import { beforeEach, describe, expect, it, vi } from 'vitest';

// Auth as the browser has it on a first load: no user until the SDK has
// restored the returning reader from its persistence, which settles
// `authStateReady()`.
const auth = vi.hoisted(() => {
  let restore: () => void = () => {};
  const state = {
    currentUser: null as { uid: string } | null,
    ready: Promise.resolve(),
    authStateReady: () => state.ready,
    /** Start a page load whose returning reader is `uid`, restored once `restore()` runs. */
    reload(uid: string) {
      state.currentUser = null;
      state.ready = new Promise<void>((resolve) => {
        restore = () => {
          state.currentUser = { uid };
          resolve();
        };
      });
    },
    restore: () => restore(),
  };
  return state;
});

// The block list and the block itself are the server's (GET / PUT / DELETE /api/v1/me/blocks): nothing here
// touches Firestore — its SDK isn't even loadable in this test.
vi.mock('./init', () => ({
  getClientDb: () => {
    throw new Error('Firestore is not read for blocks');
  },
}));
vi.mock('./reads', () => ({ rememberPeople: vi.fn() }));
vi.mock('./signals', () => ({ pokeOwn: vi.fn() }));
vi.mock('./api', () => ({ callApi: vi.fn(), ownSignalsOf: () => null }));
const mark = vi.hoisted(() => ({ uid: null as string | null }));
vi.mock('@/lib/auth/firebase/client', () => ({ getFirebaseClientAuth: () => auth, sessionMarkUid: () => mark.uid }));

import { callApi } from './api';
import { rememberPeople } from './reads';
import { pokeOwn } from './signals';
import { blockUser, getMyBlockedIds, invalidateBlocks, listMyBlocks, unblockUser } from './blocks';

const bob = { id: 'blocked-author', gone: false, author: null, bio: null, joinedAt: null };

beforeEach(() => {
  vi.clearAllMocks();
  invalidateBlocks();
  mark.uid = null;
  vi.mocked(callApi).mockImplementation((async (path: string) =>
    path === '/api/v1/me/blocks'
      ? { blocks: [{ userId: 'blocked-author', blockedAt: '2026-10-01T00:00:00.000Z', person: bob }] }
      : undefined) as never);
});

const reads = () => vi.mocked(callApi).mock.calls.filter(([path, init]) => path === '/api/v1/me/blocks' && !init);

describe('getMyBlockedIds', () => {
  // A list that doesn't wait for the viewer (the home feed) asks for the block
  // list as soon as the page loads. Answering "nobody" before Auth restored the
  // reader let a blocked author's cards through, and the list was cached so.
  it("waits for Auth to restore a returning reader before reading their list", async () => {
    auth.reload('me');
    const list = getMyBlockedIds();
    await Promise.resolve();
    expect(reads()).toHaveLength(0);
    auth.restore();
    await expect(list).resolves.toEqual(new Set(['blocked-author']));
    expect(reads()).toHaveLength(1);
  });

  it('is empty for a signed-out reader once Auth has settled', async () => {
    auth.currentUser = null;
    auth.ready = Promise.resolve();
    await expect(getMyBlockedIds()).resolves.toEqual(new Set());
    expect(reads()).toHaveLength(0);
  });

  it('reads the list once for every list that asks for it', async () => {
    auth.reload('me');
    const lists = [getMyBlockedIds(), getMyBlockedIds()];
    auth.restore();
    await Promise.all(lists);
    await getMyBlockedIds();
    expect(reads()).toHaveLength(1);
  });
});

describe('blocking', () => {
  beforeEach(() => {
    auth.currentUser = { uid: 'me' };
    auth.ready = Promise.resolve();
  });

  it('lists the blocked with when, their faces handed to the profile cache', async () => {
    await expect(listMyBlocks()).resolves.toEqual([{ uid: 'blocked-author', createdAt: new Date('2026-10-01T00:00:00.000Z') }]);
    expect(rememberPeople).toHaveBeenCalledWith([bob]);
  });

  it('blocks in ONE server call (block, connection and invites in one transaction), then reads the list again', async () => {
    await getMyBlockedIds();
    await blockUser('carol');
    expect(vi.mocked(callApi).mock.calls.filter(([, init]) => init)).toEqual([['/api/v1/me/blocks/carol', { method: 'PUT', onHeaders: expect.any(Function) }]]);
    // The answer's own counters (none here) taken as heard: the connections pulled once, now (client/signals pokeOwn).
    expect(pokeOwn).toHaveBeenCalledWith(['graph'], null);
    await getMyBlockedIds();
    expect(reads()).toHaveLength(2);
  });

  it('unblocks with a DELETE, and never blocks oneself', async () => {
    await unblockUser('carol');
    expect(vi.mocked(callApi).mock.calls).toEqual([['/api/v1/me/blocks/carol', { method: 'DELETE', onHeaders: expect.any(Function) }]]);
    expect(pokeOwn).toHaveBeenCalledWith(['graph'], null);
    await expect(blockUser('me')).rejects.toThrow('Cannot block yourself');
  });

  it('reads the list again after a block the server refused', async () => {
    await getMyBlockedIds();
    vi.mocked(callApi).mockRejectedValueOnce(new Error('offline'));
    await expect(blockUser('carol')).rejects.toThrow('offline');
    await getMyBlockedIds();
    expect(reads()).toHaveLength(2);
  });
});

describe("getMyBlockedIds for the cookie's reader (P0 #8: the card page while Auth restores)", () => {
  it('reads the list with the session cookie at once, without waiting for the SDK, when the mark names that reader', async () => {
    auth.reload('me');
    mark.uid = 'me';
    const ids = await getMyBlockedIds('me');
    expect([...ids]).toEqual(['blocked-author']);
    expect(reads()).toHaveLength(1);
    // Auth restored as the same person: the same read, not another.
    auth.restore();
    expect(await getMyBlockedIds()).toBe(ids);
    expect(reads()).toHaveLength(1);
  });

  it('waits for Auth as before when the mark names someone else, or none', async () => {
    auth.reload('me');
    mark.uid = 'someone-else';
    let done = false;
    const pending = getMyBlockedIds('me').then((ids) => ((done = true), ids));
    for (let i = 0; i < 5; i++) await Promise.resolve();
    expect(done).toBe(false);
    expect(reads()).toHaveLength(0);
    auth.restore();
    expect([...(await pending)]).toEqual(['blocked-author']);
  });

  it('never answers an empty list for a cookie read that failed: it reads again once Auth has restored', async () => {
    auth.reload('me');
    mark.uid = 'me';
    vi.mocked(callApi).mockRejectedValueOnce(new Error('401'));
    let done = false;
    const pending = getMyBlockedIds('me').then((ids) => ((done = true), ids));
    for (let i = 0; i < 5; i++) await Promise.resolve();
    expect(done).toBe(false);
    auth.restore();
    expect([...(await pending)]).toEqual(['blocked-author']);
    expect(reads()).toHaveLength(2);
  });
});
