import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, setDoc, setLogLevel, updateDoc, onSnapshot, type Firestore } from 'firebase/firestore';

// firestore.rules `match /signals/{uid}` (Phase 2's signal channel) against the
// emulator: a signed-in person reads their own document — and listens to it —
// no one reads anyone else's, signed out reads nothing, and no client writes
// any, their own included (only the server raises the counters).

let env: RulesTestEnvironment;

const as = (uid: string) => env.authenticatedContext(uid).firestore() as unknown as Firestore;
const signedOut = () => env.unauthenticatedContext().firestore() as unknown as Firestore;

beforeAll(async () => {
  setLogLevel('error');
  const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080').split(':');
  env = await initializeTestEnvironment({
    projectId: 'demo-resonance-signals-rules',
    firestore: { host, port: Number(port), rules: readFileSync(resolve(__dirname, '../../firebase/firestore.rules'), 'utf8') },
  });
});

afterAll(async () => {
  await env.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore() as unknown as Firestore;
    await setDoc(doc(db, 'signals', 'alice'), { v: 1, inbox: 2, graph: 1, threads: { alice_bob: 2 }, at: new Date() });
    await setDoc(doc(db, 'signals', 'bob'), { v: 1, inbox: 1, threads: { alice_bob: 1 } });
  });
});

describe('signals/{uid}', () => {
  it('its owner reads it, and may listen to it', async () => {
    await assertSucceeds(getDoc(doc(as('alice'), 'signals', 'alice')));
    // One that does not exist yet is theirs to read too (a new account listens before any touch).
    await assertSucceeds(getDoc(doc(as('carol'), 'signals', 'carol')));
    await assertSucceeds(
      new Promise<void>((done, fail) => {
        const stop = onSnapshot(doc(as('alice'), 'signals', 'alice'), () => (stop(), done()), fail);
      }),
    );
  });

  it("no one reads someone else's, and signed out no one reads any", async () => {
    await assertFails(getDoc(doc(as('bob'), 'signals', 'alice')));
    await assertFails(getDoc(doc(as('carol'), 'signals', 'alice')));
    await assertFails(getDoc(doc(signedOut(), 'signals', 'alice')));
  });

  it('no client writes one: not its owner, not anyone else', async () => {
    await assertFails(setDoc(doc(as('alice'), 'signals', 'alice'), { v: 1, inbox: 99 }));
    await assertFails(updateDoc(doc(as('alice'), 'signals', 'alice'), { inbox: 0 }));
    await assertFails(deleteDoc(doc(as('alice'), 'signals', 'alice')));
    await assertFails(setDoc(doc(as('carol'), 'signals', 'carol'), { v: 1 }));
    await assertFails(updateDoc(doc(as('bob'), 'signals', 'alice'), { inbox: 0 }));
    await assertFails(setDoc(doc(signedOut(), 'signals', 'dan'), { v: 1 }));
  });
});
