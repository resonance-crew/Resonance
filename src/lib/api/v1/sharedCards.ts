import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import { isReservedId } from '@/lib/db/firestore/reservedId';
import type { Card } from '@/lib/db/types';
import { pairOf } from './conversations';

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
 * unsending it (an unsent message keeps nothing), deleting the conversation,
 * the account purge — and it is asked again on every read, so the card
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
