import { afterAll, describe, expect, it } from 'vitest';
import { blockIn } from '@/server/app/social';
import { CHANGE_LOG, changeEntry, entityOfPath, pathOf, userIdsOf } from '@/server/domain/outbox';
import { pairKey } from '@/server/domain/graph';
import { memoryCtx } from '@/server/infra/memory/ctx';
import { memoryChangeSource, memoryReplicaTarget } from '@/server/infra/memory/replica';
import { MemoryState } from '@/server/infra/memory/state';
import { memoryUow } from '@/server/infra/memory/uow';
import { pgReplicaTarget } from '@/server/infra/postgres/replica';
import { lazyPgTestDb, PG_TEST_URL } from '@/server/infra/postgres/testing';
import { replicate } from './replicate';

// The outbox on the memory UnitOfWork, as FirestoreUnitOfWork keeps it with
// OUTBOX_ENABLED=1 (test/emulator/ports.outbox.emulator.test.ts): off writes
// nothing more, on writes one entry per row a service's transaction wrote
// (none when it fails); then the replicator, replayed, into memory and
// PostgreSQL (PG_TEST_URL).

const T = Date.parse('2026-11-21T09:00:00Z');

function seeded(outbox: boolean) {
  const state = new MemoryState();
  const ctx = memoryCtx({ state, uow: memoryUow(state, { outbox: () => outbox, now: () => T }) });
  state.put('users', 'ann', { handle: 'ann' });
  state.put('users', 'bob', { handle: 'bob' });
  state.put('connections', pairKey('ann', 'bob'), { userIds: ['ann', 'bob'], establishedAt: new Date(T - 1000) });
  state.put('invites', 'inv1', { fromUserId: 'bob', toUserId: 'ann', status: 'pending', createdAt: new Date(T - 500) });
  return { state, ctx };
}

const log = (state: MemoryState) => state.rows(CHANGE_LOG).map(({ row }) => [row.entity, row.id, row.op]);

describe('the outbox (memory UnitOfWork)', () => {
  it('off: a block writes its rows and no entry', async () => {
    const { state, ctx } = seeded(false);
    await blockIn(ctx, 'ann', 'bob');
    expect(state.get('users/ann/blocks', 'bob')).not.toBeNull();
    expect(state.rows(CHANGE_LOG)).toEqual([]);
  });

  it('on: one entry per row the block wrote, in order, with no content', async () => {
    const { state, ctx } = seeded(true);
    await blockIn(ctx, 'ann', 'bob');
    expect(log(state)).toEqual([
      ['blocks', 'ann/bob', 'upsert'],
      ['connections', 'ann_bob', 'delete'],
      ['invites', 'inv1', 'upsert'],
    ]);
    for (const { row } of state.rows(CHANGE_LOG)) {
      expect(Object.keys(row).sort()).toEqual(['at', 'done', 'entity', 'expireAt', 'id', 'op', 'userIds', 'version']);
      expect(row.version).toBe(T * 1000);
      expect(row.expireAt).toEqual(new Date(T + 7 * 24 * 3600_000));
    }
  });

  it('a transaction that fails writes no entry', async () => {
    const { state, ctx } = seeded(true);
    await expect(
      ctx.uow.run(async (tx) => {
        await tx.social.readBlock('ann', 'bob');
        tx.social.declineInvite('inv1');
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(state.rows(CHANGE_LOG)).toEqual([]);
  });

  it('names the uids a row id holds, and none for an entity that holds none', () => {
    expect(userIdsOf('users', 'u1')).toEqual(['u1']);
    expect(userIdsOf('connections', 'a_b')).toEqual(['a', 'b']);
    expect(userIdsOf('blocks', 'u1/u2')).toEqual(['u1', 'u2']);
    expect(userIdsOf('retiredSlugs', 'a-slug')).toEqual([]);
    expect(changeEntry('resonanceTaps', 'card_u1', 'upsert', T).userIds).toEqual(['card', 'u1']);
    expect(entityOfPath('users/u1/blocks/u2')).toEqual({ entity: 'blocks', id: 'u1/u2' });
    expect(pathOf('blocks', 'u1/u2')).toBe('users/u1/blocks/u2');
    expect(pathOf('cards', 'c1')).toBe('cards/c1');
  });
});

describe('the replicator', () => {
  it('copies the latest rows into a target, deletes included, and a replay changes nothing', async () => {
    const { state, ctx } = seeded(true);
    await blockIn(ctx, 'ann', 'bob');
    const target = new MemoryState();
    target.put('connections', 'ann_bob', { userIds: ['ann', 'bob'] });
    const first = await replicate(memoryChangeSource(state), memoryReplicaTarget(target), { batch: 2 });
    expect(first).toMatchObject({ seen: 3, applied: 3, stale: 0 });
    expect(target.get('users/ann/blocks', 'bob')).toEqual(state.get('users/ann/blocks', 'bob'));
    expect(target.get('connections', 'ann_bob')).toBeNull();
    expect(target.get('invites', 'inv1')).toEqual({ ...state.get('invites', 'inv1') });
    expect(state.rows(CHANGE_LOG, (r) => r.done !== true)).toEqual([]);

    // Replayed (entries pending again): nothing applied, nothing changed.
    for (const { id } of state.rows(CHANGE_LOG)) state.merge(CHANGE_LOG, id, { done: false });
    const before = JSON.stringify(target.dump());
    const replay = await replicate(memoryChangeSource(state), memoryReplicaTarget(target));
    expect(replay).toMatchObject({ seen: 3, applied: 0, stale: 3 });
    expect(JSON.stringify(target.dump())).toBe(before);
  });

  it('stops at its deadline and leaves the rest for the next run', async () => {
    const { state, ctx } = seeded(true);
    await blockIn(ctx, 'ann', 'bob');
    let t = 0;
    const r = await replicate(memoryChangeSource(state), memoryReplicaTarget(new MemoryState()), { batch: 1, deadline: 2, now: () => t++ });
    expect(r).toMatchObject({ seen: 2, more: true });
    expect(state.rows(CHANGE_LOG, (row) => row.done !== true)).toHaveLength(1);
  });

  describe.skipIf(!PG_TEST_URL)('into PostgreSQL (PG_TEST_URL)', () => {
    const pg = lazyPgTestDb();
    afterAll(() => pg.close());

    it('replicates a block, idempotent on replay', async () => {
      const db = await pg.get();
      const { state, ctx } = seeded(true);
      await db.docs.put('connections', 'ann_bob', { userIds: ['ann', 'bob'] });
      await blockIn(ctx, 'ann', 'bob');
      const target = pgReplicaTarget(db.pool);
      expect(await replicate(memoryChangeSource(state), target)).toMatchObject({ applied: 3 });
      for (const { id } of state.rows(CHANGE_LOG)) state.merge(CHANGE_LOG, id, { done: false });
      expect(await replicate(memoryChangeSource(state), target)).toMatchObject({ applied: 0, stale: 3 });
      expect(await db.docs.get('users/ann/blocks', 'bob')).toEqual(state.get('users/ann/blocks', 'bob'));
      expect(await db.docs.get('connections', 'ann_bob')).toBeNull();
      expect(await db.docs.get('invites', 'inv1')).toEqual(state.get('invites', 'inv1'));
    });
  });
});
