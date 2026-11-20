import { getAdminDb } from '@/lib/db/firestore/admin';
import { refreshPoolStatsIn } from '@/server/app/recommendPool';
import type { AdminDb } from '@/server/infra/firestore/db';
import { ctxFor } from '@/server/infra/firestore/ctx';
import { recommendData } from '@/server/infra/firestore/repos/recommend';
import type { StoredPoolStats } from '@/server/ports/repos/recommend';
import { getVectorStore } from './vectorStore';
import type { IVectorStore } from './vectorStore/interfaces';

/**
 * The pool's numbers kept for a pool too big to read whole (round 26 §A2.3,
 * C1), and this instance's read of the public pool (B1) — now
 * src/server/app/recommendPool.ts, kept in `config/recommendPool` by the
 * recommend repository. These are the legacy exports.
 */
export { cachedPoolStats, cachedPublicPool, POOL_MEMO_MS, publicPool, recordModel } from '@/server/app/recommendPool';
export { POOL_STATS_DOC } from '@/server/infra/firestore/repos/recommend';
export type { StoredPoolStats } from '@/server/ports/repos/recommend';

/** Work the pool's numbers out and keep them (the warm-up cron, daily). */
export function refreshPoolStats(embedModel: string, opts: { db?: AdminDb; store?: IVectorStore } = {}): Promise<{ cards: number; parts: number }> {
  return refreshPoolStatsIn(ctxFor(opts.db ?? getAdminDb(), { vectors: opts.store ?? getVectorStore() }), embedModel);
}

/** The kept numbers, or null (none yet, another model's, or unreadable). */
export function readPoolStats(embedModel: string, db: AdminDb = getAdminDb()): Promise<StoredPoolStats | null> {
  return recommendData(db).getPoolStats(embedModel);
}
