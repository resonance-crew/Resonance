import { describe, expect, it } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';
import { fakeAdminDb } from '../../../../test/fakeAdminDb';
import { LIMITS } from '@/lib/api/rateLimit';
import { countCardRead } from './cardReads';

// A card's readCount, counted by the server as its page shows it: once per
// reader, card and UTC day; never its author's reads, nor a card the reader
// couldn't open; an anonymous card whoever the reader blocked; the budget's
// end leaves reads uncounted instead of failing.

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-10-31T10:00:00Z');
const at = Timestamp.fromMillis(NOW - 7 * DAY);

const card = (extra: Record<string, unknown> = {}) => ({
  authorId: 'alice',
  thoughtCore: 'A quiet night',
  story: 'words',
  tags: [],
  visibility: 'public',
  anonymous: false,
  publishedAt: at,
  updatedAt: at,
  readCount: 0,
  ...extra,
});

function setup(cards: Record<string, Record<string, unknown>>, more: Record<string, Record<string, unknown>> = {}) {
  const docs: Record<string, Record<string, unknown>> = { ...more };
  for (const [id, c] of Object.entries(cards)) docs[`cards/${id}`] = c;
  return fakeAdminDb(docs);
}

describe('countCardRead', () => {
  it("counts a reader once a day however often they open the card, and again the next day — never touching updatedAt", async () => {
    const { db, docs } = setup({ c1: card() });

    expect(await countCardRead(db, 'bob', 'c1', NOW)).toBe(true);
    expect(await countCardRead(db, 'bob', 'c1', NOW + 60_000)).toBe(false);
    expect(await countCardRead(db, 'bob', 'c1', NOW + 3 * 60 * 60 * 1000)).toBe(false);
    expect(docs['cards/c1'].readCount).toBe(1);

    expect(await countCardRead(db, 'carol', 'c1', NOW)).toBe(true);
    expect(docs['cards/c1'].readCount).toBe(2);

    expect(await countCardRead(db, 'bob', 'c1', NOW + DAY)).toBe(true);
    expect(docs['cards/c1'].readCount).toBe(3);
    expect(docs['cards/c1'].updatedAt).toBe(at);

    expect(docs['cardReads/bob_c1']).toMatchObject({ userId: 'bob', cardId: 'c1', day: '2026-11-01' });
    // The marker names no author: an anonymous card's reader record says nothing about whose it is.
    expect(Object.keys(docs['cardReads/bob_c1']).sort()).toEqual(['cardId', 'day', 'expireAt', 'userId']);
  });

  it("never counts its author's own reads", async () => {
    const { db, docs } = setup({ c1: card(), anon: card({ anonymous: true }) });
    expect(await countCardRead(db, 'alice', 'c1', NOW)).toBe(false);
    expect(await countCardRead(db, 'alice', 'anon', NOW)).toBe(false);
    expect(docs['cards/c1'].readCount).toBe(0);
    expect(docs['cards/anon'].readCount).toBe(0);
    expect(Object.keys(docs).some((p) => p.startsWith('cardReads/'))).toBe(false);
  });

  it('counts nothing on a card the reader could not open: a draft, a private card, one in the trash, missing', async () => {
    const { db, docs } = setup({
      draft: card({ publishedAt: null }),
      priv: card({ visibility: 'private' }),
      trashed: card({ visibility: 'private', trashedAt: Timestamp.fromMillis(NOW - DAY) }),
    });
    for (const id of ['draft', 'priv', 'trashed', 'gone', '__reserved__']) {
      expect(await countCardRead(db, 'bob', id, NOW)).toBe(false);
    }
    expect([docs['cards/draft'], docs['cards/priv'], docs['cards/trashed']].map((c) => c.readCount)).toEqual([0, 0, 0]);
  });

  it('counts a card for connections only when the two are connected', async () => {
    const { db, docs } = setup({ c1: card({ visibility: 'connections' }) }, { 'connections/alice_bob': { userIds: ['alice', 'bob'] } });
    expect(await countCardRead(db, 'carol', 'c1', NOW)).toBe(false);
    expect(await countCardRead(db, 'bob', 'c1', NOW)).toBe(true);
    expect(docs['cards/c1'].readCount).toBe(1);
  });

  it('a block either way leaves a named card uncounted, an anonymous one counted all the same', async () => {
    const { db, docs } = setup(
      { named: card(), anon: card({ anonymous: true }) },
      { 'users/bob/blocks/alice': { at }, 'users/alice/blocks/carol': { at } },
    );
    expect(await countCardRead(db, 'bob', 'named', NOW)).toBe(false);
    expect(await countCardRead(db, 'carol', 'named', NOW)).toBe(false);
    expect(await countCardRead(db, 'bob', 'anon', NOW)).toBe(true);
    expect(await countCardRead(db, 'carol', 'anon', NOW)).toBe(true);
    expect(docs['cards/named'].readCount).toBe(0);
    expect(docs['cards/anon'].readCount).toBe(2);
  });

  it("spends the reader's read budget only on reads it counts, and past it counts nothing without failing", async () => {
    const { db, docs } = setup(
      { c1: card(), c2: card() },
      { 'rateLimits/bob_read': { userId: 'bob', bucket: 'read', windowStart: NOW - 1000, used: LIMITS.read.max - 1 } },
    );
    expect(await countCardRead(db, 'bob', 'c1', NOW)).toBe(true);
    expect(await countCardRead(db, 'bob', 'c1', NOW)).toBe(false); // counted already: nothing spent
    expect(docs['rateLimits/bob_read'].used).toBe(LIMITS.read.max);
    await expect(countCardRead(db, 'bob', 'c2', NOW)).resolves.toBe(false);
    expect(docs['cards/c2'].readCount).toBe(0);
  });
});
