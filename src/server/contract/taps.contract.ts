import { beforeEach, describe, expect, it } from 'vitest';
import { ApiFailure } from '@/lib/api/v1/http';
import type { DataRepos, UnitOfWork } from '@/server/ports/uow';
import { ReadAfterWriteError } from '@/server/ports/uow';

/**
 * What every adapter of the taps aggregate's repositories guarantees
 * (ports/repos/taps.ts), run against memory (src/server/infra/memory/repos/
 * taps.test.ts) and Firestore's emulator (test/emulator/ports.taps.emulator.test.ts).
 * `make` answers a fresh harness for each test; card ids are the harness's
 * own (`card(n)`), so runs never see each other's rows.
 */
export interface TapsHarness {
  uow: UnitOfWork;
  data: DataRepos;
  /** A card id of this harness's own. */
  card(n: string): string;
  /** A published public card by `authorId` (in the trash when `trashed`), readCount 0. */
  seedCard(id: string, authorId: string, opts?: { trashed?: boolean }): Promise<void>;
  /** The card's committed readCount. */
  readCount(id: string): Promise<number>;
}

const T0 = Date.parse('2026-11-19T10:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

export function describeTapsContract(name: string, make: () => TapsHarness | Promise<TapsHarness>) {
  describe(`taps repositories contract — ${name}`, () => {
    let h: TapsHarness;
    beforeEach(async () => {
      h = await make();
    });

    it('insertReadDayIfAbsent: inserted once a day, exists after, inserted again the next day; gone on a trashed card', async () => {
      const id = h.card('read');
      await h.seedCard(id, 'alice');
      const mark = (uid: string, day: string) =>
        h.uow.run(async (tx) => {
          const r = await tx.taps.insertReadDayIfAbsent(uid, id, day, new Date(Date.parse(`${day}T00:00:00Z`) + 2 * DAY));
          if (r === 'inserted') tx.taps.incrementReadCount(id);
          return r;
        });
      expect(await mark('bob', '2026-11-19')).toBe('inserted');
      expect(await mark('bob', '2026-11-19')).toBe('exists');
      expect(await h.data.taps.readMarkDay('bob', id)).toBe('2026-11-19');
      expect(await mark('carol', '2026-11-19')).toBe('inserted');
      expect(await mark('bob', '2026-11-20')).toBe('inserted');
      expect(await h.readCount(id)).toBe(3);

      const gone = h.card('gone');
      await h.seedCard(gone, 'alice', { trashed: true });
      expect(await h.uow.run((tx) => tx.taps.insertReadDayIfAbsent('bob', gone, '2026-11-19', new Date(T0)))).toBe('gone');
      expect(await h.data.taps.readMarkDay('bob', gone)).toBeNull();
    });

    it('a tap turned on, read back, taken back (kept with its ring), and a read after a write refused', async () => {
      const id = h.card('tap');
      await h.seedCard(id, 'alice');
      expect(await h.uow.run((tx) => tx.taps.getTap(id, 'bob'))).toBeNull();
      await h.uow.run(async (tx) => tx.taps.putTapOn(id, 'bob', new Date(T0), new Date(T0 - 1000)));
      expect(await h.uow.run((tx) => tx.taps.getTap(id, 'bob'))).toEqual({ on: true, rangAt: new Date(T0 - 1000) });
      expect(await h.data.taps.tapIsOn(id, 'bob')).toBe(true);
      await h.uow.run(async (tx) => tx.taps.turnTapOff(id, 'bob'));
      expect(await h.uow.run((tx) => tx.taps.getTap(id, 'bob'))).toEqual({ on: false, rangAt: new Date(T0 - 1000) });
      expect(await h.data.taps.tapIsOn(id, 'bob')).toBe(false);
      expect((await h.uow.run((tx) => tx.taps.getTapCard(id)))?.authorId).toBe('alice');

      await expect(
        h.uow.run(async (tx) => {
          tx.taps.putTapOn(id, 'carol', new Date(T0), null);
          return tx.taps.getTap(id, 'carol');
        }),
      ).rejects.toBeInstanceOf(ReadAfterWriteError);
      expect(await h.data.taps.tapIsOn(id, 'carol')).toBe(false);
    });

    it('tapsOnPage: newest first, ties by id, every tap that is on exactly once across pages, never one taken back', async () => {
      const id = h.card('page');
      await h.seedCard(id, 'alice');
      // u2 and u3 share a millisecond; u5 is taken back.
      const at = { u1: T0 - 5000, u2: T0 - 2000, u3: T0 - 2000, u4: T0 - 1000, u5: T0, u6: T0 - 9000 };
      await h.uow.run(async (tx) => {
        for (const [uid, t] of Object.entries(at)) tx.taps.putTapOn(id, uid, new Date(t), null);
      });
      await h.uow.run(async (tx) => tx.taps.turnTapOff(id, 'u5'));

      const seen: string[] = [];
      const fulls: boolean[] = [];
      let after: string | undefined;
      for (let i = 0; i < 5; i++) {
        const page = await h.data.taps.tapsOnPage(id, 2, after);
        seen.push(...page.tappers.map((t) => t.uid));
        fulls.push(page.full);
        if (!page.full || !page.next) break;
        after = page.next;
      }
      // u3 before u2: same instant, the larger id first (documentId desc).
      expect(seen).toEqual(['u4', 'u3', 'u2', 'u1', 'u6']);
      expect(fulls).toEqual([true, true, false]);
      const first = await h.data.taps.tapsOnPage(id, 10);
      expect(first.tappers.find((t) => t.uid === 'u1')?.at).toBe(T0 - 5000);
      expect(first.full).toBe(false);

      expect((await h.data.taps.tapsOnBy(id, ['u1', 'u5', 'nobody'])).map((t) => t.uid)).toEqual(['u1']);
      await expect(h.data.taps.tapsOnPage(id, 2, 'not a token')).rejects.toBeInstanceOf(ApiFailure);
    });

    it('deleteTapsOn and deleteSignalsOn take every row of the card, and only of it', async () => {
      const id = h.card('del');
      const other = h.card('keep');
      await h.seedCard(id, 'alice');
      await h.seedCard(other, 'alice');
      const state = {
        firstAt: T0, lastAt: T0, days: ['2026-11-19'], sessions: [], activeSeconds: 10, maxProgress: 0.5,
        reachedEndAt: null, rereads: 0, rereadAt: null, shared: false, reportDay: '2026-11-19', reportsToday: 1,
      };
      await h.uow.run(async (tx) => {
        tx.taps.putTapOn(id, 'bob', new Date(T0), null);
        tx.taps.putTapOn(other, 'bob', new Date(T0), null);
        tx.taps.putSignal('bob', id, state, 60);
        tx.taps.putSignal('bob', other, state, 60);
      });
      expect(await h.uow.run((tx) => tx.taps.getSignal('bob', id))).toEqual(state);
      expect((await h.data.taps.readingGate('bob', id)).kept).toEqual({ reportDay: '2026-11-19', reportsToday: 1 });
      await h.data.taps.deleteTapsOn(id);
      await h.data.taps.deleteSignalsOn(id);
      expect(await h.uow.run((tx) => tx.taps.getTap(id, 'bob'))).toBeNull();
      expect(await h.uow.run((tx) => tx.taps.getSignal('bob', id))).toBeNull();
      expect(await h.data.taps.tapIsOn(other, 'bob')).toBe(true);
      expect(await h.uow.run((tx) => tx.taps.getSignal('bob', other))).not.toBeNull();
    });
  });
}
