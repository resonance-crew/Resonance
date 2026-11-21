import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { ApiFailure } from '@/lib/api/v1/http';
import { ctxFor } from '@/server/infra/firestore/ctx';
import { getCardDetail, getMe } from '@/server/app/cardsRead';
import { acceptInviteIn } from '@/server/app/invites';
import { updateProfileIn } from '@/server/app/profile';
import {
  blockIn,
  declineInviteIn,
  deleteBookmarkIn,
  incomingInvitesIn,
  listBlocksIn,
  listConnectionsIn,
  lookupUsersIn,
  putBookmarkIn,
  unblockIn,
} from '@/server/app/social';

// Phase 2's social endpoints (2a-social) on the Firestore emulator, through
// the services their routes call: what the web and the apps wrote and read
// straight from Firestore under the rules (users/{uid} fields, bookmarks,
// blocks, connections, invites), now on the server — and the signals/{uid}
// counters each write raises for whose lists it changed.

const PROJECT = 'demo-resonance-api-social';
let app: App;
let db: Firestore;
const ctx = () => ctxFor(db);
const ts = (iso: string) => Timestamp.fromDate(new Date(iso));
const open = () => Timestamp.fromDate(new Date(Date.now() + 3 * 86_400_000));

beforeAll(() => {
  process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
  app = initializeApp({ projectId: PROJECT }, 'api-v1-social-test');
  db = getFirestore(app);
});

afterAll(async () => {
  vi.unstubAllEnvs();
  await deleteApp(app);
});

beforeEach(async () => {
  vi.stubEnv('MEDIA_PUBLIC_BASE', 'https://media.test');
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
  const card = (authorId: string, extra: Record<string, unknown> = {}) => ({
    authorId,
    thoughtCore: 'a card',
    story: 'What someone wrote, long enough to be a story.',
    tags: [],
    visibility: 'public',
    anonymous: false,
    publishedAt: ts('2026-11-01T00:00:00Z'),
    ...extra,
  });
  await Promise.all([
    db.doc('users/alice').set({ handle: 'alice', handleLower: 'alice', initials: 'AL', accentColor: 'x', joinedAt: ts('2026-01-01T00:00:00Z'), hintsSeen: { kept: 2 } }),
    db.doc('users/bob').set({ handle: 'bob', handleLower: 'bob', initials: 'BO', accentColor: 'y', bio: 'bob writes' }),
    db.doc('users/carol').set({ handle: 'carol', handleLower: 'carol', initials: 'CA', accentColor: 'z' }),
    db.doc('cards/bobNamed').set(card('bob')),
    db.doc('cards/bobPrivate').set(card('bob', { visibility: 'private' })),
    db.doc('connections/alice_bob').set({ userIds: ['alice', 'bob'], establishedAt: ts('2026-10-01T00:00:00Z') }),
    db.doc('invites/fromBob').set({ fromUserId: 'bob', toUserId: 'alice', message: 'hi', status: 'pending', expiresAt: open(), createdAt: ts('2026-11-01T00:00:00Z') }),
    db.doc('invites/toBob').set({ fromUserId: 'alice', toUserId: 'bob', message: 'hey', status: 'pending', expiresAt: open(), createdAt: ts('2026-11-02T00:00:00Z') }),
    db.doc('invites/fromCarol').set({ fromUserId: 'carol', toUserId: 'alice', message: 'yo', status: 'pending', expiresAt: open(), createdAt: ts('2026-11-03T00:00:00Z') }),
  ]);
});

async function failure(p: Promise<unknown>): Promise<ApiFailure> {
  const e = await p.then(() => null, (err: unknown) => err);
  expect(e).toBeInstanceOf(ApiFailure);
  return e as ApiFailure;
}

const data = async (path: string) => (await db.doc(path).get()).data();

describe('PATCH /me: photo, translation languages, hint counts', () => {
  it('stores them as the clients did, the other hint counts kept, and GET /me answers them', async () => {
    await updateProfileIn(ctx(), 'alice', { avatarKey: 'image/2026-11/a1.webp', autoTranslateTo: ['en'], hintsSeen: { 'feed-reason': 1, kept: 1 } });
    expect(await data('users/alice')).toMatchObject({
      avatarUrl: 'https://media.test/image/2026-11/a1.webp',
      autoTranslateTo: ['en'],
      hintsSeen: { kept: 2, 'feed-reason': 1 },
    });
    expect(await getMe(ctx(), 'alice')).toMatchObject({ avatarUrl: 'https://media.test/image/2026-11/a1.webp', autoTranslateTo: ['en'], hintsSeen: { kept: 2, 'feed-reason': 1 } });
  });

  it('refuses a picture that is not ours, writing nothing', async () => {
    expect((await failure(updateProfileIn(ctx(), 'alice', { avatarUrl: 'https://elsewhere.example/p.png', bio: 'new' }))).code).toBe('invalid_request');
    expect((await data('users/alice'))?.bio).toBeUndefined();
  });
});

describe('bookmarks (PUT / DELETE /me/bookmarks/{cardId})', () => {
  it("bookmarks a card the viewer may read; CardDetail says so; one they can't read is not_found", async () => {
    await putBookmarkIn(ctx(), 'alice', 'bobNamed');
    const first = (await data('users/alice/bookmarks/bobNamed'))?.createdAt as Timestamp;
    await putBookmarkIn(ctx(), 'alice', 'bobNamed');
    expect(((await data('users/alice/bookmarks/bobNamed'))?.createdAt as Timestamp).isEqual(first)).toBe(true);
    expect(await data('users/alice/bookmarks/bobNamed')).toMatchObject({ cardId: 'bobNamed' });
    expect((await getCardDetail(ctx(), 'alice', 'bobNamed')).bookmarked).toBe(true);
    expect((await getCardDetail(ctx(), 'carol', 'bobNamed')).bookmarked).toBe(false);
    for (const id of ['bobPrivate', 'missing']) expect((await failure(putBookmarkIn(ctx(), 'alice', id))).code).toBe('not_found');
    expect(await data('users/alice/bookmarks/bobPrivate')).toBeUndefined();
    await deleteBookmarkIn(ctx(), 'alice', 'bobNamed');
    await deleteBookmarkIn(ctx(), 'alice', 'bobNamed');
    expect(await data('users/alice/bookmarks/bobNamed')).toBeUndefined();
  });
});

describe('blocks (GET /me/blocks, PUT / DELETE /me/blocks/{uid})', () => {
  it('in one transaction: the block, the connection gone, pending invites both ways withdrawn — and both signalled', async () => {
    await blockIn(ctx(), 'alice', 'bob');
    expect(await data('users/alice/blocks/bob')).toMatchObject({ blockedUid: 'bob', createdAt: expect.any(Timestamp) });
    expect(await data('connections/alice_bob')).toBeUndefined();
    expect((await data('invites/fromBob'))?.status).toBe('withdrawn');
    expect((await data('invites/toBob'))?.status).toBe('withdrawn');
    expect((await data('invites/fromCarol'))?.status).toBe('pending');
    expect(await data('signals/alice')).toMatchObject({ v: 1, graph: 1, at: expect.any(Timestamp) });
    expect(await data('signals/bob')).toMatchObject({ v: 1, graph: 1 });
    expect(await data('signals/carol')).toBeUndefined();
  });

  it('then accepting the invite sent before it is refused, and connects no one', async () => {
    await blockIn(ctx(), 'bob', 'alice');
    expect((await failure(acceptInviteIn(ctx(), 'alice', 'fromBob'))).code).toBe('conflict');
    expect(await data('connections/alice_bob')).toBeUndefined();
  });

  it('an invite still pending across a block (written before the server did blocks) is refused as blocked', async () => {
    await db.doc('users/bob/blocks/alice').set({ blockedUid: 'alice', createdAt: Timestamp.now() });
    expect((await failure(acceptInviteIn(ctx(), 'alice', 'fromBob'))).code).toBe('blocked');
  });

  it('unblocking takes only the block away: the connection and the invites stay as the block left them', async () => {
    await blockIn(ctx(), 'alice', 'bob');
    await unblockIn(ctx(), 'alice', 'bob');
    expect(await data('users/alice/blocks/bob')).toBeUndefined();
    expect(await data('connections/alice_bob')).toBeUndefined();
    expect((await data('invites/fromBob'))?.status).toBe('withdrawn');
    // Only the unblocker's list changed.
    expect((await data('signals/alice'))?.graph).toBe(2);
    expect((await data('signals/bob'))?.graph).toBe(1);
  });

  it('lists the blocks, the latest first, each with the person', async () => {
    await blockIn(ctx(), 'alice', 'bob');
    await blockIn(ctx(), 'alice', 'carol');
    const { blocks } = await listBlocksIn(ctx(), 'alice');
    expect(blocks.map((b) => b.userId)).toEqual(['carol', 'bob']);
    expect(blocks[1].person).toMatchObject({ id: 'bob', gone: false, bio: 'bob writes', author: { handle: 'bob' } });
  });

  it('refuses blocking yourself', async () => {
    expect((await failure(blockIn(ctx(), 'alice', 'alice'))).code).toBe('invalid_request');
  });
});

describe('connections, people and invites', () => {
  it('GET /me/connections lists the people the viewer is connected with', async () => {
    expect(await listConnectionsIn(ctx(), 'alice')).toEqual({
      connections: [{ userId: 'bob', establishedAt: '2026-10-01T00:00:00.000Z', person: expect.objectContaining({ id: 'bob', gone: false }) }],
    });
    expect((await listConnectionsIn(ctx(), 'carol')).connections).toEqual([]);
  });

  it('GET /users?ids= answers each in the order asked, a deleted account gone with nothing of it', async () => {
    const { users } = await lookupUsersIn(ctx(), ['carol', 'deleted', 'alice']);
    expect(users.map((u) => [u.id, u.gone])).toEqual([
      ['carol', false],
      ['deleted', true],
      ['alice', false],
    ]);
    expect(users[1]).toEqual({ id: 'deleted', gone: true, author: null, bio: null, joinedAt: null });
    expect(users[2]).toMatchObject({ joinedAt: '2026-01-01T00:00:00.000Z', author: { id: 'alice', handle: 'alice' } });
  });

  it('GET /invites?box=incoming lists the open ones; declining one closes it and rings no one', async () => {
    await db.doc('invites/past').set({ fromUserId: 'carol', toUserId: 'alice', status: 'pending', expiresAt: ts('2026-01-01T00:00:00Z'), createdAt: ts('2026-11-04T00:00:00Z') });
    const { invites } = await incomingInvitesIn(ctx(), 'alice');
    expect(invites.map((i) => i.id)).toEqual(['fromCarol', 'fromBob']);
    expect(invites[1]).toMatchObject({ fromUserId: 'bob', message: 'hi', from: { id: 'bob', gone: false } });

    expect((await failure(declineInviteIn(ctx(), 'bob', 'fromBob'))).code).toBe('not_found');
    expect((await failure(declineInviteIn(ctx(), 'alice', 'missing'))).code).toBe('not_found');
    await declineInviteIn(ctx(), 'alice', 'fromBob');
    await declineInviteIn(ctx(), 'alice', 'fromBob');
    expect((await data('invites/fromBob'))?.status).toBe('declined');
    expect((await db.collection('notifications').get()).size).toBe(0);
    expect(await data('signals/bob')).toBeUndefined();
    expect((await incomingInvitesIn(ctx(), 'alice')).invites.map((i) => i.id)).toEqual(['fromCarol']);
    expect((await failure(acceptInviteIn(ctx(), 'alice', 'fromBob'))).code).toBe('conflict');
  });

  it('accepting an invite signals both graphs', async () => {
    await db.doc('connections/alice_bob').delete();
    await acceptInviteIn(ctx(), 'alice', 'fromCarol');
    expect((await data('signals/alice'))?.graph).toBe(1);
    expect((await data('signals/carol'))?.graph).toBe(1);
  });
});
