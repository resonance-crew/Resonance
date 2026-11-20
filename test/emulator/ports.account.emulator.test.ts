import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { describeAccountPurgeContract, seedAccountWorld } from '@/server/contract/account.contract';
import { ENTITY_NAMES } from '@/server/domain/schema/registry';
import { ctxFor } from '@/server/infra/firestore/ctx';

// The registry-driven account purge on the Firestore emulator, against the
// same contract as memory (src/server/app/account.test.ts): one account with
// a record in every registered entity, purged, then every collection and
// subcollection scanned for its uid — none left but what the registry keeps
// (KEPT in src/server/contract/account.contract.ts, each with its reason).

const PROJECT = 'demo-resonance-ports-account';
let app: App;
let db: Firestore;

beforeAll(() => {
  process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
  app = initializeApp({ projectId: PROJECT }, 'ports-account-test');
  db = getFirestore(app);
});

afterAll(async () => {
  await deleteApp(app);
});

async function clear() {
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
}

async function dump() {
  // A collection group per registered name reaches every collection and subcollection of that name.
  const snaps = await Promise.all(ENTITY_NAMES.map((name) => db.collectionGroup(name).get()));
  return snaps.flatMap((s) => s.docs.map((d) => ({ path: d.ref.path, row: d.data() as Record<string, unknown> })));
}

describeAccountPurgeContract('Firestore (emulator)', async () => {
  await clear();
  return {
    ctx: ctxFor(db),
    seed: async (path, row) => {
      await db.doc(path).set(row);
    },
    dump,
  };
});

describe('the scan itself', () => {
  it('sees every collection the database holds: none outside the registry', async () => {
    await clear();
    await seedAccountWorld(async (path, row) => {
      await db.doc(path).set(row);
    });
    const registered = new Set<string>(ENTITY_NAMES);
    const top = (await db.listCollections()).map((c) => c.id);
    expect(top.filter((id) => !registered.has(id))).toEqual([]);
    // And reads every document, subcollections included, through the registered names.
    const all = await dump();
    expect(all.some((d) => d.path.endsWith('/edits/current'))).toBe(true);
    expect(all.some((d) => d.path.includes('/blocks/'))).toBe(true);
  });
});
