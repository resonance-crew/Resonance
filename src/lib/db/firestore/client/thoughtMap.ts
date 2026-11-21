'use client';

/*
 * The viewer's thought map, through the server (phase 2b): read whole with GET /api/v1/me/thought-map, changed
 * with batches of ops (POST /api/v1/me/thought-map/ops — atomic, in order, an op on something gone skipped).
 *
 * The canvas draws every change at once (its own state) and hands it here; this module only has to get it to the
 * server in the order it was made, without slowing a drag:
 * - what is handed over within one frame goes in one batch (a group dragged: the group and its cards together);
 * - one batch is in flight at a time; what comes meanwhile waits, and a second move of a card, a group or an
 *   arrow's words still waiting is folded into the first (only the last place is sent);
 * - a batch the network loses is sent again after a pause (a few times, then given up and its callers told,
 *   as a failed write was before); one the server refuses is dropped and its callers told;
 * - reading the map waits for every change made here first, so leaving the map and coming back never shows the
 *   board from before the last move.
 */

import type { MapOpsResponseBody, ThoughtMapBody } from '@/lib/api/v1/schemas';
import { MAP_OPS_MAX } from '@/lib/api/v1/schemas';
import type { ThoughtMapEdge, ThoughtMapGroup, ThoughtMapNode } from '@/lib/db/types';
import { getFirebaseClientAuth } from '@/lib/auth/firebase/client';
import { callApi } from './api';
import { newCardId } from './cards';
import { isRetryable, RETRY_BASE_MS } from './draftOutbox';

function requireUid(): string {
  const uid = getFirebaseClientAuth().currentUser?.uid;
  if (!uid) throw new Error('Not signed in');
  return uid;
}

const toDate = (iso: string | null): Date => (iso ? new Date(iso) : new Date(0));

export interface ThoughtMapData {
  nodes: ThoughtMapNode[];
  edges: ThoughtMapEdge[];
  groups: ThoughtMapGroup[];
}

/** One op as the server takes it (MapOp: flat, its kind's fields only). */
export interface MapOpWire {
  op: 'addNode' | 'moveNode' | 'setNodeGroup' | 'removeNode' | 'addEdge' | 'setEdgeLabel' | 'removeEdge' | 'addGroup' | 'updateGroup' | 'removeGroup';
  cardId?: string;
  x?: number;
  y?: number;
  groupId?: string;
  sourceCardId?: string;
  targetCardId?: string;
  label?: string;
  id?: string;
  title?: string;
  hue?: number;
  w?: number;
  h?: number;
}

// ---- the queue ------------------------------------------------------------------------------

interface Waiter {
  resolve: () => void;
  reject: (err: unknown) => void;
}
interface Queued {
  op: MapOpWire;
  /** The calls that settle once this op (and so every op before it) is stored. */
  waiters: Waiter[];
}

/** What is handed over within this long goes in one batch: a frame. */
export const MAP_BATCH_MS = 16;
/** A batch the network lost is sent again this many times before its callers are told. */
const MAP_RETRIES = 5;

let queue: Queued[] = [];
let inflight: Promise<void> | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let failures = 0;
/** How many ops at the queue's head were sent once already (a batch to send again). */
let sentHead = 0;
/** Settle when the queue is empty and nothing is in flight. */
let idleWaiters: (() => void)[] = [];

/** What an op is about: a card's node, a group, an arrow. */
function subject(op: MapOpWire): string {
  switch (op.op) {
    case 'addNode':
    case 'moveNode':
    case 'setNodeGroup':
    case 'removeNode':
      return `node:${op.cardId}`;
    case 'addGroup':
    case 'updateGroup':
    case 'removeGroup':
      return `group:${op.groupId}`;
    case 'addEdge':
      return `edge:${op.sourceCardId}_${op.targetCardId}`;
    default:
      return `edge:${op.id}`;
  }
}

/** Ops that only move or relabel what is there: one waiting can be folded into a later one of its kind. */
const FOLDS = new Set<MapOpWire['op']>(['moveNode', 'setNodeGroup', 'updateGroup', 'setEdgeLabel']);

/** `later` folded into `earlier` (same kind, same subject): the result of applying both. */
function fold(earlier: MapOpWire, later: MapOpWire): MapOpWire {
  if (later.op === 'moveNode') {
    // An absent groupId leaves the card's group: the earlier one's still stands.
    const groupId = later.groupId ?? earlier.groupId;
    return { ...later, ...(groupId !== undefined ? { groupId } : {}) };
  }
  if (later.op === 'updateGroup') return { ...earlier, ...later };
  return later;
}

/**
 * Where `op` folds into the queue: the latest waiting op on its subject, when it is of the same kind and only
 * moves of other things lie after it (so folding it changes no order that matters). -1: append.
 */
function foldIndex(op: MapOpWire): number {
  if (!FOLDS.has(op.op)) return -1;
  const about = subject(op);
  // Not into ops sent once already (a batch the network lost may have reached the server): what was sent stays.
  for (let i = queue.length - 1; i >= sentHead; i--) {
    const q = queue[i].op;
    if (subject(q) === about) return q.op === op.op ? i : -1;
    if (!FOLDS.has(q.op)) return -1;
  }
  return -1;
}

/** Hand ops over; settles when they are stored (rejects when they were refused or kept failing). */
function enqueue(ops: MapOpWire[]): Promise<void> {
  if (ops.length === 0) return Promise.resolve();
  requireUid();
  let last = -1;
  for (const op of ops) {
    const at = foldIndex(op);
    if (at >= 0) {
      queue[at] = { ...queue[at], op: fold(queue[at].op, op) };
      last = Math.max(last, at);
    } else {
      queue.push({ op, waiters: [] });
      last = queue.length - 1;
    }
  }
  const done = new Promise<void>((resolve, reject) => queue[last].waiters.push({ resolve, reject }));
  schedule(MAP_BATCH_MS);
  return done;
}

function schedule(ms: number) {
  if (timer || inflight) return;
  timer = setTimeout(() => {
    timer = null;
    sendNext();
  }, ms);
}

function settleIdle() {
  if (queue.length || inflight || timer) return;
  const waiting = idleWaiters;
  idleWaiters = [];
  for (const w of waiting) w();
}

function sendNext() {
  if (inflight) return;
  if (!queue.length) return settleIdle();
  const batch = queue.slice(0, MAP_OPS_MAX);
  queue = queue.slice(batch.length);
  sentHead = Math.max(0, sentHead - batch.length);
  inflight = callApi<MapOpsResponseBody>('/api/v1/me/thought-map/ops', { method: 'POST', body: { ops: batch.map((q) => q.op) } }).then(
    () => {
      inflight = null;
      failures = 0;
      for (const q of batch) for (const w of q.waiters) w.resolve();
      // What came meanwhile goes at once (it waited a frame already).
      if (queue.length) sendNext();
      else settleIdle();
    },
    (err: unknown) => {
      inflight = null;
      if (isRetryable(err) && failures < MAP_RETRIES) {
        // Back at the head, as it was (nothing that came since folds into it: order stays).
        failures += 1;
        queue = [...batch, ...queue];
        sentHead = batch.length;
        schedule(RETRY_BASE_MS * 2 ** (failures - 1));
        return;
      }
      failures = 0;
      for (const q of batch) for (const w of q.waiters) w.reject(err);
      if (queue.length) sendNext();
      else settleIdle();
    },
  );
}

/** Every change handed over so far, stored (or given up). */
export function flushMapOps(): Promise<void> {
  if (!queue.length && !inflight && !timer) return Promise.resolve();
  if (timer && !inflight) {
    clearTimeout(timer);
    timer = null;
    sendNext();
  }
  return new Promise((resolve) => idleWaiters.push(resolve));
}

/** Whether a change made here is still waiting or on its way (a signal's pull may wait for it). */
export function mapOpsBusy(): boolean {
  return queue.length > 0 || inflight != null || timer != null;
}

/** Tests only. */
export function resetMapOpsForTests(): void {
  if (timer) clearTimeout(timer);
  queue = [];
  inflight = null;
  timer = null;
  failures = 0;
  sentHead = 0;
  idleWaiters = [];
}

// ---- reads ----------------------------------------------------------------------------------

/** The viewer's whole map in one read — boards stay small enough to load whole — after this tab's changes land. */
export async function loadMyThoughtMap(): Promise<ThoughtMapData> {
  await flushMapOps();
  const map = await callApi<ThoughtMapBody>('/api/v1/me/thought-map');
  return {
    nodes: map.nodes.map((n) => ({
      id: n.id,
      cardId: n.cardId,
      x: n.x,
      y: n.y,
      groupId: n.groupId ?? undefined,
      createdAt: toDate(n.createdAt),
      updatedAt: toDate(n.updatedAt),
    })),
    edges: map.edges.map((e) => ({ id: e.id, sourceCardId: e.sourceCardId, targetCardId: e.targetCardId, label: e.label, createdAt: toDate(e.createdAt) })),
    groups: map.groups.map((g) => ({ id: g.id, title: g.title, hue: g.hue, x: g.x, y: g.y, w: g.w, h: g.h, createdAt: toDate(g.createdAt) })),
  };
}

// ---- writes ---------------------------------------------------------------------------------

/** Place a card on the map (its node's id is the card's, so placing it again is harmless). */
export function addMapNode(cardId: string, x: number, y: number): Promise<void> {
  return enqueue([{ op: 'addNode', cardId, x, y }]);
}

/** Move a card and file it in `groupId` (null: unfiled). */
export function moveMapNode(cardId: string, x: number, y: number, groupId: string | null): Promise<void> {
  return enqueue(
    groupId
      ? [{ op: 'moveNode', cardId, x, y, groupId }]
      : [
          { op: 'moveNode', cardId, x, y },
          { op: 'setNodeGroup', cardId },
        ],
  );
}

/** Batched position update — used when dragging a group moves its members. */
export function moveMapNodes(moves: { cardId: string; x: number; y: number }[]): Promise<void> {
  return enqueue(moves.map((m) => ({ op: 'moveNode', cardId: m.cardId, x: m.x, y: m.y })));
}

/** Batched membership update after a group is resized/deleted or a node lands. */
export function setNodeGroups(changes: { cardId: string; groupId: string | null }[]): Promise<void> {
  return enqueue(changes.map((c) => (c.groupId ? { op: 'setNodeGroup', cardId: c.cardId, groupId: c.groupId } : { op: 'setNodeGroup', cardId: c.cardId })));
}

/** Take a card off the map, with every arrow touching it. */
export function removeMapNode(cardId: string): Promise<void> {
  return enqueue([{ op: 'removeNode', cardId }]);
}

export function edgeId(sourceCardId: string, targetCardId: string): string {
  return `${sourceCardId}_${targetCardId}`;
}

/** Draw an arrow between two cards on the map. Idempotent per direction. */
export async function createMapEdge(sourceCardId: string, targetCardId: string, label = ''): Promise<string> {
  if (sourceCardId === targetCardId) throw new Error('Self-link');
  await enqueue([{ op: 'addEdge', sourceCardId, targetCardId, label }]);
  return edgeId(sourceCardId, targetCardId);
}

export function updateMapEdgeLabel(id: string, label: string): Promise<void> {
  return enqueue([{ op: 'setEdgeLabel', id, label }]);
}

export function removeMapEdge(id: string): Promise<void> {
  return enqueue([{ op: 'removeEdge', id }]);
}

/** Make a group under an id made here (the server takes the one the client chose); answers it once stored. */
export async function createMapGroup(input: { title: string; hue: number; x: number; y: number; w: number; h: number }): Promise<string> {
  const groupId = newCardId();
  await enqueue([{ op: 'addGroup', groupId, ...input }]);
  return groupId;
}

export function updateMapGroup(id: string, patch: Partial<Pick<ThoughtMapGroup, 'title' | 'hue' | 'x' | 'y' | 'w' | 'h'>>): Promise<void> {
  const fields = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
  return enqueue([{ op: 'updateGroup', groupId: id, ...fields }]);
}

/** Delete a group region; member nodes stay on the map but become unfiled. */
export function removeMapGroup(id: string): Promise<void> {
  return enqueue([{ op: 'removeGroup', groupId: id }]);
}
