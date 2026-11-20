import type { RealtimeTopic } from '@/server/ports/realtime';

/**
 * Phase 2 inbox (2a-inbox): who a write to the inbox, a thread or the bell
 * touches (`signals/{uid}`, phase2-spec "The signal channel"), as a pure
 * table — the coordinator folds it into `domain/realtime.ts`. A touch says
 * only *that* a list changed; the client pulls what through /api/v1.
 *
 * - a message, a note in the thread, a reaction, an unsend, 停止分享, a
 *   deleted conversation → both people's `inbox` and `threads[pair]`;
 * - reading a conversation → the reader's own `inbox` and `threads[pair]`
 *   (nothing the other person lists changed);
 * - a bell row written, changed or read → its recipient's `bell`.
 *
 * A note on an ANONYMOUS card touches its author's `bell` alone: nothing
 * fires for its writer, and nothing names the pair (no `threads[pair]`, no
 * `inbox`) — a touch pointing the writer at the author would say whose card
 * it is. A note withheld across a block touches no one.
 */
export interface Touch {
  uid: string;
  topics: RealtimeTopic[];
}

const both = (a: string, b: string, topics: RealtimeTopic[]): Touch[] => [
  { uid: a, topics },
  { uid: b, topics },
];

/** A change to the thread both people see: a message, a reaction, an unsend, 停止分享, a deletion. */
export function threadChanged(pair: string, a: string, b: string): Touch[] {
  return both(a, b, ['inbox', { thread: pair }]);
}

/** A message sent; `rang` when it wrote its recipient's bell row too (a conversation's first message). */
export function messageSent(pair: string, from: string, to: string, rang: boolean): Touch[] {
  const touches = threadChanged(pair, from, to);
  if (rang) touches[1] = { uid: to, topics: [...touches[1].topics, 'bell'] };
  return touches;
}

/** What a note's sending touched, by how it went. */
export type NoteOutcome =
  /** Into the thread (a named card): both people's inbox and thread, the author's bell (its row). */
  | { kind: 'threaded'; pair: string; writer: string; author: string }
  /** On an anonymous card: the author's bell row, and nothing anywhere else. */
  | { kind: 'anonymous'; author: string }
  /** Withheld across a block, or the same note sent again: nothing new for anyone. */
  | { kind: 'none' };

export function noteSent(outcome: NoteOutcome): Touch[] {
  switch (outcome.kind) {
    case 'threaded':
      return [
        { uid: outcome.writer, topics: ['inbox', { thread: outcome.pair }] },
        { uid: outcome.author, topics: ['inbox', { thread: outcome.pair }, 'bell'] },
      ];
    case 'anonymous':
      return [{ uid: outcome.author, topics: ['bell'] }];
    case 'none':
      return [];
  }
}

/** A conversation read: the reader's own unread count went to 0. */
export function conversationRead(pair: string, reader: string): Touch[] {
  return [{ uid: reader, topics: ['inbox', { thread: pair }] }];
}

/** A bell row written, changed, deleted or read: its recipient's bell. */
export function bellChanged(recipient: string): Touch[] {
  return [{ uid: recipient, topics: ['bell'] }];
}
