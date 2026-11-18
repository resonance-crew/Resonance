import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';
import { fakeAdminDb, type FakeAdminDb } from '@/../test/fakeAdminDb';
import type { CardListBody } from '@/lib/api/v1/schemas';

let fake: FakeAdminDb;
vi.mock('@/lib/db/firestore/admin', () => ({ getAdminDb: () => fake.db }));
// The browser's read layer imports cleanly without Firebase (it reaches the server by fetch here).
vi.mock('@/lib/db/firestore/client/init', () => ({ getClientDb: vi.fn(() => ({})) }));
vi.mock('@/lib/auth/firebase/client', () => ({ getFirebaseClientAuth: vi.fn(() => ({ currentUser: null })) }));
vi.mock('firebase/firestore/lite', () => ({
  collection: vi.fn(),
  doc: vi.fn(),
  documentId: vi.fn(),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  limit: vi.fn(),
  orderBy: vi.fn(),
  query: vi.fn(),
  startAfter: vi.fn(),
  where: vi.fn(),
  Timestamp: class {
    static fromDate = vi.fn();
  },
}));

import { GET } from './route';
import { getRelatedCards } from '@/lib/db/firestore/client/reads';

// The related cards under a card, for a reader nobody is signed in as (the
// web's public path, useCardPageLists → useRelated). Round 26 §A1.7: every
// path that picks cards for people outside the author's connections leaves out
// a card its reading keeps from strangers (`cardSignatures.listedForStrangers:
// false`) — and only the server may read the readings, so the signed-out card
// page asks it, as the signed-in page and the apps ask v1's twin.

const at = (minutesAgo: number) => Timestamp.fromMillis(Date.parse('2026-11-19T08:00:00Z') - minutesAgo * 60_000);
const story = (s: string) => `${s} — and the rest of the evening went by slowly, the rain on the window, the kettle on.`;
const named = (authorId: string, tags: string[], minutesAgo: number, extra: Record<string, unknown> = {}) => ({
  authorId,
  thoughtCore: `A card by ${authorId}`,
  story: story(`A card by ${authorId}`),
  tags,
  anonymous: false,
  visibility: 'public',
  publishedAt: at(minutesAgo),
  slug: `by-${authorId}`,
  ...extra,
});
const profile = (handle: string) => ({ handle, handleLower: handle, initials: handle.slice(0, 2), accentColor: 'oklch(90% 0.05 160)', avatarSeed: '7' });

beforeEach(() => {
  fake = fakeAdminDb({
    // The card being read, and recent public cards around it.
    'cards/base': named('bob', ['rain', 'walk'], 60),
    // Shares both tags — but its reading keeps it from strangers (feeling only).
    'cards/kept': named('carol', ['rain', 'walk'], 5),
    'cardSignatures/kept': { authorId: 'carol', listedForStrangers: false, moodOnly: true },
    'cards/near': named('dora', ['rain', 'walk'], 10),
    'cardSignatures/near': { authorId: 'dora', listedForStrangers: true },
    'cards/anon': named('fay', ['rain'], 15, { anonymous: true, slug: 'a-rainy-night-fay' }),
    // Not read yet (no reading): nothing has judged it, so it isn't held back.
    'cards/plain': named('eli', [], 20),
    'cards/secret': named('bob', ['rain'], 30, { visibility: 'private' }),
    'cards/binned': named('bob', ['rain'], 40, { visibility: 'private', trashedAt: at(1), trashedFrom: { visibility: 'public', referenceCardId: null } }),
    'users/bob': profile('bob'),
    'users/carol': profile('carol'),
    'users/dora': profile('dora'),
    'users/eli': profile('eli'),
    'users/fay': profile('fay'),
  });
});

const related = (id: string) => GET(new Request(`http://localhost/api/cards/related?id=${encodeURIComponent(id)}`));
const ids = (body: CardListBody) => body.cards.map((c) => c.id);

describe('GET /api/cards/related', () => {
  it('leaves out a card its reading keeps from strangers, the cards sharing the most tags first', async () => {
    const res = await related('base');
    const body = (await res.json()) as CardListBody;
    expect(ids(body)).toEqual(['near', 'anon', 'plain']);
    expect(fake.reads).toContain('cardSignatures/kept');
    // The same for everyone: the CDN keeps it briefly.
    expect(res.headers.get('cache-control')).toBe('public, max-age=0, s-maxage=60, stale-while-revalidate=300');
  });

  it('names no one on an anonymous card, and never reads its author', async () => {
    const body = (await (await related('base')).json()) as CardListBody;
    const anon = body.cards.find((c) => c.id === 'anon')!;
    expect(anon).toMatchObject({ anonymous: true, author: null, slug: null });
    expect(fake.reads).not.toContain('users/fay');
    expect(body.cards.find((c) => c.id === 'near')!.author).toMatchObject({ id: 'dora', handle: 'dora' });
  });

  it('answers nothing, never kept, under a card no one signed out may read', async () => {
    for (const id of ['secret', 'binned', 'missing', 'a/b', '']) {
      const res = await related(id);
      expect(await res.json(), id).toEqual({ cards: [] });
      expect(res.headers.get('cache-control'), id).toBe('no-store');
    }
  });
});

describe("the signed-out card page's related cards (client reads → the server)", () => {
  const realFetch = globalThis.fetch;
  beforeEach(() => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => GET(new Request(new URL(String(input), 'http://localhost')))) as typeof fetch;
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('asks the server, which leaves out the card kept from strangers', async () => {
    const body = await getRelatedCards('base');
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/cards/related?id=base');
    expect(ids(body)).toEqual(['near', 'anon', 'plain']);
    expect(ids(body)).not.toContain('kept');
  });

  it('fails loudly on a server error (SWR then tries again), never as an empty list', async () => {
    globalThis.fetch = vi.fn(async () => new Response('nope', { status: 500 })) as typeof fetch;
    await expect(getRelatedCards('base')).rejects.toThrow('Related request failed (500)');
  });
});
