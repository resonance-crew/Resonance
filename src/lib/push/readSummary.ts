import { runReadSummaryIn, type ReadSummaryRun } from '@/server/app/pushReadSummary';
import { ctxFor } from '@/server/infra/firestore/ctx';
import type { AdminDb } from '@/server/infra/firestore/db';

export {
  BELL_READ_SUMMARY_CAPABILITY,
  READ_SUMMARY,
  READ_SUMMARY_MIN,
  WEEK_MS,
  readSummaryId,
  weekTally,
  type WeekRead,
  type WeekTally,
} from '@/server/domain/push/readSummary';
export type { ReadSummaryRun } from '@/server/app/pushReadSummary';

/**
 * The weekly read summary (round 26 §R4, `/api/cron/read-summary`, Mondays
 * 01:00 UTC = 09:00 in Taipei): for each published public card, how many
 * readers — never its author — read it to the end in the seven days before
 * the run (`readerSignals.reachedEndAt`, lib/api/v1/reading). Three or more,
 * and the author gets one bell row, `notifications/rsum_{cardId}_{yyyymmdd}` =
 * `{ userId, type: 'read_summary', payload: { cardId, readers, reread,
 * anonymous?: true }, readAt, createdAt, pushedAt }` — 「上週有 {count} 個人把這張卡
 * 讀到最後」, with 「，有人回來又讀了一遍」 when one of them came back to read it
 * again that week (`reread`). Fewer than three, nothing: a count that small
 * could name its readers. Names never, at any count. A card for connections
 * only (or private by now) never gets one, at any count: its readers are
 * among the author's connections, who may be only three or four while few
 * connections exist, and a count of three could then name them all.
 *
 * A bell row only: written already pushed (`pushedAt`), so nothing rings a
 * phone for it (no switch is needed for what never buzzes). Like the tap's
 * row (./tapBell), it is written only when every app install the author has
 * registered declares `bell-read-summary`: an older build would draw its type
 * as a raw string. Opens the card. The row's id carries the run's day, so a
 * run repeated the same day writes nothing new.
 *
 * The service is src/server/app/pushReadSummary; this keeps the old signature.
 */
export function runReadSummary(db: AdminDb, opts: { now?: number; deadline?: number; clock?: () => number } = {}): Promise<ReadSummaryRun> {
  return runReadSummaryIn(ctxFor(db), { ...opts, now: opts.now ?? Date.now(), clock: opts.clock ?? Date.now });
}
