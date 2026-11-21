import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Firebase boundary mocks ------------------------------------------------
// These pure functions wrap a single Firestore `getDoc`. We mock the SDK and
// the db/auth accessors so the tests exercise *our* error handling, not the
// network. Only the named exports the code under test actually calls need real
// behaviour; the rest are inert stubs so the module imports cleanly.
vi.mock('./init', () => ({ getClientDb: vi.fn(() => ({})) }));
// Who is signed in: a viewer reads people through /api/v1 (callApi, mocked below); signed out, through the rules.
const auth = vi.hoisted(() => ({ currentUser: { uid: 'me' } as { uid: string } | null }));
vi.mock('@/lib/auth/firebase/client', () => ({ getFirebaseClientAuth: vi.fn(() => auth) }));
vi.mock('./api', () => ({
  callApi: vi.fn(),
  ApiError: class ApiError extends Error {
    constructor(
      readonly status: number,
      readonly code: string,
      message: string,
    ) {
      super(message);
    }
  },
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
import { ApiError, callApi } from './api';
import {
  forgetCachedUser,
  getCardById,
  getCardsByAuthor,
  getMyDrafts,
  getCurrentUserProfile,
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

/** A v1 Person, as GET /api/v1/users answers one. */
const person = (id: string, handle = `h-${id}`) => ({
  id,
  gone: false,
  author: { id, handle, initials: 'H', accentColor: 'oklch(70% 0.1 40)', avatarUrl: null, avatarSeed: `seed-${id}`, verified: false, region: 'TW' },
  bio: `bio of ${id}`,
  joinedAt: '2026-01-02T03:04:05.000Z',
});
const goneOne = (id: string) => ({ id, gone: true, author: null, bio: null, joinedAt: null });

/** The fake /api/v1: profiles by id (every id but `missing`), and whatever `over` answers by path. */
function api(missing: string[] = [], over: Record<string, unknown> = {}) {
  vi.mocked(callApi).mockImplementation((async (path: string) => {
    if (path in over) {
      const v = over[path];
      if (v instanceof Error) throw v;
      return v;
    }
    const url = new URL(path, 'https://x');
    if (url.pathname === '/api/v1/users') {
      const ids = url.searchParams.get('ids')!.split(',');
      return { users: ids.map((id) => (missing.includes(id) ? goneOne(id) : person(id))) };
    }
    throw new Error(`unexpected ${path}`);
  }) as never);
}
/** The uids each GET /api/v1/users asked for. */
const apiReads = () =>
  vi
    .mocked(callApi)
    .mock.calls.map(([path]) => new URL(path, 'https://x'))
    .filter((u) => u.pathname === '/api/v1/users')
    .map((u) => u.searchParams.get('ids')!.split(','));

describe('isConnected / listMyConnectionUids (GET /api/v1/me/connections)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.currentUser = { uid: 'me' };
    forgetCachedUser();
  });
  const connections = { '/api/v1/me/connections': { connections: [{ userId: 'bob', establishedAt: null, person: person('bob') }] } };

  it("answers from the viewer's connections — one read for everyone asking at once — and never touches Firestore", async () => {
    api([], connections);
    const [withBob, withCarol] = await Promise.all([isConnected('me', 'bob'), isConnected('carol', 'me')]);
    expect([withBob, withCarol]).toEqual([true, false]);
    expect(vi.mocked(callApi).mock.calls.filter(([p]) => p === '/api/v1/me/connections')).toHaveLength(1);
    // The people it named are cached: their face needs no read.
    await expect(getUserById('bob')).resolves.toMatchObject({ handle: 'h-bob', avatarSeed: 'seed-bob' });
    expect(apiReads()).toEqual([]);
    expect(getDoc).not.toHaveBeenCalled();
  });

  it("is not connected for someone else's pair, or signed out, without asking", async () => {
    api([], connections);
    await expect(isConnected('bob', 'carol')).resolves.toBe(false);
    auth.currentUser = null;
    await expect(isConnected('me', 'bob')).resolves.toBe(false);
    expect(callApi).not.toHaveBeenCalled();
  });

  it('lets a failed read fail rather than answer "not connected"', async () => {
    api([], { '/api/v1/me/connections': new Error('offline') });
    await expect(isConnected('me', 'bob')).rejects.toThrow('offline');
  });
});

// --- profiles: one page-wide cache, 30 at a time ------------------------------

/** What Firestore holds under users/*: every uid but the ones listed as missing (the signed-out reads). */
function usersAnswer(missing: string[] = []) {
  vi.mocked(getDoc).mockImplementation((async (ref: { path: string }) => {
    const id = ref.path.replace(/^users\//, '');
    const there = !missing.includes(id);
    return { id, exists: () => there, data: () => (there ? { handle: `h-${id}` } : undefined) };
  }) as never);
}

describe('profiles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getDoc).mockReset();
    auth.currentUser = { uid: 'me' };
    forgetCachedUser();
  });

  it("signed in: reads a list's authors once each, thirty to a GET /api/v1/users, never Firestore", async () => {
    api();
    const ids = Array.from({ length: 35 }, (_, i) => `u${i}`);
    const authors = await getUsersByIds([...ids, 'u0', 'u1']);

    expect(Object.keys(authors)).toHaveLength(35);
    expect(authors.u34).toMatchObject({ handle: 'h-u34', bio: 'bio of u34', avatarSeed: 'seed-u34' });
    expect(authors.u34.joinedAt.toISOString()).toBe('2026-01-02T03:04:05.000Z');
    expect(apiReads().map((chunk) => chunk.length)).toEqual([30, 5]);
    expect(apiReads().flat().sort()).toEqual([...ids].sort());
    expect(getDoc).not.toHaveBeenCalled();
    expect(getDocs).not.toHaveBeenCalled();
  });

  it('signed out: a get each through the rules (profiles are public), never a list query', async () => {
    auth.currentUser = null;
    usersAnswer();
    const authors = await getUsersByIds(['a', 'b']);
    expect(authors.b.handle).toBe('h-b');
    expect(getDoc).toHaveBeenCalledTimes(2);
    expect(getDocs).not.toHaveBeenCalled();
    expect(callApi).not.toHaveBeenCalled();
  });

  it('serves the next list from the cache, reading only the people it has not seen', async () => {
    api();
    await getUsersByIds(['a', 'b']);
    vi.mocked(callApi).mockClear();

    const authors = await getUsersByIds(['a', 'b', 'c']);
    expect(Object.keys(authors).sort()).toEqual(['a', 'b', 'c']);
    expect(apiReads()).toEqual([['c']]);

    // A single profile read (a card page's author) is a cache hit too.
    vi.mocked(callApi).mockClear();
    await expect(getUserById('a')).resolves.toMatchObject({ handle: 'h-a' });
    expect(callApi).not.toHaveBeenCalled();
  });

  it('shares a read already on its way instead of starting another', async () => {
    api();
    const [first, second] = await Promise.all([getUsersByIds(['a', 'b']), getUsersByIds(['b', 'a'])]);
    expect(first.a.handle).toBe('h-a');
    expect(second.b.handle).toBe('h-b');
    expect(callApi).toHaveBeenCalledTimes(1);
  });

  it('remembers who is gone (the server says so, never stale data), and leaves them out', async () => {
    api(['gone']);
    expect(await getUsersByIds(['a', 'gone'])).not.toHaveProperty('gone');
    vi.mocked(callApi).mockClear();
    expect(await getUsersByIds(['gone'])).toEqual({});
    await expect(getUserById('gone')).resolves.toBeNull();
    expect(callApi).not.toHaveBeenCalled();
  });

  it('reads a profile again once it is a few minutes old', async () => {
    api();
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
    await getUsersByIds(['a']);
    now.mockReturnValue(1_000_000 + 6 * 60 * 1000);
    vi.mocked(callApi).mockClear();
    await getUsersByIds(['a']);
    expect(apiReads()).toEqual([['a']]);
    now.mockRestore();
  });

  it("always reads the viewer's own profile fresh (GET /me beside their public face), and forgets a profile its owner just edited", async () => {
    api();
    await getUsersByIds(['me']);
    api([], {
      '/api/v1/me': {
        id: 'me',
        handle: 'renamed',
        initials: 'R',
        accentColor: 'oklch(70% 0.1 40)',
        bio: null,
        avatarUrl: null,
        region: 'TW',
        primaryLocale: 'en',
        handleChangedAt: '2026-10-01T00:00:00.000Z',
        autoTranslateTo: ['zh-TW'],
        hintsSeen: { swipe: 2 },
      },
    });

    const me = await getCurrentUserProfile();
    expect(me).toMatchObject({ handle: 'renamed', primaryLocale: 'en', autoTranslateTo: ['zh-TW'], hintsSeen: { swipe: 2 }, avatarSeed: 'seed-me' });
    expect(me!.handleChangedAt.toISOString()).toBe('2026-10-01T00:00:00.000Z');
    // …and the lists pick up what it read.
    vi.mocked(callApi).mockClear();
    expect((await getUsersByIds(['me'])).me.handle).toBe('renamed');
    expect(callApi).not.toHaveBeenCalled();

    forgetCachedUser('me');
    api();
    await getUsersByIds(['me']);
    expect(apiReads()).toEqual([['me']]);
  });

  it('answers no profile before onboarding (404 from /me)', async () => {
    api([], { '/api/v1/me': new ApiError(404, 'not_found', 'No profile.') });
    await expect(getCurrentUserProfile()).resolves.toBeNull();
  });

  it('lets a failed read fail, and caches nothing from it', async () => {
    vi.mocked(callApi).mockRejectedValueOnce(new Error('offline'));
    await expect(getUsersByIds(['a'])).rejects.toThrow('offline');
    api();
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

  it('ask only for attributed cards: a card\'s resonances, a profile\'s cards', async () => {
    await getResonanceCards('c1');
    await getPublicCardsByAuthor('bob');
    for (const call of [0, 1]) {
      expect(filtersOf(call)).toContainEqual({ field: 'anonymous', op: '==', value: false });
      expect(filtersOf(call)).toContainEqual({ field: 'visibility', op: '==', value: 'public' });
    }
  });
});

describe('getUserByHandle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getDoc).mockReset();
    auth.currentUser = { uid: 'me' };
    forgetCachedUser();
  });

  it('signed in: the profile head from GET /api/v1/users/{handle}, cached for the lists', async () => {
    const nina = person('nina', '小夜');
    api([], { [`/api/v1/users/${encodeURIComponent('小夜')}`]: { ...nina, isSelf: false, isConnected: false, isBlocked: false } });
    await expect(getUserByHandle(' 小夜 ')).resolves.toMatchObject({ id: 'nina', handle: '小夜', bio: 'bio of nina' });
    vi.mocked(callApi).mockClear();
    await expect(getUserById('nina')).resolves.toMatchObject({ handle: '小夜' });
    expect(callApi).not.toHaveBeenCalled();
    expect(getDoc).not.toHaveBeenCalled();
  });

  it('signed in: nobody by that name (404) is no one; a failed read fails', async () => {
    api([], { '/api/v1/users/bob': new ApiError(404, 'not_found', 'No such person.'), '/api/v1/users/eve': new Error('offline') });
    await expect(getUserByHandle('bob')).resolves.toBeNull();
    await expect(getUserByHandle('eve')).rejects.toThrow('offline');
  });

  it("signed out: goes by the pen name's reservation (handles/{name}), then the profile it names", async () => {
    auth.currentUser = null;
    vi.mocked(getDoc).mockImplementation((async (ref: { path: string }) =>
      ref.path === 'handles/小夜'
        ? { exists: () => true, data: () => ({ uid: 'nina', handle: '小夜' }) }
        : { id: 'nina', exists: () => true, data: () => ({ handle: '小夜' }) }) as never);
    await expect(getUserByHandle(' 小夜 ')).resolves.toMatchObject({ id: 'nina', handle: '小夜' });
    expect(vi.mocked(getDoc).mock.calls.map(([ref]) => (ref as unknown as { path: string }).path)).toEqual(['handles/小夜', 'users/nina']);
    expect(getDocs).not.toHaveBeenCalled();
  });

  it('signed out: names no one for a name with no reservation; an offline read fails', async () => {
    auth.currentUser = null;
    vi.mocked(getDoc).mockResolvedValueOnce({ exists: () => false } as never);
    await expect(getUserByHandle('BOB')).resolves.toBeNull();
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
