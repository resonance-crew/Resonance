import { beforeEach, describe, expect, it } from 'vitest';
import type { RecommendationItem } from '@/lib/db/types';
import type { RecommendData } from '@/server/ports/repos/recommend';
import type { UnitOfWork } from '@/server/ports/uow';

/**
 * What both recommend repositories do (ports/repos/recommend.ts), run on
 * memory (src/server/infra/memory/repos/recommend.test.ts) and on Firestore's
 * emulator (test/emulator/ports.recommend.emulator.test.ts). `seed` writes a
 * row shaped as its document (times as Dates: the admin SDK keeps them as
 * Timestamps); `peek` reads one back with its times as ms. The harness is
 * fresh for each test (an empty database).
 */
export interface RecommendHarness {
  data: RecommendData;
  uow: UnitOfWork;
  seed(table: string, id: string, row: Record<string, unknown>): Promise<void>;
  peek(table: string, id: string): Promise<Record<string, unknown> | null>;
}

const item = (cardId: string): RecommendationItem => ({ cardId, channel: 'insight', reason: '', score: 0.5 });
const T = Date.UTC(2026, 10, 21, 9);
const at = (daysAgo: number) => new Date(T - daysAgo * 86_400_000);

export function describeRecommendRepoContract(name: string, make: () => Promise<RecommendHarness>) {
  describe(`recommend repository contract — ${name}`, () => {
    let h: RecommendHarness;
    beforeEach(async () => {
      h = await make();
    });

    it('keeps a build lease, a served result with its shown counts, an ask, and a failure on the reader’s row', async () => {
      expect(await h.data.getPicks('u1')).toBeNull();
      await h.uow.run(async (tx) => {
        expect(await tx.recommend.getPicks('u1')).toBeNull();
        tx.recommend.putLease('u1', T + 90_000);
      });
      expect(await h.data.getPicks('u1')).toMatchObject({ items: [], leaseUntil: T + 90_000, date: null });

      await h.uow.run(async (tx) => {
        expect(await tx.recommend.getShown('u1')).toEqual({});
        tx.recommend.putServedPicks('u1', { date: '2026-11-21', items: [item('a')], partial: true, coldStart: false, warm: false }, { a: { n: 1, lastDay: '2026-11-21' } });
      });
      expect(await h.data.getPicks('u1')).toEqual({
        date: '2026-11-21',
        items: [item('a')],
        partial: true,
        leaseUntil: 0,
        failedAt: 0,
        askedOn: '2026-11-21',
        warm: false,
        coldStart: false,
      });

      // The ask replaces the counts whole and touches nothing else.
      await h.uow.run(async (tx) => {
        expect(await tx.recommend.getShown('u1')).toEqual({ a: { n: 1, lastDay: '2026-11-21' } });
        tx.recommend.putAsked('u1', '2026-11-22', { b: { n: 1, lastDay: '2026-11-22' } });
      });
      const row = await h.peek('recommendations', 'u1');
      expect(row).toMatchObject({ askedOn: '2026-11-22', shown: { b: { n: 1, lastDay: '2026-11-22' } }, date: '2026-11-21' });
      expect(typeof row?.generatedAt).toBe('number');

      await h.data.putFailure('u1', T);
      expect(await h.data.getPicks('u1')).toMatchObject({ failedAt: T, leaseUntil: 0, items: [item('a')] });

      // A warm build leaves the ask as it was and marks itself; a reader's own clears the mark.
      await h.data.putPicks('u1', { date: '2026-11-23', items: [item('w')], partial: false, coldStart: true, warm: true });
      expect(await h.data.getPicks('u1')).toMatchObject({ date: '2026-11-23', warm: true, askedOn: '2026-11-22', coldStart: true, failedAt: 0 });
      await h.data.putPicks('u1', { date: '2026-11-24', items: [], partial: false, coldStart: false, warm: false });
      expect(await h.data.getPicks('u1')).toMatchObject({ warm: false, askedOn: '2026-11-24' });
    });

    it('reads what the reader did, their connections and the named originals they answered', async () => {
      await h.seed('cards', 'mine', { authorId: 'alice', publishedAt: at(10), visibility: 'public' });
      await h.seed('cards', 'reply', { authorId: 'alice', publishedAt: at(2), referenceCardId: 'bobs', visibility: 'public' });
      await h.seed('cards', 'trashed', { authorId: 'alice', publishedAt: at(3), trashedAt: at(1), visibility: 'private' });
      await h.seed('cards', 'bobs', { authorId: 'bob', publishedAt: at(20), visibility: 'public' });
      await h.seed('cards', 'anon', { authorId: 'bob', publishedAt: at(20), visibility: 'public', anonymous: true });
      await h.seed('notes', 'n1', { cardId: 'noted', fromUserId: 'alice', toUserId: 'carol', text: 'secret', createdAt: at(1) });
      await h.seed('resonanceTaps', 't1', { cardId: 'tapped', userId: 'alice', on: true, at: at(1) });
      await h.seed('users/alice/bookmarks', 'saved', { createdAt: at(3) });
      await h.seed('readerSignals', 'alice_read', { userId: 'alice', cardId: 'read', lastAt: at(4), reachedEndAt: null, rereads: 2, shared: true, activeSeconds: 30, maxProgress: 0.5 });
      await h.seed('recommendations', 'alice', { shown: { seen: { n: 2, lastDay: '2026-11-20' }, 'bad/id': { n: 1, lastDay: '2026-11-20' } } });
      await h.seed('connections', 'alice_bob', { userIds: ['alice', 'bob'] });
      await h.seed('connections', 'dora_alice', { userIds: ['dora', 'alice'] });

      const activity = await h.data.readerActivity('alice', 300);
      const byId = <T extends { id: string }>(xs: T[]) => [...xs].sort((a, b) => (a.id < b.id ? -1 : 1));
      expect(byId(activity.own)).toEqual([
        { id: 'mine', publishedAt: at(10).getTime(), trashed: false, referenceCardId: undefined },
        { id: 'reply', publishedAt: at(2).getTime(), trashed: false, referenceCardId: 'bobs' },
        { id: 'trashed', publishedAt: at(3).getTime(), trashed: true, referenceCardId: undefined },
      ]);
      expect(activity.notes).toEqual([{ cardId: 'noted', createdAt: at(1).getTime() }]);
      expect(activity.taps).toEqual([{ cardId: 'tapped', on: true, at: at(1).getTime() }]);
      expect(activity.saved).toEqual([{ id: 'saved', cardId: undefined, createdAt: at(3).getTime() }]);
      expect(activity.reading).toEqual([
        { cardId: 'read', lastAt: at(4).getTime(), reachedEndAt: null, rereads: 2, rereadAt: null, shared: true, activeSeconds: 30, maxProgress: 0.5, expectedSeconds: undefined },
      ]);
      expect(activity.shown).toEqual({ seen: { n: 2, lastDay: '2026-11-20' } });

      expect(await h.data.connectionIds('alice')).toEqual(['bob', 'dora']);
      expect(await h.data.engagedAuthorIds('alice')).toEqual(new Set(['bob']));
      expect(await h.data.namedCardIds(['bobs', 'anon', 'gone', 'a/b'])).toEqual(new Set(['bobs']));
      expect((await h.data.connectionCards(['bob'])).map((c) => c.cardId)).toEqual(['bobs']);
      expect(await h.data.connectionCards(['bob'])).toEqual([{ cardId: 'bobs', authorId: 'bob', publishedAt: at(20).getTime() }]);
    });

    it('keeps the pool numbers per model, and says which readings are kept from strangers', async () => {
      expect(await h.data.getPoolStats('m1')).toBeNull();
      await h.data.putPoolStats({ mu: { insight: [0.5, 0.5], situation: [] }, r: { 'c1:insight:0': 0.2 }, tau: 0.3, tauSituation: 0.1, cards: 7, embedModel: 'm1' });
      const kept = await h.data.getPoolStats('m1');
      expect(kept).toMatchObject({ mu: { insight: [0.5, 0.5], situation: [] }, r: { 'c1:insight:0': 0.2 }, tau: 0.3, tauSituation: 0.1, cards: 7, embedModel: 'm1' });
      expect(kept!.at).toBeGreaterThan(0);
      expect(await h.data.getPoolStats('m2')).toBeNull();

      await h.seed('cardSignatures', 'quiet', { listedForStrangers: false });
      await h.seed('cardSignatures', 'listed', { listedForStrangers: true });
      expect(await h.data.unlistedForStrangers(['quiet', 'listed', 'unread'])).toEqual(new Set(['quiet']));
    });

    it('reads and marks a card for indexing, and keeps its reading only while the card is there', async () => {
      await h.seed('cards', 'c1', { authorId: 'ann', publishedAt: at(1), thoughtCore: 'Title', story: 'Story', visibility: 'connections', signature: { coreInsight: 'x', contentHash: 'h0' } });
      expect(await h.data.getCardForIndex('c1')).toEqual({
        publishedAt: expect.anything(),
        thoughtCore: 'Title',
        story: 'Story',
        authorId: 'ann',
        visibility: 'connections',
        trashed: false,
        thin: false,
        contentHash: 'h0',
        indexPending: false,
      });
      expect(await h.data.getCardForIndex('gone')).toBeNull();
      expect(await h.data.getCardVisibility('c1')).toEqual({ visibility: 'connections', trashed: false });
      expect(await h.data.markIndexPending('gone')).toBe('not-found');
      expect(await h.data.markIndexPending('c1')).toBe('ok');
      expect(await h.data.listIndexPending(10)).toEqual(['c1']);
      expect(await h.data.putCardSignature('c1', { coreInsight: 'new line', placeholder: false })).toBe('ok');
      expect(await h.data.putCardSignature('gone', { coreInsight: 'x' })).toBe('not-found');

      const kept = await h.uow.run(async (tx) => {
        const text = await tx.recommend.getCardText('c1');
        expect(text).toMatchObject({ thoughtCore: 'Title', story: 'Story', thin: false, signature: { coreInsight: 'new line', placeholder: false } });
        if (!(await tx.recommend.cardExists('c1'))) return false;
        tx.recommend.patchCardIndexed('c1', 'h1');
        tx.recommend.patchCardThin('c1', true);
        tx.recommend.putReading('c1', {
          throughLine: 'new line',
          insights: [],
          placeholder: false,
          lifeDomain: 'work',
          insightScore: 0.5,
          authorId: 'ann',
          version: 3,
          model: 'm',
          embedModel: 'e',
          listedForStrangers: true,
          templated: true,
          rewritten: false,
          error: null,
          usage: { input: 1, output: 2, reasoning: 0, embed: 3 },
        } as never);
        return true;
      });
      expect(kept).toBe(true);
      expect(await h.data.getCardForIndex('c1')).toMatchObject({ contentHash: 'h1', thin: true, indexPending: false });
      expect(await h.data.listIndexPending(10)).toEqual([]);
      expect(await h.data.listTemplated(10)).toEqual([{ cardId: 'c1', rewritten: false }]);
      expect(await h.uow.run(async (tx) => tx.recommend.cardExists('gone'))).toBe(false);

      await h.uow.run(async (tx) => {
        await tx.recommend.cardExists('c1');
        tx.recommend.mergeReadingFailure('c1', { authorId: 'ann', error: 'length', usage: { input: 1, output: 0, reasoning: 0 } });
      });
      expect(await h.peek('cardSignatures', 'c1')).toMatchObject({ throughLine: 'new line', error: 'length', templated: true });
      await h.uow.run(async (tx) => {
        await tx.recommend.getCardText('c1');
        tx.recommend.patchCardThin('c1', false);
      });
      expect(await h.data.getCardForIndex('c1')).toMatchObject({ thin: false });
      await h.data.clearIndexPending('gone');
    });

    it('reads what the warm-up needs: when the reader’s app last registered, their picks and their pick-push log', async () => {
      await h.seed('devices', 'd1', { userId: 'eve', token: 'tok', updatedAt: at(3) });
      await h.seed('devices', 'd2', { userId: 'eve', token: '', updatedAt: at(0) });
      await h.seed('recommendations', 'eve', { date: '2026-11-21', items: [item('x')], askedOn: '2026-11-21' });
      await h.seed('pickPushes', 'eve', { sentAt: [at(1)], recent: [{ cardId: 'x', at: at(1) }] });
      const got = await h.data.warmInputs('eve');
      expect(got.lastSeen).toBe(at(3).getTime());
      expect(got.picks).toMatchObject({ askedOn: '2026-11-21', items: [item('x')] });
      expect(got.pickLog).toEqual({ sentAt: [at(1).getTime()], recent: [{ cardId: 'x', at: at(1).getTime() }] });
      expect(await h.data.warmInputs('nobody')).toEqual({ lastSeen: 0, picks: null, pickLog: { recent: [], sentAt: [] } });

      for (const id of ['a', 'b', 'c', 'd']) await h.seed('notificationSettings', id, { picks: id !== 'c' });
      const pages: string[][] = [];
      for await (const page of h.data.pickReaders({ from: 'a', pageSize: 2 })) pages.push(page);
      expect(pages.flat()).toEqual(['b', 'd', 'a']);
    });
  });
}
