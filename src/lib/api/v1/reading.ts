import type { ReadingReportInput } from './schemas';
import type { AdminDb } from '@/server/infra/firestore/db';
import { ctxFor } from '@/server/infra/firestore/ctx';
import { deleteSignalsOnIn, reportReadingIn } from '@/server/app/reading';

/**
 * How a reader read a card (round 26 §R3): the reading reports the card page
 * sends as it is left (POST /api/v1/cards/{id}/reading), kept for one purpose
 * — picking cards for that reader (the recommender's taste, run 2) — and, as
 * a weekly count of three or more with no names, for the card's author
 * (lib/push/readSummary). Never anyone's name to anyone.
 *
 * `readerSignals/{uid}_{cardId}` (server-only: the rules refuse every client
 * read and write) = `{ userId, cardId, firstAt, lastAt, days (the UTC days it
 * was read, ≤ 60), sessions (the last 5 page views: { id, active, progress,
 * startedAt, at, endSeen, end, rereadable, reread }), activeSeconds,
 * maxProgress, reachedEndAt, rereads, rereadAt, shared, reportDay,
 * reportsToday, expectedSeconds, expireAt }`. `expireAt` is 180 days after the last read, for
 * the Firestore TTL policy on the collection (firestore.indexes.json): a card
 * not opened again for half a year leaves nothing behind. Deleted with the
 * reader's account and with the card (deleteCard, the purge's `byCard`), and
 * an anonymous card's as it goes into the trash (./trash: in its readers'
 * exports, they would otherwise end in the purge's run beside its author's
 * profile).
 *
 * A report holds its page view's running totals (`session` is that view's id):
 * the server keeps the largest seconds and progress each session has said and
 * adds sessions up — a report sent twice, or every few seconds, counts once.
 * Timestamps are the server's. What a client says is clamped: progress to
 * 0…1, active seconds to three times the story's reading time (readSeconds,
 * unrounded) plus ten minutes. At most REPORTS_PER_CARD_DAY reports a reader
 * and card a UTC day are kept, and every kept report spends the `readReport`
 * budget; past either, reports go unkept.
 *
 * - **Read to the end**: a session whose end came into view (`reachedEnd`)
 *   with at least END_ACTIVE_SHARE of the reading time spent (`reachedEndAt`,
 *   the latest such session's time) — a short card whose end shows at once is
 *   not read to the end before then.
 * - **A re-read**: a session starting at least REREAD_GAP_MS after the one
 *   before it ended, once it is REREAD_PROGRESS of the way through (`rereads`,
 *   `rereadAt`).
 *
 * Who is counted is what POST …/read counts (./cardReads): a signed-in reader
 * other than the author, of a card they may read — published, out of the
 * trash, public or connected —, never a named card across a block either way,
 * an anonymous card whoever was blocked. Whatever happens the caller is
 * answered the same 204, so asking says nothing about a card.
 */
export {
  READER_SIGNALS,
  SIGNAL_KEEP_DAYS,
  REPORTS_PER_CARD_DAY,
  DAYS_KEPT,
  SESSIONS_KEPT,
  REREAD_GAP_MS,
  REREAD_PROGRESS,
  END_ACTIVE_SHARE,
  ACTIVE_FACTOR,
  ACTIVE_SLACK_SECONDS,
  activeCap,
  foldReading,
  utcDay,
  type SessionState,
  type SignalState,
} from '@/server/domain/reading';
export { signalDoc, signalRef, signalState } from '@/server/infra/firestore/repos/taps';

// Legacy facades (src/server/README.md): today's exports and signatures, run
// by the services of src/server/app/reading.ts on a context bound to `db`.

/**
 * Keep `viewerId`'s reading report on card `cardId` (see above). Resolves to
 * whether it was kept — for tests and logs only: the route answers 204
 * either way.
 */
export function reportReading(db: AdminDb, viewerId: string, cardId: string, report: ReadingReportInput, now = Date.now()): Promise<boolean> {
  return reportReadingIn(ctxFor(db), viewerId, cardId, report, now);
}

/** Every reading record of the card `id`, a batch at a time (deleting the card, or trashing an anonymous one). */
export function deleteSignalsOn(db: AdminDb, id: string): Promise<void> {
  return deleteSignalsOnIn(ctxFor(db), id);
}
