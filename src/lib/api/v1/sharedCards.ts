import { sharedAmongIn, stopSharingIn, wasSharedPrivatelyIn, type SharedCard } from '@/server/app/sharedCards';
import { ctxFor } from '@/server/infra/firestore/ctx';
import type { AdminDb } from '@/server/infra/firestore/db';

/**
 * A 私人卡 shared in a conversation: its author sent it to you as a message.
 * The card — one of theirs never published, or kept private — is then yours
 * to read, and only to read, for as long as that message stands.
 *
 * The pass is the message, and only a message sendMessage marked so
 * (`privateShare: true`): the server writes it — clients write no messages —
 * when the card it carries is a 私人卡 at that moment. A card sent while it
 * was public, or for connections only, and turned private later is shared
 * with no one; nor are the cards older messages carry, from before there was
 * such a pass. Whatever takes the message away takes the pass with it —
 * unsending it (an unsent message keeps nothing), 停止分享 (stopSharing:
 * its author unmarks it, any time), deleting the conversation, the account
 * purge — and it is asked again on every read, so the card
 * leaving its author's hands ends it too: published to readers (then it is
 * theirs to read by its audience, as anyone's), the trash, deleting it, a
 * block either way, or the card turning anonymous (whose card it is would
 * follow from who sent it).
 *
 * Only the two reads that show a card — GET /cards/{key} and GET /cards?keys=
 * (a thread's bubbles) — and reporting it ask this. Nothing that answers a
 * card does: a note, a resonance, a bookmark, sending it on to someone else
 * (sendMessage asks canView of its sender) all see it as private still.
 */

// Legacy facades: the services are src/server/app/sharedCards.ts, their
// Firestore code src/server/infra/firestore/repos/conversations.ts.

export { PRIVATE_SHARES, keptPrivate } from '@/server/domain/conversations';
export { privateShareRef } from '@/server/infra/firestore/repos/conversations';

/** Whether `card`'s author shared it with `viewerId` in their conversation (see above). */
export async function sharedWith(db: AdminDb, viewerId: string, card: SharedCard): Promise<boolean> {
  return (await sharedAmong(db, viewerId, [card])).has(card);
}

/**
 * Of `cards`, those their authors shared with the viewer (sharedWith): one
 * block pair, one conversation and one query per author, however many of
 * their cards are asked about.
 */
export async function sharedAmong<C extends SharedCard>(db: AdminDb, viewerId: string, cards: C[]): Promise<Set<C>> {
  return sharedAmongIn(ctxFor(db), viewerId, cards);
}

/**
 * `privateShares/{cardId}` = `{ authorId, at }`: the 私人卡 its author once
 * sent in a message (server-only: the rules close it to clients). Written by
 * sendMessage beside the message's marker, and kept whatever becomes of that
 * message — unsent, 停止分享, the conversation deleted: whoever read the card
 * then knows whose it is. Read by its author alone (GET /cards/{id}/private-shares),
 * so the publish step can say so before the card goes out anonymous: the
 * owner's call was to warn, never to refuse. Deleted with the card and with
 * the author's account.
 */

/** Whether `uid`'s card `cardId` was ever sent privately in a message (see PRIVATE_SHARES); anyone else's card, a 404. */
export async function wasSharedPrivately(db: AdminDb, uid: string, cardId: string): Promise<boolean> {
  return wasSharedPrivatelyIn(ctxFor(db), uid, cardId);
}

/**
 * 停止分享: `uid` ends the pass their messages in conversation `pair` gave to
 * their card `cardId` — every message of theirs there naming it loses its
 * marker (`privateShare`), in one transaction, with no time window (unsend's
 * is 24 hours). The messages stay as they are; to the other person the card
 * is one they can't read from then on, as for any card. Sending it again
 * shares it again. Idempotent: nothing to unmark is no error. Across a block
 * too — it reaches no one. A conversation not theirs is a 404, whether it
 * exists or not.
 */
export async function stopSharing(db: AdminDb, uid: string, pair: string, cardId: string): Promise<{ unmarked: number }> {
  return stopSharingIn(ctxFor(db), uid, pair, cardId);
}
