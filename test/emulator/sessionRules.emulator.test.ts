import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { assertFails, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  setLogLevel,
  updateDoc,
  where,
  type Firestore,
} from 'firebase/firestore';

// The three collections Phase 3 of the middleware decouple keeps for the server
// alone, against firestore.rules on the emulator:
//   - identities/{provider}_{subject}: which account a provider's subject is (ADR 0004);
//   - refreshTokens/{sha256}: a session's refresh token, by its hash — a client
//     that could read or write one could keep, or forge, someone's session;
//   - changeLog/{ulid}: the outbox's entries, whose ids and `userIds` name accounts
//     (the rules have no block for it: it stands on the default deny).
// No client reads, lists, queries or writes any of them — not the account they
// are about, not anyone else, not signed out.

let env: RulesTestEnvironment;

const as = (uid: string) => env.authenticatedContext(uid).firestore() as unknown as Firestore;
const signedOut = () => env.unauthenticatedContext().firestore() as unknown as Firestore;

const TOKEN_HASH = 'a'.repeat(64);
const CLOSED = [
  { name: 'identities', id: 'firebase_alice', uidField: 'userId', row: { userId: 'alice', provider: 'firebase', subject: 'alice', createdAt: new Date() } },
  {
    name: 'refreshTokens',
    id: TOKEN_HASH,
    uidField: 'uid',
    row: { uid: 'alice', family: 'f1', authTime: 1, createdAt: new Date(), expiresAt: new Date(Date.now() + 86_400_000), usedAt: null },
  },
  {
    name: 'changeLog',
    id: '01JD0000000000000000000000',
    uidField: 'userIds',
    row: { entity: 'users', id: 'alice', op: 'upsert', version: 1, at: new Date(), done: false, expireAt: new Date(Date.now() + 86_400_000), userIds: ['alice'] },
  },
] as const;

beforeAll(async () => {
  setLogLevel('error');
  const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080').split(':');
  env = await initializeTestEnvironment({
    projectId: 'demo-resonance-session-rules',
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
    for (const c of CLOSED) await setDoc(doc(db, c.name, c.id), c.row);
  });
});

describe.each(CLOSED)('$name: the server alone', (c) => {
  const viewers = () => [
    ['the account it is about', as('alice')],
    ['someone else', as('bob')],
    ['signed out', signedOut()],
  ] as const;

  it('no client reads a row, lists the collection or queries it by the account', async () => {
    for (const [, db] of viewers()) {
      await assertFails(getDoc(doc(db, c.name, c.id)));
      // One that isn't there answers no differently: a miss never says which ids exist.
      await assertFails(getDoc(doc(db, c.name, 'nothing-here')));
      await assertFails(getDocs(collection(db, c.name)));
      const mine = c.uidField === 'userIds' ? where(c.uidField, 'array-contains', 'alice') : where(c.uidField, '==', 'alice');
      await assertFails(getDocs(query(collection(db, c.name), mine)));
    }
  });

  it('no client creates, changes or deletes a row', async () => {
    for (const [, db] of viewers()) {
      await assertFails(setDoc(doc(db, c.name, 'made-by-a-client'), c.row));
      await assertFails(setDoc(doc(db, c.name, c.id), c.row));
      await assertFails(updateDoc(doc(db, c.name, c.id), { [c.uidField]: 'bob' }));
      await assertFails(deleteDoc(doc(db, c.name, c.id)));
    }
  });
});
