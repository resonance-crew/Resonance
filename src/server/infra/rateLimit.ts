import type { Spend } from '@/server/domain/rateLimit';
import type { RateLimiter } from '@/server/ports/rateLimit';

/**
 * Spends `spends` of `uid`'s windows atomically, as domain/rateLimit
 * `chargeWindows` decides, storing what it says to store; answers whether the
 * whole request had room.
 */
export type ChargeWindows = (uid: string, spends: readonly Spend[], now: number) => Promise<boolean>;

/** The 429's message, the same from every limiter. */
export const REFUSAL = 'Too many requests. Please try again later.';

/**
 * The v1 transport's failure and its response (lib/api/v1/http), loaded at
 * the first refusal: http reaches the auth module and next/server, which
 * building a context must not load.
 */
const http = () => import('@/lib/api/v1/http');

/**
 * A RateLimiter over a store's atomic charge — what every adapter answers
 * the same: the 429 `rate_limited` ApiFailure from spend/spendAll, and its
 * response from limited().
 */
export function rateLimiterOver(charge: ChargeWindows): RateLimiter {
  const spendAll: RateLimiter['spendAll'] = async (uid, spends, now = Date.now()) => {
    if (await charge(uid, spends, now)) return;
    const { ApiFailure } = await http();
    throw new ApiFailure('rate_limited', REFUSAL);
  };
  return {
    spend: (uid, bucket, weight = 1, now = Date.now()) => spendAll(uid, [[bucket, weight]], now),
    spendAll,
    async limited(uid, bucket, weight = 1) {
      if (await charge(uid, typeof bucket === 'string' ? [[bucket, weight]] : bucket, Date.now())) return null;
      return (await http()).apiError('rate_limited', REFUSAL);
    },
  };
}
