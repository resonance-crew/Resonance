import { afterAll, beforeAll } from 'vitest';
import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { describeWriterContract } from '@/server/contract/writer.contract';
import { ctxFor } from '@/server/infra/firestore/ctx';
import { memoryRealtime } from '@/server/infra/memory/adapters';
import { memoryVectors } from '@/server/infra/memory/vectors';

// The writer's services over the Firestore repositories (任務 #3 Phase 2,
// lane 2a-writer), against the same contract as memory
// (src/server/app/writer.test.ts): real transactions — a map batch's reads
// (getAll, the `in` queries for the arrows and members a removal reaches)
// before its writes, `create()` for a new draft, an update (never a merge)
// for an autosave, the patch log and its recursive delete.

const PROJECT = 'demo-resonance-ports-writer';
let app: App;
let db: Firestore;

beforeAll(() => {
  process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
  app = initializeApp({ projectId: PROJECT }, 'ports-writer-test');
  db = getFirestore(app);
});

afterAll(async () => {
  await deleteApp(app);
});

const toStore = (value: unknown): unknown => {
  if (value instanceof Date) return Timestamp.fromDate(value);
  if (Array.isArray(value)) return value.map(toStore);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, toStore(v)]));
  return value;
};
const fromStore = (value: unknown): unknown => {
  if (value instanceof Timestamp) return value.toDate();
  if (Array.isArray(value)) return value.map(fromStore);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, fromStore(v)]));
  return value;
};

describeWriterContract('Firestore (emulator)', async () => {
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
  const realtime = memoryRealtime();
  // Deleting a card clears its vectors too: memory's, so no test reaches a real index.
  const ctx = ctxFor(db, { realtime, vectors: memoryVectors() });
  return {
    ctx,
    touches: realtime.touches,
    async seed(path, row) {
      await db.doc(path).set(toStore(row) as Record<string, unknown>);
    },
    async read(path) {
      const snap = await db.doc(path).get();
      return snap.exists ? (fromStore(snap.data()) as Record<string, unknown>) : null;
    },
  };
});
