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
 * Besides the signals, every watcher is pulled again — a safety pull, for a
 * write no signal tells of (an old app's direct Firestore write, a trash or
 * restore, a touch that failed) — every {@link SAFETY_PULL_MS} while the page
 * is in the foreground and the listener is live, every
 * {@link FAILED_PULL_MS} while it has failed (nothing else then tells of a
 * change), once when a listener that failed hears again (what it missed), on
 * coming back to the tab after a safety interval away, and at once when this
 * browser itself wrote (`pokeSignal`, `pokeOwn`). It used to be every minute
 * whatever the listener did: every open tab read every conversation and its
 * people sixty times an hour.
 */

/** What a counter names: one of the lists, or one conversation's messages (`thread:{pairId}`). */
export type SignalTopic = 'inbox' | 'bell' | 'graph' | 'map' | 'drafts' | `thread:${string}`;

const TOPICS = ['inbox', 'bell', 'graph', 'map', 'drafts'] as const;

/** How often everything watched is pulled again while the page is in the foreground and the listener is live. */
export const SAFETY_PULL_MS = 5 * 60_000;
/** …and while the listener has failed (the signals are not heard: the pulls are all there is). */
export const FAILED_PULL_MS = 60_000;

type Counters = Map<SignalTopic, number>;

interface Hub {
  uid: string;
  watchers: Map<SignalTopic, Set<() => void>>;
  /** The counters last heard; null until the first answer. */
  last: Counters | null;
  /** The listener's first answer since it (last) started: where the counters stood as the watchers' first reads were made. */
  first: Counters | null;
  stopListener: () => void;
  failed: boolean;
  /** The listener failed since it last heard: its next answer pulls everything (what it missed). */
  missed: boolean;
  timer: ReturnType<typeof setInterval> | null;
  lastAll: number;
}

/** A tick a little early still counts (timers drift). */
const TICK_SLACK_MS = 1_000;

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
  // `failed` stays until the listener answers: until then the pulls keep the shorter interval.
  const failed = () => {
    // The pulls go every FAILED_PULL_MS meanwhile; the listener starts again on the next return to the tab or the network.
    hub.failed = true;
    hub.missed = true;
  };
  hub.stopListener = listenLazily(
    ({ listenDoc }) =>
      listenDoc(
        ['signals', hub.uid],
        (data) => {
          const next = countersOf(data);
          const before = hub.last;
          hub.last = next;
          hub.failed = false;
          // The first answer is where the counters stand: the watchers' own first reads came with them —
          // unless the listener failed before it, when whatever moved meanwhile was never heard.
          if (!before) {
            hub.first = new Map(next);
            if (hub.missed) {
              hub.missed = false;
              fireAll(hub);
            }
            return;
          }
          // Counters only rise: one below what was held is a snapshot from before a write of this browser's
          // whose counter its answer brought already (pokeOwn) — kept, not fired.
          for (const [topic, n] of next) {
            const was = before.get(topic) ?? 0;
            if (n < was) next.set(topic, was);
            else if (n !== was) fire(hub, topic);
          }
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
    if (Date.now() - hub.lastAll >= (hub.failed ? FAILED_PULL_MS : SAFETY_PULL_MS)) fireAll(hub);
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
  const made: Hub = { uid, watchers: new Map(), last: null, first: null, stopListener: () => {}, failed: false, missed: false, timer: null, lastAll: Date.now() };
  hubs.set(uid, made);
  listen(made);
  // Ticks at the shorter interval; pulls when the one that applies has passed.
  made.timer = setInterval(() => {
    if (visible() && Date.now() - made.lastAll >= (made.failed ? FAILED_PULL_MS : SAFETY_PULL_MS) - TICK_SLACK_MS) fireAll(made);
  }, FAILED_PULL_MS);
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

/**
 * This browser just wrote, and the server says what its write left the
 * writer's own counters at (`X-Resonance-Signals`, `{ topic: n }`: the
 * writer's touch is made before the response). Each topic is pulled once:
 * now — and the listener bringing that same touch later pulls nothing more —
 * unless the listener has heard it already, in which case its watchers were
 * pulled then, after the write. Nothing of anyone else's is lost: a counter
 * that reached `n` holds every touch before this write's, and the pull this
 * makes (or made) comes after the write, so it reads them; a touch after it
 * moves the counter past `n`, which the listener fires as ever. Without the
 * counters (an older server, a touch that failed): {@link pokeSignal}.
 */
export function pokeOwn(topics: SignalTopic[], heard: Record<string, number> | null): void {
  for (const hub of hubs.values()) {
    // Every counter first, then the pulls: a pull fired for one topic sees what the write did to the others
    // (the list's delta reads the conversations whose counters moved, client/messages conversationsReader).
    const pull: SignalTopic[] = [];
    for (const topic of topics) {
      const n = heard?.[topic];
      if (typeof n !== 'number' || !Number.isFinite(n) || !hub.last || hub.failed) {
        pull.push(topic);
        continue;
      }
      if ((hub.last.get(topic) ?? 0) >= n) continue;
      hub.last.set(topic, n);
      pull.push(topic);
    }
    for (const topic of pull) fire(hub, topic);
  }
}

/** What {@link heardCounters} answers while the listener is live: the counters as last heard, and as it first heard them. */
export interface Heard {
  now: ReadonlyMap<SignalTopic, number>;
  /** Where they stood as the watchers' first reads were made (the listener's first answer, which fires nothing). */
  first: ReadonlyMap<SignalTopic, number>;
}

/**
 * The counters `uid`'s listener heard (copies; with the ones this browser's
 * own writes brought, pokeOwn) — what a pull compares with the counters at
 * its last read to read only what moved (client/messages
 * `conversationsReader`). `'waiting'` while a listener that never failed
 * hasn't answered yet (its first answer will stand for a read made now);
 * null while no one can say what moved: no listener, or one that failed and
 * hasn't heard since.
 */
export function heardCounters(uid: string): Heard | 'waiting' | null {
  const hub = hubs.get(uid);
  if (!hub || hub.failed || hub.missed) return null;
  if (!hub.last || !hub.first) return 'waiting';
  return { now: new Map(hub.last), first: hub.first };
}

/** Stop every listener and forget every watcher (sign-out, tests). */
export function resetSignals(): void {
  for (const hub of [...hubs.values()]) stopHub(hub);
}
