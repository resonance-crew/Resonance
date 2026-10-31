import { Timestamp } from 'firebase-admin/firestore';
import { describe, expect, it } from 'vitest';
import { fakeAdminDb } from '../../../../test/fakeAdminDb';
import { getFeed } from './service';

// The latest feed (GET /api/v1/feed, and /api/cards/latest signed out)
// against an in-memory Admin Firestore: which cards it answers, and what it
// reads to decide (apiV1.emulator.test.ts covers the rest).

const at = (ms: number) => Timestamp.fromMillis(ms);

/** A published public card whose stored summary is current (as every server write leaves it). */
const card = (ms: number, title: string, excerpt: string, extra: Record<string, unknown> = {}) => ({
  authorId: 'alice',
  thoughtCore: title,
  story: excerpt,
  tags: [],
  visibility: 'public',
  anonymous: false,
  publishedAt: at(ms),
  updatedAt: at(ms),
  excerpt,
  readMinutes: 1,
  excerptAt: at(ms),
  ...extra,
});

describe('getFeed', () => {
  const docs = () => ({
    'users/alice': { handle: 'alice' },
    'cards/real': card(1, 'A real card', 'with words'),
    // billgeorge's case: a title, nothing written.
    'cards/empty': card(2, 'My First Story', ''),
    'cards/untitled': card(3, '   ', 'words without a title'),
    // Its stored summary is older than its story: judged by the story, read for it.
    'cards/edited-empty': card(4, 'Edited', 'once had words', { story: '', updatedAt: at(40) }),
    'cards/edited-real': card(5, 'Edited too', '', { story: 'words now', updatedAt: at(50) }),
  });

  it('leaves out blank cards — no title, or no words in the story — keeping the page where the query ended it', async () => {
    const { db } = fakeAdminDb(docs());
    const page = await getFeed(db, null, 5);
    expect(page.cards.map((c) => c.id)).toEqual(['edited-real', 'real']);
    // The page token still follows the last document read, so the next page starts after the blanks.
    expect(page.nextPageToken).not.toBeNull();
  });

  it('decides by the stored summary a list already reads: no story read for a card whose summary is current', async () => {
    const { db, reads } = fakeAdminDb(docs());
    await getFeed(db, 'viewer', 5);
    const storyReads = reads.filter((r) => /^cards\/[\w-]+$/.test(r)).sort();
    expect(storyReads).toEqual(['cards/edited-empty', 'cards/edited-real']);
  });
});
