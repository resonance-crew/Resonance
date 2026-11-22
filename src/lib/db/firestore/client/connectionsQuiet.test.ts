import { Timestamp } from 'firebase-admin/firestore';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeAdminDb } from '../../../../../test/fakeAdminDb';

// The messages page's connections end to end, counted: the real watcher (client/reads watchConnections, as
// hooks' useConversations uses it) and reader (listMyConnectionUids) on the real signal channel (client/signals,
// its listener fed the viewer's signal document as the server leaves it), asking the real GET
// /api/v1/me/connections over test/fakeAdminDb, which counts documents as Firestore bills them — through a
// fetch that keeps the browser's cache (If-None-Match, a 304 answered from what it holds). Before: every safety
// pull (every five minutes) read the whole list — 20 connections and their 20 people — whatever moved.

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
    throw new Error('Firestore is not read for the connections');
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

import { GET } from '@/app/api/v1/me/connections/route';
import { ctxFor } from '@/server/infra/firestore/ctx';
import { memoryRealtime } from '@/server/infra/memory/adapters';
import { CONNECTIONS_FULL_READ_MS, listMyConnectionUids, resetConnectionsHeard, watchConnections } from './reads';
import { SAFETY_PULL_MS, pokeOwn, resetSignals } from './signals';

const ts = (ms: number) => Timestamp.fromMillis(ms);
const T0 = Date.UTC(2026, 10, 22);
const pairWith = (o: string) => [ME, o].sort().join('_');

function world(n: number) {
  const docs: Record<string, Record<string, unknown>> = { [`users/${ME}`]: { handle: 'Me', initials: 'ME', accentColor: 'c' } };
  const others = Array.from({ length: n }, (_, i) => `u${String(i).padStart(2, '0')}`);
  others.forEach((o, i) => {
    docs[`users/${o}`] = { handle: `Person${i}`, initials: 'PE', accentColor: 'c' };
    docs[`connections/${pairWith(o)}`] = { userIds: [ME, o].sort(), establishedAt: ts(T0 + i * 1000) };
  });
  const fake = fakeAdminDb(docs);
  const realtime = memoryRealtime();
  state.ctx = ctxFor(fake.db, { realtime });

  // The browser's HTTP cache for a `private, no-cache` answer: it asks with the ETag it holds, and a 304 is the
  // body it held.
  const held = new Map<string, { etag: string; body: string }>();
  const requests: string[] = [];
  vi.stubGlobal('fetch', async (path: string, init: { method?: string; headers?: Record<string, string> }) => {
    requests.push(path);
    const cached = held.get(path);
    const res = await GET(
      new Request(`https://resonance.test${path}`, { method: init.method ?? 'GET', headers: { ...init.headers, ...(cached ? { 'If-None-Match': cached.etag } : {}) } }),
    );
    if (res.status === 304 && cached) return new Response(cached.body, { status: 200, headers: { ETag: res.headers.get('ETag') ?? cached.etag } });
    const body = await res.text();
    held.set(path, { etag: res.headers.get('ETag') ?? '', body });
    return new Response(body, { status: res.status, headers: res.headers });
  });

  let ids: string[] = [];
  const read = () => void listMyConnectionUids().then((v) => void (ids = v));
  const stop = watchConnections(ME, read);
  read();
  /** The listener brings the viewer's signal document as the server left it. */
  const hear = async () => {
    const doc = realtime.signals(ME);
    state.listeners.forEach((l) => l.onData(doc as unknown as Record<string, unknown>));
    await settle();
  };
  const settle = () => vi.advanceTimersByTimeAsync(0).then(() => vi.advanceTimersByTimeAsync(0));
  const cost = async (fn: () => Promise<unknown>) => {
    const [r, b] = [requests.length, fake.billed()];
    await fn();
    await settle();
    return { requests: requests.slice(r), reads: fake.billed() - b };
  };
  return { fake, realtime, others, hear, settle, cost, stop, ids: () => ids };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'setInterval', 'Date'] });
  vi.setSystemTime(T0 + 3_600_000);
  state.listeners = [];
});
afterEach(() => {
  resetSignals();
  resetConnectionsHeard();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('the messages page’s connections read only when they may have moved', () => {
  it('open for an hour with nothing moved: a whole read every ten minutes, no safety pull between', async () => {
    const w = world(20);
    await w.settle();
    await w.hear();
    expect(w.ids()).toHaveLength(20);
    const hour = await w.cost(async () => {
      for (let m = 0; m < 60; m++) await vi.advanceTimersByTimeAsync(60_000);
    });
    // Twelve safety pulls (every SAFETY_PULL_MS), and the whole list read on six of them (2 documents a
    // connection; a 304 for the unchanged body, past the early 304's ten minutes): 12 requests, 480 documents before.
    expect(60 * 60_000 / SAFETY_PULL_MS).toBe(12);
    expect(hour.requests).toHaveLength(60 * 60_000 / CONNECTIONS_FULL_READ_MS);
    expect(hour.reads).toBeLessThanOrEqual(6 * 40);
    expect(w.ids()).toHaveLength(20);
  });

  it('a connection made elsewhere (both people’s graph touched) is read at once; one this browser ended (a block) too', async () => {
    const w = world(20);
    await w.settle();
    await w.hear();
    const made = await w.cost(async () => {
      w.fake.docs[`connections/${pairWith('new')}`] = { userIds: [ME, 'new'].sort(), establishedAt: ts(T0 + 99_000) };
      await w.realtime.touch(ME, ['graph']);
      await w.hear();
    });
    expect(made.requests).toEqual(['/api/v1/me/connections']);
    expect(w.ids()).toContain('new');

    // The viewer blocks u03 (PUT /me/blocks: the connection ended, the blocker's own touch made before the
    // answer, its counter handed on — client/blocks pokeOwn): one read, at once, and none when the listener hears it.
    const blocked = await w.cost(async () => {
      delete w.fake.docs[`connections/${pairWith('u03')}`];
      const doc = await w.realtime.touchAndRead!(ME, ['graph']);
      pokeOwn(['graph'], { graph: doc!.graph });
      await w.realtime.touch('u03', ['graph']);
    });
    expect(blocked.requests).toEqual(['/api/v1/me/connections']);
    expect(w.ids()).not.toContain('u03');
    expect((await w.cost(() => w.hear())).requests).toEqual([]);
  });

  it('a safety pull reads whole when no one can say what moved (no listener answer yet)', async () => {
    const w = world(5);
    await w.settle();
    // The listener never answered: every safety pull reads.
    const quiet = await w.cost(() => vi.advanceTimersByTimeAsync(SAFETY_PULL_MS));
    expect(quiet.requests).toEqual(['/api/v1/me/connections']);
  });
});
