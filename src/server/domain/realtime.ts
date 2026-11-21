// Pure: who a write's signal reaches (signals/{uid}, ports/realtime.ts), and
// with which topics. No I/O — app/realtime.ts `signal()` hands the result to
// ctx.realtime after the write commits.

import type { RealtimeTopic } from '@/server/ports/realtime';
import { pairKey } from './graph';

/** What a committed write changed, as the signal channel tells it. */
export type SignalEvent =
  /** A message, reaction, unsend, read or deletion in the conversation of `a` and `b`: both see their inbox and the thread move. */
  | { kind: 'conversation'; a: string; b: string }
  /**
   * A note from `from` on a card of `to`'s. On an anonymous card only its author (`to`) is told — their inbox and
   * bell — and nothing points the writer at them: no thread of the two, no touch of the writer at all.
   */
  | { kind: 'note'; from: string; to: string; anonymousCard: boolean }
  /** A bell row written for `to`, or read by them. */
  | { kind: 'bell'; to: string }
  /** Each of `uids` has a connection, a block or an invite of theirs changed (a connection made or ended, a block, an unblock). */
  | { kind: 'graph'; uids: readonly string[] }
  /** `uid`'s own thought map changed. */
  | { kind: 'map'; uid: string }
  /** `uid`'s own drafts or pending edits changed. */
  | { kind: 'drafts'; uid: string };

export interface Touch {
  uid: string;
  topics: RealtimeTopic[];
}

const ok = (uid: unknown): uid is string => typeof uid === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(uid);

/**
 * The touches a set of events makes: one per person, each topic once (a
 * thread by its pair id), in the order people first appear. Someone touched
 * by nothing is left out; an id that can't name an account is dropped.
 */
export function touchesFor(events: readonly SignalEvent[]): Touch[] {
  const byUid = new Map<string, Map<string, RealtimeTopic>>();
  const add = (uid: string, ...topics: RealtimeTopic[]) => {
    if (!ok(uid)) return;
    let mine = byUid.get(uid);
    if (!mine) byUid.set(uid, (mine = new Map()));
    for (const t of topics) mine.set(typeof t === 'string' ? t : `thread:${t.thread}`, t);
  };
  for (const e of events) {
    switch (e.kind) {
      case 'conversation': {
        if (!ok(e.a) || !ok(e.b) || e.a === e.b) break;
        const thread = { thread: pairKey(e.a, e.b) };
        add(e.a, 'inbox', thread);
        add(e.b, 'inbox', thread);
        break;
      }
      case 'note': {
        if (e.from === e.to) break;
        if (e.anonymousCard) {
          // Only the author: the writer's own client made the write, and anything else would point them at the author.
          add(e.to, 'inbox', 'bell');
          break;
        }
        if (!ok(e.from) || !ok(e.to)) break;
        const thread = { thread: pairKey(e.from, e.to) };
        add(e.from, 'inbox', thread);
        add(e.to, 'inbox', 'bell', thread);
        break;
      }
      case 'bell':
        add(e.to, 'bell');
        break;
      case 'graph':
        for (const uid of e.uids) add(uid, 'graph');
        break;
      case 'map':
        add(e.uid, 'map');
        break;
      case 'drafts':
        add(e.uid, 'drafts');
        break;
    }
  }
  return [...byUid].map(([uid, topics]) => ({ uid, topics: [...topics.values()] }));
}
