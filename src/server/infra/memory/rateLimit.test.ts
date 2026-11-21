import { describe, expect, it } from 'vitest';
import { describeRateLimiterContract } from '@/server/contract/rateLimit.contract';
import { chargeWindows } from '@/server/domain/rateLimit';
import { memoryCtx } from './ctx';
import { memoryRateLimiter } from './rateLimit';
import { MemoryState } from './state';

// The memory RateLimiter against the same contract as Firestore's emulator
// (test/emulator/ports.rateLimit.emulator.test.ts), then the pure policy both share.

describeRateLimiterContract('memory', () => {
  const state = new MemoryState();
  return {
    limiter: memoryRateLimiter(state),
    used: async (uid, bucket) => state.get<{ used: number }>('rateLimits', `${uid}_${bucket}`)?.used,
  };
});

describe('the memory context', () => {
  it('keeps its windows in its own state, as Firestore keeps rateLimits/{uid}_{bucket}', async () => {
    const ctx = memoryCtx();
    await ctx.limits.spend('ann', 'note', 2, 1_000);
    expect(ctx.state.dump().rateLimits).toEqual({ ann_note: { userId: 'ann', bucket: 'note', windowStart: 1_000, used: 2 } });
  });
});

describe('chargeWindows', () => {
  it('treats a stored window with a field that is not a number as no window', () => {
    const { allowed, writes } = chargeWindows('u', [['note', 3]], [{ windowStart: 'x', used: 99 }], 5);
    expect(allowed).toBe(true);
    expect(writes).toEqual([{ index: 0, window: { userId: 'u', bucket: 'note', windowStart: 5, used: 3 } }]);
  });

  it('reads the same bucket twice in one request as it was before the request', () => {
    const { writes } = chargeWindows('u', [['note'], ['note']], [null, null], 0);
    expect(writes.map((w) => w.window.used)).toEqual([1, 1]);
  });
});
