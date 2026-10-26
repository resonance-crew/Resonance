import { Timestamp } from 'firebase-admin/firestore';
import { describe, expect, it } from 'vitest';
import { fakeAdminDb } from '../../../../test/fakeAdminDb';
import { latestForLanding } from './landing';

// The landing page's server read (src/app/[locale]/page.tsx): what goes into
// its cached, public HTML, and how few reads that takes.

const at = (ms: number) => Timestamp.fromMillis(ms);
const card = (authorId: string, ms: number, extra: Record<string, unknown> = {}) => ({
  authorId,
  thoughtCore: `title ${ms}`,
  story: `the story of ${ms}`,
  tags: ['日常'],
  visibility: 'public',
  anonymous: false,
  publishedAt: at(ms),
  updatedAt: at(ms),
  resonanceCount: 2,
  // The recommender's and the server's own: none of it is a card surface's.
  signature: { coreInsight: 'distilled', insightScore: 0.9 },
  indexedAt: at(ms),
  linkPreviewsFor: ['https://example.com'],
  excerpt: 'stored excerpt',
  ...extra,
});

describe('latestForLanding', () => {
  const docs = () => ({
    'cards/c1': card('alice', 1),
    'cards/c2': card('bob', 2, { linkPreviews: [{ url: 'https://example.com', title: 'Example' }] }),
    'cards/c3': card('alice', 3),
    'cards/masked': card('carol', 4, { anonymous: true }),
    'cards/private': card('alice', 5, { visibility: 'private' }),
    'cards/draft': card('alice', 6, { publishedAt: null }),
    'users/alice': { handle: 'alice', initials: 'A', accentColor: 'x', avatarSeed: '1', primaryLocale: 'zh-TW', verified: false, bio: 'a long bio', region: 'Taipei' },
    'users/bob': { handle: 'bob', initials: 'B', accentColor: 'y', avatarSeed: '2', primaryLocale: 'en', verified: true },
    'users/carol': { handle: 'carol', initials: 'C', accentColor: 'z' },
  });

  it('brings the newest public cards with their stories, and nothing a card surface does not draw', async () => {
    const { db } = fakeAdminDb(docs());
    const { cards } = await latestForLanding(db, 6);
    expect(cards.map((c) => c.id)).toEqual(['masked', 'c3', 'c2', 'c1']);
    expect(cards[1]).toMatchObject({ thoughtCore: 'title 3', story: 'the story of 3', tags: ['日常'], resonanceCount: 2 });
    expect(cards[2].linkPreviews).toEqual([{ url: 'https://example.com', title: 'Example' }]);
    for (const c of cards) {
      for (const field of ['signature', 'indexedAt', 'linkPreviewsFor', 'excerpt', 'updatedAt']) expect(c, field).not.toHaveProperty(field);
    }
  });

  it("names no author of an anonymous card, and reads each other author's byline once, in one batch", async () => {
    const { db, reads } = fakeAdminDb(docs());
    const { cards, authors } = await latestForLanding(db, 6);
    expect(cards[0].authorId).toBe('');
    expect(Object.keys(authors).sort()).toEqual(['alice', 'bob']);
    expect(authors.alice).toMatchObject({ id: 'alice', handle: 'alice', initials: 'A', primaryLocale: 'zh-TW', region: '' });
    expect(authors.alice).not.toHaveProperty('bio');
    expect(reads.filter((r) => r.startsWith('users/')).sort()).toEqual(['users/alice', 'users/bob']);
  });
});
