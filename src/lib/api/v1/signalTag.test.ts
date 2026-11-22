import { describe, expect, it, vi } from 'vitest';
import { memoryRealtime } from '@/server/infra/memory/adapters';
import { EARLY_MAX_AGE_S, signalledJson } from './signalTag';

// The lists the signal channel covers answer 304 before they are read, while
// the viewer's counter for them stands — for ten minutes at most, since the
// answers also hold what no signal tells of (people's names and faces).

const URL_ = 'https://resonance.test/api/v1/conversations';
const req = (etag?: string, url = URL_) => new Request(url, { headers: etag ? { 'If-None-Match': etag } : {} });
const T0 = Date.UTC(2026, 10, 22, 12);

function setup(body: unknown = { conversations: [{ id: 'alice_bob' }], nextPageToken: null }) {
  const realtime = memoryRealtime();
  let answer = body;
  const read = vi.fn(async () => answer);
  return { realtime, read, set: (b: unknown) => (answer = b) };
}

describe('signalledJson', () => {
  it('answers a request naming an answer whose counter still stands with a 304, the list never read', async () => {
    const { realtime, read } = setup();
    const first = await signalledJson(req(), { uid: 'me', topic: 'inbox', realtime, now: T0 }, read);
    expect(first.status).toBe(200);
    expect(first.headers.get('Cache-Control')).toBe('private, no-cache');
    const etag = first.headers.get('ETag')!;
    expect(read).toHaveBeenCalledTimes(1);

    const again = await signalledJson(req(etag), { uid: 'me', topic: 'inbox', realtime, now: T0 + 5 * 60_000 }, read);
    expect(again.status).toBe(304);
    expect(again.headers.get('ETag')).toBe(etag);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('reads the list again once its counter moved — a 304 still when the body is the same, under a new tag', async () => {
    const { realtime, read, set } = setup();
    const etag = (await signalledJson(req(), { uid: 'me', topic: 'inbox', realtime, now: T0 }, read)).headers.get('ETag')!;
    // A reaction elsewhere moves only the thread: the list's counter stands.
    await realtime.touch('me', [{ thread: 'alice_me' }]);
    expect((await signalledJson(req(etag), { uid: 'me', topic: 'inbox', realtime, now: T0 + 1000 }, read)).status).toBe(304);
    expect(read).toHaveBeenCalledTimes(1);

    await realtime.touch('me', ['inbox']);
    const same = await signalledJson(req(etag), { uid: 'me', topic: 'inbox', realtime, now: T0 + 2000 }, read);
    expect(read).toHaveBeenCalledTimes(2);
    expect(same.status).toBe(304);
    const fresh = same.headers.get('ETag')!;
    expect(fresh).not.toBe(etag);

    set({ conversations: [{ id: 'alice_bob' }, { id: 'carol_me' }], nextPageToken: null });
    await realtime.touch('me', ['inbox']);
    const changed = await signalledJson(req(fresh), { uid: 'me', topic: 'inbox', realtime, now: T0 + 3000 }, read);
    expect(changed.status).toBe(200);
    expect(await changed.json()).toEqual({ conversations: [{ id: 'alice_bob' }, { id: 'carol_me' }], nextPageToken: null });
  });

  it('believes a tag ten minutes at most: what no signal tells of (a renamed person) shows by then', async () => {
    const { realtime, read, set } = setup();
    const etag = (await signalledJson(req(), { uid: 'me', topic: 'inbox', realtime, now: T0 }, read)).headers.get('ETag')!;
    set({ conversations: [{ id: 'alice_bob', other: { handle: 'Alicia' } }], nextPageToken: null });
    expect((await signalledJson(req(etag), { uid: 'me', topic: 'inbox', realtime, now: T0 + (EARLY_MAX_AGE_S - 1) * 1000 }, read)).status).toBe(304);
    const late = await signalledJson(req(etag), { uid: 'me', topic: 'inbox', realtime, now: T0 + EARLY_MAX_AGE_S * 1000 }, read);
    expect(late.status).toBe(200);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("never takes one viewer's tag, another query's, or a forged one for another's counter", async () => {
    const { realtime, read } = setup();
    const etag = (await signalledJson(req(), { uid: 'me', topic: 'inbox', realtime, now: T0 }, read)).headers.get('ETag')!;
    // Another viewer naming it: their list is read (and, being another body, answered whole).
    await signalledJson(req(etag), { uid: 'you', topic: 'inbox', realtime, now: T0 + 1000 }, read);
    expect(read).toHaveBeenCalledTimes(2);
    // Another page of the list.
    await signalledJson(req(etag, `${URL_}?pageToken=abc`), { uid: 'me', topic: 'inbox', realtime, now: T0 + 1000 }, read);
    expect(read).toHaveBeenCalledTimes(3);
    // A tag from the future, or with its mac changed.
    const [hash, , mac] = etag.slice(1, -1).split('.');
    await signalledJson(req(`"${hash}.${Math.floor(T0 / 1000) + 3600}.${mac}"`), { uid: 'me', topic: 'inbox', realtime, now: T0 + 1000 }, read);
    await signalledJson(req(`"${hash}.${Math.floor(T0 / 1000)}.AAAAAAAAAAAAAAAA"`), { uid: 'me', topic: 'inbox', realtime, now: T0 + 1000 }, read);
    expect(read).toHaveBeenCalledTimes(5);
  });

  it('reads whole every time where the signal store reads nothing, or its read fails — and an old plain tag still gets its 304', async () => {
    const read = vi.fn(async () => ({ items: [] }));
    const touchOnly = { touch: async () => {} };
    const first = await signalledJson(req(), { uid: 'me', topic: 'bell', realtime: touchOnly, now: T0 }, read);
    const etag = first.headers.get('ETag')!;
    expect(etag).toMatch(/^"[A-Za-z0-9_-]{27}"$/);
    expect((await signalledJson(req(etag), { uid: 'me', topic: 'bell', realtime: touchOnly, now: T0 }, read)).status).toBe(304);
    const failing = { touch: async () => {}, read: async () => Promise.reject(new Error('down')) };
    expect((await signalledJson(req(etag), { uid: 'me', topic: 'bell', realtime: failing, now: T0 }, read)).status).toBe(304);
    expect(read).toHaveBeenCalledTimes(3);
  });
});
