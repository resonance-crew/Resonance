import { Timestamp } from 'firebase-admin/firestore';
import { describe, expect, it } from 'vitest';
import { fakeAdminDb } from '../../../../test/fakeAdminDb';
import { cardsByKeys, getCardBox, getRecommendedFeed, getRelated } from './reads';

// v1 reads against an in-memory Admin Firestore: which documents a read asks
// for, and in what order (apiV1Reads.emulator.test.ts covers what they answer).

const at = (ms: number) => Timestamp.fromMillis(ms);

/** A read kept pending until `release()`, to see what else was asked meanwhile. */
function holding(matches: (read: string) => boolean) {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  return { hold: (r: string) => (matches(r) ? gate : undefined), release };
}

describe('cardsByKeys (GET /cards?keys=)', () => {
  const docs = () => ({
    'cards/Zx81kQ': { authorId: 'alice', thoughtCore: 'by id', story: 'long story', publishedAt: at(1) },
    'cards/Yw72jP': { authorId: 'alice', thoughtCore: 'named by its slug too', story: 's', publishedAt: at(1) },
    // An older client's slug that is another card's id: the slug names its holder.
    'cards/holder': { authorId: 'bob', thoughtCore: 'holder', story: 's', slug: 'Yw72jP', publishedAt: at(2) },
    'cards/sluggy': { authorId: 'carol', thoughtCore: 'by slug', story: 's', slug: 'a-quiet-night', publishedAt: at(3) },
    'cards/plain-id': { authorId: 'carol', thoughtCore: 'slug-shaped id', story: 's', publishedAt: at(4) },
  });

  it("reads the keys that can't be slugs by id beside the slug query", async () => {
    const gate = holding((r) => r.startsWith('cards?slug in'));
    const { db, reads } = fakeAdminDb(docs(), gate);
    const cards = cardsByKeys(db, ['Zx81kQ', 'a-quiet-night', 'plain-id']);
    await Promise.resolve();
    // The id-shaped key is asked for while the slug query is still out; the slug-shaped ones wait for it.
    expect(reads).toEqual(['cards?slug in Zx81kQ,a-quiet-night,plain-id', 'cards/Zx81kQ']);
    gate.release();
    expect((await cards).map((c) => c.id)).toEqual(['Zx81kQ', 'sluggy', 'plain-id']);
    expect(reads).toEqual(['cards?slug in Zx81kQ,a-quiet-night,plain-id', 'cards/Zx81kQ', 'cards/plain-id']);
  });

  it('answers a slug’s holder before the card whose id the key is, each card once, in key order', async () => {
    const { db } = fakeAdminDb(docs());
    const cards = await cardsByKeys(db, ['a-quiet-night', 'Yw72jP', 'holder', 'Zx81kQ', 'missing', 'Missing', '__x__', 'sluggy']);
    expect(cards.map((c) => c.id)).toEqual(['sluggy', 'holder', 'Zx81kQ']);
    // Read for a list: never the story.
    expect(cards.every((c) => c.story === undefined)).toBe(true);
  });
});

describe('the draft shelf (GET /me/cards?tab=draft)', () => {
  const drafts = () => {
    const docs: Record<string, Record<string, unknown>> = { 'users/alice': { handle: 'alice' } };
    for (let i = 0; i < 45; i++) {
      docs[`cards/d${i}`] = { authorId: 'alice', thoughtCore: `draft ${i}`, story: `story of draft ${i}`, tags: [], visibility: 'public', publishedAt: null, updatedAt: at(1_000 + i) };
    }
    // In the trash: on the trash shelf alone.
    docs['cards/d44'].trashedAt = at(5_000);
    // A summary stored beside a story that says something else: a draft shows its story as it is.
    Object.assign(docs['cards/d43'], { excerpt: 'stored long ago', readMinutes: 9, excerptAt: at(1_043) });
    return docs;
  };

  it('scans the drafts without their stories and reads only the shown ones’, the most recently edited first', async () => {
    const { db, reads } = fakeAdminDb(drafts());
    const { cards } = await getCardBox(db, 'alice', 'draft');
    expect(cards.map((c) => c.id)).toEqual(Array.from({ length: 40 }, (_, i) => `d${43 - i}`));
    expect(cards[0].excerpt).toBe('story of draft 43');
    expect(cards[0].readMinutes).toBe(1);
    expect(cards[39].excerpt).toBe('story of draft 4');
    // One story read per draft shown — none for the five left out (four too old, one in the trash).
    const storyReads = reads.filter((r) => /^cards\/d\d+$/.test(r));
    expect(storyReads.sort()).toEqual(cards.map((c) => `cards/${c.id}`).sort());
  });
});

describe('blank cards in the recommended feed and related cards', () => {
  const card = (ms: number, title: string, story: string) => ({
    authorId: 'bob',
    thoughtCore: title,
    story,
    tags: ['日常'],
    visibility: 'public',
    anonymous: false,
    publishedAt: at(ms),
    updatedAt: at(ms),
    excerpt: story,
    readMinutes: 1,
    excerptAt: at(ms),
  });
  const docs = () => ({
    'users/bob': { handle: 'bob' },
    'cards/base': card(1, 'The card being read', 'its story'),
    'cards/r1': card(2, 'Real one', 'words'),
    'cards/empty': card(3, 'My First Story', ''),
    'cards/untitled': card(4, '', 'words without a title'),
    'cards/r2': card(5, 'Real two', 'more words'),
    'cards/r3': card(6, 'Real three', 'and more'),
  });
  const item = (cardId: string) => ({ cardId, channel: 'insight' as const, reason: `because ${cardId}`, score: 1 });

  it('never recommends a blank card — not even one picked before its vectors went', async () => {
    const { db } = fakeAdminDb(docs());
    const load = async () => ({ items: ['empty', 'r1', 'untitled', 'r2'].map(item), status: 'fresh' as const });
    const { cards } = await getRecommendedFeed(db, 'alice', load);
    expect(cards.map((c) => [c.id, c.reason])).toEqual([
      ['r1', 'because r1'],
      ['r2', 'because r2'],
    ]);
  });

  it('fills the related cards from past the blank ones', async () => {
    const { db } = fakeAdminDb(docs());
    const { cards } = await getRelated(db, 'alice', 'base');
    expect(cards.map((c) => c.id)).toEqual(['r3', 'r2', 'r1']);
  });
});
