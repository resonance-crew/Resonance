import { describe, expect, it } from 'vitest';
import { SIGNALS_VERSION, type RealtimePublisher, type SignalsDoc } from '@/server/ports/realtime';

/**
 * What every RealtimePublisher keeps (ports/realtime.ts): each touch raises
 * the counters it names by one — touches side by side all count — threads
 * by their pair id, the document says its version, and a touch never throws.
 * Run on memory (src/server/infra/memory/realtime.test.ts) and on the
 * emulator (test/emulator/ports.realtime.emulator.test.ts).
 */
export interface RealtimeHarness {
  publisher: RealtimePublisher;
  /** `signals/{uid}` as committed (counters absent read as 0); null when nothing touched them. */
  read(uid: string): Promise<SignalsDoc | null>;
  id(n: string): string;
}

export function describeRealtimeContract(name: string, make: () => RealtimeHarness | Promise<RealtimeHarness>) {
  describe(`RealtimePublisher contract: ${name}`, () => {
    it('raises each topic named by one, and leaves the others as they were', async () => {
      const h = await make();
      const alice = h.id('alice');
      await h.publisher.touch(alice, ['graph']);
      await h.publisher.touch(alice, ['graph', 'inbox']);
      expect(await h.read(alice)).toEqual({ v: SIGNALS_VERSION, inbox: 1, bell: 0, graph: 2, map: 0, drafts: 0, threads: {} });
    });

    it('counts threads by their pair id, apart from one another', async () => {
      const h = await make();
      const bob = h.id('bob');
      const [p, q] = [`${h.id('a')}_${bob}`, `${bob}_${h.id('z')}`];
      await h.publisher.touch(bob, ['inbox', { thread: p }]);
      await h.publisher.touch(bob, ['inbox', { thread: p }, { thread: q }]);
      const doc = await h.read(bob);
      expect(doc?.inbox).toBe(2);
      expect(doc?.threads).toEqual({ [p]: 2, [q]: 1 });
    });

    it('loses no touch made at the same time as another', async () => {
      const h = await make();
      const carol = h.id('carol');
      await Promise.all(Array.from({ length: 8 }, () => h.publisher.touch(carol, ['bell'])));
      expect((await h.read(carol))?.bell).toBe(8);
    });

    it("touches only the person named: no one else's document appears", async () => {
      const h = await make();
      await h.publisher.touch(h.id('dan'), ['map', 'drafts']);
      expect(await h.read(h.id('erin'))).toBeNull();
      expect(await h.read(h.id('dan'))).toMatchObject({ map: 1, drafts: 1 });
    });
  });
}
