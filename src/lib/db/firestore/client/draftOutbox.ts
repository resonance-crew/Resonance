'use client';

/*
 * The writer's outbox: a draft's autosaves (PATCH /api/v1/cards/{id}/draft) and a published card's working copy
 * (PUT /api/v1/cards/{id}/edits/current), sent in order — what Firestore's ordered write stream and sdk.ts
 * `inOrder` promised the writer before (phase 2b).
 *
 * - One request in flight per card and kind; what is saved meanwhile waits, merged into one (newest state wins:
 *   a draft's patches field by field, a working copy whole), and goes next.
 * - Each send carries `rev`, this browser's count of the card's saves (kept in localStorage, so a reload counts
 *   on): the server applies it only above the one it stores, so a save that arrives late never puts older words
 *   back. A send answered `applied: false` was beaten by a count from elsewhere (another device, an earlier
 *   session) — these are the words on screen, so they go again at `stored + 1`.
 * - A network failure (or a 5xx, a 429) rejects that save's promise (the writer says 未儲存) and keeps its words,
 *   tried again after a pause that grows, or as soon as the browser is back online; a refusal (any other 4xx)
 *   drops them and rejects.
 * - `flushOutbox` sends at once and settles when nothing is left: publishing, applying an edit and discarding wait
 *   on it. `dropOutbox` forgets what wasn't sent (a card deleted, a working copy thrown away) and waits out the
 *   request in flight, so nothing lands after it.
 */

import type { DraftSavedBody } from '@/lib/api/v1/schemas';
import { ApiError, callApi } from './api';

export type OutboxKind = 'draft' | 'edit';

/** A draft's patch: the fields that change, and those removed. */
export interface DraftPatch {
  fields: Record<string, unknown>;
  clear: string[];
}

type Payload = DraftPatch | Record<string, unknown>;

interface Waiter {
  resolve: (saved: DraftSavedBody) => void;
  reject: (err: unknown) => void;
}

interface Entry {
  kind: OutboxKind;
  id: string;
  /** What waits to be sent (merged), and who waits on it. */
  pending: Payload | null;
  waiting: Waiter[];
  inflight: Promise<void> | null;
  retryTimer: ReturnType<typeof setTimeout> | null;
  failures: number;
}

const entries = new Map<string, Entry>();
const keyOf = (kind: OutboxKind, id: string) => `${kind}:${id}`;

/** A refused stale send goes again at most this many times (each one above what the server said it stores). */
const STALE_RESENDS = 3;
/** The pause before a failed send goes again: doubling from this, up to RETRY_MAX_MS. */
export const RETRY_BASE_MS = 1000;
const RETRY_MAX_MS = 30_000;

// ---- rev: this browser's count of a card's saves ---------------------------------------------

const memoryRevs = new Map<string, number>();
const revKey = (kind: OutboxKind, id: string) => `resonance:rev:${kind}:${id}`;

function storage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

/** The highest `rev` known for the card (sent from here or answered by the server); 0 when none. */
export function knownRev(kind: OutboxKind, id: string): number {
  const key = revKey(kind, id);
  let stored = 0;
  try {
    stored = Number(storage()?.getItem(key) ?? 0) || 0;
  } catch {
    // Storage refused: the memory copy stands in.
  }
  return Math.max(stored, memoryRevs.get(key) ?? 0);
}

/** Note a `rev` as known (only ever rises). */
export function noteRev(kind: OutboxKind, id: string, rev: number): void {
  if (!Number.isFinite(rev) || rev <= knownRev(kind, id)) return;
  const key = revKey(kind, id);
  memoryRevs.set(key, rev);
  try {
    storage()?.setItem(key, String(rev));
  } catch {
    // Kept in memory for this tab.
  }
}

/** Forget a card's counts (it is gone for good). */
export function forgetRevs(id: string): void {
  for (const kind of ['draft', 'edit'] as const) {
    memoryRevs.delete(revKey(kind, id));
    try {
      storage()?.removeItem(revKey(kind, id));
    } catch {
      // Nothing to forget.
    }
  }
}

// ---- merging what waits --------------------------------------------------------------------

function isPatch(p: Payload): p is DraftPatch {
  return 'fields' in p && 'clear' in p && Array.isArray((p as DraftPatch).clear);
}

/** `later` laid over `earlier`: a draft's patch field by field (a field cleared later is gone, set later is back), a working copy whole. */
function merge(earlier: Payload | null, later: Payload): Payload {
  if (!earlier || !isPatch(later) || !isPatch(earlier)) return later;
  const fields = { ...earlier.fields };
  for (const f of later.clear) delete fields[f];
  Object.assign(fields, later.fields);
  const clear = [...new Set([...earlier.clear.filter((f) => !(f in later.fields)), ...later.clear])];
  return { fields, clear };
}

// ---- sending --------------------------------------------------------------------------------

function send(kind: OutboxKind, id: string, rev: number, payload: Payload): Promise<DraftSavedBody> {
  const card = encodeURIComponent(id);
  if (kind === 'draft') {
    const { fields, clear } = payload as DraftPatch;
    return callApi<DraftSavedBody>(`/api/v1/cards/${card}/draft`, {
      method: 'PATCH',
      body: { ...fields, ...(clear.length ? { clear } : {}), rev },
    });
  }
  return callApi<DraftSavedBody>(`/api/v1/cards/${card}/edits/current`, { method: 'PUT', body: { ...payload, rev } });
}

/** Sends `payload` at the next count, again above the server's when it answers that it holds a later one. */
async function sendCounted(kind: OutboxKind, id: string, payload: Payload): Promise<DraftSavedBody> {
  let rev = knownRev(kind, id) + 1;
  noteRev(kind, id, rev);
  let saved = await send(kind, id, rev, payload);
  for (let i = 0; !saved.applied && i < STALE_RESENDS; i++) {
    rev = Math.max(saved.rev, rev) + 1;
    noteRev(kind, id, rev);
    saved = await send(kind, id, rev, payload);
  }
  noteRev(kind, id, saved.rev);
  return saved;
}

/** Worth sending again: the network, the server's own trouble, or a pause it asked for. */
export function isRetryable(err: unknown): boolean {
  if (!(err instanceof ApiError)) return true;
  return err.status >= 500 || err.status === 429 || err.status === 0;
}

function entryFor(kind: OutboxKind, id: string): Entry {
  const key = keyOf(kind, id);
  let e = entries.get(key);
  if (!e) {
    e = { kind, id, pending: null, waiting: [], inflight: null, retryTimer: null, failures: 0 };
    entries.set(key, e);
  }
  return e;
}

function cleanUp(e: Entry) {
  if (!e.pending && !e.inflight && !e.retryTimer && e.waiting.length === 0) entries.delete(keyOf(e.kind, e.id));
}

let onlineHooked = false;
function hookOnline() {
  if (onlineHooked || typeof window === 'undefined') return;
  onlineHooked = true;
  window.addEventListener('online', () => {
    for (const e of entries.values()) {
      if (e.retryTimer) {
        clearTimeout(e.retryTimer);
        e.retryTimer = null;
        pump(e);
      }
    }
  });
}

/** Send what waits, if nothing is in flight. */
function pump(e: Entry): void {
  if (e.inflight || !e.pending) return;
  if (e.retryTimer) {
    clearTimeout(e.retryTimer);
    e.retryTimer = null;
  }
  const payload = e.pending;
  const waiting = e.waiting;
  e.pending = null;
  e.waiting = [];
  e.inflight = sendCounted(e.kind, e.id, payload).then(
    (saved) => {
      e.inflight = null;
      e.failures = 0;
      for (const w of waiting) w.resolve(saved);
      pump(e);
      cleanUp(e);
    },
    (err: unknown) => {
      e.inflight = null;
      for (const w of waiting) w.reject(err);
      if (isRetryable(err)) {
        // Kept, under anything saved since, for the next try.
        e.pending = e.pending ? merge(payload, e.pending) : payload;
        e.failures += 1;
        if (e.waiting.length) pump(e);
        else schedule(e);
      } else {
        e.failures = 0;
        pump(e);
      }
      cleanUp(e);
    },
  );
}

function schedule(e: Entry): void {
  if (e.retryTimer || !e.pending) return;
  hookOnline();
  const wait = Math.min(RETRY_BASE_MS * 2 ** Math.max(0, e.failures - 1), RETRY_MAX_MS);
  e.retryTimer = setTimeout(() => {
    e.retryTimer = null;
    pump(e);
  }, wait);
}

/** Queue a save; settles when it (or a later save it was merged into) is stored. */
export function enqueueSave(kind: OutboxKind, id: string, payload: Payload): Promise<DraftSavedBody> {
  const e = entryFor(kind, id);
  e.pending = merge(e.pending, payload);
  const done = new Promise<DraftSavedBody>((resolve, reject) => e.waiting.push({ resolve, reject }));
  pump(e);
  return done;
}

/** Send what waits at once; settles when nothing is left, or rejects with why the last send failed. */
export async function flushOutbox(kind: OutboxKind, id: string): Promise<void> {
  const e = entries.get(keyOf(kind, id));
  if (!e) return;
  if (e.pending) {
    const done = new Promise<DraftSavedBody>((resolve, reject) => e.waiting.push({ resolve, reject }));
    pump(e);
    await done;
    return;
  }
  if (e.inflight) {
    await e.inflight;
    // The send in flight may have failed and been kept: try it now.
    if (e.pending) await flushOutbox(kind, id);
  }
}

/** Forget what wasn't sent (its waiters settle as superseded) and wait out the send in flight. */
export async function dropOutbox(kind: OutboxKind, id: string): Promise<void> {
  const e = entries.get(keyOf(kind, id));
  if (!e) return;
  if (e.retryTimer) clearTimeout(e.retryTimer);
  e.retryTimer = null;
  const waiting = e.waiting;
  e.pending = null;
  e.waiting = [];
  for (const w of waiting) w.resolve({ applied: false, rev: knownRev(kind, id), updatedAt: null });
  const inflight = e.inflight;
  if (inflight) await inflight.catch(() => undefined);
  // A failure in flight may have put its words back: they are dropped too.
  if (e.retryTimer) clearTimeout(e.retryTimer);
  e.retryTimer = null;
  e.pending = null;
  cleanUp(e);
}

/** Whether anything waits or is on its way for the card. */
export function outboxBusy(kind: OutboxKind, id: string): boolean {
  const e = entries.get(keyOf(kind, id));
  return !!e && (!!e.pending || !!e.inflight);
}

/** Tests only: forget every entry and count. */
export function resetOutboxForTests(): void {
  for (const e of entries.values()) if (e.retryTimer) clearTimeout(e.retryTimer);
  entries.clear();
  memoryRevs.clear();
}
