import { afterAll, beforeAll } from 'vitest';
import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { describeTranslationsContract } from '@/server/contract/translations.contract';
import { ctxFor } from '@/server/infra/firestore/ctx';

// The translations aggregate's Firestore repositories against the same
// contract as memory (src/server/infra/memory/repos/translations.test.ts):
// real transactions, field masks, the BulkWriter's lastUpdateTime
// preconditions and documentId paging on the emulator, with card ids of
// each test's own.

const PROJECT = 'demo-resonance-ports-translations';
let app: App;
let db: Firestore;

beforeAll(() => {
  process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
  app = initializeApp({ projectId: PROJECT }, 'ports-translations-test');
  db = getFirestore(app);
});

afterAll(async () => {
  await deleteApp(app);
});

const toStore = (fields: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, v instanceof Date ? Timestamp.fromDate(v) : v]));
const fromStore = (fields: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, v instanceof Timestamp ? v.toDate() : v]));

let run = 0;
describeTranslationsContract('Firestore (emulator)', () => {
  // Fixed width, so a later test's ids sort after an earlier one's.
  const prefix = `p${Date.now()}x${String(++run).padStart(4, '0')}-`;
  const ctx = ctxFor(db);
  return {
    uow: ctx.uow,
    data: ctx.data,
    card: (n) => `${prefix}${n}`,
    async seedCard(id, fields) {
      await db.doc(`cards/${id}`).set(toStore(fields));
    },
    async touchCard(id, fields) {
      await db.doc(`cards/${id}`).update(toStore(fields));
    },
    async readCard(id) {
      const snap = await db.doc(`cards/${id}`).get();
      return snap.exists ? fromStore(snap.data()!) : null;
    },
  };
});
