/**
 * What changed for someone, so their open screens refetch: the
 * `signals/{uid}` channel (plan section 3.6, Phase 2). Only *that* something
 * changed travels, never what; the client reads it through /api/v1.
 *
 * The document a client listens to (its own only — firestore.rules
 * `match /signals/{uid}`; the server alone writes it):
 * `{ v: 1, inbox: n, bell: n, graph: n, map: n, drafts: n, threads: { [pairId]: n }, at: <server time> }` —
 * counters that only rise, one per topic, and one per conversation the
 * reader is in. Numbers only: no content, and no other uid but inside the
 * pair ids of their own conversations. Who is touched by what is
 * src/server/domain/realtime.ts.
 */
export type RealtimeTopic = 'inbox' | 'bell' | 'graph' | 'map' | 'drafts' | { thread: string };

/** The signal document's schema version (`v`). */
export const SIGNALS_VERSION = 1;

/** The signal document as a client reads it (absent counters are 0). */
export interface SignalsDoc {
  v: number;
  inbox: number;
  bell: number;
  graph: number;
  map: number;
  drafts: number;
  threads: Record<string, number>;
}

export interface RealtimePublisher {
  /**
   * Tell `uid`'s clients these topics changed: each counter goes up by one.
   * Called after the write that changed them has committed — never inside
   * `uow.run`. Best effort: never throws into the write that changed them.
   */
  touch(uid: string, topics: readonly RealtimeTopic[]): Promise<void>;
  /**
   * `signals/{uid}` as it stands (absent counters 0), or null when there is
   * none. What a read's early 304 compares its validator with (lib/api/v1/signalTag).
   * Optional: a store without it never answers early.
   */
  read?(uid: string): Promise<SignalsDoc | null>;
  /**
   * {@link touch}, now, answering the counters it left — the writer's own
   * touch, before the response, so its client can take the counters as heard
   * and not pull a second time what it pulled after its write (lib/api/v1/ownSignals).
   * Null when the touch failed or the store can't say. Optional, as `read`.
   */
  touchAndRead?(uid: string, topics: readonly RealtimeTopic[]): Promise<SignalsDoc | null>;
}

/** A signal document's fields, absent counters 0 (`data` as stored, or null). */
export function signalsOf(data: Record<string, unknown> | null | undefined): SignalsDoc | null {
  if (!data) return null;
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  const threads: Record<string, number> = {};
  if (data.threads && typeof data.threads === 'object') {
    for (const [pair, n] of Object.entries(data.threads as Record<string, unknown>)) threads[pair] = num(n);
  }
  return { v: num(data.v), inbox: num(data.inbox), bell: num(data.bell), graph: num(data.graph), map: num(data.map), drafts: num(data.drafts), threads };
}

/** A counter of a signal document: one of the topics', or one conversation's. */
export function counterOf(doc: SignalsDoc | null, topic: RealtimeTopic): number {
  if (!doc) return 0;
  return typeof topic === 'string' ? doc[topic] : (doc.threads[topic.thread] ?? 0);
}
