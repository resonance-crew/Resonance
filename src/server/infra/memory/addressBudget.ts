import { ADDRESS_LIMITS, spendFixedWindow, type AddressBucket } from '@/server/domain/rateLimit';
import type { AddressLimiter } from '@/server/ports/rateLimit';
import { REFUSAL } from '../rateLimit';

/** Past this many windows, the lapsed ones are dropped before the next spend. */
const PRUNE_AT = 10_000;

/**
 * The per-address windows in this instance's memory (ADDRESS_LIMITS): no
 * read, no write anywhere, so a refused request costs nothing. Each instance
 * keeps its own, and a cold start forgets them — a brake, not a count.
 */
export function memoryAddressLimiter(): AddressLimiter {
  const windows = new Map<string, { since: number; used: number }>();
  return {
    async spend(address, bucket: AddressBucket, now = Date.now()) {
      const limit = ADDRESS_LIMITS[bucket];
      if (windows.size > PRUNE_AT) {
        for (const [key, w] of windows) if (now - w.since >= ADDRESS_LIMITS[key.split(' ')[0] as AddressBucket].windowMs) windows.delete(key);
      }
      const key = `${bucket} ${address || 'unknown'}`;
      const next = spendFixedWindow(windows.get(key), limit, now);
      if (next) {
        windows.set(key, next);
        return;
      }
      // Loaded at the first refusal, as infra/rateLimit's: http reaches next/server.
      const { ApiFailure } = await import('@/lib/api/v1/http');
      throw new ApiFailure('rate_limited', REFUSAL);
    },
  };
}

/** This instance's (the /api/v1/auth routes'), made at the first request. */
let instance: AddressLimiter | null = null;
export function instanceAddressLimiter(): AddressLimiter {
  return (instance ??= memoryAddressLimiter());
}
