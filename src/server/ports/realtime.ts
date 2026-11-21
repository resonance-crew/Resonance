/**
 * What changed for someone, so their open screens refetch: the
 * `signals/{uid}` channel (plan section 3.6, Phase 2). Only *that* something
 * changed travels, never what; the client reads it through /api/v1.
 */
export type RealtimeTopic = 'inbox' | 'bell' | 'graph' | 'map' | 'drafts' | { thread: string };

export interface RealtimePublisher {
  /** Tell `uid`'s clients these topics changed. Best effort: never throws into the write that changed them. */
  touch(uid: string, topics: readonly RealtimeTopic[]): Promise<void>;
}
