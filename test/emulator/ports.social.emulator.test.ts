import { afterAll, beforeAll } from 'vitest';
import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { describeSocialContract } from '@/server/contract/social.contract';
import { pairKey } from '@/server/domain/graph';
import { ctxFor } from '@/server/infra/firestore/ctx';

// The social aggregate's Firestore repositories against the same contract as
// memory (src/server/infra/memory/repos/social.test.ts): the block's queries of
// pending invites inside its transaction, a bookmark's create kept as it was,
// the lists' order — with ids of each run's own.

const PROJECT = 'demo-resonance-ports-social';
let app: App;
let db: Firestore;

beforeAll(() => {
  process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
  app = initializeApp({ projectId: PROJECT }, 'ports-social-test');
  db = getFirestore(app);
});

afterAll(async () => {
  await deleteApp(app);
});

let run = 0;
describeSocialContract('Firestore (emulator)', () => {
  const prefix = `s${Date.now()}x${++run}`;
  const ctx = ctxFor(db);
  return {
    uow: ctx.uow,
    data: ctx.data,
    id: (n) => `${prefix}${n}`,
    async seedConnection(a, b, at) {
      await db.doc(`connections/${pairKey(a, b)}`).set({ userIds: [a, b].sort(), establishedAt: Timestamp.fromDate(at) });
    },
    async seedInvite(id, row) {
      await db.doc(`invites/${id}`).set({ ...row, message: 'hi', createdAt: Timestamp.fromDate(row.createdAt), expiresAt: Timestamp.fromDate(row.expiresAt) });
    },
    inviteStatus: async (id) => ((await db.doc(`invites/${id}`).get()).get('status') ?? null),
    connected: async (a, b) => (await db.doc(`connections/${pairKey(a, b)}`).get()).exists,
    blockSeen: async (a, b) => (await ctx.data.users.hasBlocked(a, b)) && (await ctx.data.graph.hasBlocked(a, b)),
  };
});
