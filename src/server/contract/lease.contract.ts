import { beforeEach, describe, expect, it } from 'vitest';
import type { LeaseStore } from '@/server/ports/lease';

/**
 * What every LeaseStore adapter guarantees (ports/lease.ts), run on memory
 * (src/server/infra/memory/lease.test.ts) and on Firestore's emulator
 * (test/emulator/ports.lease.emulator.test.ts). `make` answers a store and
 * two keys of the test's own (row paths: `collection/id`).
 */
export function describeLeaseStoreContract(name: string, make: () => Promise<{ leases: LeaseStore; key: string; other: string }>) {
  describe(`LeaseStore contract — ${name}`, () => {
    const T = Date.UTC(2026, 10, 21, 9);
    let h: { leases: LeaseStore; key: string; other: string };
    beforeEach(async () => {
      h = await make();
    });

    it('one holder at a time: a second acquire is refused while the first holds the key', async () => {
      expect(await h.leases.acquire(h.key, 90_000, T)).toBe(true);
      expect(await h.leases.acquire(h.key, 90_000, T + 1)).toBe(false);
      expect(await h.leases.acquire(h.key, 90_000, T + 89_999)).toBe(false);
      // Another key is another lease.
      expect(await h.leases.acquire(h.other, 90_000, T + 1)).toBe(true);
    });

    it('of several acquiring at once, exactly one wins', async () => {
      const won = await Promise.all(Array.from({ length: 4 }, () => h.leases.acquire(h.key, 90_000, T)));
      expect(won.filter(Boolean)).toHaveLength(1);
    });

    it('lapses at its end: the key is free again from now + ttl', async () => {
      expect(await h.leases.acquire(h.key, 1_000, T)).toBe(true);
      expect(await h.leases.acquire(h.key, 1_000, T + 999)).toBe(false);
      expect(await h.leases.acquire(h.key, 1_000, T + 1_000)).toBe(true);
    });

    it('released early, the key is free at once; releasing a free or unknown key is no error', async () => {
      expect(await h.leases.acquire(h.key, 90_000, T)).toBe(true);
      await h.leases.release(h.key);
      expect(await h.leases.acquire(h.key, 90_000, T + 1)).toBe(true);
      await h.leases.release(h.other);
      await h.leases.release(h.other);
      expect(await h.leases.acquire(h.other, 90_000, T + 1)).toBe(true);
    });
  });
}
