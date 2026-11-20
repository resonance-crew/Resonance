import { beforeEach, describe, expect, it } from 'vitest';
import { pairKey, resonanceBellId, resonanceReason, inviteReason, letterReason } from '@/server/domain/graph';
import type { DataRepos, UnitOfWork } from '@/server/ports/uow';
import { ReadAfterWriteError } from '@/server/ports/uow';

/**
 * What every adapter of the graph aggregate's repositories guarantees
 * (ports/repos/graph.ts) — the riskiest semantics of the move first: a
 * reader rings an author once (the fixed bell, or a legacy one found by the
 * equality query inside the transaction), reasons merge idempotently
 * (`arrayUnion`), the in-transaction `array-contains` take-back query, and no
 * reason left → no connection. Run against memory
 * (src/server/infra/memory/repos/graph.test.ts) and Firestore's emulator
 * (test/emulator/ports.graph.emulator.test.ts). `id(n)` names a user or a card
 * of this harness's own, so runs never see each other's rows.
 */
export interface GraphHarness {
  uow: UnitOfWork;
  data: DataRepos;
  id(n: string): string;
  /** A user with this pen name ('' for none). */
  seedUser(uid: string, handle: string): Promise<void>;
  /** A published card (public, named unless said). */
  seedCard(id: string, authorId: string, fields?: { anonymous?: boolean; visibility?: string; referenceCardId?: string }): Promise<void>;
  /** A connection written before reasons were kept: no origins. */
  seedConnection(a: string, b: string): Promise<void>;
  /** A bell row under a random id (the old resonance bells). */
  seedBell(row: { userId: string; type: string; payload: Record<string, unknown> }): Promise<void>;
  /** An invite (`expiresAt` a time, or a malformed value as stored). */
  seedInvite(id: string, row: { fromUserId: string; toUserId: string; status: string; expiresAt: Date | string | null }): Promise<void>;
  /** A letter waiting between the two (`letters/{from}_{to}` and the conversation's `request`). */
  seedLetter(from: string, to: string): Promise<void>;
  /** The committed origins: reason keys (sorted) and resonance cards; null when absent. */
  origins(a: string, b: string): Promise<{ reasons: string[]; resonanceCards: string[] } | null>;
  connected(a: string, b: string): Promise<boolean>;
  /** A committed row's fields (cards, notifications, invites, letters, conversations); null when absent. */
  row(table: string, id: string): Promise<Record<string, unknown> | null>;
}

export function describeGraphContract(name: string, make: () => GraphHarness | Promise<GraphHarness>) {
  describe(`graph repositories contract — ${name}`, () => {
    let h: GraphHarness;
    let alice: string, bob: string, carol: string;
    beforeEach(async () => {
      h = await make();
      [alice, bob, carol] = [h.id('alice'), h.id('bob'), h.id('carol')];
      await Promise.all([h.seedUser(alice, 'alice'), h.seedUser(bob, 'bob'), h.seedUser(carol, 'carol')]);
    });

    it('a reader rings once: the fixed bell, or a legacy one of theirs for that card found in the transaction', async () => {
      const original = h.id('orig');
      await h.seedCard(original, alice);
      const first = await h.uow.run((tx) => tx.graph.readReach(bob, original));
      expect(first).toMatchObject({ from: bob, originalId: original, rang: false, connected: false, blockOut: false, blockIn: false, origins: null });
      expect(first.original?.authorId).toBe(alice);
      expect(first.me?.handle).toBe('bob');
      expect(first.bellId).toBe(resonanceBellId(bob, original));

      await h.uow.run(async (tx) => {
        const r = await tx.graph.readReach(bob, original);
        tx.graph.ringResonance(r.bellId, { to: alice, from: bob, fromHandle: 'bob', cardId: original, anonymous: false });
      });
      expect((await h.uow.run((tx) => tx.graph.readReach(bob, original))).rang).toBe(true);
      expect(await h.row('notifications', resonanceBellId(bob, original))).toMatchObject({
        userId: alice, type: 'resonance', readAt: null, payload: { fromUserId: bob, fromHandle: 'bob', cardId: original },
      });

      // carol rang alice before bells had fixed ids; for another card only, she hasn't.
      await h.seedBell({ userId: alice, type: 'resonance', payload: { fromUserId: carol, fromHandle: 'carol', cardId: original } });
      expect((await h.uow.run((tx) => tx.graph.readReach(carol, original))).rang).toBe(true);
      const other = h.id('other');
      await h.seedCard(other, alice);
      expect((await h.uow.run((tx) => tx.graph.readReach(carol, other))).rang).toBe(false);
      // Their own card reaches no one: nothing beyond the card, profile and bell is read.
      expect(await h.uow.run((tx) => tx.graph.readReach(alice, original))).toMatchObject({ connected: false, origins: null, rang: false });
      // An anonymous resonance's bell says so.
      await h.uow.run(async (tx) => tx.graph.ringResonance(resonanceBellId(carol, other), { to: alice, from: carol, fromHandle: 'carol', cardId: other, anonymous: true }));
      expect((await h.row('notifications', resonanceBellId(carol, other)))?.payload).toEqual({ fromUserId: carol, fromHandle: 'carol', cardId: other, anonymous: true });
    });

    it('connect, reasons merged idempotently, a take-back leaving one, and no reason left → no connection', async () => {
      const original = h.id('orig');
      const [c1, c2] = [h.id('c1'), h.id('c2')];
      await h.seedCard(original, alice);
      await h.uow.run(async (tx) => tx.graph.connect([bob, alice], resonanceReason(bob, c1, original)));
      expect(await h.connected(alice, bob)).toBe(true);
      expect(await h.origins(alice, bob)).toEqual({ reasons: [`resonance_${bob}_${c1}`], resonanceCards: [c1] });

      const add = (...reasons: Parameters<typeof resonanceReason>[]) =>
        h.uow.run(async (tx) => {
          const r = await tx.graph.readReach(bob, original);
          expect(r.connected).toBe(true);
          tx.graph.addReason([bob, alice], r.origins, ...reasons.map((a) => resonanceReason(...a)));
        });
      await add([bob, c2, original]);
      await add([bob, c2, original], [bob, c1, original]);
      expect(await h.origins(alice, bob)).toEqual({ reasons: [`resonance_${bob}_${c1}`, `resonance_${bob}_${c2}`].sort(), resonanceCards: [c1, c2] });
      // Nothing to add writes nothing.
      await h.uow.run(async (tx) => tx.graph.addReason([bob, alice], (await tx.graph.readReach(bob, original)).origins, null));
      expect((await h.origins(alice, bob))?.reasons).toHaveLength(2);

      const plans1 = await h.uow.run(async (tx) => {
        const plans = await tx.graph.readTakeBack(bob, c1);
        tx.graph.takeBack(plans);
        return plans;
      });
      expect(plans1).toEqual([{ pair: pairKey(alice, bob), key: `resonance_${bob}_${c1}`, cardId: c1, ends: false }]);
      expect(await h.origins(alice, bob)).toEqual({ reasons: [`resonance_${bob}_${c2}`], resonanceCards: [c2] });
      expect(await h.connected(alice, bob)).toBe(true);
      // Taking it back again finds nothing.
      expect(await h.uow.run((tx) => tx.graph.readTakeBack(bob, c1))).toEqual([]);

      const plans2 = await h.uow.run(async (tx) => {
        const plans = await tx.graph.readTakeBack(bob, c2);
        tx.graph.takeBack(plans);
        return plans;
      });
      expect(plans2.map((p) => p.ends)).toEqual([true]);
      expect(await h.connected(alice, bob)).toBe(false);
      expect(await h.origins(alice, bob)).toBeNull();
    });

    it('reasons that are not resonances stand: a letter, an invite, a connection older than reasons', async () => {
      const original = h.id('orig');
      const c = h.id('c');
      await h.seedCard(original, alice);
      // Older than reasons: the first reason added brings `legacy`, so taking it back never ends it.
      await h.seedConnection(alice, carol);
      await h.uow.run(async (tx) => {
        const r = await tx.graph.readPair(carol, alice);
        expect(r).toMatchObject({ connected: true, origins: null, blockOut: false, blockIn: false, requestHeld: false });
        tx.graph.addReason([carol, alice], r.origins, resonanceReason(carol, c, original));
      });
      expect(await h.origins(alice, carol)).toEqual({ reasons: ['legacy', `resonance_${carol}_${c}`].sort(), resonanceCards: [c] });
      const plans = await h.uow.run(async (tx) => {
        const p = await tx.graph.readTakeBack(carol, c);
        tx.graph.takeBack(p);
        return p;
      });
      expect(plans.map((p) => p.ends)).toEqual([false]);
      expect(await h.connected(alice, carol)).toBe(true);
      expect(await h.origins(alice, carol)).toEqual({ reasons: ['legacy'], resonanceCards: [] });

      // A letter and an invite connect with no resonance card; the extra fields sit beside the connection.
      await h.uow.run(async (tx) => tx.graph.connect([bob, alice], inviteReason('inv1'), { extra: { inviteId: 'inv1' } }));
      expect(await h.row('connections', pairKey(alice, bob))).toMatchObject({ userIds: [alice, bob].sort(), inviteId: 'inv1' });
      await h.uow.run(async (tx) => tx.graph.addReason([bob, alice], (await tx.graph.readPair(bob, alice)).origins, letterReason(bob)));
      expect(await h.origins(alice, bob)).toEqual({ reasons: ['invite_inv1', 'letter'], resonanceCards: [] });
    });

    it("the take-back query finds by the card, whatever it answers, and only the taker's own reason; a read after a write is refused", async () => {
      const original = h.id('orig');
      const c = h.id('c');
      await h.seedCard(original, alice);
      // carol's reason with alice names a card `c` too — not bob's resonance.
      await h.uow.run(async (tx) => tx.graph.connect([carol, alice], resonanceReason(carol, c, original)));
      expect(await h.uow.run((tx) => tx.graph.readTakeBack(bob, c))).toEqual([]);
      await h.uow.run(async (tx) => tx.graph.connect([bob, alice], resonanceReason(bob, c, h.id('gone'))));
      expect((await h.uow.run((tx) => tx.graph.readTakeBack(bob, c))).map((p) => p.pair)).toEqual([pairKey(alice, bob)]);

      await expect(
        h.uow.run(async (tx) => {
          tx.graph.takeBack(await tx.graph.readTakeBack(bob, c));
          return tx.graph.readTakeBack(carol, c);
        }),
      ).rejects.toBeInstanceOf(ReadAfterWriteError);
      // Nothing of the refused transaction was kept.
      expect(await h.connected(alice, bob)).toBe(true);
    });

    it("a card pointed and unpointed, and a reader's answers to a card found by equality", async () => {
      const original = h.id('orig');
      const mine = h.id('mine');
      await h.seedCard(original, alice);
      await h.seedCard(mine, bob, { anonymous: true });
      expect(await h.uow.run((tx) => tx.graph.findAnswers(bob, original, 2))).toEqual([]);
      await h.uow.run(async (tx) => tx.graph.pointCard(mine, original));
      expect(await h.uow.run((tx) => tx.graph.findAnswers(bob, original, 2))).toEqual([mine]);
      const card = await h.uow.run((tx) => tx.graph.getCard(mine));
      expect(card?.resonance).toMatchObject({ authorId: bob, referenceCardId: original, visibility: 'public', anonymous: true });
      expect(card?.resonance.publishedAt).toBeInstanceOf(Date);
      expect(card?.trashed).toBe(false);
      await h.uow.run(async (tx) => tx.graph.unpointCard(mine));
      expect(await h.row('cards', mine)).not.toHaveProperty('referenceCardId');
      expect(await h.uow.run((tx) => tx.graph.getCard(h.id('none')))).toBeNull();
    });

    it('an invite read, closed, and the letter it answers cleared; the bell under a new id', async () => {
      const inv = h.id('inv');
      await h.seedInvite(inv, { fromUserId: alice, toUserId: bob, status: 'pending', expiresAt: new Date(Date.now() + 86_400_000) });
      const odd = h.id('odd');
      await h.seedInvite(odd, { fromUserId: alice, toUserId: bob, status: 'pending', expiresAt: 'next week' });
      await h.seedLetter(alice, bob);
      const read = await h.uow.run((tx) => tx.graph.getInvite(inv));
      expect(read).toMatchObject({ fromUserId: alice, toUserId: bob, status: 'pending' });
      expect(read?.expiresAt).toBeInstanceOf(Date);
      expect((await h.uow.run((tx) => tx.graph.getInvite(odd)))?.expiresAt).toBeNull();
      expect(await h.uow.run((tx) => tx.graph.getInvite(h.id('none')))).toBeNull();

      const bell = await h.uow.run(async (tx) => {
        const r = await tx.graph.readPair(bob, alice);
        expect(r.requestHeld).toBe(true);
        tx.graph.setInviteStatus(inv, 'accepted');
        tx.graph.answerLetters(bob, alice, r.requestHeld);
        return tx.graph.ringInviteAccepted(alice, { inviteId: inv, fromUserId: bob, fromHandle: 'bob' });
      });
      expect((await h.row('invites', inv))?.status).toBe('accepted');
      expect(await h.row('letters', `${alice}_${bob}`)).toBeNull();
      expect(await h.row('conversations', pairKey(alice, bob))).not.toHaveProperty('request');
      expect(await h.row('notifications', bell)).toMatchObject({ userId: alice, type: 'invite_accepted', payload: { inviteId: inv, fromUserId: bob, fromHandle: 'bob' } });
    });
  });
}
