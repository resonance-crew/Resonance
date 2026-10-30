'use client';

import { useSyncExternalStore } from 'react';
import type { MessageReplyQuote } from '@/lib/db/types';

/**
 * A conversation's unsent message (round 22 §4.4), kept in this browser per
 * account and conversation: leaving the thread — another conversation, the
 * list, another page, closing the tab — never throws away what was being
 * written, and opening the thread again brings it back: its words, the
 * message it answers, the note it quotes and the card riding with it (never a
 * picture). Gone once it is sent, or emptied, when the conversation is
 * deleted, and all of them on signing out. The conversation list shows a
 * draft's words after a pen (never the word 草稿) until it is sent. The apps
 * keep theirs by the same rule.
 *
 * localStorage, one key per conversation: `resonance:draft:{uid}:{pair}` →
 * `{ text, replyTo?, noteRef?, cardId?, at }`. At most MAX_DRAFTS per account
 * (the oldest go first) and none older than DRAFT_DAYS.
 */
const PREFIX = 'resonance:draft:';
export const MAX_DRAFTS = 50;
export const DRAFT_DAYS = 30;
const DAY_MS = 86_400_000;
/** Said on this tab when a draft changes (another tab hears `storage`). */
const CHANGED = 'resonance:chat-drafts';

export interface ChatDraft {
  text: string;
  /** The message it answers, as the composer quoted it. */
  replyTo?: MessageReplyQuote;
  /** The note it quotes (a reply to a note left on a card). */
  noteRef?: { cardId: string; noteId: string };
  /** The card riding with it, by id. */
  cardId?: string;
  /** When it was last kept (ms). */
  at: number;
}

export type ChatDraftContent = Omit<ChatDraft, 'at'>;

const keyOf = (uid: string, pair: string) => `${PREFIX}${uid}:${pair}`;
const str = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

/** Whether `draft` holds anything worth bringing back. */
export function draftHasContent(draft: ChatDraftContent | null | undefined): boolean {
  return !!draft && (!!draft.text.trim() || !!draft.replyTo || !!draft.noteRef || !!draft.cardId);
}

/** A stored draft as written by this build — anything else (an older shape, a hand edit) is none. */
function parse(raw: string | null, now: number): ChatDraft | null {
  if (!raw) return null;
  try {
    const d = JSON.parse(raw) as Record<string, unknown>;
    if (typeof d?.text !== 'string' || typeof d.at !== 'number' || now - d.at >= DRAFT_DAYS * DAY_MS) return null;
    const draft: ChatDraft = { text: d.text, at: d.at };
    const q = d.replyTo as Record<string, unknown> | undefined;
    if (q && str(q.id) && typeof q.senderId === 'string' && typeof q.text === 'string') {
      draft.replyTo = q as unknown as MessageReplyQuote;
    }
    const n = d.noteRef as Record<string, unknown> | undefined;
    if (n && str(n.cardId) && str(n.noteId)) draft.noteRef = { cardId: n.cardId, noteId: n.noteId };
    if (str(d.cardId)) draft.cardId = d.cardId;
    return draftHasContent(draft) ? draft : null;
  } catch {
    return null;
  }
}

/** Every key of `uid`'s drafts in this browser (or of everyone's, with no uid). */
function draftKeys(uid?: string): string[] {
  const prefix = uid ? `${PREFIX}${uid}:` : PREFIX;
  const keys: string[] = [];
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key?.startsWith(prefix)) keys.push(key);
    }
  } catch {
    // Storage unavailable: no drafts.
  }
  return keys;
}

function changed(): void {
  version++;
  try {
    window.dispatchEvent(new Event(CHANGED));
  } catch {
    // no window (a test's node environment)
  }
}

/** The draft left in conversation `pair`, or null. */
export function readChatDraft(uid: string, pair: string, now = Date.now()): ChatDraft | null {
  try {
    return parse(window.localStorage.getItem(keyOf(uid, pair)), now);
  } catch {
    return null;
  }
}

/** Every draft of `uid`'s in this browser, by conversation. */
export function chatDraftsOf(uid: string, now = Date.now()): Record<string, ChatDraft> {
  const out: Record<string, ChatDraft> = {};
  const prefix = `${PREFIX}${uid}:`;
  for (const key of draftKeys(uid)) {
    try {
      const draft = parse(window.localStorage.getItem(key), now);
      if (draft) out[key.slice(prefix.length)] = draft;
    } catch {
      // unreadable: skipped
    }
  }
  return out;
}

/**
 * Keep `draft` as conversation `pair`'s unsent message (nothing in it: forget
 * it); the account's oldest beyond MAX_DRAFTS, and any past DRAFT_DAYS, go.
 */
export function keepChatDraft(uid: string, pair: string, draft: ChatDraftContent, now = Date.now()): void {
  if (!draftHasContent(draft)) {
    forgetChatDraft(uid, pair);
    return;
  }
  try {
    const kept: ChatDraft = { text: draft.text, at: now };
    if (draft.replyTo) kept.replyTo = draft.replyTo;
    if (draft.noteRef) kept.noteRef = draft.noteRef;
    if (draft.cardId) kept.cardId = draft.cardId;
    const key = keyOf(uid, pair);
    const raw = JSON.stringify(kept);
    if (window.localStorage.getItem(key) === raw) return;
    window.localStorage.setItem(key, raw);
    // The account's drafts: the stale and the oldest past the limit go.
    const all = draftKeys(uid)
      .map((k) => ({ k, d: parse(window.localStorage.getItem(k), now) }))
      .sort((a, b) => (b.d?.at ?? 0) - (a.d?.at ?? 0));
    all.forEach(({ k, d }, i) => {
      if (!d || i >= MAX_DRAFTS) window.localStorage.removeItem(k);
    });
  } catch {
    // Storage unavailable (a private window, blocked site data): the words live as long as the composer.
  }
  changed();
}

/** Conversation `pair`'s draft went (sent, emptied, the conversation deleted). */
export function forgetChatDraft(uid: string, pair: string): void {
  try {
    const key = keyOf(uid, pair);
    if (window.localStorage.getItem(key) == null) return;
    window.localStorage.removeItem(key);
  } catch {
    return;
  }
  changed();
}

/** Signing out: every account's unsent messages leave this browser. */
export function forgetAllChatDrafts(): void {
  const keys = draftKeys();
  try {
    keys.forEach((key) => window.localStorage.removeItem(key));
  } catch {
    // nothing to clear
  }
  if (keys.length) changed();
}

// --- The list's view of them -------------------------------------------------

let version = 0;
const NONE: Record<string, ChatDraft> = {};
let cache: { uid: string; version: number; drafts: Record<string, ChatDraft> } | null = null;

// Another tab's drafts change what this one's list would read, whether or not a list is on screen now.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key == null || e.key.startsWith(PREFIX)) version++;
  });
}

function subscribe(onChange: () => void): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key == null || e.key.startsWith(PREFIX)) onChange();
  };
  window.addEventListener(CHANGED, onChange);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(CHANGED, onChange);
    window.removeEventListener('storage', onStorage);
  };
}

/** The viewer's drafts by conversation, kept current as they change here or in another tab. */
export function useChatDrafts(uid: string | null | undefined): Record<string, ChatDraft> {
  return useSyncExternalStore(
    subscribe,
    () => {
      if (!uid) return NONE;
      if (cache?.uid !== uid || cache.version !== version) cache = { uid, version, drafts: chatDraftsOf(uid) };
      return cache.drafts;
    },
    () => NONE,
  );
}
