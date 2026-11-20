import { indexOwedIn, markIndexOwedIn, type IndexOwedRun } from '@/server/app/recommendIndex';
import type { AdminDb } from '@/server/infra/firestore/db';
import { ctxFor } from '@/server/infra/firestore/ctx';
import { getVectorStore } from './vectorStore';

/**
 * The daily re-reading (round 26 §A1.8, `/api/cron/index-cards`) — now
 * src/server/app/recommendIndex.ts. These are its legacy facades, on the
 * database they are handed (the readings too: indexCard took the app's admin
 * database, which in production and under the emulator suites is that one).
 */
export { INDEX_OWED_CONCURRENCY, INDEX_OWED_LIMIT, type IndexOwedRun } from '@/server/app/recommendIndex';

export function indexOwed(db: AdminDb, opts: { limit?: number; deadline?: number; now?: () => number } = {}): Promise<IndexOwedRun> {
  return indexOwedIn(ctxFor(db, { vectors: getVectorStore() }), opts);
}

/**
 * Mark a card's reading owed (an applied edit): the daily run reads it again.
 * An update, so a card deleted meanwhile stays deleted; one gone is no error.
 */
export async function markIndexOwed(db: AdminDb, cardId: string): Promise<void> {
  await markIndexOwedIn(ctxFor(db), cardId);
}
