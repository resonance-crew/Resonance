import { describeInboxContract } from '@/server/contract/inbox.contract';
import { isInstant, toInstant } from '@/server/ports/time';
import { memoryCtx } from '../ctx';

// Phase 2 inbox (2a-inbox): the inbox reads and read marks over memory,
// against the same contract as Firestore's emulator
// (test/emulator/ports.inbox.emulator.test.ts).

describeInboxContract('memory', () => {
  const ctx = memoryCtx();
  return {
    data: ctx.data,
    uow: ctx.uow,
    uid: (n) => n,
    async seedConversation(pair, c) {
      ctx.state.put('conversations', pair, { createdAt: c.updatedAt, lastMessage: null, unread: {}, ...c });
    },
    async seedMessage(pair, id, m) {
      ctx.state.put('messages', `${pair}/${id}`, { ...m });
    },
    async seedBell(id, r) {
      ctx.state.put('notifications', id, { readAt: null, ...r });
    },
    async readAt(id) {
      const v = ctx.state.get('notifications', id)?.readAt;
      return isInstant(v) ? v : typeof v === 'number' ? toInstant(v) : null;
    },
  };
});
