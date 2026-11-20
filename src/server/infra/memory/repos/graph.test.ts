import { describeGraphContract } from '@/server/contract/graph.contract';
import { ORIGINS, pairKey } from '@/server/domain/graph';
import { memoryCtx } from '../ctx';

// The graph repositories over memory against the same contract as Firestore's
// emulator (test/emulator/ports.graph.emulator.test.ts).

describeGraphContract('memory', () => {
  const ctx = memoryCtx();
  const s = ctx.state;
  let bells = 0;
  return {
    uow: ctx.uow,
    data: ctx.data,
    id: (n) => n,
    async seedUser(uid, handle) {
      s.put('users', uid, { handle });
    },
    async seedCard(id, authorId, fields = {}) {
      s.put('cards', id, { authorId, visibility: 'public', anonymous: false, publishedAt: new Date('2026-11-18T10:00:00Z'), trashedAt: null, ...fields });
    },
    async seedConnection(a, b) {
      s.put('connections', pairKey(a, b), { userIds: [a, b].sort(), establishedAt: new Date('2026-01-01T00:00:00Z') });
    },
    async seedBell(row) {
      s.put('notifications', `legacy${++bells}`, { ...row, readAt: null, createdAt: new Date('2026-06-04T00:00:00Z') });
    },
    async seedInvite(id, row) {
      s.put('invites', id, row);
    },
    async seedLetter(from, to) {
      s.put('letters', `${from}_${to}`, { from, to, count: 1 });
      s.put('conversations', pairKey(from, to), { participants: [from, to].sort(), request: { from, count: 1 } });
    },
    async origins(a, b) {
      const row = s.get(ORIGINS, pairKey(a, b));
      return row ? { reasons: Object.keys(row.reasons as object).sort(), resonanceCards: row.resonanceCards as string[] } : null;
    },
    connected: async (a, b) => !!s.get('connections', pairKey(a, b)),
    row: async (table, id) => s.get(table, id),
  };
});
