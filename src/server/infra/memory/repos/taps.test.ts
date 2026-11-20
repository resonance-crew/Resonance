import { describeTapsContract } from '@/server/contract/taps.contract';
import { memoryCtx } from '../ctx';

// The taps repositories over memory against the same contract as Firestore's
// emulator (test/emulator/ports.taps.emulator.test.ts).

describeTapsContract('memory', () => {
  const ctx = memoryCtx();
  return {
    uow: ctx.uow,
    data: ctx.data,
    card: (n) => n,
    async seedCard(id, authorId, opts = {}) {
      const at = new Date('2026-11-18T10:00:00Z');
      ctx.state.put('cards', id, {
        authorId,
        visibility: opts.trashed ? 'private' : 'public',
        anonymous: false,
        publishedAt: at,
        trashedAt: opts.trashed ? at : null,
        readCount: 0,
      });
    },
    readCount: async (id) => Number(ctx.state.get('cards', id)?.readCount),
  };
});
