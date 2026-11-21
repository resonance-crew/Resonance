import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { backfillMediaKeys } from '../../scripts/backfills/mediaKeys';
import { memoryMediaUrls } from '@/server/infra/env/media';
import { ctxFor } from '@/server/infra/firestore/ctx';
import { getMe } from '@/server/app/cardsRead';
import { updateProfileIn } from '@/server/app/profile';

// ADR 0005 on the Firestore emulator: the profile service keeps `avatarKey`
// beside the photo it stores (and drops one that no longer goes with it),
// answers rebuild the URL from it once the storage moved, and the backfill
// gives the documents written before their keys — dry run first, only the key
// fields written, idempotent.

const PROJECT = 'demo-resonance-media-keys';
const NOW = 'https://img.resonance.channel';
const BEFORE = 'https://pub-0123.r2.dev';
const KEY = 'image/2026-11/0b9c6a2e-1f43-4c55-9d8e-2a1c3b4d5e6f.webp';
let app: App;
let db: Firestore;
const at = Timestamp.fromDate(new Date('2026-11-01T00:00:00Z'));
const data = async (path: string) => (await db.doc(path).get()).data();

beforeAll(() => {
  process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
  app = initializeApp({ projectId: PROJECT }, 'media-keys-test');
  db = getFirestore(app);
});

afterAll(async () => {
  vi.unstubAllEnvs();
  await deleteApp(app);
});

beforeEach(async () => {
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
});

describe('the profile service on Firestore', () => {
  it('keeps the key beside the photo, drops a stale one, and answers the key on the current base after a move', async () => {
    vi.stubEnv('MEDIA_PUBLIC_BASE', NOW);
    await db.doc('users/ann').set({ handle: 'ann', initials: 'AN', accentColor: 'x' });
    const ctx = ctxFor(db);
    await updateProfileIn(ctx, 'ann', { avatarKey: KEY });
    expect(await data('users/ann')).toMatchObject({ avatarUrl: `${NOW}/${KEY}`, avatarKey: KEY });
    await updateProfileIn(ctx, 'ann', { avatarUrl: `${NOW}/image/2026-11/b.webp` });
    expect(await data('users/ann')).toMatchObject({ avatarKey: 'image/2026-11/b.webp' });
    // The storage moves: the documents still name the old host, the answers the new one.
    await db.doc('users/ann').update({ avatarUrl: `${BEFORE}/image/2026-11/b.webp` });
    vi.stubEnv('MEDIA_PUBLIC_BASE', 'https://media.resonance.channel');
    vi.stubEnv('MEDIA_FORMER_BASES', BEFORE);
    expect((await getMe(ctxFor(db), 'ann')).avatarUrl).toBe('https://media.resonance.channel/image/2026-11/b.webp');
    vi.unstubAllEnvs();
  });
});

describe('backfill media-keys', () => {
  it('counts on a dry run, then writes only the key fields; a second run has nothing to do', async () => {
    await Promise.all([
      db.doc('users/ann').set({ handle: 'ann', avatarUrl: `${NOW}/${KEY}`, joinedAt: at }),
      db.doc('users/ben').set({ handle: 'ben', avatarUrl: 'https://elsewhere.example/b.png' }),
      db.doc('users/cat').set({ handle: 'cat', avatarUrl: `${NOW}/image/2026-11/new.webp`, avatarKey: 'image/2026-01/old.webp' }),
      db.doc('users/dan').set({ handle: 'dan', avatarUrl: `${BEFORE}/${KEY}`, avatarKey: KEY }),
      db.doc('cards/c1').set({ authorId: 'ann', media: { type: 'image', url: `${NOW}/${KEY}`, label: 'rain' }, updatedAt: at }),
      db.doc('cards/c2').set({ authorId: 'ann', media: { type: 'image', url: 'https://legacy.example/old.jpg' } }),
      db.doc('cards/c3').set({ authorId: 'ann' }),
    ]);
    const media = memoryMediaUrls(NOW, [BEFORE]);
    const before = Object.fromEntries(await Promise.all(['users/ann', 'users/ben', 'cards/c1', 'cards/c2', 'cards/c3'].map(async (p) => [p, await data(p)])));
    const quiet = () => {};
    expect(await backfillMediaKeys(db, { apply: false, media, log: quiet })).toMatchObject({ users: 4, cards: 3, avatarKeys: 2, coverKeys: 1, removed: 1, written: 0 });
    expect(await data('users/ann')).toEqual(before['users/ann']);

    expect(await backfillMediaKeys(db, { apply: true, media, log: quiet })).toMatchObject({ written: 4 });
    expect(await data('users/ann')).toEqual({ ...before['users/ann'], avatarKey: KEY });
    expect(await data('users/ben')).toEqual(before['users/ben']);
    expect((await data('users/cat'))!.avatarKey).toBe('image/2026-11/new.webp');
    // Still on the former base: no key until it is moved (rehost-images), and the one it had removed.
    expect('avatarKey' in (await data('users/dan'))!).toBe(false);
    expect(await data('cards/c1')).toEqual({ ...before['cards/c1'], media: { ...before['cards/c1']!.media, key: KEY } });
    expect(await data('cards/c2')).toEqual(before['cards/c2']);
    expect(await data('cards/c3')).toEqual(before['cards/c3']);

    expect(await backfillMediaKeys(db, { apply: true, media, log: quiet })).toMatchObject({ avatarKeys: 0, coverKeys: 0, removed: 0, written: 0 });
  });

  it('refuses to run without a current base', async () => {
    await expect(backfillMediaKeys(db, { apply: false, media: memoryMediaUrls('', []), log: () => {} })).rejects.toThrow(/MEDIA_PUBLIC_BASE/);
  });
});
