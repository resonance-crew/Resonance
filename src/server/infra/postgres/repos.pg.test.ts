import { afterAll, describe } from 'vitest';
import { describeGraphContract } from '@/server/contract/graph.contract';
import { describeSocialContract } from '@/server/contract/social.contract';
import { describeTapsContract } from '@/server/contract/taps.contract';
import { ORIGINS, pairKey } from '@/server/domain/graph';
import { pgUow } from './ctx';
import { buildPgDataRepos } from './repos';
import { lazyPgTestDb, PG_SKIP_REASON, PG_TEST_URL } from './testing';

// The taps, social and graph repositories over PostgreSQL against the very
// contracts memory and Firestore's emulator keep. Skipped without PG_TEST_URL.

const pg = lazyPgTestDb();
afterAll(() => pg.close());

async function fresh() {
  const db = await pg.get();
  await db.reset();
  return { db, uow: pgUow(db.pool), data: buildPgDataRepos(db.docs) };
}

describe.skipIf(!PG_TEST_URL)(`PostgreSQL repositories${PG_TEST_URL ? '' : ` — ${PG_SKIP_REASON}`}`, () => {
  describeTapsContract('postgres', async () => {
    const { db, uow, data } = await fresh();
    return {
      uow,
      data,
      card: (n) => n,
      async seedCard(id, authorId, opts = {}) {
        const at = new Date('2026-11-18T10:00:00Z');
        await db.docs.put('cards', id, {
          authorId,
          visibility: opts.trashed ? 'private' : 'public',
          anonymous: false,
          publishedAt: at,
          trashedAt: opts.trashed ? at : null,
          readCount: 0,
        });
      },
      async seedConnection(a, b) {
        await db.docs.put('connections', pairKey(a, b), { userIds: [a, b].sort() });
      },
      readCount: async (id) => Number((await db.docs.get('cards', id))?.readCount),
    };
  });

  describeSocialContract('postgres', async () => {
    const { db, uow, data } = await fresh();
    return {
      uow,
      data,
      id: (n) => n,
      async seedConnection(a, b, at) {
        await db.docs.put('connections', pairKey(a, b), { userIds: [a, b].sort(), establishedAt: at });
      },
      async seedInvite(id, row) {
        await db.docs.put('invites', id, { ...row, message: 'hi' });
      },
      inviteStatus: async (id) => ((await db.docs.get('invites', id))?.status as string | undefined) ?? null,
      connected: async (a, b) => (await db.docs.get('connections', pairKey(a, b))) != null,
      blockSeen: async (a, b) => (await data.users.hasBlocked(a, b)) && (await data.graph.hasBlocked(a, b)),
    };
  });

  describeGraphContract('postgres', async () => {
    const { db, uow, data } = await fresh();
    let bells = 0;
    return {
      uow,
      data,
      id: (n) => n,
      async seedUser(uid, handle) {
        await db.docs.put('users', uid, { handle });
      },
      async seedCard(id, authorId, fields = {}) {
        await db.docs.put('cards', id, { authorId, visibility: 'public', anonymous: false, publishedAt: new Date('2026-11-18T10:00:00Z'), trashedAt: null, ...fields });
      },
      async seedConnection(a, b) {
        await db.docs.put('connections', pairKey(a, b), { userIds: [a, b].sort(), establishedAt: new Date('2026-01-01T00:00:00Z') });
      },
      async seedBell(row) {
        await db.docs.put('notifications', `legacy${++bells}`, { ...row, readAt: null, createdAt: new Date('2026-06-04T00:00:00Z') });
      },
      async seedInvite(id, row) {
        await db.docs.put('invites', id, row);
      },
      async seedLetter(from, to) {
        await db.docs.put('letters', `${from}_${to}`, { from, to, count: 1 });
        await db.docs.put('conversations', pairKey(from, to), { participants: [from, to].sort(), request: { from, count: 1 } });
      },
      async origins(a, b) {
        const row = await db.docs.get(ORIGINS, pairKey(a, b));
        return row ? { reasons: Object.keys(row.reasons as object).sort(), resonanceCards: row.resonanceCards as string[] } : null;
      },
      connected: async (a, b) => !!(await db.docs.get('connections', pairKey(a, b))),
      row: (table, id) => db.docs.get(table, id),
    };
  });
});
