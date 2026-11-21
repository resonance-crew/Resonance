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
}
