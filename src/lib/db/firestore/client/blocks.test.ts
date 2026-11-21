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
vi.mock('./signals', () => ({ pokeSignal: vi.fn() }));
vi.mock('./api', () => ({ callApi: vi.fn() }));
vi.mock('@/lib/auth/firebase/client', () => ({ getFirebaseClientAuth: () => auth }));

import { callApi } from './api';
import { rememberPeople } from './reads';
import { pokeSignal } from './signals';
import { blockUser, getMyBlockedIds, invalidateBlocks, listMyBlocks, unblockUser } from './blocks';

const bob = { id: 'blocked-author', gone: false, author: null, bio: null, joinedAt: null };

beforeEach(() => {
  vi.clearAllMocks();
  invalidateBlocks();
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
    expect(vi.mocked(callApi).mock.calls.filter(([, init]) => init)).toEqual([['/api/v1/me/blocks/carol', { method: 'PUT' }]]);
    expect(pokeSignal).toHaveBeenCalledWith('graph');
    await getMyBlockedIds();
    expect(reads()).toHaveLength(2);
  });

  it('unblocks with a DELETE, and never blocks oneself', async () => {
    await unblockUser('carol');
    expect(vi.mocked(callApi).mock.calls).toEqual([['/api/v1/me/blocks/carol', { method: 'DELETE' }]]);
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
