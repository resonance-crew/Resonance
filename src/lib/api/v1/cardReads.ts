import type { AdminDb } from '@/server/infra/firestore/db';
import { ctxFor } from '@/server/infra/firestore/ctx';
import { countCardReadIn } from '@/server/app/cardReads';

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
 * Firestore TTL policy on the collection, so the marker itself is gone once it
 * has done its work.
 *
 * How a reader read a card is kept elsewhere since round 26, and for one
 * reason only — picking cards for that reader: `readerSignals/{uid}_{cardId}`
 * (./reading, POST …/reading) holds their active time, how far they read,
 * the days they came back and whether they shared it, for 180 days after
 * their last read (its own TTL), deleted with their account and with the
 * card. Its author hears no name from it, only a weekly count of three
 * readers or more (lib/push/readSummary). This count is apart from all that,
 * and shown to no one yet.
 *
 * Counted reads spend the reader's `read` budget (already counted today
 * spends nothing): a script walking every card can't count more than that a
 * day. Over it, reads go uncounted and are still answered 204.
 */
export { CARD_READS, readDay } from '@/server/domain/taps';
export { cardReadRef } from '@/server/infra/firestore/repos/taps';

// The legacy facade (src/server/README.md): today's export and signature, run
// by the service of src/server/app/cardReads.ts on a context bound to `db`.

/**
 * Count `viewerId` reading card `cardId` (see above). Resolves to whether it
 * was counted — for tests and logs only: the route answers 204 either way.
 * Throws only the `read` budget's 429.
 */
export function countCardRead(db: AdminDb, viewerId: string, cardId: string, now = Date.now()): Promise<boolean> {
  return countCardReadIn(ctxFor(db), viewerId, cardId, now);
}
