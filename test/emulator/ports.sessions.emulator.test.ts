import { afterAll, beforeAll } from 'vitest';
import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { describeSessionStoreContract } from '@/server/contract/sessions.contract';
import { firestoreSessionStore } from '@/server/infra/firestore/sessions';

// The SessionStore on Firestore's emulator (refreshTokens/{sha256}, rotated in
// a transaction; a replay within the grace is superseded, a later one revokes
// the family), against the contract the memory adapter runs in the unit suite.

const PROJECT = 'demo-resonance-ports-sessions';
let app: App;
let db: Firestore;

beforeAll(() => {
  process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
  app = initializeApp({ projectId: PROJECT }, 'ports-sessions-test');
  db = getFirestore(app);
});

afterAll(async () => {
  await deleteApp(app);
});

const clear = () => fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });

let n = 0;
describeSessionStoreContract('firestore', async () => {
  await clear();
  return { store: firestoreSessionStore(db), uid: `u${++n}` };
});
