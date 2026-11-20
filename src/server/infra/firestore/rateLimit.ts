import type { RateLimiter } from '@/server/ports/rateLimit';
import type { AdminDb } from './db';

/**
 * `rateLimits/{uid}_{bucket}` — for now by delegating to src/lib/api/rateLimit
 * (loaded on first use, so that module may later import this one without a
 * cycle). The rate-limit lane moves the transaction here and keeps
 * `spend(db, …)` there as a legacy facade.
 */
export function firestoreRateLimiter(db: AdminDb): RateLimiter {
  const lib = () => import('@/lib/api/rateLimit');
  return {
    spend: async (uid, bucket, weight, now) => (await lib()).spend(db, uid, bucket, weight, now),
    spendAll: async (uid, spends, now) => (await lib()).spendAll(db, uid, spends, now),
    limited: async (uid, bucket, weight) => (await lib()).limited(db, uid, bucket, weight),
  };
}
