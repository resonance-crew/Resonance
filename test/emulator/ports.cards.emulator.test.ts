import { afterAll, beforeAll, beforeEach } from 'vitest';
import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { describeCardsReadContract } from '@/server/contract/cards.contract';
import { ctxFor } from '@/server/infra/firestore/ctx';

// The cards / users read contract (src/server/contract/cards.contract.ts) on the Firestore repositories,
// against the emulator — the same cases the memory repositories pass (src/server/infra/memory/cards.test.ts).

const PROJECT = 'demo-resonance-ports-cards';
let app: App;
let db: Firestore;

beforeAll(() => {
  process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
  app = initializeApp({ projectId: PROJECT }, 'ports-cards-test');
  db = getFirestore(app);
});

afterAll(async () => {
  await deleteApp(app);
});

beforeEach(async () => {
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
});

/** A seed row as Firestore keeps it: its Dates as Timestamps. */
const stored = (row: Record<string, unknown>) => Object.fromEntries(Object.entries(row).map(([k, v]) => [k, v instanceof Date ? Timestamp.fromDate(v) : v]));

describeCardsReadContract('firestore (emulator)', async (seed) => {
  const writes: Promise<unknown>[] = [];
  for (const [id, row] of Object.entries(seed.cards ?? {})) writes.push(db.doc(`cards/${id}`).set(stored(row)));
  for (const [id, row] of Object.entries(seed.users ?? {})) writes.push(db.doc(`users/${id}`).set(stored(row)));
  for (const [uid, other] of seed.blocks ?? []) writes.push(db.doc(`users/${uid}/blocks/${other}`).set({ blockedUid: other }));
  for (const [a, b] of seed.connections ?? []) writes.push(db.doc(`connections/${a < b ? `${a}_${b}` : `${b}_${a}`}`).set({ users: [a, b] }));
  await Promise.all(writes);
  return ctxFor(db).data;
});
