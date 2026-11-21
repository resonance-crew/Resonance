import { chargeWindows, rateWindowId } from '@/server/domain/rateLimit';
import type { RateLimiter } from '@/server/ports/rateLimit';
import { rateLimiterOver } from '../rateLimit';
import type { AdminDb } from './db';

/**
 * One server-only document per user and bucket (`rateLimits/{uid}_{bucket}`,
 * closed to clients by the rules; deleted with the account) holds the
 * window's start and what was spent in it — a fixed window, counted in a
 * transaction (every window read first, `tx.getAll`) so concurrent requests
 * can't both take the last unit.
 */
export function firestoreRateLimiter(db: AdminDb): RateLimiter {
  return rateLimiterOver(async (uid, spends, now) => {
    const refs = spends.map(([bucket]) => db.doc(`rateLimits/${rateWindowId(uid, bucket)}`));
    return db.runTransaction(async (tx) => {
      const snaps = await tx.getAll(...refs);
      const { allowed, writes } = chargeWindows(
        uid,
        spends,
        snaps.map((snap) => ({ windowStart: snap.get('windowStart'), used: snap.get('used') })),
        now,
      );
      for (const { index, window } of writes) tx.set(refs[index], { ...window });
      return allowed;
    });
  });
}
