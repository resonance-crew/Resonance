import { describe, expect, it } from 'vitest';
import { ApiFailure } from '@/lib/api/v1/http';
import { LIMITS, type Bucket } from '@/server/domain/rateLimit';
import type { RateLimiter } from '@/server/ports/rateLimit';

/** A RateLimiter, and what its store holds as spent in a window (undefined: no window). */
export interface RateLimitHarness {
  limiter: RateLimiter;
  used(uid: string, bucket: Bucket): Promise<number | undefined>;
}

const T0 = Date.UTC(2026, 8, 30, 12);

async function refusal(p: Promise<unknown>): Promise<ApiFailure> {
  const e = await p.then(
    () => null,
    (err: unknown) => err,
  );
  expect(e).toBeInstanceOf(ApiFailure);
  return e as ApiFailure;
}

/**
 * What every RateLimiter keeps (src/lib/api/rateLimit, LIMITS): a fixed
 * window per user and bucket, weights, spendAll in order and all at once,
 * limited()'s 429 answer, and no overspending under concurrent requests.
 * `make` is called once per test; each test uses its own user ids.
 */
export function describeRateLimiterContract(name: string, make: () => RateLimitHarness | Promise<RateLimitHarness>) {
  let run = 0;
  const user = (who: string) => `${who}-${Date.now()}-${++run}`;

  describe(`RateLimiter contract: ${name}`, () => {
    it('allows the budget, then refuses with rate_limited until the window turns, per user and per bucket', async () => {
      const { limiter, used } = await make();
      const [alice, bob] = [user('alice'), user('bob')];
      const { max, windowMs } = LIMITS.illustration;
      for (let i = 0; i < max; i++) await limiter.spend(alice, 'illustration', 1, T0 + i);
      const failure = await refusal(limiter.spend(alice, 'illustration', 1, T0 + max));
      expect(failure.code).toBe('rate_limited');
      expect(await used(alice, 'illustration')).toBe(max);
      await limiter.spend(bob, 'illustration', 1, T0);
      await limiter.spend(alice, 'tags', 1, T0);
      // Still refused at the window's last millisecond, open again at its end.
      await refusal(limiter.spend(alice, 'illustration', 1, T0 + windowMs - 1));
      await limiter.spend(alice, 'illustration', 1, T0 + windowMs);
      expect(await used(alice, 'illustration')).toBe(1);
    });

    it('counts a weight against the budget', async () => {
      const { limiter, used } = await make();
      const alice = user('alice');
      const { max } = LIMITS.uploadBytes;
      await limiter.spend(alice, 'uploadBytes', max - 10, T0);
      await refusal(limiter.spend(alice, 'uploadBytes', 11, T0 + 1));
      await limiter.spend(alice, 'uploadBytes', 10, T0 + 2);
      expect(await used(alice, 'uploadBytes')).toBe(max);
    });

    it('spendAll: in order; the first without room refuses, those before it stay spent, those after it untouched', async () => {
      const { limiter, used } = await make();
      const erin = user('erin');
      await limiter.spendAll(erin, [['chatImage'], ['chatImageBytes', 1_000]], T0);
      expect([await used(erin, 'chatImage'), await used(erin, 'chatImageBytes')]).toEqual([1, 1_000]);
      const failure = await refusal(limiter.spendAll(erin, [['chatImage'], ['chatImageBytes', LIMITS.chatImageBytes.max]], T0 + 1));
      expect(failure.code).toBe('rate_limited');
      expect([await used(erin, 'chatImage'), await used(erin, 'chatImageBytes')]).toEqual([2, 1_000]);
      for (let i = 0; i < LIMITS.upload.max; i++) await limiter.spend(erin, 'upload', 1, T0);
      await refusal(limiter.spendAll(erin, [['upload'], ['uploadBytes', 10]], T0 + 2));
      expect(await used(erin, 'uploadBytes')).toBeUndefined();
    });

    it('never lets concurrent requests overspend', async () => {
      const { limiter, used } = await make();
      const carol = user('carol');
      const { max } = LIMITS.illustration;
      const results = await Promise.allSettled(Array.from({ length: max + 5 }, () => limiter.spendAll(carol, [['illustration'], ['uploadBytes', 10]], T0)));
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(max);
      // The count comes first: a request it refuses spends no bytes.
      expect([await used(carol, 'illustration'), await used(carol, 'uploadBytes')]).toEqual([max, max * 10]);
    });

    it('limited: null while there is room, then the 429 ApiError response; a list spends several buckets', async () => {
      const { limiter, used } = await make();
      const dana = user('dana');
      for (let i = 0; i < LIMITS.export.max; i++) expect(await limiter.limited(dana, 'export')).toBeNull();
      const res = await limiter.limited(dana, 'export');
      expect(res?.status).toBe(429);
      expect(res?.headers.get('Cache-Control')).toBe('no-store');
      expect(await res?.json()).toEqual({ error: { code: 'rate_limited', message: 'Too many requests. Please try again later.' } });

      expect(await limiter.limited(dana, [['upload'], ['uploadBytes', 500]])).toBeNull();
      expect(await used(dana, 'uploadBytes')).toBe(500);
      expect((await limiter.limited(dana, [['upload'], ['uploadBytes', LIMITS.uploadBytes.max]]))?.status).toBe(429);
      expect(await used(dana, 'upload')).toBe(2);
    });
  });
}
