import { afterAll, beforeAll } from 'vitest';
import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { describeGraphContract } from '@/server/contract/graph.contract';
import { ORIGINS, pairKey } from '@/server/domain/graph';
import { ctxFor } from '@/server/infra/firestore/ctx';

// The graph aggregate's Firestore repositories against the same contract as
// memory (src/server/infra/memory/repos/graph.test.ts): real transactions on
// the emulator — the legacy bell's four-field equality query and the
// array-contains take-back query run inside them, arrayUnion / arrayRemove and
// the FieldPath delete as stored — with user and card ids of each test's own.

const PROJECT = 'demo-resonance-ports-graph';
let app: App;
let db: Firestore;

beforeAll(() => {
  process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
  app = initializeApp({ projectId: PROJECT }, 'ports-graph-test');
  db = getFirestore(app);
});

afterAll(async () => {
  await deleteApp(app);
});

let run = 0;
describeGraphContract('Firestore (emulator)', () => {
  const prefix = `g${Date.now()}x${++run}`;
  const ctx = ctxFor(db);
  return {
    uow: ctx.uow,
    data: ctx.data,
    id: (n) => `${prefix}${n}`,
    async seedUser(uid, handle) {
      await db.doc(`users/${uid}`).set({ handle });
    },
    async seedCard(id, authorId, fields = {}) {
      await db.doc(`cards/${id}`).set({
        authorId,
        visibility: 'public',
        anonymous: false,
        publishedAt: Timestamp.fromDate(new Date('2026-11-18T10:00:00Z')),
        trashedAt: null,
        ...fields,
      });
    },
    async seedConnection(a, b) {
      await db.doc(`connections/${pairKey(a, b)}`).set({ userIds: [a, b].sort(), establishedAt: Timestamp.fromDate(new Date('2026-01-01T00:00:00Z')) });
    },
    async seedBell(row) {
      await db.collection('notifications').add({ ...row, readAt: null, createdAt: Timestamp.fromDate(new Date('2026-06-04T00:00:00Z')) });
    },
    async seedInvite(id, row) {
      await db.doc(`invites/${id}`).set({ ...row, expiresAt: row.expiresAt instanceof Date ? Timestamp.fromDate(row.expiresAt) : row.expiresAt });
    },
    async seedLetter(from, to) {
      await db.doc(`letters/${from}_${to}`).set({ from, to, count: 1 });
      await db.doc(`conversations/${pairKey(from, to)}`).set({ participants: [from, to].sort(), request: { from, count: 1 } });
    },
    async origins(a, b) {
      const snap = await db.doc(`${ORIGINS}/${pairKey(a, b)}`).get();
      return snap.exists ? { reasons: Object.keys(snap.get('reasons')).sort(), resonanceCards: snap.get('resonanceCards') } : null;
    },
    connected: async (a, b) => (await db.doc(`connections/${pairKey(a, b)}`).get()).exists,
    row: async (table, id) => (await db.doc(`${table}/${id}`).get()).data() ?? null,
  };
});
