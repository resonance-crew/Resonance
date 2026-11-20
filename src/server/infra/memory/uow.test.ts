import { describe, expect, it } from 'vitest';
import { describeUnitOfWorkContract } from '@/server/contract/uow.contract';
import { memoryPeek, memoryProbe, type ProbeTx } from '@/server/contract/probe';
import { memoryCtx } from './ctx';
import { MemoryState } from './state';
import { MemoryUnitOfWork } from './uow';

// The memory UnitOfWork against the same contract as Firestore's emulator
// (test/emulator/ports.uow.emulator.test.ts), then what only memory promises.

describeUnitOfWorkContract('memory', () => {
  const state = new MemoryState();
  return { uow: new MemoryUnitOfWork<ProbeTx>(state, memoryProbe), peek: memoryPeek(state) };
});

describe('the memory UnitOfWork', () => {
  it('hands out copies: changing a row read or written changes nothing stored', async () => {
    const state = new MemoryState();
    const row = { list: [1] };
    const uow = new MemoryUnitOfWork(state, (tx) => tx);
    await uow.run(async (tx) => tx.put('t', 'a', row));
    row.list.push(2);
    const read = await uow.run(async (tx) => tx.get<{ list: number[] }>('t', 'a'));
    read!.list.push(3);
    expect(state.get('t', 'a')).toEqual({ list: [1] });
  });

  it('refuses a transaction run inside another, instead of waiting on itself', async () => {
    const uow = new MemoryUnitOfWork(new MemoryState(), memoryProbe);
    await expect(uow.run(async () => uow.run(async () => 1))).rejects.toThrow(/nested/);
    // …and the next one still runs.
    expect(await uow.run(async () => 2)).toBe(2);
  });

  it('merges fields into a row, a field set to undefined removed', async () => {
    const state = new MemoryState();
    state.seed('t', { a: { x: 1, y: 2 } });
    await new MemoryUnitOfWork(state, (tx) => tx).run(async (tx) => tx.merge('t', 'a', { y: undefined, z: 3 }));
    expect(state.dump()).toEqual({ t: { a: { x: 1, z: 3 } } });
  });
});

describe('memoryCtx', () => {
  it('finds a person by pen name: the reservation first, else the earliest profile going by it', async () => {
    const ctx = memoryCtx();
    ctx.state.seed('users', {
      late: { id: 'late', handle: 'Mia', joinedAt: new Date(2026, 1, 1) },
      early: { id: 'early', handle: 'mia', joinedAt: new Date(2025, 1, 1) },
      held: { id: 'held', handle: 'Rin', joinedAt: new Date(2025, 1, 1) },
    });
    ctx.state.seed('handles', { rin: { uid: 'held' } });
    expect((await ctx.data.users.findByHandle(' MIA '))?.id).toBe('early');
    expect((await ctx.data.users.findByHandle('rin'))?.id).toBe('held');
    expect(await ctx.data.users.findByHandle('nobody')).toBeNull();
  });

  it('records after-response work until flushed, logging a failure without throwing', async () => {
    const ctx = memoryCtx();
    const ran: string[] = [];
    ctx.later.later(() => void ran.push('one'), 'one');
    ctx.later.later(() => {
      throw new Error('nope');
    }, 'two');
    ctx.later.later(async () => void ran.push('three'), 'three');
    expect(ran).toEqual([]);
    await ctx.later.flush();
    expect(ran).toEqual(['one', 'three']);
    expect(ctx.log.lines).toEqual([{ level: 'error', message: '[two]', rest: [expect.any(Error)] }]);
  });

  it('a clock that moves only when told, predictable ids, and recorded pages and touches', async () => {
    const ctx = memoryCtx();
    const t0 = ctx.clock.now();
    ctx.clock.advance(1000);
    expect(ctx.clock.now() - t0).toBe(1000);
    expect([ctx.ids.id(), ctx.ids.id()]).toEqual(['m0000000000000000001', 'm0000000000000000002']);
    expect(ctx.ids.id()).toHaveLength(20);
    expect(ctx.pages.revalidate(['/card/x'])).toEqual(['/card/x']);
    await ctx.realtime.touch('u1', ['bell', { thread: 'a_b' }]);
    expect(ctx.realtime.touches).toEqual([{ uid: 'u1', topics: ['bell', { thread: 'a_b' }] }]);
  });

  it('a port with no memory adapter yet throws when called, not when the context is built', async () => {
    const ctx = memoryCtx();
    expect(() => ctx.push.send(['t'], { data: {} })).toThrow(/not wired/);
    const sent: string[][] = [];
    const wired = memoryCtx({ push: { send: async (tokens) => (sent.push(tokens), { sent: tokens.length, dead: [] }) } });
    expect(await wired.push.send(['t'], { data: {} })).toEqual({ sent: 1, dead: [] });
  });
});
