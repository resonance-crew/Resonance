import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { FieldValue, getFirestore, type Firestore } from 'firebase-admin/firestore';

// The web's one remaining Firestore listener as it runs (the middleware
// decouple, Phase 2): client/signals on the full SDK, signed in through the
// Auth emulator and held to firestore.rules — it hears the viewer's own
// signals/{uid} move, calls only the watchers whose counter moved, and is
// refused someone else's.

const PROJECT = 'demo-resonance-web-signals';
const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080';
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '127.0.0.1:9099';

Object.assign(process.env, {
  NEXT_PUBLIC_FIREBASE_EMULATOR: 'true',
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: PROJECT,
  NEXT_PUBLIC_FIREBASE_API_KEY: 'demo-key',
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: `${PROJECT}.firebaseapp.com`,
  NEXT_PUBLIC_FIREBASE_APP_ID: 'demo-app',
  NEXT_PUBLIC_EMULATOR_FIRESTORE_PORT: firestoreHost.split(':')[1],
  NEXT_PUBLIC_EMULATOR_AUTH_PORT: authHost.split(':')[1],
});

let admin: App;
let db: Firestore;
let me: string;

const client = {
  auth: () => import('@/lib/auth/firebase/client'),
  signals: () => import('@/lib/db/firestore/client/signals'),
  listen: () => import('@/lib/db/firestore/client/listen'),
};

/** Resolves once `fn` has been called `n` times (or rejects after a while). */
function calls(n: number, timeout = 8000) {
  let count = 0;
  let done!: () => void;
  const reached = new Promise<void>((resolveIt, reject) => {
    done = resolveIt;
    setTimeout(() => reject(new Error(`heard ${count} of ${n}`)), timeout);
  });
  return {
    fn: () => {
      if (++count >= n) done();
    },
    reached,
    get count() {
      return count;
    },
  };
}

beforeAll(async () => {
  process.env.FIRESTORE_EMULATOR_HOST = firestoreHost;
  admin = initializeApp({ projectId: PROJECT }, 'web-signals-test');
  db = getFirestore(admin);
  const rules = readFileSync(resolve(__dirname, '../../firebase/firestore.rules'), 'utf8');
  const loaded = await fetch(`http://${firestoreHost}/emulator/v1/projects/${PROJECT}:securityRules`, {
    method: 'PUT',
    body: JSON.stringify({ rules: { files: [{ name: 'firestore.rules', content: rules }] } }),
  });
  expect(loaded.ok).toBe(true);
  const { getFirebaseClientAuth } = await client.auth();
  const { createUserWithEmailAndPassword } = await import('firebase/auth');
  const cred = await createUserWithEmailAndPassword(getFirebaseClientAuth(), `signals-${Date.now()}@web.test`, 'web-signals-pw');
  me = cred.user.uid;
});

afterAll(async () => {
  (await client.signals()).resetSignals();
  const { getFirebaseClientAuth } = await client.auth();
  await getFirebaseClientAuth().signOut();
  await deleteApp(admin);
});

beforeEach(async () => {
  (await client.signals()).resetSignals();
  await fetch(`http://${firestoreHost}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
});

const touch = (uid: string, fields: Record<string, unknown>) => db.doc(`signals/${uid}`).set({ v: 1, ...fields, at: FieldValue.serverTimestamp() }, { merge: true });

describe('the signal listener, on the full SDK', () => {
  it("hears the viewer's own counters move, and calls only the watchers whose counter moved", async () => {
    await touch(me, { inbox: 1, bell: 1, threads: { [`${me}_zed`]: 1 } });
    const { watchSignal } = await client.signals();
    const inbox = calls(1);
    const thread = calls(1);
    let bell = 0;
    watchSignal(me, 'inbox', inbox.fn);
    watchSignal(me, `thread:${me}_zed`, thread.fn);
    watchSignal(me, 'bell', () => bell++);

    // Its first answer is where the counters stand; then a message (the server's touch after a send) moves two.
    await new Promise((r) => setTimeout(r, 1500));
    expect([inbox.count, thread.count, bell]).toEqual([0, 0, 0]);
    await touch(me, { inbox: FieldValue.increment(1), threads: { [`${me}_zed`]: FieldValue.increment(1) } });
    await Promise.all([inbox.reached, thread.reached]);
    expect(bell).toBe(0);
  });

  it("is refused someone else's signals by the rules", async () => {
    await touch('bob', { inbox: 3 });
    const { listenLazily } = await client.listen();
    const refused = await new Promise<Error>((resolveIt) => {
      listenLazily(
        ({ listenDoc }) => listenDoc(['signals', 'bob'], () => undefined, resolveIt),
        resolveIt,
      );
    });
    expect((refused as { code?: string }).code).toBe('permission-denied');
  });
});
