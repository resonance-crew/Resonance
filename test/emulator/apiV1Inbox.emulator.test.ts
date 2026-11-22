import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, Timestamp, type Firestore } from 'firebase-admin/firestore';

// Phase 2 inbox (2a-inbox) through the real route handlers against the
// Firestore emulator: the conversation list, one conversation, a thread's
// messages (paged both ways at the microsecond, `after` for what came since),
// the read marks and the bell — each answering a participant (a recipient)
// exactly what their own listener read, everyone else the same 404, blocked
// people's threads as before (the client filters by its blocks), and every
// read an ETag that turns a repeat into an empty 304.

const mocks = vi.hoisted(() => ({ db: null as unknown, viewer: 'alice' }));
vi.mock('@/lib/auth', () => ({ getCurrentUser: async () => ({ id: mocks.viewer }) }));
vi.mock('@/lib/db/firestore/admin', () => ({ getAdminDb: () => mocks.db }));
vi.mock('next/server', async (orig) => ({ ...(await orig<typeof import('next/server')>()), after: () => {} }));

const listRoute = await import('@/app/api/v1/conversations/route');
const oneRoute = await import('@/app/api/v1/conversations/[pair]/route');
const messagesRoute = await import('@/app/api/v1/conversations/[pair]/messages/route');
const readRoute = await import('@/app/api/v1/conversations/[pair]/read/route');
const bellRoute = await import('@/app/api/v1/me/bell/route');
const bellReadRoute = await import('@/app/api/v1/notifications/read/route');
const { sendMessage, sendNote } = await import('@/lib/api/v1/conversations');
const { setReaction, unsendMessage } = await import('@/lib/api/v1/messageActions');
const { firestoreRealtime } = await import('@/server/infra/firestore/realtime');
const { consoleLogger } = await import('@/server/infra/system/log');

/**
 * The touch a write's after-response work makes (after() is mocked away in
 * this suite): the lists answer 304 before reading while the viewer's
 * counter stands (lib/api/v1/signalTag), so a change only shows once its
 * touch has landed, as in production.
 */
const touched = (uid: string, topics: ('inbox' | 'bell')[]) => firestoreRealtime(db, consoleLogger).touch(uid, topics);

const PROJECT = 'demo-resonance-api-inbox';
const PAIR = 'alice_bob';
let app: App;
let db: Firestore;

beforeAll(() => {
  process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
  app = initializeApp({ projectId: PROJECT }, 'api-v1-inbox-test');
  db = getFirestore(app);
  mocks.db = db;
});

afterAll(async () => {
  await deleteApp(app);
});

beforeEach(async () => {
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
  mocks.viewer = 'alice';
  await Promise.all([
    ...['alice', 'bob', 'carol'].map((id) =>
      db.doc(`users/${id}`).set({ handle: id, handleLower: id, initials: id.slice(0, 2).toUpperCase(), accentColor: 'oklch(90% 0.05 60)' }),
    ),
    db.doc(`connections/${PAIR}`).set({ userIds: ['alice', 'bob'], establishedAt: Timestamp.now() }),
    db.doc('cards/walk').set({
      authorId: 'bob', thoughtCore: 'A walk', story: 's', visibility: 'public', anonymous: false,
      publishedAt: Timestamp.fromDate(new Date('2026-09-01T08:00:00Z')),
    }),
  ]);
});

type Hdrs = Record<string, string>;
const as = (uid: string) => {
  mocks.viewer = uid;
};
const req = (path: string, init: RequestInit = {}) => new Request(`http://localhost${path}`, init);
const params = <K extends string>(p: Record<K, string>) => ({ params: Promise.resolve(p) });
const list = (q = '', headers: Hdrs = {}) => listRoute.GET(req(`/api/v1/conversations${q}`, { headers }));
const one = (pair: string, headers: Hdrs = {}) => oneRoute.GET(req(`/api/v1/conversations/${pair}`, { headers }), params({ pair }));
const messages = (pair: string, q = '', headers: Hdrs = {}) =>
  messagesRoute.GET(req(`/api/v1/conversations/${pair}/messages${q}`, { headers }), params({ pair }));
const markRead = (pair: string) => readRoute.POST(req(`/api/v1/conversations/${pair}/read`, { method: 'POST' }), params({ pair }));
const bell = (q = '', headers: Hdrs = {}) => bellRoute.GET(req(`/api/v1/me/bell${q}`, { headers }));
const bellRead = (body: unknown) =>
  bellReadRoute.POST(req('/api/v1/notifications/read', { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }));
const json = async (res: Response) => {
  expect(res.status).toBe(200);
  return res.json();
};
/** A message stored with this exact send time (seconds, nanoseconds). */
const seed = (id: string, text: string, seconds: number, nanos: number, senderId = 'alice') =>
  db.doc(`conversations/${PAIR}/messages/${id}`).set({ senderId, text, sentAt: new Timestamp(seconds, nanos) });

describe('GET /conversations', () => {
  it('lists the viewer’s conversations newest first, with their unread count, the preview and the other person', async () => {
    await sendNote(db, 'carol', { cardId: 'walk', text: 'a letter for bob' });
    await sendMessage(db, 'alice', { to: 'bob', text: 'hi bob' });
    as('bob');
    const body = await json(await list());
    expect(body.nextPageToken).toBeNull();
    expect(body.conversations.map((c: { id: string }) => c.id)).toEqual([PAIR, 'bob_carol']);
    const [ab, bc] = body.conversations;
    expect(ab).toMatchObject({
      participants: ['alice', 'bob'],
      otherId: 'alice',
      other: { id: 'alice', handle: 'alice', initials: 'AL' },
      unread: 1,
      lastMessage: { text: 'hi bob', senderId: 'alice', image: false, sticker: false, albumCount: null, unsent: false },
      request: null,
    });
    expect(ab.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/);
    // The letter carol left waits for bob's answer.
    expect(bc).toMatchObject({ otherId: 'carol', unread: 1, request: { from: 'carol', cardId: 'walk', count: 1 } });
    // Never the other person's unread count, or anything else the list doesn't show.
    expect(Object.keys(ab).sort()).toEqual(['createdAt', 'id', 'lastMessage', 'originCardId', 'other', 'otherId', 'participants', 'request', 'unread', 'updatedAt']);

    as('alice');
    expect((await json(await list())).conversations.map((c: { id: string; unread: number }) => [c.id, c.unread])).toEqual([[PAIR, 0]]);
    as('carol');
    expect((await json(await list())).conversations.map((c: { id: string }) => c.id)).toEqual(['bob_carol']);
  });

  it('answers 304 to its ETag while nothing changed, and a new one after a message', async () => {
    await sendMessage(db, 'alice', { to: 'bob', text: 'one' });
    as('bob');
    const first = await list();
    expect(first.headers.get('cache-control')).toBe('private, no-cache');
    const etag = first.headers.get('etag')!;
    const again = await list('', { 'If-None-Match': etag });
    expect([again.status, await again.text()]).toEqual([304, '']);
    await sendMessage(db, 'alice', { to: 'bob', text: 'two' });
    await touched('bob', ['inbox']);
    const changed = await list('', { 'If-None-Match': etag });
    expect(changed.status).toBe(200);
  });

  it('lists a blocked person’s conversation as before (the client filters by its blocks); a gone account’s other is null', async () => {
    await sendMessage(db, 'alice', { to: 'bob', text: 'hi' });
    await db.doc('users/bob/blocks/alice').set({ blockedUid: 'alice' });
    as('bob');
    expect((await json(await list())).conversations.map((c: { id: string }) => c.id)).toEqual([PAIR]);
    expect((await json(await one(PAIR))).id).toBe(PAIR);
    expect((await json(await messages(PAIR))).messages.map((m: { text: string }) => m.text)).toEqual(['hi']);
    as('alice');
    expect((await json(await one(PAIR))).id).toBe(PAIR);
    await db.doc('users/bob').delete();
    expect((await json(await one(PAIR))).other).toBeNull();
  });

  it('pages 50 at a time by its token, and refuses a token that is not one', async () => {
    const at = Date.parse('2026-11-01T00:00:00Z');
    await Promise.all(
      Array.from({ length: 51 }, (_, i) => {
        const other = `u${String(i).padStart(2, '0')}`;
        return db.doc(`conversations/alice_${other}`).set({ participants: ['alice', other], unread: {}, lastMessage: null, updatedAt: Timestamp.fromMillis(at + i) });
      }),
    );
    const first = await json(await list());
    expect(first.conversations).toHaveLength(50);
    expect(first.conversations[0].id).toBe('alice_u50');
    const second = await json(await list(`?pageToken=${encodeURIComponent(first.nextPageToken)}`));
    expect([second.conversations.map((c: { id: string }) => c.id), second.nextPageToken]).toEqual([['alice_u00'], null]);
    expect((await list('?pageToken=nope')).status).toBe(400);
  });
});

describe('GET /conversations/{pair} and its messages', () => {
  it('is 404 to anyone but its participants, whether it exists or not', async () => {
    await sendMessage(db, 'alice', { to: 'bob', text: 'hi' });
    as('carol');
    for (const pair of [PAIR, 'alice_carol', 'bob_carol']) {
      for (const res of [await one(pair), await messages(pair), await markRead(pair)]) {
        expect(res.status).toBe(404);
        expect((await res.json()).error).toEqual({ code: 'not_found', message: 'No such conversation.' });
      }
    }
    as('alice');
    expect((await one('alice_carol')).status).toBe(404);
    expect((await one('not-a-pair')).status).toBe(400);
  });

  it('pages a thread both ways at the microsecond: two messages in one millisecond are both there, in order', async () => {
    await db.doc(`conversations/${PAIR}`).set({ participants: ['alice', 'bob'], unread: {}, lastMessage: null, updatedAt: Timestamp.now() });
    const s = 1_790_000_000;
    // m2 and m3 share their millisecond; m3a and m3b share their microsecond (the id breaks the tie).
    await seed('m1', 'one', s, 100_000_000);
    await seed('m2', 'two', s, 200_000_000 + 1_000);
    await seed('m3', 'three', s, 200_000_000 + 2_000);
    await seed('m3a', 'three-a', s, 200_000_000 + 5_000);
    await seed('m3b', 'three-b', s, 200_000_000 + 5_000);
    await seed('m4', 'four', s + 1, 0, 'bob');

    const newest = await json(await messages(PAIR, '?limit=2'));
    expect(newest.messages.map((m: { id: string }) => m.id)).toEqual(['m4', 'm3b']);
    expect(newest.hasNewer).toBe(false);
    expect(newest.messages[1].sentAt).toBe('2026-09-21T14:13:20.200005Z');
    const back1 = await json(await messages(PAIR, `?limit=2&before=${encodeURIComponent(newest.olderCursor)}`));
    expect(back1.messages.map((m: { id: string }) => m.id)).toEqual(['m3a', 'm3']);
    const back2 = await json(await messages(PAIR, `?limit=2&before=${encodeURIComponent(back1.olderCursor)}`));
    expect(back2.messages.map((m: { id: string }) => m.id)).toEqual(['m2', 'm1']);
    const back3 = await json(await messages(PAIR, `?limit=2&before=${encodeURIComponent(back2.olderCursor)}`));
    expect([back3.messages, back3.olderCursor]).toEqual([[], null]);

    // Forward from m1: everything after it, two at a time, then nothing.
    const m1 = back2.messages[1].cursor;
    const fwd1 = await json(await messages(PAIR, `?limit=2&after=${encodeURIComponent(m1)}`));
    expect([fwd1.messages.map((m: { id: string }) => m.id), fwd1.hasNewer, fwd1.olderCursor]).toEqual([['m3', 'm2'], true, null]);
    const fwd2 = await json(await messages(PAIR, `?limit=2&after=${encodeURIComponent(fwd1.newerCursor)}`));
    expect(fwd2.messages.map((m: { id: string }) => m.id)).toEqual(['m3b', 'm3a']);
    const fwd3 = await json(await messages(PAIR, `?limit=2&after=${encodeURIComponent(fwd2.newerCursor)}`));
    expect([fwd3.messages.map((m: { id: string }) => m.id), fwd3.hasNewer]).toEqual([['m4'], false]);
    const fwd4 = await json(await messages(PAIR, `?limit=2&after=${encodeURIComponent(fwd3.newerCursor)}`));
    expect([fwd4.messages, fwd4.newerCursor]).toEqual([[], fwd3.newerCursor]);

    expect((await messages(PAIR, '?before=nope')).status).toBe(400);
    expect((await messages(PAIR, `?before=${encodeURIComponent(m1)}&after=${encodeURIComponent(m1)}`)).status).toBe(400);
    expect((await messages(PAIR, '?limit=101')).status).toBe(400);
  });

  it('an `after` pull brings a message sent since the last one held; the newest window’s ETag moves with a reaction', async () => {
    const firstId = (await sendMessage(db, 'alice', { to: 'bob', text: 'one' })).id;
    as('bob');
    const window = await messages(PAIR);
    const page = await json(window.clone());
    const etag = window.headers.get('etag')!;
    expect((await messages(PAIR, '', { 'If-None-Match': etag })).status).toBe(304);

    await sendMessage(db, 'alice', { to: 'bob', text: 'two' });
    const since = await json(await messages(PAIR, `?after=${encodeURIComponent(page.newerCursor)}`));
    expect(since.messages.map((m: { text: string }) => m.text)).toEqual(['two']);

    await setReaction(db, 'bob', PAIR, firstId, { reaction: 'heart' });
    const moved = await messages(PAIR, '', { 'If-None-Match': etag });
    expect(moved.status).toBe(200);
    const shown = await moved.json();
    expect(shown.messages.find((m: { id: string }) => m.id === firstId)).toMatchObject({ text: 'one', reactions: { bob: 'heart' } });
  });

  it('shows each message as stored: a note’s kind and card, a reply’s quote, an unsent one as only who and when', async () => {
    const note = await sendNote(db, 'bob', { cardId: 'walk', text: 'my own card' }).catch((e) => e);
    expect(note).toBeInstanceOf(Error); // bob can't leave a note on his own card
    await db.doc('cards/hers').set({
      authorId: 'alice', thoughtCore: 'Hers', story: 's', visibility: 'public', anonymous: false,
      publishedAt: Timestamp.fromDate(new Date('2026-09-01T08:00:00Z')),
    });
    const left = await sendNote(db, 'bob', { cardId: 'hers', text: 'about your card' });
    const hi = (await sendMessage(db, 'alice', { to: 'bob', text: 'hi', replyTo: left.id })).id;
    const gone = (await sendMessage(db, 'alice', { to: 'bob', text: 'oops' })).id;
    await unsendMessage(db, 'alice', PAIR, gone);
    as('bob');
    const page = await json(await messages(PAIR));
    const byId = new Map(page.messages.map((m: { id: string }) => [m.id, m]));
    expect(byId.get(left.id)).toMatchObject({ senderId: 'bob', text: 'about your card', kind: 'note', cardRef: 'hers' });
    expect(byId.get(hi)).toMatchObject({ text: 'hi', replyTo: { id: left.id, senderId: 'bob', text: 'about your card', cardRef: 'hers' } });
    const unsent = byId.get(gone) as Record<string, unknown>;
    expect(Object.keys(unsent).sort()).toEqual(['cursor', 'id', 'senderId', 'sentAt', 'text', 'unsentAt']);
    expect(unsent.text).toBe('');
    // The list's preview of an unsent last message says so.
    expect((await json(await one(PAIR))).lastMessage).toMatchObject({ unsent: true, text: '' });
  });
});

describe('POST /conversations/{pair}/read', () => {
  it('zeroes the viewer’s unread count, never the other’s, and never makes a deleted conversation again', async () => {
    await sendMessage(db, 'alice', { to: 'bob', text: 'one' });
    await sendMessage(db, 'bob', { to: 'alice', text: 'back' });
    await sendMessage(db, 'alice', { to: 'bob', text: 'two' });
    expect((await db.doc(`conversations/${PAIR}`).get()).get('unread')).toEqual({ alice: 1, bob: 2 });
    as('bob');
    expect((await markRead(PAIR)).status).toBe(204);
    expect((await db.doc(`conversations/${PAIR}`).get()).get('unread')).toEqual({ alice: 1, bob: 0 });
    expect((await markRead(PAIR)).status).toBe(204);
    expect((await json(await one(PAIR))).unread).toBe(0);
    await db.recursiveDelete(db.doc(`conversations/${PAIR}`));
    expect((await markRead(PAIR)).status).toBe(404);
    expect((await db.doc(`conversations/${PAIR}`).get()).exists).toBe(false);
  });
});

describe('the bell', () => {
  const row = (id: string, userId: string, type: string, payload: Record<string, unknown>, ms: number, extra: Record<string, unknown> = {}) =>
    db.doc(`notifications/${id}`).set({ userId, type, payload, readAt: null, createdAt: Timestamp.fromMillis(ms), ...extra });
  const T = Date.parse('2026-11-20T00:00:00Z');

  it('GET /me/bell: the viewer’s rows newest first, 20 a page, the fields the clients draw and the people named', async () => {
    await Promise.all(Array.from({ length: 21 }, (_, i) => row(`r${String(i).padStart(2, '0')}`, 'bob', 'message', { fromUserId: 'alice', fromHandle: 'alice' }, T + i)));
    await row('tap', 'bob', 'resonance_tap', { cardId: 'walk', fromUserIds: ['carol', 'alice', 'gone1'] }, T + 100, { pushedAt: Timestamp.fromMillis(T + 100) });
    await row('theirs', 'alice', 'message', { fromUserId: 'bob' }, T + 200);
    as('bob');
    const first = await json(await bell());
    expect(first.items).toHaveLength(20);
    expect(first.items[0]).toEqual({
      id: 'tap',
      type: 'resonance_tap',
      payload: { cardId: 'walk', fromUserIds: ['carol', 'alice', 'gone1'] },
      readAt: null,
      createdAt: '2026-11-20T00:00:00.100000Z',
    });
    expect(first.people.map((p: { handle: string }) => p.handle).sort()).toEqual(['alice', 'carol']);
    const second = await json(await bell(`?pageToken=${encodeURIComponent(first.nextPageToken)}`));
    expect([second.items.map((i: { id: string }) => i.id), second.nextPageToken]).toEqual([['r01', 'r00'], null]);
    expect((await json(await bell('?limit=50'))).items).toHaveLength(22);
    expect((await bell('?limit=51')).status).toBe(400);
    as('alice');
    expect((await json(await bell())).items.map((i: { id: string }) => i.id)).toEqual(['theirs']);
  });

  it('POST /notifications/read: own rows only, by id or up to a time, readAt the server’s time; the bell’s ETag moves', async () => {
    await row('a', 'bob', 'message', {}, T);
    await row('b', 'bob', 'message', {}, T + 1000);
    await row('c', 'bob', 'message', {}, T + 2000);
    await row('x', 'alice', 'message', {}, T);
    as('bob');
    const before = await bell();
    const etag = before.headers.get('etag')!;
    expect((await bellRead({ ids: ['a', 'x', 'missing'] })).status).toBe(204);
    const readAt = (id: string) => db.doc(`notifications/${id}`).get().then((s) => s.get('readAt'));
    expect(await readAt('a')).toBeInstanceOf(Timestamp);
    expect(await readAt('x')).toBeNull();
    await touched('bob', ['bell']);
    expect((await bell('', { 'If-None-Match': etag })).status).toBe(200);
    expect((await bellRead({ before: new Date(T + 1000).toISOString() })).status).toBe(204);
    expect(await readAt('b')).toBeInstanceOf(Timestamp);
    expect(await readAt('c')).toBeNull();
    for (const bad of [{}, { ids: [] }, { ids: ['a'], before: new Date(T).toISOString() }, { ids: ['a/b'] }, { before: 'yesterday' }]) {
      expect((await bellRead(bad)).status).toBe(400);
    }
  });
});
