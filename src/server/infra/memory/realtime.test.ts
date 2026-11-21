import { describe, expect, it } from 'vitest';
import { describeRealtimeContract } from '@/server/contract/realtime.contract';
import { signal } from '@/server/app/realtime';
import { memoryCtx } from './ctx';
import { memoryRealtime } from './adapters';

describeRealtimeContract('memory', () => {
  const publisher = memoryRealtime();
  return {
    publisher,
    id: (n) => n,
    read: async (uid) => (publisher.touches.some((t) => t.uid === uid) ? publisher.signals(uid) : null),
  };
});

describe('signal()', () => {
  it('touches each person once, with every topic their events named', async () => {
    const ctx = memoryCtx();
    await signal(ctx, { kind: 'graph', uids: ['alice', 'bob'] }, { kind: 'conversation', a: 'bob', b: 'alice' });
    expect(ctx.realtime.touches).toEqual([
      { uid: 'alice', topics: ['graph', 'inbox', { thread: 'alice_bob' }] },
      { uid: 'bob', topics: ['graph', 'inbox', { thread: 'alice_bob' }] },
    ]);
  });

  it('never throws into the write: a failing touch is logged', async () => {
    const ctx = memoryCtx({
      realtime: {
        touch: async () => {
          throw new Error('down');
        },
      } as never,
    });
    await expect(signal(ctx, { kind: 'bell', to: 'alice' })).resolves.toBeUndefined();
    expect(ctx.log.lines.some((l) => l.level === 'warn' && l.message.includes('[realtime]'))).toBe(true);
  });
});
