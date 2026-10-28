import { FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { isReservedId } from '@/lib/db/firestore/reservedId';
import type { Card } from '@/lib/db/types';
import { pairOf } from './conversations';
import { ApiFailure } from './http';
import { otherInPair } from './messageActions';

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

/** What sharedWith reads a card by: present's visibility fields. */
type SharedCard = Pick<Card, 'id' | 'authorId' | 'anonymous' | 'trashedAt' | 'publishedAt' | 'visibility'>;

/** How many of an author's marked messages sharing the cards asked for are read (the same card sent again and again shares no more). */
const SENT_READ = 60;
/** Firestore's `in` takes at most 30 values. */
const IN_MAX = 30;

const idOk = (id: unknown): id is string => typeof id === 'string' && id.length > 0 && !id.includes('/') && !isReservedId(id);

/** A 私人卡: never published, or published and kept private — what a message can be the pass to. */
export const keptPrivate = (card: Pick<Card, 'publishedAt' | 'visibility'>) => !card.publishedAt || card.visibility === 'private';

/** Whether `card`'s author shared it with `viewerId` in their conversation (see above). */
export async function sharedWith(db: Firestore, viewerId: string, card: SharedCard): Promise<boolean> {
  return (await sharedAmong(db, viewerId, [card])).has(card);
}

/**
 * Of `cards`, those their authors shared with the viewer (sharedWith): one
 * block pair, one conversation and one query per author, however many of
 * their cards are asked about.
 */
export async function sharedAmong<C extends SharedCard>(db: Firestore, viewerId: string, cards: C[]): Promise<Set<C>> {
  const shared = new Set<C>();
  if (!idOk(viewerId)) return shared;
  const candidates = cards.filter(
    (c) => idOk(c.id) && idOk(c.authorId) && c.authorId !== viewerId && c.trashedAt == null && c.anonymous !== true && keptPrivate(c),
  );
  const byAuthor = new Map<string, C[]>();
  for (const c of candidates) byAuthor.set(c.authorId, [...(byAuthor.get(c.authorId) ?? []), c]);
  await Promise.all(
    [...byAuthor].map(async ([author, theirs]) => {
      const ids = [...new Set(theirs.map((c) => c.id))].slice(0, IN_MAX);
      const pair = pairOf(viewerId, author);
      const [blockOut, blockIn, convo, sent] = await Promise.all([
        db.doc(`users/${viewerId}/blocks/${author}`).get(),
        db.doc(`users/${author}/blocks/${viewerId}`).get(),
        db.doc(`conversations/${pair}`).get(),
        db
          .collection(`conversations/${pair}/messages`)
          .where('senderId', '==', author)
          .where('privateShare', '==', true)
          .where('cardRef', 'in', ids)
          .select('cardRef', 'sentAt')
          .limit(SENT_READ)
          .get(),
      ]);
      if (blockOut.exists || blockIn.exists || !convo.exists) return;
      const participants = convo.get('participants');
      if (!Array.isArray(participants) || !participants.includes(viewerId) || !participants.includes(author)) return;
      // A message older than the conversation outlived its deletion (messages go before the conversation does):
      // it shares nothing once the two talk again, as its picture would show nothing (chatImages).
      const since = convo.get('createdAt');
      const passes = new Set(
        sent.docs
          .filter((m) => {
            const sentAt = m.get('sentAt');
            return !(sentAt instanceof Timestamp && since instanceof Timestamp && sentAt.toMillis() < since.toMillis());
          })
          .map((m) => m.get('cardRef')),
      );
      for (const c of theirs) if (passes.has(c.id)) shared.add(c);
    }),
  );
  return shared;
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
export const PRIVATE_SHARES = 'privateShares';

export const privateShareRef = (db: Firestore, cardId: string) => db.collection(PRIVATE_SHARES).doc(cardId);

/** Whether `uid`'s card `cardId` was ever sent privately in a message (see PRIVATE_SHARES); anyone else's card, a 404. */
export async function wasSharedPrivately(db: Firestore, uid: string, cardId: string): Promise<boolean> {
  if (!idOk(cardId)) throw new ApiFailure('not_found', 'No such card.');
  const [card, record] = await Promise.all([db.doc(`cards/${cardId}`).get(), privateShareRef(db, cardId).get()]);
  if (!card.exists || card.get('authorId') !== uid) throw new ApiFailure('not_found', 'No such card.');
  return record.exists && record.get('authorId') === uid;
}

/** How many of the messages sharing a card one transaction unmarks (the same card sent more often: the next, right after). */
const UNMARK_IN_TRANSACTION = 400;

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
export async function stopSharing(db: Firestore, uid: string, pair: string, cardId: string): Promise<{ unmarked: number }> {
  const other = idOk(uid) ? otherInPair(pair, uid) : null;
  if (!other || !idOk(cardId)) throw new ApiFailure('not_found', 'No such conversation.');
  const conversation = db.doc(`conversations/${pair}`);
  const marked = conversation
    .collection('messages')
    .where('senderId', '==', uid)
    .where('privateShare', '==', true)
    .where('cardRef', '==', cardId)
    .limit(UNMARK_IN_TRANSACTION);
  let unmarked = 0;
  for (;;) {
    const page = await db.runTransaction(async (tx) => {
      const [convo, sent] = await Promise.all([tx.get(conversation), tx.get(marked)]);
      const participants = convo.exists ? convo.get('participants') : null;
      if (!Array.isArray(participants) || !participants.includes(uid)) throw new ApiFailure('not_found', 'No such conversation.');
      for (const m of sent.docs) tx.update(m.ref, { privateShare: FieldValue.delete() });
      return sent.size;
    });
    unmarked += page;
    if (page < UNMARK_IN_TRANSACTION) return { unmarked };
  }
}
