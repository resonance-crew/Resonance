import { describeSocialContract } from '@/server/contract/social.contract';
import { pairKey } from '@/server/domain/graph';
import { memoryCtx } from '../ctx';

describeSocialContract('memory', () => {
  const ctx = memoryCtx();
  const s = ctx.state;
  return {
    uow: ctx.uow,
    data: ctx.data,
    id: (n) => n,
    async seedConnection(a, b, at) {
      s.put('connections', pairKey(a, b), { userIds: [a, b].sort(), establishedAt: at });
    },
    async seedInvite(id, row) {
      s.put('invites', id, { ...row, message: 'hi' });
    },
    inviteStatus: async (id) => (s.get<{ status: string }>('invites', id)?.status ?? null),
    connected: async (a, b) => s.get('connections', pairKey(a, b)) != null,
    blockSeen: async (a, b) => (await ctx.data.users.hasBlocked(a, b)) && (await ctx.data.graph.hasBlocked(a, b)),
  };
});
