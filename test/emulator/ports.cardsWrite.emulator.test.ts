import { afterAll, beforeAll, beforeEach } from 'vitest';
import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { describeCardsWriteContract } from '@/server/contract/cardsWrite.contract';
import { ctxFor } from '@/server/infra/firestore/ctx';
import { sanitize } from '@/server/infra/firestore/mapper';

// The cards / users write contract (src/server/contract/cardsWrite.contract.ts) on the Firestore repositories,
// against the emulator — the same cases the memory repositories pass (src/server/infra/memory/cardsWrite.test.ts).

const PROJECT = 'demo-resonance-ports-cardswrite';
let app: App;
let db: Firestore;

beforeAll(() => {
  process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
  app = initializeApp({ projectId: PROJECT }, 'ports-cardswrite-test');
  db = getFirestore(app);
});

afterAll(async () => {
  await deleteApp(app);
});

beforeEach(async () => {
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
});

/** A seed row as Firestore keeps it: its Dates as Timestamps, nothing undefined. */
const stored = (row: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(row).filter(([, v]) => v !== undefined).map(([k, v]) => [k, v instanceof Date ? Timestamp.fromDate(v) : v]));

describeCardsWriteContract('firestore (emulator)', async (seed) => {
  await Promise.all(Object.entries(seed).map(([path, row]) => db.doc(path).set(stored(row))));
  const ctx = ctxFor(db);
  return {
    uow: ctx.uow,
    data: ctx.data,
    peek: async (path) => {
      const snap = await db.doc(path).get();
      return snap.exists ? sanitize<Record<string, unknown>>(snap.data()) : null;
    },
  };
});
