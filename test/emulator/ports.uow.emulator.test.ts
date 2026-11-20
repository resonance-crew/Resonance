import { afterAll, beforeAll } from 'vitest';
import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { describeUnitOfWorkContract } from '@/server/contract/uow.contract';
import { firestorePeek, firestoreProbe, type ProbeTx } from '@/server/contract/probe';
import { FirestoreUnitOfWork } from '@/server/infra/firestore/uow';

// The Firestore UnitOfWork against the same contract as the memory one
// (src/server/infra/memory/uow.test.ts): real transactions on the emulator,
// over a probe collection of this suite's own (never a production one), a new
// collection per test so no test sees another's rows.

const PROJECT = 'demo-resonance-ports-uow';
let app: App;
let db: Firestore;

beforeAll(() => {
  process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
  app = initializeApp({ projectId: PROJECT }, 'ports-uow-test');
  db = getFirestore(app);
});

afterAll(async () => {
  await deleteApp(app);
});

let run = 0;
describeUnitOfWorkContract('Firestore (emulator)', () => {
  const collection = `probe_${Date.now()}_${++run}`;
  return { uow: new FirestoreUnitOfWork<ProbeTx>(db, firestoreProbe(collection)), peek: firestorePeek(db, collection) };
});
