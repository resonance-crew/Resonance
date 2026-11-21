import { afterAll, beforeAll } from 'vitest';
import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { describeRealtimeContract } from '@/server/contract/realtime.contract';
import { SIGNALS_VERSION } from '@/server/ports/realtime';
import { firestoreRealtime, SIGNALS } from '@/server/infra/firestore/realtime';
import { consoleLogger } from '@/server/infra/system/log';

// The signal channel's Firestore adapter against the same contract as memory
// (src/server/infra/memory/realtime.test.ts): merge-sets with
// FieldValue.increment on signals/{uid}, nested thread counters, concurrent
// touches all counted — with ids of each run's own.

const PROJECT = 'demo-resonance-ports-realtime';
let app: App;
let db: Firestore;

beforeAll(() => {
  process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
  app = initializeApp({ projectId: PROJECT }, 'ports-realtime-test');
  db = getFirestore(app);
});

afterAll(async () => {
  await deleteApp(app);
});

let run = 0;
describeRealtimeContract('Firestore (emulator)', () => {
  const prefix = `r${Date.now()}x${++run}`;
  return {
    publisher: firestoreRealtime(db, consoleLogger),
    id: (n) => `${prefix}${n}`,
    async read(uid) {
      const snap = await db.collection(SIGNALS).doc(uid).get();
      if (!snap.exists) return null;
      const d = snap.data()!;
      const n = (k: string) => (typeof d[k] === 'number' ? (d[k] as number) : 0);
      return { v: d.v ?? SIGNALS_VERSION, inbox: n('inbox'), bell: n('bell'), graph: n('graph'), map: n('map'), drafts: n('drafts'), threads: (d.threads as Record<string, number>) ?? {} };
    },
  };
});
