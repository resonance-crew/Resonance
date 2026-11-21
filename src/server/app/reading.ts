import { ApiFailure } from '@/lib/api/v1/http';
import type { ReadingReportInput } from '@/lib/api/v1/schemas';
import { readSeconds } from '@/lib/readTime';
import type { ServerCtx } from '@/server/ctx';
import { REPORTS_PER_CARD_DAY, foldReading, utcDay } from '@/server/domain/reading';
import { docIdOk } from '@/server/domain/taps';

// A reader's reading report (round 26 §R3) as an application service. Why each
// check: the module comment of src/lib/api/v1/reading.ts (the legacy facade).

/** See src/lib/api/v1/reading.ts `reportReading`. */
export async function reportReadingIn(ctx: ServerCtx, viewerId: string, cardId: string, report: ReadingReportInput, now = ctx.clock.now()): Promise<boolean> {
  if (!docIdOk(viewerId) || !docIdOk(cardId)) return false;
  const taps = ctx.data.taps;
  const { card, kept } = await taps.readingGate(viewerId, cardId);
  if (!card) return false;
  if (card.authorId === viewerId || !card.publishedAt || card.trashedAt != null) return false;
  if (!(await taps.canView(card, viewerId))) return false;
  if (card.anonymous !== true && (await taps.blockedEitherWay(viewerId, card.authorId))) return false;
  // The day's reports already in: nothing kept, nothing spent.
  if (kept && kept.reportDay === utcDay(now) && kept.reportsToday >= REPORTS_PER_CARD_DAY) return false;
  try {
    await ctx.limits.spend(viewerId, 'readReport', 1, now);
  } catch (err) {
    // Over budget the report goes unkept, quietly: a 429 here, and not on the next card, would say this one was readable.
    if (err instanceof ApiFailure && err.code === 'rate_limited') return false;
    throw err;
  }
  const expected = readSeconds(String(card.story ?? ''));
  return ctx.uow.run(
    async (tx) => {
      const [record, live] = await Promise.all([tx.taps.getSignal(viewerId, cardId), tx.taps.cardLive(cardId)]);
      // The card gone or trashed meanwhile.
      if (!live) return false;
      const next = foldReading(record, report, now, expected);
      if (!next) return false;
      tx.taps.putSignal(viewerId, cardId, next, expected);
      return true;
    },
    { label: 'reportReading' },
  );
}

/** See src/lib/api/v1/reading.ts `deleteSignalsOn`. */
export function deleteSignalsOnIn(ctx: ServerCtx, cardId: string): Promise<void> {
  return ctx.data.taps.deleteSignalsOn(cardId);
}
