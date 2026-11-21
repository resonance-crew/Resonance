import { afterAll, beforeAll } from 'vitest';
import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { describeTapsContract } from '@/server/contract/taps.contract';
import { ctxFor } from '@/server/infra/firestore/ctx';

// The taps aggregate's Firestore repositories against the same contract as
// memory (src/server/infra/memory/repos/taps.test.ts): real transactions,
// queries and batches on the emulator — the author's page query under its
// composite index (indexGuard) — with card ids of each test's own.

const PROJECT = 'demo-resonance-ports-taps';
let app: App;
let db: Firestore;

beforeAll(() => {
  process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
  app = initializeApp({ projectId: PROJECT }, 'ports-taps-test');
  db = getFirestore(app);
});

afterAll(async () => {
  await deleteApp(app);
});

let run = 0;
describeTapsContract('Firestore (emulator)', () => {
  const prefix = `p${Date.now()}x${++run}`;
  const ctx = ctxFor(db);
  return {
    uow: ctx.uow,
    data: ctx.data,
    card: (n) => `${prefix}${n}`,
    async seedCard(id, authorId, opts = {}) {
      const at = Timestamp.fromDate(new Date('2026-11-18T10:00:00Z'));
      await db.doc(`cards/${id}`).set({
        authorId,
        visibility: opts.trashed ? 'private' : 'public',
        anonymous: false,
        publishedAt: at,
        trashedAt: opts.trashed ? at : null,
        readCount: 0,
      });
    },
    readCount: async (id) => Number((await db.doc(`cards/${id}`).get()).get('readCount')),
  };
});
