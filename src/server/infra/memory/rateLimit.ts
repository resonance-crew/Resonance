import { chargeWindows, rateWindowId } from '@/server/domain/rateLimit';
import type { RateLimiter } from '@/server/ports/rateLimit';
import { rateLimiterOver } from '../rateLimit';
import { MemoryState } from './state';

/**
 * The windows as rows of the state's `rateLimits` table (`{uid}_{bucket}`,
 * as Firestore's documents), read and written in one synchronous step, so
 * two spends can never both take the last unit.
 */
export function memoryRateLimiter(state: MemoryState = new MemoryState()): RateLimiter {
  return rateLimiterOver(async (uid, spends, now) => {
    const ids = spends.map(([bucket]) => rateWindowId(uid, bucket));
    const { allowed, writes } = chargeWindows(uid, spends, ids.map((id) => state.get('rateLimits', id)), now);
    for (const { index, window } of writes) state.put('rateLimits', ids[index], { ...window });
    return allowed;
  });
}
