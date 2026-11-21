import { afterAll, beforeAll } from 'vitest';
import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { describeRecommendRepoContract } from '@/server/contract/recommend.contract';
import { recommendData } from '@/server/infra/firestore/repos/recommend';
import { firestoreUow } from '@/server/infra/firestore/uow';

// The recommend repository (src/server/infra/firestore/repos/recommend.ts:
// today's Firestore code of src/lib/recommend, moved) on Firestore's
// emulator, against the contract the memory repository runs in the unit suite.

const PROJECT = 'demo-resonance-ports-recommend';
let app: App;
let db: Firestore;

beforeAll(() => {
  process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
  app = initializeApp({ projectId: PROJECT }, 'ports-recommend-test');
  db = getFirestore(app);
});

afterAll(async () => {
  await deleteApp(app);
});

const clear = () => fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });

const msOf = (v: unknown): unknown =>
  v instanceof Timestamp ? v.toMillis() : v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, msOf(x)])) : v;

describeRecommendRepoContract('firestore', async () => {
  await clear();
  return {
    data: recommendData(db),
    uow: firestoreUow(db),
    seed: async (table, id, row) => void (await db.collection(table).doc(id).set(row)),
    peek: async (table, id) => {
      const snap = await db.collection(table).doc(id).get();
      return snap.exists ? (msOf(snap.data()) as Record<string, unknown>) : null;
    },
  };
});
