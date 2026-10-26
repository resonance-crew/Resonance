import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Firebase boundary mocks ------------------------------------------------
// These pure functions wrap a single Firestore `getDoc`. We mock the SDK and
// the db/auth accessors so the tests exercise *our* error handling, not the
// network. Only the named exports the code under test actually calls need real
// behaviour; the rest are inert stubs so the module imports cleanly.
vi.mock('./init', () => ({ getClientDb: vi.fn(() => ({})) }));
vi.mock('@/lib/auth/firebase/client', () => ({
  getFirebaseClientAuth: vi.fn(() => ({ currentUser: { uid: 'me' } })),
}));
vi.mock('firebase/firestore/lite', () => ({
  collection: vi.fn((_db: unknown, name: string) => name),
  doc: vi.fn((_db: unknown, ...path: string[]) => ({ path: path.join('/') })),
  documentId: vi.fn(() => '__name__'),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  limit: vi.fn((n: number) => ({ limit: n })),
  orderBy: vi.fn(),
  // A query is its collection plus its filters, so tests can see what was asked.
  query: vi.fn((collection: string, ...filters: unknown[]) => ({ collection, filters })),
  startAfter: vi.fn(),
  where: vi.fn((field: string, op: string, value: unknown) => ({ field, op, value })),
  // A class, so the mapper's `instanceof Timestamp` checks run.
  Timestamp: class {
    static fromDate = vi.fn();
  },
}));

import { getDoc, getDocs, Timestamp } from 'firebase/firestore/lite';
import {
  forgetCachedUser,
  getCardById,
  getCardsByAuthor,
  getMyDrafts,
  getCurrentUserProfile,
  getLatestPublishedFeed,
  getPublicCardsByAuthor,
  getResonanceCards,
  getUserByHandle,
  getUserById,
  getUsersByIds,
  isConnected,
} from './reads';

// What the SDK rejects with: a FirestoreError carries its `code`.
const denied = () => Object.assign(new Error('Missing or insufficient permissions'), { code: 'permission-denied' });
const offline = () =>
  Object.assign(new Error('Failed to get document because the client is offline.'), { code: 'unavailable' });

describe('getCardById', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reads a card the rules refuse this viewer as no card', async () => {
    vi.mocked(getDoc).mockRejectedValue(denied());
    await expect(getCardById('c1')).resolves.toBeNull();
  });

  // A network hiccup says nothing about the card: as null it showed "this card
  // doesn't exist", and SWR kept that answer instead of trying again.
  it('lets a read that failed for any other reason fail', async () => {
    vi.mocked(getDoc).mockRejectedValue(offline());
    await expect(getCardById('c1')).rejects.toThrow('offline');
  });
});

describe('isConnected', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns true when the connection doc exists', async () => {
    vi.mocked(getDoc).mockResolvedValue({ exists: () => true } as never);
    await expect(isConnected('a', 'b')).resolves.toBe(true);
  });

  it('returns false when the connection doc is absent', async () => {
    vi.mocked(getDoc).mockResolvedValue({ exists: () => false } as never);
    await expect(isConnected('a', 'b')).resolves.toBe(false);
  });

  // Regression: the connections read rule references `resource.data.userIds`, so
  // a `get` on a doc that doesn't exist (the common "not connected" case) is
  // *denied* rather than returning an empty snapshot. The function must swallow
  // that and report "not connected" — otherwise the whole profile fetch throws
  // and the page falls through to its not-found state.
  it('swallows a permission-denied error and reports not connected', async () => {
    vi.mocked(getDoc).mockRejectedValue(denied());
    await expect(isConnected('a', 'b')).resolves.toBe(false);
  });

  it('lets an offline read fail rather than answer "not connected"', async () => {
    vi.mocked(getDoc).mockRejectedValue(offline());
    await expect(isConnected('a', 'b')).rejects.toThrow('offline');
  });
});

// --- profiles: one page-wide cache, a get each ------------------------------

/** What Firestore holds under users/*: every uid but the ones listed as missing. */
function usersAnswer(missing: string[] = []) {
  vi.mocked(getDoc).mockImplementation((async (ref: { path: string }) => {
    const id = ref.path.replace(/^users\//, '');
    const there = !missing.includes(id);
    return { id, exists: () => there, data: () => (there ? { handle: `h-${id}` } : undefined) };
  }) as never);
}
/** The uids read, in order. */
const profileReads = () =>
  vi.mocked(getDoc).mock.calls.map(([ref]) => {
    const path = (ref as unknown as { path: string }).path;
    expect(path).toMatch(/^users\//);
    return path.replace(/^users\//, '');
  });

describe('profiles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getDoc).mockReset();
    forgetCachedUser();
  });

  it("reads a list's authors once each, a get per profile, never a list query", async () => {
    usersAnswer();
    const ids = Array.from({ length: 35 }, (_, i) => `u${i}`);
    const authors = await getUsersByIds([...ids, 'u0', 'u1']);

    expect(Object.keys(authors)).toHaveLength(35);
    expect(authors.u34.handle).toBe('h-u34');
    // The rules list no profiles: a list query, however small its pages, walks the whole directory.
    expect(getDocs).not.toHaveBeenCalled();
    expect(profileReads().sort()).toEqual([...ids].sort());
  });

  it('serves the next list from the cache, reading only the people it has not seen', async () => {
    usersAnswer();
    await getUsersByIds(['a', 'b']);
    vi.mocked(getDoc).mockClear();

    const authors = await getUsersByIds(['a', 'b', 'c']);
    expect(Object.keys(authors).sort()).toEqual(['a', 'b', 'c']);
    expect(profileReads()).toEqual(['c']);

    // A single profile read (a card page's author) is a cache hit too.
    vi.mocked(getDoc).mockClear();
    await expect(getUserById('a')).resolves.toMatchObject({ handle: 'h-a' });
    expect(getDoc).not.toHaveBeenCalled();
  });

  it('shares a read already on its way instead of starting another', async () => {
    usersAnswer();
    const [first, second] = await Promise.all([getUsersByIds(['a', 'b']), getUsersByIds(['b', 'a'])]);
    expect(first.a.handle).toBe('h-a');
    expect(second.b.handle).toBe('h-b');
    expect(getDoc).toHaveBeenCalledTimes(2);
  });

  it('remembers who is missing, and leaves them out', async () => {
    usersAnswer(['gone']);
    expect(await getUsersByIds(['a', 'gone'])).not.toHaveProperty('gone');
    vi.mocked(getDoc).mockClear();
    expect(await getUsersByIds(['gone'])).toEqual({});
    expect(getDoc).not.toHaveBeenCalled();
  });

  it('reads a profile again once it is a few minutes old', async () => {
    usersAnswer();
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
    await getUsersByIds(['a']);
    now.mockReturnValue(1_000_000 + 6 * 60 * 1000);
    vi.mocked(getDoc).mockClear();
    await getUsersByIds(['a']);
    expect(profileReads()).toEqual(['a']);
    now.mockRestore();
  });

  it("always reads the viewer's own profile fresh, and forgets a profile its owner just edited", async () => {
    usersAnswer();
    await getUsersByIds(['me']);
    vi.mocked(getDoc).mockResolvedValue({ id: 'me', exists: () => true, data: () => ({ handle: 'renamed' }) } as never);

    await expect(getCurrentUserProfile()).resolves.toMatchObject({ handle: 'renamed' });
    // …and the lists pick up what it read.
    vi.mocked(getDoc).mockClear();
    expect((await getUsersByIds(['me'])).me.handle).toBe('renamed');
    expect(getDoc).not.toHaveBeenCalled();

    forgetCachedUser('me');
    usersAnswer();
    await getUsersByIds(['me']);
    expect(profileReads()).toEqual(['me']);
  });

  it('lets a failed read fail, and caches nothing from it', async () => {
    vi.mocked(getDoc).mockRejectedValueOnce(new Error('offline'));
    await expect(getUsersByIds(['a'])).rejects.toThrow('offline');
    usersAnswer();
    expect((await getUsersByIds(['a'])).a.handle).toBe('h-a');
  });
});

// An anonymous card's document names its author, so the rules list only
// public cards that name theirs: every public list must ask for exactly that
// (the server hands anonymous ones out, without their author).
describe('public card lists', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getDocs).mockResolvedValue({ docs: [] } as never);
  });
  const filtersOf = (call: number) => (vi.mocked(getDocs).mock.calls[call][0] as unknown as { filters: unknown[] }).filters;

  it('ask only for attributed cards: the latest feed, a card\'s resonances, a profile\'s cards', async () => {
    await getLatestPublishedFeed(12);
    await getResonanceCards('c1');
    await getPublicCardsByAuthor('bob');
    for (const call of [0, 1, 2]) {
      expect(filtersOf(call)).toContainEqual({ field: 'anonymous', op: '==', value: false });
      expect(filtersOf(call)).toContainEqual({ field: 'visibility', op: '==', value: 'public' });
    }
  });
});

describe('getUserByHandle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    forgetCachedUser();
  });

  it("goes by the pen name's reservation (handles/{name}), then the profile it names", async () => {
    vi.mocked(getDoc).mockImplementation((async (ref: { path: string }) =>
      ref.path === 'handles/小夜'
        ? { exists: () => true, data: () => ({ uid: 'nina', handle: '小夜' }) }
        : { id: 'nina', exists: () => true, data: () => ({ handle: '小夜' }) }) as never);
    await expect(getUserByHandle(' 小夜 ')).resolves.toMatchObject({ id: 'nina', handle: '小夜' });
    expect(vi.mocked(getDoc).mock.calls.map(([ref]) => (ref as unknown as { path: string }).path)).toEqual(['handles/小夜', 'users/nina']);
    expect(getDocs).not.toHaveBeenCalled();
  });

  it('names no one for a name with no reservation, and never lists the profiles', async () => {
    vi.mocked(getDoc).mockResolvedValue({ exists: () => false } as never);
    await expect(getUserByHandle('BOB')).resolves.toBeNull();
    expect(getDocs).not.toHaveBeenCalled();
  });

  it('lets an offline read fail rather than answer "no such person"', async () => {
    vi.mocked(getDoc).mockRejectedValue(offline());
    await expect(getUserByHandle('bob')).rejects.toThrow('offline');
  });
});

describe('getCardsByAuthor: the card box shelves read through the rules', () => {
  beforeEach(() => vi.clearAllMocks());
  const published = new Date('2026-09-01T08:00:00Z');
  const doc = (id: string, data: Record<string, unknown>) => ({ id, data: () => ({ authorId: 'me', thoughtCore: id, story: '', ...data }) });
  const trashed = { trashedAt: new Date('2026-10-01T08:00:00Z'), trashedFrom: { visibility: 'public', referenceCardId: null } };

  // A card in the trash is private while there, and its query is the private shelf's own: read past it.
  it('leaves cards in the trash off the private shelf before it is cut to forty, however many newer ones there are', async () => {
    const docs = [
      ...Array.from({ length: 45 }, (_, i) => doc(`t${i}`, { visibility: 'private', publishedAt: published, ...trashed })),
      doc('kept', { visibility: 'private', publishedAt: published }),
    ];
    vi.mocked(getDocs).mockResolvedValue({ docs } as never);
    const cards = await getCardsByAuthor('me', 'private');
    expect(cards.map((c) => c.id)).toEqual(['kept']);
    const asked = vi.mocked(getDocs).mock.calls[0][0] as unknown as { filters: unknown[] };
    expect(asked.filters).toContainEqual({ limit: 80 });
  });

  it('leaves them off the drafts before the newest forty are taken', async () => {
    const docs = [
      ...Array.from({ length: 45 }, (_, i) => doc(`t${i}`, { visibility: 'private', publishedAt: null, ...trashed })),
      doc('draft', { visibility: 'public', publishedAt: null }),
    ];
    vi.mocked(getDocs).mockResolvedValue({ docs } as never);
    expect((await getCardsByAuthor('me', 'draft')).map((c) => c.id)).toEqual(['draft']);
  });

  it('still shows forty of the cards not in the trash', async () => {
    const docs = Array.from({ length: 60 }, (_, i) => doc(`p${i}`, { visibility: 'private', publishedAt: published }));
    vi.mocked(getDocs).mockResolvedValue({ docs } as never);
    expect(await getCardsByAuthor('me', 'private')).toHaveLength(40);
  });
});

describe('getMyDrafts: the 草稿 shelf — drafts and the cards kept private, together', () => {
  beforeEach(() => vi.clearAllMocks());
  const published = new Date('2026-09-01T08:00:00Z');
  const stamp = (iso: string) =>
    Object.assign(new (Timestamp as unknown as new () => object)(), { toMillis: () => Date.parse(iso), toDate: () => new Date(iso) });
  const doc = (id: string, data: Record<string, unknown>) => ({ id, data: () => ({ authorId: 'me', thoughtCore: id, story: '', ...data }) });
  const trashed = { trashedAt: new Date('2026-10-01T08:00:00Z'), trashedFrom: { visibility: 'public', referenceCardId: null } };

  it('reads the draft and private shelves’ own queries and lists their cards as one, the most recently changed first', async () => {
    const privateDraft = doc('draft-kept-private', { publishedAt: null, visibility: 'private', updatedAt: stamp('2026-10-20T00:00:00Z') });
    vi.mocked(getDocs)
      .mockResolvedValueOnce({
        docs: [doc('draft-old', { publishedAt: null, visibility: 'public', updatedAt: stamp('2026-10-01T00:00:00Z') }), privateDraft],
      } as never)
      .mockResolvedValueOnce({
        docs: [
          doc('trashed', { publishedAt: published, visibility: 'private', updatedAt: stamp('2026-10-30T00:00:00Z'), ...trashed }),
          doc('kept-private', { publishedAt: published, visibility: 'private', updatedAt: stamp('2026-10-10T00:00:00Z') }),
          // A private draft answers both queries: listed once.
          privateDraft,
        ],
      } as never);
    expect((await getMyDrafts('me')).map((c) => c.id)).toEqual(['draft-kept-private', 'kept-private', 'draft-old']);
    const asked = vi.mocked(getDocs).mock.calls.map(([q]) => (q as unknown as { filters: unknown[] }).filters);
    expect(asked[0]).toContainEqual({ field: 'publishedAt', op: '==', value: null });
    expect(asked[1]).toContainEqual({ field: 'visibility', op: 'in', value: ['private'] });
  });

  it('keeps the newest forty', async () => {
    const drafts = Array.from({ length: 30 }, (_, i) => doc(`d${i}`, { publishedAt: null, updatedAt: stamp(`2026-10-${String(i + 1).padStart(2, '0')}T00:00:00Z`) }));
    const kept = Array.from({ length: 30 }, (_, i) => doc(`p${i}`, { publishedAt: published, visibility: 'private', updatedAt: stamp(`2026-09-${String(i + 1).padStart(2, '0')}T00:00:00Z`) }));
    vi.mocked(getDocs).mockResolvedValueOnce({ docs: drafts } as never).mockResolvedValueOnce({ docs: kept } as never);
    const cards = await getMyDrafts('me');
    expect(cards).toHaveLength(40);
    expect(cards[0].id).toBe('d29');
    expect(cards.at(-1)!.id).toBe('p20');
  });
});
