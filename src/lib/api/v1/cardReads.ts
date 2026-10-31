import { FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { mapCard } from '@/lib/db/firestore/mapper';
import { isReservedId } from '@/lib/db/firestore/reservedId';
import { spend } from '@/lib/api/rateLimit';
import { ApiFailure } from './http';
import { CARD_VISIBILITY_FIELDS, canView } from './present';

/**
 * A card's `readCount`: how many reader-days it has had — each signed-in
 * reader other than its author counted at most once per card per UTC day,
 * however often they open it (POST /api/v1/cards/{id}/read, which the card
 * page calls once it shows the card).
 *
 * Only the server writes it (the rules refuse a client's `readCount`), and
 * only for a card the reader may read as GET /cards/{key} would answer it:
 * published, not in the trash, public — or for connections only and the two
 * connected. Never the author's own reads, never across a block either way on
 * a named card; an anonymous card is counted whoever the reader blocked, as a
 * block never touches one. Whatever it decides, the caller is answered the
 * same 204, so asking says nothing about a card — not whose an anonymous one
 * is, not whether it exists.
 *
 * The day's marker is `cardReads/{uid}_{cardId}` = `{ userId, cardId, day,
 * expireAt }` (server-only, closed to clients by the rules; deleted with the
 * reader's account and with the cards of a purged account). One document per
 * reader and card, overwritten on a later day, so it never grows past what a
 * reader has opened; `expireAt` (the end of the next UTC day) is there for a
 * Firestore TTL policy on the collection, which leaves no reading history
 * behind once the marker has done its work.
 *
 * Counted reads spend the reader's `read` budget (already counted today
 * spends nothing): a script walking every card can't count more than that a
 * day. Over it, reads go uncounted and are still answered 204.
 */
export const CARD_READS = 'cardReads';

const DAY_MS = 24 * 60 * 60 * 1000;

/** The UTC day `now` falls on, as YYYY-MM-DD. */
export const readDay = (now: number) => new Date(now).toISOString().slice(0, 10);

const idOk = (id: string) => id.length > 0 && !id.includes('/') && !isReservedId(id);

export const cardReadRef = (db: Firestore, uid: string, cardId: string) => db.collection(CARD_READS).doc(`${uid}_${cardId}`);

async function blockedEitherWay(db: Firestore, a: string, b: string): Promise<boolean> {
  const [ab, ba] = await db.getAll(db.doc(`users/${a}/blocks/${b}`), db.doc(`users/${b}/blocks/${a}`));
  return ab.exists || ba.exists;
}

/**
 * Count `viewerId` reading card `cardId` (see above). Resolves to whether it
 * was counted — for tests and logs only: the route answers 204 either way.
 * Throws only the `read` budget's 429.
 */
export async function countCardRead(db: Firestore, viewerId: string, cardId: string, now = Date.now()): Promise<boolean> {
  if (!idOk(viewerId) || !idOk(cardId)) return false;
  const cardRef = db.doc(`cards/${cardId}`);
  const [snap] = await db.getAll(cardRef, { fieldMask: [...CARD_VISIBILITY_FIELDS] });
  if (!snap.exists) return false;
  const card = mapCard(snap.id, snap.data()!);
  if (card.authorId === viewerId || !card.publishedAt || card.trashedAt != null) return false;
  if (!(await canView(db, card, viewerId))) return false;
  if (card.anonymous !== true && (await blockedEitherWay(db, viewerId, card.authorId))) return false;

  const day = readDay(now);
  const marker = cardReadRef(db, viewerId, cardId);
  // Already counted today: nothing written, nothing spent.
  if ((await marker.get()).get('day') === day) return false;
  try {
    await spend(db, viewerId, 'read', 1, now);
  } catch (err) {
    // Over budget the read goes uncounted, quietly: a 429 here, and not on the next card, would say this one
    // was readable and not yet counted.
    if (err instanceof ApiFailure && err.code === 'rate_limited') return false;
    throw err;
  }

  return db.runTransaction(async (tx) => {
    const [mark, current] = await tx.getAll(marker, cardRef);
    // A second tab racing this one, or the card gone or trashed meanwhile.
    if (mark.get('day') === day || !current.exists || current.get('trashedAt') != null) return false;
    const dayStart = Date.parse(`${day}T00:00:00.000Z`);
    tx.set(marker, { userId: viewerId, cardId, day, expireAt: Timestamp.fromMillis(dayStart + 2 * DAY_MS) });
    // Never updatedAt: a read changes nothing a list shows.
    tx.update(cardRef, { readCount: FieldValue.increment(1) });
    return true;
  });
}
