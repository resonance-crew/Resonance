import { Timestamp } from 'firebase-admin/firestore';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeAdminDb } from '../../../../../test/fakeAdminDb';

// The web's conversation list end to end, counted: the real list reader
// (client/messages conversationsReader) on the real signal channel
// (client/signals, its listener fed the viewer's signal document as the
// server leaves it), asking the real GET /api/v1/conversations over
// test/fakeAdminDb, which counts documents as Firestore bills them. The
// writes (a send, a read mark, a deletion) are made on the documents as the
// server makes them, with the touches the server's own table gives
// (domain/realtimeInbox) — so what is counted is what the list's pull after
// each costs: the request it makes and the documents it reads. Before the
// delta every one of these pulls read the whole first page: 50 conversations
// and their 50 people.

const ME = 'me';
const state = vi.hoisted(() => ({
  ctx: null as unknown,
  listeners: [] as { onData: (d: Record<string, unknown> | null) => void }[],
}));
vi.mock('@/lib/auth', () => ({ getCurrentUser: async () => ({ id: 'me' }) }));
vi.mock('@/server/ctx', () => ({ serverCtx: () => state.ctx }));
vi.mock('@/lib/auth/firebase/client', () => ({
  getFirebaseClientAuth: () => ({ currentUser: { uid: 'me', getIdToken: async () => 'id-token' } }),
  ensureAppCheck: () => {},
}));
vi.mock('@/lib/auth/firebase/appCheck', () => ({ appCheckHeaders: async () => ({}) }));
vi.mock('./init', () => ({
  getClientDb: () => {
    throw new Error('Firestore is not read for the list');
  },
}));
vi.mock('./listen', () => ({
  listenLazily: (start: (rt: { listenDoc: unknown }) => () => void) =>
    start({
      listenDoc: (_path: string[], onData: (d: Record<string, unknown> | null) => void) => {
        const l = { onData };
        state.listeners.push(l);
        return () => {
          state.listeners = state.listeners.filter((x) => x !== l);
        };
      },
    }),
}));

import { GET } from '@/app/api/v1/conversations/route';
import { pulled } from '@/lib/data/live';
import type { Conversation } from '@/lib/db/types';
import { ctxFor } from '@/server/infra/firestore/ctx';
import { memoryRealtime } from '@/server/infra/memory/adapters';
import { conversationRead, messageSent, threadChanged } from '@/server/domain/realtimeInbox';
import { CONVERSATIONS_PAGE, LIST_FULL_READ_MS, conversationsReader } from './messages';
import { getUsersByIds } from './reads';
import { pokeOwn, resetSignals } from './signals';

const ts = (ms: number) => Timestamp.fromMillis(ms);
const T0 = Date.UTC(2026, 10, 22);
const pairWith = (o: string) => [ME, o].sort().join('_');

function world(n: number) {
  const docs: Record<string, Record<string, unknown>> = { [`users/${ME}`]: { handle: 'Me', initials: 'ME', accentColor: 'c' } };
  const others = Array.from({ length: n }, (_, i) => `u${String(i).padStart(2, '0')}`);
  others.forEach((o, i) => {
    docs[`users/${o}`] = { handle: `Person${i}`, initials: 'PE', accentColor: 'c' };
    docs[`conversations/${pairWith(o)}`] = {
      participants: [ME, o].sort(),
      createdAt: ts(T0),
      updatedAt: ts(T0 + i * 1000),
      lastMessage: { text: 'hi', senderId: o, sentAt: ts(T0 + i * 1000) },
      unread: { [ME]: 1, [o]: 0 },
    };
  });
  const fake = fakeAdminDb(docs);
  const realtime = memoryRealtime();
  state.ctx = ctxFor(fake.db, { realtime });

  const requests: string[] = [];
  vi.stubGlobal('fetch', async (path: string, init: { method?: string; headers?: Record<string, string> }) => {
    requests.push(path);
    return GET(new Request(`https://resonance.test${path}`, { method: init.method ?? 'GET', headers: init.headers }));
  });

  let list: Conversation[] | undefined;
  let failed: Error | null = null;
  const stop = pulled<Conversation[]>(ME, ['inbox'], conversationsReader(ME))(
    (data) => void (list = data),
    (e) => void (failed = e),
  );
  /** The listener brings the viewer's signal document as the server left it. */
  const hear = async () => {
    const doc = realtime.signals(ME);
    state.listeners.forEach((l) => l.onData(doc as unknown as Record<string, unknown>));
    await settle();
  };
  const settle = () => vi.advanceTimersByTimeAsync(0).then(() => vi.advanceTimersByTimeAsync(0));
  /** What `fn` cost: the requests the list made and the documents they read (the signal document's read, on Firestore, beside them). */
  const cost = async (fn: () => Promise<unknown>) => {
    const [r, b] = [requests.length, fake.billed()];
    await fn();
    await settle();
    return { requests: requests.slice(r), reads: fake.billed() - b };
  };
  return { fake, realtime, others, requests, hear, settle, cost, stop, list: () => list, failed: () => failed };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'setInterval', 'Date'] });
  vi.setSystemTime(T0 + 3_600_000);
  state.listeners = [];
});
afterEach(() => {
  resetSignals();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

/** The server's send, as POST /messages leaves the documents and the touches: the sender's own counters to its client (X-Resonance-Signals). */
async function send(w: ReturnType<typeof world>, from: string, to: string, at: number) {
  const pair = pairWith(from === ME ? to : from);
  const path = `conversations/${pair}`;
  const was = w.fake.docs[path] as { unread: Record<string, number> };
  w.fake.docs[path] = { ...was, updatedAt: ts(at), lastMessage: { text: 'new', senderId: from, sentAt: ts(at) }, unread: { ...was.unread, [to]: (was.unread[to] ?? 0) + 1 } };
  w.fake.docs[`${path}/messages/m${at}`] = { senderId: from, text: 'new', sentAt: ts(at) };
  for (const t of messageSent(pair, from, to, false)) await w.realtime.touch(t.uid, t.topics);
  return pair;
}

const own = (w: ReturnType<typeof world>, pair: string) => {
  const doc = w.realtime.signals(ME);
  return { inbox: doc.inbox, [`thread:${pair}`]: doc.threads[pair] ?? 0 };
};

describe('the conversation list reads only what moved', () => {
  it('after a send and after a read mark: one request for that one conversation and its person, not the page', async () => {
    const w = world(50);
    await w.settle();
    await w.hear();
    expect(w.list()).toHaveLength(CONVERSATIONS_PAGE);
    expect(w.requests).toEqual(['/api/v1/conversations']);
    // The people the page brought along are the messages page's faces: no second read of them (GET /users?ids=).
    const faces = await w.cost(() => getUsersByIds(w.others));
    expect(faces.requests).toEqual([]);
    expect(Object.keys(await getUsersByIds(w.others))).toHaveLength(50);

    // The viewer sends to u03: its answer's own counters (pokeOwn), as the outbox hands them on.
    const sent = await w.cost(async () => {
      const pair = await send(w, ME, 'u03', T0 + 120_000);
      pokeOwn([`thread:${pair}`, 'inbox'], own(w, pair));
    });
    expect(sent.requests).toEqual([`/api/v1/conversations?pairs=${pairWith('u03')}`]);
    expect(sent.reads).toBeLessThanOrEqual(2);
    expect(w.list()![0]).toMatchObject({ id: pairWith('u03'), lastMessage: { text: 'new', senderId: ME } });
    expect(w.list()).toHaveLength(CONVERSATIONS_PAGE);

    // The listener then brings the same touch: nothing more is read.
    expect((await w.cost(() => w.hear())).requests).toEqual([]);

    // The viewer reads u10's conversation (POST …/read: unread 0, the reader's own touch).
    const read = await w.cost(async () => {
      const pair = pairWith('u10');
      const path = `conversations/${pair}`;
      const was = w.fake.docs[path] as { unread: Record<string, number> };
      w.fake.docs[path] = { ...was, unread: { ...was.unread, [ME]: 0 } };
      for (const t of conversationRead(pair, ME)) await w.realtime.touch(t.uid, t.topics);
      pokeOwn(['inbox', `thread:${pair}`], own(w, pair));
    });
    expect(read.requests).toEqual([`/api/v1/conversations?pairs=${pairWith('u10')}`]);
    expect(read.reads).toBeLessThanOrEqual(2);
    expect(w.list()!.find((c) => c.id === pairWith('u10'))!.unread[ME]).toBe(0);
    // Its place is kept: a read mark doesn't make a conversation the newest.
    expect(w.list()!.map((c) => c.id).indexOf(pairWith('u10'))).toBe(50 - 1 - 10 + 1);
  });

  it('a message from someone else, heard on the listener: their conversation alone, moved to the top', async () => {
    const w = world(50);
    await w.settle();
    await w.hear();
    const came = await w.cost(async () => {
      await send(w, 'u00', ME, T0 + 200_000);
      await w.hear();
    });
    expect(came.requests).toEqual([`/api/v1/conversations?pairs=${pairWith('u00')}`]);
    expect(came.reads).toBeLessThanOrEqual(2);
    expect(w.list()![0]).toMatchObject({ id: pairWith('u00'), unread: { [ME]: 2 } });
  });

  it('a deletion: gone from a short list at once; a full page is read whole (the next one in is the server’s to say)', async () => {
    const short = world(5);
    await short.settle();
    await short.hear();
    const pair = pairWith('u02');
    const gone = await short.cost(async () => {
      delete short.fake.docs[`conversations/${pair}`];
      for (const t of threadChanged(pair, ME, 'u02')) await short.realtime.touch(t.uid, t.topics);
      await short.hear();
    });
    expect(gone.requests).toEqual([`/api/v1/conversations?pairs=${pair}`]);
    expect(short.list()!.map((c) => c.id)).not.toContain(pair);
    expect(short.list()).toHaveLength(4);
    short.stop();
    resetSignals();
    state.listeners = [];

    const full = world(51);
    await full.settle();
    await full.hear();
    const top = full.list()!.map((c) => c.id);
    const fullGone = await full.cost(async () => {
      delete full.fake.docs[`conversations/${top[0]}`];
      for (const t of threadChanged(top[0], ME, 'u50')) await full.realtime.touch(t.uid, t.topics);
      await full.hear();
    });
    expect(fullGone.requests).toEqual([`/api/v1/conversations?pairs=${top[0]}`, '/api/v1/conversations']);
    expect(full.list()).toHaveLength(CONVERSATIONS_PAGE);
    expect(full.list()!.map((c) => c.id)).toEqual([...top.slice(1), pairWith('u00')]);
  });

  it('a safety pull with nothing moved reads nothing; past the full-read interval the page is read whole', async () => {
    const w = world(50);
    await w.settle();
    await w.hear();
    const quiet = await w.cost(() => vi.advanceTimersByTimeAsync(5 * 60_000));
    expect(quiet.requests).toEqual([]);
    const later = await w.cost(() => vi.advanceTimersByTimeAsync(LIST_FULL_READ_MS));
    expect(later.requests).toEqual(['/api/v1/conversations']);
  });

  it('reads the page whole when no one can say what moved: the list touched alone, or before the listener answers', async () => {
    const w = world(50);
    await w.settle();
    // No answer from the listener yet: a pull can only read the page.
    const early = await w.cost(async () => {
      await w.realtime.touch(ME, ['inbox']);
      pokeOwn(['inbox'], null);
    });
    expect(early.requests).toEqual(['/api/v1/conversations']);
    await w.hear();
    // `inbox` moved with no conversation's counter (a touch of the list alone).
    const alone = await w.cost(async () => {
      await w.realtime.touch(ME, ['inbox']);
      await w.hear();
    });
    expect(alone.requests).toEqual(['/api/v1/conversations']);
    expect(w.failed()).toBeNull();
  });
});
