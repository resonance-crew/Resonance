import type { Bucket, Spend } from '@/lib/api/rateLimit';

export type { Bucket, Spend };

/**
 * Per-user fixed windows (src/lib/api/rateLimit.ts `LIMITS`): one window per
 * user and bucket, spent atomically so two requests can't both take the last
 * unit.
 */
export interface RateLimiter {
  /** Spend `weight` (1) of the bucket, or throw the 429 `rate_limited` ApiFailure when the window has no room. */
  spend(uid: string, bucket: Bucket, weight?: number, now?: number): Promise<void>;
  /** Several buckets at once, in order: the first without room refuses (429), the ones before it stay spent. */
  spendAll(uid: string, spends: readonly Spend[], now?: number): Promise<void>;
  /** For the routes outside /api/v1: the 429 response to return, or null to go ahead. */
  limited(uid: string, bucket: Bucket | readonly Spend[], weight?: number): Promise<Response | null>;
}
