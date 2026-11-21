'use client';

import { listenLazily } from './listen';

/*
 * The signal channel (middleware decouple, Phase 2): the one document the web
 * still listens to, `signals/{uid}` — `{ v, inbox, bell, graph, map, drafts,
 * threads: { [pairId]: n }, at }`, counters the server raises after a write
 * that changes what the viewer lists, and nothing else (no content, no other
 * uid but inside a pair the viewer is in). A counter that moved says which
 * /api/v1 read to pull again; the read itself answers with an ETag, so an
 * unchanged list costs a 304 (the browser's cache sends If-None-Match for
 * `private, no-cache` answers on its own).
 *
 * Besides the signals, every watcher is pulled again every minute while the
 * page is in the foreground (a write no signal tells of: an old app's direct
 * Firestore write, a trash or restore), on coming back to the tab after a
 * minute away, and at once when this browser itself wrote (`pokeSignal`).
 */

/** What a counter names: one of the lists, or one conversation's messages (`thread:{pairId}`). */
export type SignalTopic = 'inbox' | 'bell' | 'graph' | 'map' | 'drafts' | `thread:${string}`;

const TOPICS = ['inbox', 'bell', 'graph', 'map', 'drafts'] as const;

/** How often everything watched is pulled again while the page is in the foreground. */
export const SAFETY_PULL_MS = 60_000;

type Counters = Map<SignalTopic, number>;

interface Hub {
  uid: string;
  watchers: Map<SignalTopic, Set<() => void>>;
  /** The counters last heard; null until the first answer. */
  last: Counters | null;
  stopListener: () => void;
  failed: boolean;
  timer: ReturnType<typeof setInterval> | null;
  lastAll: number;
}

const hubs = new Map<string, Hub>();

function countersOf(data: Record<string, unknown> | null): Counters {
  const out: Counters = new Map();
  if (!data) return out;
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  for (const t of TOPICS) out.set(t, num(data[t]));
  const threads = data.threads;
  if (threads && typeof threads === 'object') {
    for (const [pair, n] of Object.entries(threads as Record<string, unknown>)) out.set(`thread:${pair}`, num(n));
  }
  return out;
}

function fire(hub: Hub, topic: SignalTopic): void {
  for (const fn of [...(hub.watchers.get(topic) ?? [])]) fn();
}

function fireAll(hub: Hub): void {
  hub.lastAll = Date.now();
  for (const topic of [...hub.watchers.keys()]) fire(hub, topic);
}

function listen(hub: Hub): void {
  hub.failed = false;
  const failed = () => {
    // The minute's pull carries on; the listener starts again on the next return to the tab or the network.
    hub.failed = true;
  };
  hub.stopListener = listenLazily(
    ({ listenDoc }) =>
      listenDoc(
        ['signals', hub.uid],
        (data) => {
          const next = countersOf(data);
          const before = hub.last;
          hub.last = next;
          // The first answer is where the counters stand: the watchers' own first reads came with them.
          if (!before) return;
          for (const [topic, n] of next) if ((before.get(topic) ?? 0) !== n) fire(hub, topic);
        },
        failed,
      ),
    failed,
  );
}

function visible(): boolean {
  return typeof document === 'undefined' || document.visibilityState !== 'hidden';
}

function onReturn(): void {
  if (!visible()) return;
  for (const hub of hubs.values()) {
    if (hub.failed) {
      hub.stopListener();
      hub.last = null;
      listen(hub);
    }
    if (Date.now() - hub.lastAll >= SAFETY_PULL_MS) fireAll(hub);
  }
}

if (typeof window !== 'undefined') {
  document.addEventListener('visibilitychange', onReturn);
  window.addEventListener('online', onReturn);
}

function hubOf(uid: string): Hub {
  const hub = hubs.get(uid);
  if (hub) return hub;
  // Another account signed in on this tab: the one before stops listening.
  for (const other of hubs.values()) stopHub(other);
  const made: Hub = { uid, watchers: new Map(), last: null, stopListener: () => {}, failed: false, timer: null, lastAll: Date.now() };
  hubs.set(uid, made);
  listen(made);
  made.timer = setInterval(() => {
    if (visible()) fireAll(made);
  }, SAFETY_PULL_MS);
  return made;
}

function stopHub(hub: Hub): void {
  hub.stopListener();
  if (hub.timer) clearInterval(hub.timer);
  hubs.delete(hub.uid);
}

/**
 * Call `fn` whenever `topic` moves for the viewer `uid` (and on the safety
 * pulls). The first watcher starts the one listener; the last one to leave
 * stops it. Returns the stop.
 */
export function watchSignal(uid: string, topic: SignalTopic, fn: () => void): () => void {
  const hub = hubOf(uid);
  let set = hub.watchers.get(topic);
  if (!set) hub.watchers.set(topic, (set = new Set()));
  set.add(fn);
  return () => {
    set!.delete(fn);
    if (set!.size === 0) hub.watchers.delete(topic);
    if (hub.watchers.size === 0 && hubs.get(hub.uid) === hub) stopHub(hub);
  };
}

/** This browser just changed `topic` itself: pull it again now rather than wait for the signal's round trip. */
export function pokeSignal(topic: SignalTopic): void {
  for (const hub of hubs.values()) fire(hub, topic);
}

/** Stop every listener and forget every watcher (sign-out, tests). */
export function resetSignals(): void {
  for (const hub of [...hubs.values()]) stopHub(hub);
}
