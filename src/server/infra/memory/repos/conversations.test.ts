import { describeConversationsContract } from '@/server/contract/conversations.contract';
import { memoryCtx } from '../ctx';

// The conversations repositories over memory against the same contract as
// Firestore's emulator (test/emulator/ports.conversations.emulator.test.ts).

describeConversationsContract('memory', () => {
  const ctx = memoryCtx();
  return {
    uow: ctx.uow,
    data: ctx.data,
    uid: (n) => n,
    async seedMessage(pair, id, m) {
      ctx.state.put('messages', `${pair}/${id}`, { ...m });
    },
    unread: async (pair) => (ctx.state.get('conversations', pair)?.unread ?? {}) as Record<string, number>,
  };
});
