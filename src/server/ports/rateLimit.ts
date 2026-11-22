import type { AddressBucket, Bucket, Spend } from '@/server/domain/rateLimit';

export type { AddressBucket, Bucket, Spend };

/**
 * Per-user fixed windows (src/server/domain/rateLimit.ts `LIMITS`): one window per
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

/**
 * Per-address fixed windows (domain/rateLimit `ADDRESS_LIMITS`), for the
 * routes that answer before anyone is known: best-effort, per instance.
 */
export interface AddressLimiter {
  /** Spend one of `address`'s `bucket` (no address: one shared bucket), or throw the 429 `rate_limited` ApiFailure. */
  spend(address: string | null, bucket: AddressBucket, now?: number): Promise<void>;
}
