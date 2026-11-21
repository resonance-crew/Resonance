import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, Timestamp, type Firestore } from 'firebase-admin/firestore';

// Phase 2 inbox (2a-inbox), the safety probes (CLAUDE.md #6) for the new
// reads — GET /conversations, /conversations/{pair}, …/messages and
// /me/bell — against the Firestore emulator, each asked with no block and
// with a block either way:
//
// - a note and a tap on an ANONYMOUS card: the writer's (the tapper's)
//   answers never point at the author — no conversation, no bell row, no
//   uid of theirs anywhere in the bytes; the author's bell has the row the
//   rules let them read, saying `anonymous`, its payload exactly as stored
//   (never more), and no thread with the writer.
// - across a block either way: the note withheld and the tap unrung — no row
//   in the author's bell either — and the writer's answers the same bytes as
//   with no block (nothing tells them they were blocked, or whose card it is).
// - a named card's thread with a person blocked stays theirs to read, as the
//   rules let it today.

const mocks = vi.hoisted(() => ({ db: null as unknown, viewer: 'alice' }));
vi.mock('@/lib/auth', () => ({ getCurrentUser: async () => ({ id: mocks.viewer }) }));
vi.mock('@/lib/db/firestore/admin', () => ({ getAdminDb: () => mocks.db }));
vi.mock('next/server', async (orig) => ({ ...(await orig<typeof import('next/server')>()), after: () => {} }));

const listRoute = await import('@/app/api/v1/conversations/route');
const oneRoute = await import('@/app/api/v1/conversations/[pair]/route');
const messagesRoute = await import('@/app/api/v1/conversations/[pair]/messages/route');
const bellRoute = await import('@/app/api/v1/me/bell/route');
const { sendNote } = await import('@/lib/api/v1/conversations');
const { setTap } = await import('@/lib/api/v1/taps');
const { ringTap } = await import('@/lib/push/tapBell');

const PROJECT = 'demo-resonance-anon-blocks-inbox';
// alice writes (and taps); bob wrote the anonymous card.
const PAIR = 'alice_bob';
let app: App;
let db: Firestore;

beforeAll(() => {
  process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
  app = initializeApp({ projectId: PROJECT }, 'anon-blocks-inbox-test');
  db = getFirestore(app);
  mocks.db = db;
});

afterAll(async () => {
  await deleteApp(app);
});

const card = (authorId: string, anonymous: boolean) => ({
  authorId, thoughtCore: 'A walk', story: 's', visibility: 'public', anonymous,
  publishedAt: Timestamp.fromDate(new Date('2026-09-01T08:00:00Z')),
});

beforeEach(async () => {
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
  await Promise.all([
    ...['alice', 'bob', 'carol'].map((id) => db.doc(`users/${id}`).set({ handle: id, handleLower: id, initials: id.slice(0, 2).toUpperCase(), accentColor: 'x' })),
    db.doc('cards/anon').set(card('bob', true)),
    db.doc('cards/named').set(card('bob', false)),
  ]);
});

const params = <K extends string>(p: Record<K, string>) => ({ params: Promise.resolve(p) });
const req = (path: string) => new Request(`http://localhost${path}`);
/** Everything the viewer's inbox endpoints answer about `pair`, as raw bodies. */
async function inboxOf(uid: string, pair = PAIR) {
  mocks.viewer = uid;
  const list = await listRoute.GET(req('/api/v1/conversations'));
  const one = await oneRoute.GET(req(`/api/v1/conversations/${pair}`), params({ pair }));
  const messages = await messagesRoute.GET(req(`/api/v1/conversations/${pair}/messages`), params({ pair }));
  const bell = await bellRoute.GET(req('/api/v1/me/bell'));
  return {
    list: { status: list.status, body: await list.text() },
    one: { status: one.status, body: await one.text() },
    messages: { status: messages.status, body: await messages.text() },
    bell: { status: bell.status, body: await bell.text() },
  };
}
const BLOCKS = [null, ['alice', 'bob'], ['bob', 'alice']] as const;
const block = (b: (typeof BLOCKS)[number]) => (b ? db.doc(`users/${b[0]}/blocks/${b[1]}`).set({ blockedUid: b[1] }) : Promise.resolve());
const rows = async (userId: string) => (await db.collection('notifications').where('userId', '==', userId).get()).docs;

describe('a note on an anonymous card', () => {
  it.each(BLOCKS)('never points the writer at the author (block %j)', async (b) => {
    await block(b);
    await sendNote(db, 'alice', { cardId: 'anon', text: 'Thank you for this' });
    const writer = await inboxOf('alice');
    expect(JSON.parse(writer.list.body).conversations).toEqual([]);
    expect([writer.one.status, writer.messages.status]).toEqual([404, 404]);
    expect(JSON.parse(writer.bell.body)).toEqual({ items: [], people: [], nextPageToken: null });
    for (const part of Object.values(writer)) expect(part.body).not.toContain('bob');

    const author = await inboxOf('bob');
    expect(JSON.parse(author.list.body).conversations).toEqual([]);
    expect([author.one.status, author.messages.status]).toEqual([404, 404]);
    const items = JSON.parse(author.bell.body).items;
    if (b) {
      // Withheld across a block: no row for the author either.
      expect(items).toEqual([]);
      expect(await rows('bob')).toHaveLength(0);
    } else {
      expect(items).toHaveLength(1);
      expect(items[0]).toMatchObject({ type: 'note', payload: { anonymous: true, cardId: 'anon' } });
      // Exactly the payload the rules let the author read on the row itself: never more.
      const [stored] = await rows('bob');
      expect(items[0].payload).toEqual(stored.get('payload'));
    }
  });

  it('answers the writer the same bytes with a block either way as with none', async () => {
    const seen: string[] = [];
    for (const b of BLOCKS) {
      await block(b);
      await sendNote(db, 'alice', { cardId: 'anon', text: 'again' });
      const w = await inboxOf('alice');
      seen.push(JSON.stringify([w.list, w.one, w.messages, w.bell]));
      if (b) await db.doc(`users/${b[0]}/blocks/${b[1]}`).delete();
    }
    expect(new Set(seen).size).toBe(1);
  });
});

describe('a tap on an anonymous card', () => {
  it.each(BLOCKS)('rings the author’s bell, saying anonymous, and nothing of the author reaches the tapper (block %j)', async (b) => {
    await block(b);
    const now = Date.now();
    await setTap(db, 'alice', 'anon', true, now);
    await ringTap(db, 'alice', 'anon', now);
    const tapper = await inboxOf('alice');
    expect(JSON.parse(tapper.bell.body).items).toEqual([]);
    for (const part of Object.values(tapper)) expect(part.body).not.toContain('bob');

    const items = JSON.parse((await inboxOf('bob')).bell.body).items;
    if (b) {
      expect(items).toEqual([]);
    } else {
      expect(items).toHaveLength(1);
      expect(items[0]).toMatchObject({ type: 'resonance_tap', payload: { cardId: 'anon', anonymous: true, fromUserIds: ['alice'] } });
      const [stored] = await rows('bob');
      expect(items[0].payload).toEqual(stored.get('payload'));
    }
  });
});

describe('a named card’s thread across a block', () => {
  it.each(BLOCKS.slice(1))('stays its participants’ to read, as the rules let it (block %j); a stranger is 404 either way', async (b) => {
    // alice's note on bob's named card opens their thread (a letter).
    await sendNote(db, 'alice', { cardId: 'named', text: 'Hello' });
    await block(b);
    for (const uid of ['alice', 'bob']) {
      const seen = await inboxOf(uid);
      expect([seen.one.status, seen.messages.status]).toEqual([200, 200]);
      expect(JSON.parse(seen.list.body).conversations.map((c: { id: string }) => c.id)).toEqual([PAIR]);
    }
    const stranger = await inboxOf('carol');
    expect([stranger.one.status, stranger.messages.status]).toEqual([404, 404]);
    expect(JSON.parse(stranger.list.body).conversations).toEqual([]);
  });
});
