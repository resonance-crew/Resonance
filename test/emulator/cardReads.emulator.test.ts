import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { countCardRead } from '@/lib/api/v1/cardReads';

// A card's readCount against the Firestore emulator (lib/api/v1/cardReads):
// the increment and the day's marker in one transaction, once per reader,
// card and UTC day — racing tabs too —, never its author's, never updatedAt;
// an anonymous card counted alike with and without a block either way, a
// named one not across one.

const PROJECT = 'demo-resonance-card-reads';
let app: App;
let db: Firestore;

beforeAll(() => {
  process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
  app = initializeApp({ projectId: PROJECT }, 'card-reads-test');
  db = getFirestore(app);
});

afterAll(async () => {
  await deleteApp(app);
});

beforeEach(async () => {
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, {
    method: 'DELETE',
  });
});

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 31, 10);
const at = Timestamp.fromMillis(NOW - 7 * DAY);
const card = (id: string, extra: Record<string, unknown> = {}) =>
  db.doc(`cards/${id}`).set({
    authorId: 'alice', thoughtCore: 't', story: 's', tags: [], visibility: 'public', anonymous: false,
    publishedAt: at, updatedAt: at, readCount: 0, resonanceCount: 0, inviteCount: 0, ...extra,
  });
const readCount = async (id: string) => (await db.doc(`cards/${id}`).get()).get('readCount');

describe('countCardRead', () => {
  it('counts each reader once a day — two tabs at once too — and again the next day, leaving updatedAt be', async () => {
    await card('c1');
    const both = await Promise.all([countCardRead(db, 'bob', 'c1', NOW), countCardRead(db, 'bob', 'c1', NOW + 1)]);
    expect(both.filter(Boolean)).toHaveLength(1);
    expect(await countCardRead(db, 'bob', 'c1', NOW + 60_000)).toBe(false);
    expect(await countCardRead(db, 'carol', 'c1', NOW)).toBe(true);
    expect(await countCardRead(db, 'bob', 'c1', NOW + DAY)).toBe(true);
    expect(await readCount('c1')).toBe(3);
    expect((await db.doc('cards/c1').get()).get('updatedAt').toMillis()).toBe(at.toMillis());
    expect((await db.doc('cardReads/bob_c1').get()).data()).toMatchObject({ userId: 'bob', cardId: 'c1', day: '2026-11-01' });
  });

  it("never counts its author, a draft, a private card, one in the trash, or a connections card to a stranger", async () => {
    await Promise.all([
      card('mine'),
      card('draft', { publishedAt: null }),
      card('priv', { visibility: 'private' }),
      card('trashed', { visibility: 'private', trashedAt: Timestamp.fromMillis(NOW - DAY) }),
      card('conn', { visibility: 'connections' }),
    ]);
    expect(await countCardRead(db, 'alice', 'mine', NOW)).toBe(false);
    for (const id of ['draft', 'priv', 'trashed', 'conn', 'missing']) expect(await countCardRead(db, 'bob', id, NOW)).toBe(false);
    await db.doc('connections/alice_bob').set({ userIds: ['alice', 'bob'] });
    expect(await countCardRead(db, 'bob', 'conn', NOW)).toBe(true);
    expect(await Promise.all(['mine', 'draft', 'priv', 'trashed', 'conn'].map(readCount))).toEqual([0, 0, 0, 0, 1]);
  });

  for (const block of [null, 'users/bob/blocks/alice', 'users/alice/blocks/bob']) {
    it(`counts an anonymous card ${block ? `across a block (${block})` : 'without a block'}, a named one only without`, async () => {
      await Promise.all([card('anon', { anonymous: true }), card('named')]);
      if (block) await db.doc(block).set({ createdAt: at });
      expect(await countCardRead(db, 'bob', 'anon', NOW)).toBe(true);
      expect(await countCardRead(db, 'bob', 'named', NOW)).toBe(!block);
      expect(await readCount('anon')).toBe(1);
    });
  }
});
