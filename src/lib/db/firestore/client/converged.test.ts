import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// The middleware decouple's Phase 2 on the web: the profile fields, hints,
// bookmarks and the bell go through /api/v1 (a fake server here, on fetch),
// never Firestore — its handle throws if anything asks for it, and the
// modules don't even import its SDK.

vi.mock('./init', () => ({
  getClientDb: () => {
    throw new Error('Firestore is not read or written here any more');
  },
}));
const auth = vi.hoisted(() => ({
  currentUser: { uid: 'me', getIdToken: async () => 'id-token' } as { uid: string; getIdToken: () => Promise<string> } | null,
}));
vi.mock('@/lib/auth/firebase/client', () => ({ getFirebaseClientAuth: () => auth, ensureAppCheck: vi.fn() }));
const poked = vi.hoisted(() => [] as string[]);
vi.mock('./signals', () => ({ pokeSignal: (t: string) => poked.push(t), watchSignal: () => () => {} }));

import { getCurrentUserHandle, updateProfile } from './profile';
import { syncHintCount } from './hints';
import { isBookmarked, toggleBookmark } from './bookmarks';
import { getBell, markNotificationRead } from './notifications';
import { getUserById } from './reads';

type Answer = { status: number; body?: unknown };
let answers: Record<string, Answer> = {};
const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
  const a = answers[url] ?? { status: 204 };
  return new Response(a.body === undefined ? null : JSON.stringify(a.body), { status: a.status });
});
vi.stubGlobal('fetch', fetchMock);
const calls = () => fetchMock.mock.calls.map(([url, init]) => [init?.method ?? 'GET', url, init?.body ? JSON.parse(String(init.body)) : undefined]);

beforeEach(() => {
  fetchMock.mockClear();
  answers = {};
  poked.length = 0;
  auth.currentUser = { uid: 'me', getIdToken: async () => 'id-token' };
});

describe('the profile', () => {
  it('saves the avatar and the translation languages through PATCH /api/v1/me, with the rest, in one call', async () => {
    answers['/api/v1/me'] = { status: 200, body: { id: 'me', handle: 'me' } };
    await updateProfile({ bio: 'hi', avatarUrl: 'https://media.resonance.channel/a.webp', autoTranslateTo: ['en'] });
    expect(calls()).toEqual([['PATCH', '/api/v1/me', { bio: 'hi', avatarUrl: 'https://media.resonance.channel/a.webp', autoTranslateTo: ['en'] }]]);
    expect((fetchMock.mock.calls[0][1]?.headers as Record<string, string>).Authorization).toBe('Bearer id-token');
  });

  it("reads the account's pen name from GET /api/v1/me; none before onboarding (404) or signed out", async () => {
    answers['/api/v1/me'] = { status: 200, body: { id: 'me', handle: '小夜' } };
    await expect(getCurrentUserHandle()).resolves.toBe('小夜');
    answers['/api/v1/me'] = { status: 404, body: { error: { code: 'not_found', message: 'No profile.' } } };
    await expect(getCurrentUserHandle()).resolves.toBeNull();
    auth.currentUser = null;
    fetchMock.mockClear();
    await expect(getCurrentUserHandle()).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("syncs a hint's count as a merge (the server keeps the larger), and swallows a failure", async () => {
    await syncHintCount('swipe', 3);
    expect(calls()).toEqual([['PATCH', '/api/v1/me', { hintsSeen: { swipe: 3 } }]]);
    answers['/api/v1/me'] = { status: 503 };
    await expect(syncHintCount('swipe', 4)).resolves.toBeUndefined();
  });
});

describe('bookmarks', () => {
  it('saves and lets go with PUT / DELETE, flipping what the card read says when not told', async () => {
    await expect(toggleBookmark('walk', true)).resolves.toBe(true);
    await expect(toggleBookmark('walk', false)).resolves.toBe(false);
    answers['/api/v1/cards/walk'] = { status: 200, body: { bookmarked: true } };
    await expect(toggleBookmark('walk')).resolves.toBe(false);
    expect(calls()).toEqual([
      ['PUT', '/api/v1/me/bookmarks/walk', undefined],
      ['DELETE', '/api/v1/me/bookmarks/walk', undefined],
      ['GET', '/api/v1/cards/walk', undefined],
      ['DELETE', '/api/v1/me/bookmarks/walk', undefined],
    ]);
  });

  it("says whether a card is saved from its own read (CardDetail.bookmarked); one the viewer can't read is not", async () => {
    answers['/api/v1/cards/walk'] = { status: 200, body: { bookmarked: true } };
    answers['/api/v1/cards/old'] = { status: 200, body: {} };
    answers['/api/v1/cards/gone'] = { status: 404, body: { error: { code: 'not_found', message: 'No such card.' } } };
    await expect(isBookmarked('walk')).resolves.toBe(true);
    await expect(isBookmarked('old')).resolves.toBe(false);
    await expect(isBookmarked('gone')).resolves.toBe(false);
    auth.currentUser = null;
    await expect(isBookmarked('walk')).resolves.toBe(false);
  });
});

describe('the bell', () => {
  it('reads its rows from GET /api/v1/me/bell, the people they name into the profile cache', async () => {
    answers['/api/v1/me/bell?limit=20'] = {
      status: 200,
      body: {
        items: [
          { id: 'n2', type: 'note', payload: { fromUserId: 'bob', cardId: 'walk', preview: 'hi' }, readAt: null, createdAt: '2026-11-20T03:04:05.123456Z' },
          { id: 'n1', type: 'resonance_tap', payload: { fromUserIds: ['bob'], anonymous: true }, readAt: '2026-11-20T04:00:00.000000Z', createdAt: '2026-11-19T00:00:00.000000Z' },
        ],
        people: [{ id: 'bob', handle: 'bob', initials: 'B', accentColor: 'x', avatarUrl: null, avatarSeed: 's', verified: false, region: null }],
        nextPageToken: null,
      },
    };
    const bell = await getBell(20);
    expect(bell.items.map((n) => [n.id, n.type, n.userId, n.readAt?.toISOString() ?? null, n.createdAt.toISOString()])).toEqual([
      ['n2', 'note', 'me', null, '2026-11-20T03:04:05.123Z'],
      ['n1', 'resonance_tap', 'me', '2026-11-20T04:00:00.000Z', '2026-11-19T00:00:00.000Z'],
    ]);
    expect(bell.items[1].payload).toEqual({ fromUserIds: ['bob'], anonymous: true });
    fetchMock.mockClear();
    await expect(getUserById('bob')).resolves.toMatchObject({ handle: 'bob', avatarSeed: 's' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('marks a row read by id through the server, and pulls the bell again at once', async () => {
    await markNotificationRead('n2');
    expect(calls()).toEqual([['POST', '/api/v1/notifications/read', { ids: ['n2'] }]]);
    expect(poked).toEqual(['bell']);
  });
});

describe('what the converged modules import', () => {
  // After Phase 2 the web's Firestore is the signals listener (./realtime, loaded on demand), Auth and App Check —
  // and, until their lanes land, the writer's modules and the signed-out reads (./reads). These must not come back.
  const converged = ['profile.ts', 'hints.ts', 'bookmarks.ts', 'blocks.ts', 'invites.ts', 'notifications.ts', 'notes.ts', 'messages.ts', 'signals.ts'];
  const firestore = /from '(firebase\/firestore[^']*|\.\/sdk|\.\/init|\.\/realtime)'/;
  it.each(converged)('%s imports no Firestore SDK', (file) => {
    const src = readFileSync(join(__dirname, file), 'utf8');
    expect(src).not.toMatch(firestore);
  });

  it('messages.ts reaches the old Firestore thread only by the re-export the unchanged emulator suite needs', () => {
    const src = readFileSync(join(__dirname, 'messages.ts'), 'utf8');
    expect(src.match(/from '\.\/messagesLegacy'/g)).toHaveLength(1);
    expect(src).toMatch(/^export \{ getOlderMessages, listenThread, markConversationRead, type MessageCursor \} from '\.\/messagesLegacy';$/m);
    // …and nothing in the app imports the legacy names.
    for (const file of ['../../../data/thread.ts', '../../../data/hooks.ts', '../../../../components/sections/MessagesPage/ThreadView.tsx']) {
      expect(readFileSync(join(__dirname, file), 'utf8')).not.toMatch(/\b(listenThread|getOlderMessages|markConversationRead|messagesLegacy)\b/);
    }
  });

  it('the data layer above them listens through the signal channel alone', () => {
    for (const file of ['../../../data/live.ts', '../../../data/thread.ts']) {
      expect(readFileSync(join(__dirname, file), 'utf8')).not.toMatch(/firebase\/firestore|client\/(sdk|init|realtime|listen)'/);
    }
  });
});
