import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeAdminDb } from '../../../../../test/fakeAdminDb';

// The web's bell end to end, counted: the real reader (client/notifications bellReader, as hooks'
// useNotifications pulls it) on the real signal channel (client/signals, its listener fed the viewer's signal
// document as the server leaves it), asking the real GET /api/v1/me/bell and POST /api/v1/notifications/read
// over test/fakeAdminDb, which counts documents as Firestore bills them (its commits stamped with their own
// time, as Firestore's serverTimestamp). Before: every pull of the bell read its newest 20 rows and their 20
// people — a row tapped read cost a stale early 304 at once and the whole page when the listener heard it.

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
    throw new Error('Firestore is not read for the bell');
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

import { GET } from '@/app/api/v1/me/bell/route';
import { POST as markRead } from '@/app/api/v1/notifications/read/route';
import { pulled } from '@/lib/data/live';
import type { Notification } from '@/lib/db/types';
import { ctxFor } from '@/server/infra/firestore/ctx';
import { memoryRealtime } from '@/server/infra/memory/adapters';
import { BELL_FULL_READ_MS, bellReader, markNotificationRead } from './notifications';
import { resetSignals } from './signals';

const ts = (ms: number) => Timestamp.fromMillis(ms);
const T0 = Date.UTC(2026, 10, 22);

function world(n: number) {
  const docs: Record<string, Record<string, unknown>> = { [`users/${ME}`]: { handle: 'Me', initials: 'ME', accentColor: 'c' } };
  const others = Array.from({ length: n }, (_, i) => `u${String(i).padStart(2, '0')}`);
  others.forEach((o, i) => {
    docs[`users/${o}`] = { handle: `Person${i}`, initials: 'PE', accentColor: 'c' };
    docs[`notifications/n${String(i).padStart(2, '0')}`] = { userId: ME, type: 'message', payload: { fromUserId: o }, readAt: null, createdAt: ts(T0 + i * 1000) };
  });
  const fake = fakeAdminDb(docs, { serverTime: true });
  const realtime = memoryRealtime();
  state.ctx = ctxFor(fake.db, { realtime });

  /** Each request, and the documents its answer read. */
  const requests: { path: string; reads: number }[] = [];
  vi.stubGlobal('fetch', async (path: string, init: { method?: string; headers?: Record<string, string>; body?: string }) => {
    const before = fake.billed();
    const req = new Request(`https://resonance.test${path}`, { method: init.method ?? 'GET', headers: init.headers, body: init.body });
    const res = path.startsWith('/api/v1/notifications/read') ? await markRead(req) : await GET(req);
    requests.push({ path, reads: fake.billed() - before });
    return res;
  });

  let rows: Notification[] | undefined;
  let failed: Error | null = null;
  const stop = pulled<Notification[]>(ME, ['bell'], bellReader(ME, 20))(
    (data) => void (rows = data),
    (e) => void (failed = e),
  );
  /** The listener brings the viewer's signal document as the server left it. */
  const hear = async () => {
    const doc = realtime.signals(ME);
    state.listeners.forEach((l) => l.onData(doc as unknown as Record<string, unknown>));
    await settle();
  };
  const settle = () => vi.advanceTimersByTimeAsync(0).then(() => vi.advanceTimersByTimeAsync(0));
  const cost = async (fn: () => Promise<unknown>) => {
    const r = requests.length;
    await fn();
    await settle();
    return requests.slice(r);
  };
  /** A row written by the server for the viewer, as the writers stamp it (repos/bell bellMade), and the bell touched. */
  const ring = async (id: string, from: string) => {
    await fake.db.doc(`notifications/${id}`).set({
      userId: ME,
      type: 'note',
      payload: { fromUserId: from },
      readAt: null,
      createdAt: FieldValue.serverTimestamp(),
      editedAt: FieldValue.serverTimestamp(),
      madeAt: FieldValue.serverTimestamp(),
    });
    await realtime.touch(ME, ['bell']);
  };
  return { fake, realtime, others, hear, settle, cost, ring, stop, rows: () => rows, failed: () => failed };
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

const GETS = <R extends { path: string }>(rs: R[]) => rs.filter((r) => r.path.startsWith('/api/v1/me/bell'));

describe('the bell reads only what changed', () => {
  it('tap a bell row: the read mark, then that one row — not the page and its people, and nothing when the listener hears it', async () => {
    const w = world(50);
    await w.settle();
    await w.hear();
    expect(w.rows()).toHaveLength(20);
    const row = w.rows()![4];
    expect(row.readAt).toBeNull();

    const tapped = await w.cost(() => markNotificationRead(row.id));
    expect(tapped.map((r) => r.path)).toEqual(['/api/v1/notifications/read', expect.stringMatching(/^\/api\/v1\/me\/bell\?limit=20&updatedAfter=/)]);
    // The rows' count and the row (41 before: the page, its 20 people, and the count's absent cursor).
    expect(GETS(tapped)[0].reads).toBeLessThanOrEqual(2);
    expect(w.rows()!.find((n) => n.id === row.id)!.readAt).not.toBeNull();
    expect(w.rows()).toHaveLength(20);
    // The listener then brings the same touch: nothing more is read.
    expect(await w.cost(() => w.hear())).toEqual([]);
  });

  it('a row that came, heard on the listener: it and its person, on top', async () => {
    const w = world(50);
    await w.settle();
    await w.hear();
    const came = await w.cost(async () => {
      await w.ring('fresh', 'u03');
      await w.hear();
    });
    expect(came).toHaveLength(1);
    // The count, the row and its person.
    expect(came[0].reads).toBeLessThanOrEqual(3);
    expect(w.rows()![0]).toMatchObject({ id: 'fresh', type: 'note', payload: { fromUserId: 'u03' } });
    expect(w.rows()).toHaveLength(20);
  });

  it('a row that went (an untapped reader’s last): the server says so, and the page is read whole', async () => {
    const w = world(50);
    await w.settle();
    await w.hear();
    const top = w.rows()![0].id;
    const gone = await w.cost(async () => {
      await w.fake.db.doc(`notifications/${top}`).delete();
      await w.realtime.touch(ME, ['bell']);
      await w.hear();
    });
    expect(gone).toHaveLength(1);
    expect(w.rows()!.map((n) => n.id)).not.toContain(top);
    expect(w.rows()).toHaveLength(20);
  });

  it('a safety pull with nothing moved reads nothing; past the full-read interval the page is read whole', async () => {
    const w = world(50);
    await w.settle();
    await w.hear();
    const quiet = await w.cost(() => vi.advanceTimersByTimeAsync(5 * 60_000));
    expect(quiet).toEqual([]);
    const later = await w.cost(() => vi.advanceTimersByTimeAsync(BELL_FULL_READ_MS));
    expect(later.map((r) => r.path)).toEqual(['/api/v1/me/bell?limit=20&changes=1']);
    expect(w.failed()).toBeNull();
  });
});
