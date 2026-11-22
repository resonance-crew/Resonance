import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, deleteField, doc, serverTimestamp, setDoc, setLogLevel, updateDoc, type Firestore } from 'firebase/firestore';

// ADR 0005's keys against firestore.rules: `cards.media.key` and
// `users.avatarKey` are optional on every client write that sets a cover or
// a photo today (older builds never send them, and keep working), and when
// sent each must be a storage key — never a URL, no `..` — and the very key
// the stored URL ends in.

let env: RulesTestEnvironment;
const as = (uid: string) => env.authenticatedContext(uid).firestore() as unknown as Firestore;

const BASE = 'https://img.resonance.test';
const KEY = 'image/2026-11/0b9c6a2e-1f43-4c55-9d8e-2a1c3b4d5e6f.webp';
const BAD_KEYS = [
  `${BASE}/${KEY}`,
  'image/../secret.webp',
  'image/2026-11/./a.webp',
  '/image/2026-11/a.webp',
  'image//a.webp',
  'image/2026-11/',
  '',
  'x'.repeat(513),
  'image/2026-11/other.webp',
  42,
];

function draft(authorId: string, extra: Record<string, unknown> = {}) {
  return {
    authorId, thoughtCore: 'A title', story: 'A story', tags: ['one'], visibility: 'public', anonymous: false,
    originalLocale: 'zh-TW', translations: {}, publishedAt: null, readCount: 0, resonanceCount: 0, inviteCount: 0,
    createdAt: serverTimestamp(), updatedAt: serverTimestamp(), ...extra,
  };
}

beforeAll(async () => {
  setLogLevel('error');
  const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080').split(':');
  env = await initializeTestEnvironment({
    projectId: 'demo-resonance-media-keys-rules',
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
    await setDoc(doc(db, 'config', 'storage'), { host: 'img.resonance.test' });
    await setDoc(doc(db, 'users', 'alice'), { handle: 'alice', handleLower: 'alice', initials: 'AL', accentColor: 'x', avatarUrl: `${BASE}/image/2026-10/old.webp` });
  });
});

describe('users.avatarKey', () => {
  it('an older client changes only the photo URL, as before', async () => {
    await assertSucceeds(updateDoc(doc(as('alice'), 'users', 'alice'), { avatarUrl: `${BASE}/${KEY}` }));
  });

  it("takes the key of the photo the profile names — with the URL, or on its own — and its removal", async () => {
    const me = doc(as('alice'), 'users', 'alice');
    await assertSucceeds(updateDoc(me, { avatarUrl: `${BASE}/${KEY}`, avatarKey: KEY }));
    await assertSucceeds(updateDoc(me, { avatarKey: deleteField() }));
    await assertSucceeds(updateDoc(me, { avatarKey: KEY }));
    // The key of the photo before is not this photo's.
    await assertFails(updateDoc(me, { avatarKey: 'image/2026-10/old.webp' }));
  });

  it('refuses a URL, a path that climbs, a malformed key, or a key of another picture', async () => {
    const me = doc(as('alice'), 'users', 'alice');
    for (const avatarKey of BAD_KEYS) await assertFails(updateDoc(me, { avatarUrl: `${BASE}/${KEY}`, avatarKey }));
  });

  it("reads a dot in the key as a dot: a key names its own URL, never one a character off (audit L13)", async () => {
    const me = doc(as('alice'), 'users', 'alice');
    const near = `${BASE}/${KEY.replace('.webp', 'Xwebp')}`;
    await assertFails(updateDoc(me, { avatarUrl: near, avatarKey: KEY }));
    await assertSucceeds(updateDoc(me, { avatarUrl: `${BASE}/${KEY}`, avatarKey: KEY }));
  });

  it("is never anyone else's to write", async () => {
    await assertFails(updateDoc(doc(as('bob'), 'users', 'alice'), { avatarKey: 'image/2026-10/old.webp' }));
  });
});

describe('cards.media.key', () => {
  const cover = (extra: Record<string, unknown> = {}) => ({ type: 'image', url: `${BASE}/${KEY}`, label: 'rain', ...extra });

  it('a cover without a key, as every build before writes it, still saves', async () => {
    await assertSucceeds(setDoc(doc(collection(as('alice'), 'cards')), draft('alice', { media: cover() })));
  });

  it('takes the key its URL ends in — on a new draft, an autosave and a pending edit', async () => {
    const db = as('alice');
    const ref = doc(collection(db, 'cards'));
    await assertSucceeds(setDoc(ref, draft('alice', { media: cover({ key: KEY }) })));
    await assertSucceeds(setDoc(ref, { media: cover({ key: KEY, label: 'snow' }), updatedAt: serverTimestamp() }, { merge: true }));
  });

  it('reads a dot in the key as a dot (audit L13)', async () => {
    const db = as('alice');
    const near = `${BASE}/${KEY.replace('.webp', 'Xwebp')}`;
    await assertFails(setDoc(doc(collection(db, 'cards')), draft('alice', { media: { type: 'image', url: near, key: KEY } })));
  });

  it('refuses a URL, a path that climbs, a malformed key, or the key of another picture', async () => {
    const db = as('alice');
    for (const key of BAD_KEYS) await assertFails(setDoc(doc(collection(db, 'cards')), draft('alice', { media: cover({ key }) })));
  });
});
