import { afterAll, beforeAll } from 'vitest';
import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { describeLeaseStoreContract } from '@/server/contract/lease.contract';
import { firestoreLeaseStore } from '@/server/infra/firestore/lease';

// The LeaseStore on Firestore's emulator (the recommender's build lease:
// `leaseUntil` on the row the key names, taken in a transaction), against the
// contract the memory adapter runs in the unit suite.

const PROJECT = 'demo-resonance-ports-lease';
let app: App;
let db: Firestore;

beforeAll(() => {
  process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
  app = initializeApp({ projectId: PROJECT }, 'ports-lease-test');
  db = getFirestore(app);
});

afterAll(async () => {
  await deleteApp(app);
});

const clear = () => fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });

let n = 0;
describeLeaseStoreContract('firestore', async () => {
  await clear();
  n++;
  return { leases: firestoreLeaseStore(db), key: `recommendations/u${n}`, other: `recommendations/v${n}` };
});
