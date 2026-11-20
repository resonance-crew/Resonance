import type { ChatImageStore } from '@/lib/storage/chatImages';
import {
  purgeUnsentCopiesIn,
  removeReactionIn,
  setReactionIn,
  unsendMessageIn,
  unsentCopiesIn,
  type UnsentCopyPurge,
  type UnsentMessage,
} from '@/server/app/messages';
import { ctxFor } from '@/server/infra/firestore/ctx';
import type { AdminDb } from '@/server/infra/firestore/db';
import type { SetReactionInput } from './schemas';

/**
 * What a person does to a message already in their conversation (round 16):
 * answer it with a reaction (PUT/DELETE …/messages/{id}/reaction), or unsend
 * one of their own (POST …/messages/{id}/unsend). Both are the server's to
 * write — the rules let no client create or update a message.
 */

// Legacy facades: the services are src/server/app/messages.ts, their
// Firestore code src/server/infra/firestore/repos/conversations.ts.

export { QUOTES_IN_TRANSACTION, UNSEND_WINDOW_MS, UNSENT_COPY_KEEP_MS, UNSENT_MESSAGES, otherInPair, unsentQuote } from '@/server/domain/conversations';
export { unsentCopyRef } from '@/server/infra/firestore/repos/conversations';
export type { UnsentCopyPurge, UnsentMessage } from '@/server/app/messages';

/**
 * Answer a message in one's own conversation with a reaction: `reactions.{uid}`
 * on the message — one per person, a second replacing the first; one's own
 * messages take them too. Quiet: no bell, no push, no unread, the list's
 * preview unchanged (the thread's listener shows it). Checked in the
 * contract's order, after the route spent the `react` budget: the
 * conversation and the message (not_found for one the viewer isn't in, a
 * message not in it, or an unsent one), the pen name, a block either way,
 * the connection — a letter not yet answered takes no reactions. All in one
 * transaction, so a reaction never lands on a message unsent a moment before.
 */
export async function setReaction(db: AdminDb, uid: string, pair: string, messageId: string, input: SetReactionInput): Promise<void> {
  return setReactionIn(ctxFor(db), uid, pair, messageId, input);
}

/**
 * Take one's reaction to a message back. Idempotent: none there (or the
 * message unsent, which took every reaction with it) is nothing to do.
 * Taking back reaches no one, so neither a block nor a missing connection
 * stands in its way; only a conversation that isn't theirs, or a message not
 * in it, is not_found.
 */
export async function removeReaction(db: AdminDb, uid: string, pair: string, messageId: string): Promise<void> {
  return removeReactionIn(ctxFor(db), uid, pair, messageId);
}

/**
 * Unsend a message one sent, within UNSEND_WINDOW_MS: for both people it
 * becomes a line saying so. One transaction —
 * - the message becomes `{ senderId, sentAt, unsentAt }`: its words, card,
 *   picture, sticker, album place, link preview, quote and reactions gone;
 * - every message of the conversation quoting it (`replyTo.id`) keeps only
 *   `replyTo: { id, senderId, unsent: true }`;
 * - the conversation's preview, if it is this message, becomes
 *   `{ senderId, sentAt, unsent: true }` (unread counts untouched);
 * - what it said is kept for moderation, `unsentMessages/{pair}_{id}`
 *   (UNSENT_MESSAGES), with the picture it carried (its record and files stay
 *   until the copy goes; GET /chat-images no longer serves it, as no message
 *   names it).
 * Checked, after the route spent the `unsend` budget: the message — anyone
 * else's, or one not in a conversation of theirs, is not_found; a note
 * (`kind: 'note'`, a letter left on a card) can't be unsent; one already
 * unsent is answered as done (writing nothing); past the window, a conflict.
 */
export async function unsendMessage(db: AdminDb, uid: string, pair: string, messageId: string, now = Date.now()): Promise<UnsentMessage> {
  return unsendMessageIn(ctxFor(db), uid, pair, messageId, now);
}

/**
 * The conversation's unsent messages as a report's evidence keeps them: every
 * copy still kept (unsent within UNSENT_COPY_KEEP_MS of `now`), oldest first,
 * each marked `unsent: true`.
 */
export async function unsentCopiesFor(db: AdminDb, pair: string, now = Date.now()) {
  return unsentCopiesIn(ctxFor(db), pair, now);
}

/**
 * Deletes the unsent messages' copies kept UNSENT_COPY_KEEP_MS or longer, the
 * oldest first, page after page (the daily trash cron), each with the picture
 * it carried: the picture's files (best effort, when a store is at hand), then
 * its record and the copy together. Starts none past `deadline`.
 */
export async function purgeUnsentCopies(
  db: AdminDb,
  store: ChatImageStore | null,
  opts: { now?: number; deadline?: number; clock?: () => number } = {},
): Promise<UnsentCopyPurge> {
  return purgeUnsentCopiesIn(ctxFor(db, { chatObjects: store }), { now: opts.now ?? Date.now(), deadline: opts.deadline, clock: opts.clock ?? Date.now });
}
