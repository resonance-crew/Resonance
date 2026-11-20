// Legacy facades over the RateLimiter port (src/server/ports/rateLimit.ts):
// about forty routes and the rateLimit emulator suite call `spend(db, …)`
// with a Firestore; the budgets live in src/server/domain/rateLimit.ts, the
// windows in src/server/infra/firestore/rateLimit.ts.
import type { AdminDb } from '@/server/infra/firestore/db';
import { firestoreRateLimiter } from '@/server/infra/firestore/rateLimit';
import type { Bucket, Spend } from '@/server/domain/rateLimit';

export { LIMITS, type Bucket, type Spend } from '@/server/domain/rateLimit';

/**
 * Spend `weight` (default 1) of `uid`'s `bucket`, or throw a 429
 * `rate_limited` ApiFailure when the current window has no room left.
 *
 * One server-only document per user and bucket (`rateLimits/{uid}_{bucket}`,
 * closed to clients by the rules; deleted with the account) holds the
 * window's start and what was spent in it — a fixed window, counted in a
 * transaction so concurrent requests can't both take the last unit.
 */
export async function spend(db: AdminDb, uid: string, bucket: Bucket, weight = 1, now = Date.now()): Promise<void> {
  await firestoreRateLimiter(db).spend(uid, bucket, weight, now);
}

/**
 * spend() of several buckets in one transaction (a picture's count and its
 * bytes), as spending them one after another would: in order, each spent
 * while it has room, the first without room refusing the request (429) —
 * the ones before it stay spent, the ones after it untouched.
 */
export async function spendAll(db: AdminDb, uid: string, spends: readonly Spend[], now = Date.now()): Promise<void> {
  await firestoreRateLimiter(db).spendAll(uid, spends, now);
}

/**
 * spend() for the routes outside /api/v1: the 429 response to return, or
 * null when the request may go ahead. Several buckets at once (spendAll)
 * when given a list.
 */
export async function limited(db: AdminDb, uid: string, bucket: Bucket | readonly Spend[], weight = 1): Promise<Response | null> {
  return firestoreRateLimiter(db).limited(uid, bucket, weight);
}
