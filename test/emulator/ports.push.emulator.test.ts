import { afterAll, beforeAll } from 'vitest';
import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { describePushStateContract } from '@/server/contract/pushState.contract';
import { ctxFor } from '@/server/infra/firestore/ctx';

// The pushState and bell repositories on Firestore's emulator, against the
// same contract as memory's (src/server/infra/memory/pushState.test.ts): a
// project of this suite's own, emptied before each test.

const PROJECT = 'demo-resonance-ports-push';
let app: App;
let db: Firestore;

beforeAll(() => {
  process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
  app = initializeApp({ projectId: PROJECT }, 'ports-push-test');
  db = getFirestore(app);
});

afterAll(async () => {
  await deleteApp(app);
});

describePushStateContract('Firestore (emulator)', async () => {
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
  return ctxFor(db);
});
