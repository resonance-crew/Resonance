import { beforeEach, describe, expect, it } from 'vitest';
import { ReadAfterWriteError } from '@/server/ports/uow';
import type { ProbeHarness } from './probe';

/**
 * What every UnitOfWork adapter guarantees (ports/uow.ts), run against the
 * memory adapter (src/server/infra/memory/uow.test.ts) and Firestore's
 * emulator (test/emulator/ports.uow.emulator.test.ts). `make` answers a fresh
 * harness for each test (its own keys or collection).
 */
export function describeUnitOfWorkContract(name: string, make: () => ProbeHarness | Promise<ProbeHarness>) {
  describe(`UnitOfWork contract — ${name}`, () => {
    let h: ProbeHarness;
    beforeEach(async () => {
      h = await make();
    });

    it('answers what fn answers, and keeps what it wrote', async () => {
      const answer = await h.uow.run(async (tx) => {
        const before = await tx.get('a');
        tx.set('a', 1);
        tx.set('b', 2);
        return { before };
      });
      expect(answer).toEqual({ before: null });
      expect(await h.peek('a')).toBe(1);
      expect(await h.peek('b')).toBe(2);
    });

    it('a later transaction reads what an earlier one committed, and may delete it', async () => {
      await h.uow.run(async (tx) => tx.set('a', 5));
      expect(await h.uow.run(async (tx) => tx.get('a'))).toBe(5);
      await h.uow.run(async (tx) => tx.delete('a'));
      expect(await h.peek('a')).toBeNull();
    });

    it('keeps nothing a failed fn wrote, and throws its error', async () => {
      await h.uow.run(async (tx) => tx.set('kept', 1));
      const boom = new Error('boom');
      await expect(
        h.uow.run(async (tx) => {
          await tx.get('kept');
          tx.set('kept', 99);
          tx.set('new', 1);
          throw boom;
        }),
      ).rejects.toBe(boom);
      expect(await h.peek('kept')).toBe(1);
      expect(await h.peek('new')).toBeNull();
    });

    it('refuses a read after a write (ReadAfterWriteError), keeping nothing', async () => {
      await expect(
        h.uow.run(
          async (tx) => {
            tx.set('a', 1);
            return tx.get('b');
          },
          { label: 'probe' },
        ),
      ).rejects.toBeInstanceOf(ReadAfterWriteError);
      expect(await h.peek('a')).toBeNull();
    });

    it('takes many reads before its writes', async () => {
      await h.uow.run(async (tx) => {
        tx.set('x', 1);
        tx.set('y', 2);
      });
      const sum = await h.uow.run(async (tx) => {
        const [x, y, z] = await Promise.all([tx.get('x'), tx.get('y'), tx.get('z')]);
        const total = (x ?? 0) + (y ?? 0) + (z ?? 0);
        tx.set('sum', total);
        return total;
      });
      expect(sum).toBe(3);
      expect(await h.peek('sum')).toBe(3);
    });

    it('serialises concurrent read-modify-writes: no increment is lost', async () => {
      const N = 5;
      const results = await Promise.all(
        Array.from({ length: N }, () =>
          h.uow.run(async (tx) => {
            const next = ((await tx.get('counter')) ?? 0) + 1;
            tx.set('counter', next);
            return next;
          }),
        ),
      );
      expect(await h.peek('counter')).toBe(N);
      // Each transaction saw a different value: none ran on a stale read.
      expect([...results].sort((a, b) => a - b)).toEqual(Array.from({ length: N }, (_, i) => i + 1));
    });
  });
}
