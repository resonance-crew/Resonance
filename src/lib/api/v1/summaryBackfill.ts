import * as app from '@/server/app/summary';
import type { AdminDb } from '@/server/infra/firestore/db';
import { ctxFor } from '@/server/infra/firestore/ctx';

/**
 * Give published cards the list summary publishing now stores (./summary):
 * those published before it existed, and those whose story was written since
 * by something that doesn't restate it (the web editor applying an edit from
 * the browser). Run by scripts/backfill-card-summaries.ts; until it has run,
 * lists read those cards' stories instead, so it is safe to run any time and
 * again later.
 *
 * Each write is conditional on the card being unchanged since it was read (a
 * story edited in between is left for the next run: its summary would be the
 * old story's), and writes only the summary — `excerptAt` is the write's own
 * server time, later than the card's `updatedAt`, so it counts as current.
 *
 * The service is src/server/app/summary.ts (its reads and BulkWriter
 * src/server/infra/firestore/repos/translations.ts); this is its facade.
 */

export type SummaryBackfillOptions = app.SummaryBackfillOptions;
export type SummaryBackfillReport = app.SummaryBackfillReport;

export function backfillCardSummaries(db: AdminDb, opts: SummaryBackfillOptions = {}): Promise<SummaryBackfillReport> {
  return app.backfillCardSummaries(ctxFor(db), opts);
}
