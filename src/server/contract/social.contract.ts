import { describe, expect, it } from 'vitest';
import type { DataRepos, UnitOfWork } from '@/server/ports/uow';

/**
 * What every adapter of the social aggregate (ports/repos/social.ts) keeps:
 * a block in one transaction — the block, the connection, the pending
 * invites both ways, nothing else — bookmarks that keep their first time,
 * the lists newest first. Run on memory (src/server/infra/memory/repos/social.test.ts)
 * and on the emulator (test/emulator/ports.social.emulator.test.ts), with ids of each run's own.
 */
export interface SocialHarness {
  uow: UnitOfWork;
  data: DataRepos;
  id(n: string): string;
  seedConnection(a: string, b: string, at: Date): Promise<void>;
  seedInvite(id: string, row: { fromUserId: string; toUserId: string; status: string; createdAt: Date; expiresAt: Date }): Promise<void>;
  /** A committed invite's status; null when absent. */
  inviteStatus(id: string): Promise<string | null>;
  connected(a: string, b: string): Promise<boolean>;
  /** Whether `a`'s block of `b` is there as the other aggregates read it (users.hasBlocked, graph.hasBlocked). */
  blockSeen(a: string, b: string): Promise<boolean>;
}

const at = (iso: string) => new Date(iso);

export function describeSocialContract(name: string, make: () => SocialHarness | Promise<SocialHarness>) {
  describe(`social repos contract: ${name}`, () => {
    it('blocks in one transaction: the block, the connection ended, pending invites both ways withdrawn — nothing else', async () => {
      const h = await make();
      const [a, b, c] = [h.id('a'), h.id('b'), h.id('c')];
      const t = at('2026-11-01T00:00:00Z');
      await h.seedConnection(a, b, t);
      await h.seedConnection(a, c, t);
      await h.seedInvite(h.id('i1'), { fromUserId: a, toUserId: b, status: 'pending', createdAt: t, expiresAt: at('2027-01-01T00:00:00Z') });
      await h.seedInvite(h.id('i2'), { fromUserId: b, toUserId: a, status: 'pending', createdAt: t, expiresAt: at('2027-01-01T00:00:00Z') });
      await h.seedInvite(h.id('i3'), { fromUserId: b, toUserId: a, status: 'declined', createdAt: t, expiresAt: at('2027-01-01T00:00:00Z') });
      await h.seedInvite(h.id('i4'), { fromUserId: c, toUserId: a, status: 'pending', createdAt: t, expiresAt: at('2027-01-01T00:00:00Z') });

      const reads = await h.uow.run(async (tx) => {
        const r = await tx.social.readBlock(a, b);
        tx.social.block(a, b, r);
        return r;
      });
      expect(reads).toEqual({ blocked: false, connected: true, pendingInvites: expect.arrayContaining([h.id('i1'), h.id('i2')]) });
      expect(reads.pendingInvites).toHaveLength(2);
      expect(await h.blockSeen(a, b)).toBe(true);
      expect(await h.blockSeen(b, a)).toBe(false);
      expect(await h.connected(a, b)).toBe(false);
      expect(await h.connected(a, c)).toBe(true);
      expect([await h.inviteStatus(h.id('i1')), await h.inviteStatus(h.id('i2')), await h.inviteStatus(h.id('i3')), await h.inviteStatus(h.id('i4'))]).toEqual([
        'withdrawn',
        'withdrawn',
        'declined',
        'pending',
      ]);
      expect((await h.data.social.listBlocks(a)).map((r) => r.uid)).toEqual([b]);
    });

    it('blocking again reads the block there, and keeps it as it was', async () => {
      const h = await make();
      const [a, b] = [h.id('a'), h.id('b')];
      const block = () =>
        h.uow.run(async (tx) => {
          const r = await tx.social.readBlock(a, b);
          tx.social.block(a, b, r);
          return r;
        });
      await block();
      const [first] = await h.data.social.listBlocks(a);
      expect(await block()).toEqual({ blocked: true, connected: false, pendingInvites: [] });
      expect(await h.data.social.listBlocks(a)).toEqual([first]);
      expect(first.createdAt).toBeInstanceOf(Date);
    });

    it('unblocks: only the block goes, and says whether there was one', async () => {
      const h = await make();
      const [a, b] = [h.id('a'), h.id('b')];
      await h.uow.run(async (tx) => tx.social.block(a, b, await tx.social.readBlock(a, b)));
      expect(await h.data.social.unblock(a, b)).toBe(true);
      expect(await h.blockSeen(a, b)).toBe(false);
      expect(await h.data.social.unblock(a, b)).toBe(false);
      expect(await h.data.social.listBlocks(a)).toEqual([]);
    });

    it('bookmarks: a second put keeps the first, a delete of none is fine', async () => {
      const h = await make();
      const [a, card] = [h.id('a'), h.id('card')];
      expect(await h.data.social.isBookmarked(a, card)).toBe(false);
      await h.data.social.putBookmark(a, card);
      await h.data.social.putBookmark(a, card);
      expect(await h.data.social.isBookmarked(a, card)).toBe(true);
      expect(await h.data.social.isBookmarked(h.id('b'), card)).toBe(false);
      await h.data.social.deleteBookmark(a, card);
      await h.data.social.deleteBookmark(a, card);
      expect(await h.data.social.isBookmarked(a, card)).toBe(false);
    });

    it('lists connections and pending invites to someone, the latest first', async () => {
      const h = await make();
      const [a, b, c, d] = [h.id('a'), h.id('b'), h.id('c'), h.id('d')];
      await h.seedConnection(a, b, at('2026-10-01T00:00:00Z'));
      await h.seedConnection(c, a, at('2026-11-01T00:00:00Z'));
      await h.seedConnection(b, c, at('2026-11-02T00:00:00Z'));
      expect(await h.data.social.listConnections(a)).toEqual([
        { other: c, establishedAt: at('2026-11-01T00:00:00Z') },
        { other: b, establishedAt: at('2026-10-01T00:00:00Z') },
      ]);
      const later = at('2027-01-01T00:00:00Z');
      await h.seedInvite(h.id('i1'), { fromUserId: b, toUserId: a, status: 'pending', createdAt: at('2026-10-01T00:00:00Z'), expiresAt: later });
      await h.seedInvite(h.id('i2'), { fromUserId: c, toUserId: a, status: 'pending', createdAt: at('2026-10-05T00:00:00Z'), expiresAt: later });
      await h.seedInvite(h.id('i3'), { fromUserId: d, toUserId: a, status: 'accepted', createdAt: at('2026-10-09T00:00:00Z'), expiresAt: later });
      await h.seedInvite(h.id('i4'), { fromUserId: a, toUserId: d, status: 'pending', createdAt: at('2026-10-09T00:00:00Z'), expiresAt: later });
      const invites = await h.data.social.pendingInvitesTo(a);
      expect(invites.map((i) => [i.id, i.fromUserId])).toEqual([
        [h.id('i2'), c],
        [h.id('i1'), b],
      ]);
      expect(invites[0]).toMatchObject({ toUserId: a, status: 'pending', expiresAt: later, referenceCardId: null });
    });

    it('declines an invite inside a transaction', async () => {
      const h = await make();
      const [a, b] = [h.id('a'), h.id('b')];
      await h.seedInvite(h.id('i1'), { fromUserId: b, toUserId: a, status: 'pending', createdAt: at('2026-10-01T00:00:00Z'), expiresAt: at('2027-01-01T00:00:00Z') });
      await h.uow.run(async (tx) => {
        await tx.graph.getInvite(h.id('i1'));
        tx.social.declineInvite(h.id('i1'));
      });
      expect(await h.inviteStatus(h.id('i1'))).toBe('declined');
    });
  });
}
