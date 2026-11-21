import { describe, expect, it } from 'vitest';
import { ApiFailure } from '@/lib/api/v1/http';
import { memoryCtx } from '@/server/infra/memory/ctx';
import { getCardDetail, getMe } from './cardsRead';
import { mergedHints, updateProfileIn } from './profile';
import { acceptInviteIn } from './invites';
import { resonateWithIn, unresonateIn } from './resonate';
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
} from './social';

// The 2a-social services on memoryCtx: what the clients wrote and read from
// Firestore under the rules, now on the server — and whom each write's signal
// reaches (signals/{uid}), never the person a block or an anonymous card hides.

const at = (iso: string) => new Date(iso);
const later = at('2027-01-01T00:00:00Z');
const card = (authorId: string, extra: Record<string, unknown> = {}) => ({
  authorId,
  thoughtCore: 'A card',
  story: 'What someone wrote, long enough to be a story.',
  tags: [],
  visibility: 'public',
  anonymous: false,
  publishedAt: at('2026-11-01T00:00:00Z'),
  ...extra,
});

function world() {
  const ctx = memoryCtx();
  ctx.state.seed('users', {
    alice: { handle: 'alice', initials: 'AL', accentColor: 'x', joinedAt: at('2026-01-01T00:00:00Z'), bio: 'hi' },
    bob: { handle: 'bob', initials: 'BO', accentColor: 'y', joinedAt: at('2026-02-01T00:00:00Z') },
    carol: { handle: 'carol', initials: 'CA', accentColor: 'z' },
  });
  ctx.state.seed('cards', {
    bobNamed: card('bob'),
    bobAnon: card('bob', { anonymous: true }),
    bobPrivate: card('bob', { visibility: 'private' }),
    bobConn: card('bob', { visibility: 'connections' }),
  });
  return ctx;
}

async function failure(p: Promise<unknown>): Promise<ApiFailure> {
  const e = await p.then(() => null, (err: unknown) => err);
  expect(e).toBeInstanceOf(ApiFailure);
  return e as ApiFailure;
}

const block = (ctx: ReturnType<typeof world>, a: string, b: string) => {
  ctx.state.put(`users/${a}/blocks`, b, { blockedUid: b, createdAt: new Date() });
  ctx.state.put('blocks', `${a}/${b}`, { blockedUid: b });
};

describe('blocks', () => {
  it('ends the connection and withdraws invites both ways in one go, and tells both: their lists changed', async () => {
    const ctx = world();
    ctx.state.put('connections', 'alice_bob', { userIds: ['alice', 'bob'], establishedAt: new Date() });
    ctx.state.put('invites', 'i1', { fromUserId: 'bob', toUserId: 'alice', status: 'pending', expiresAt: later });
    expect(await blockIn(ctx, 'alice', 'bob')).toBe(true);
    expect(ctx.state.get('connections', 'alice_bob')).toBeNull();
    expect(ctx.state.get('invites', 'i1')).toMatchObject({ status: 'withdrawn' });
    expect(ctx.realtime.touches).toEqual([
      { uid: 'alice', topics: ['graph'] },
      { uid: 'bob', topics: ['graph'] },
    ]);
  });

  it('a block alone — nothing of theirs changed — is never signalled to the person blocked', async () => {
    const ctx = world();
    await blockIn(ctx, 'alice', 'carol');
    expect(ctx.realtime.touches).toEqual([{ uid: 'alice', topics: ['graph'] }]);
    // Again: nothing changes, no one is touched.
    expect(await blockIn(ctx, 'alice', 'carol')).toBe(false);
    expect(ctx.realtime.touches).toHaveLength(1);
  });

  it('refuses blocking yourself', async () => {
    expect((await failure(blockIn(world(), 'alice', 'alice'))).code).toBe('invalid_request');
  });

  it('a block refuses accepting an invite sent before it', async () => {
    const ctx = world();
    ctx.state.put('invites', 'i1', { fromUserId: 'bob', toUserId: 'alice', status: 'pending', expiresAt: later });
    await blockIn(ctx, 'bob', 'alice');
    // Withdrawn by the block, so it is no longer open — whichever side blocked.
    expect((await failure(acceptInviteIn(ctx, 'alice', 'i1'))).code).toBe('conflict');
    expect(ctx.state.get('connections', 'alice_bob')).toBeNull();
  });

  it('unblocking takes only the block away: no connection comes back, only the unblocker is touched', async () => {
    const ctx = world();
    ctx.state.put('connections', 'alice_bob', { userIds: ['alice', 'bob'], establishedAt: new Date() });
    await blockIn(ctx, 'alice', 'bob');
    ctx.realtime.touches.length = 0;
    await unblockIn(ctx, 'alice', 'bob');
    expect(ctx.state.get('users/alice/blocks', 'bob')).toBeNull();
    expect(ctx.state.get('connections', 'alice_bob')).toBeNull();
    expect(ctx.realtime.touches).toEqual([{ uid: 'alice', topics: ['graph'] }]);
    await unblockIn(ctx, 'alice', 'bob');
    expect(ctx.realtime.touches).toHaveLength(1);
  });

  it('lists blocks with the people, a deleted account as gone', async () => {
    const ctx = world();
    await blockIn(ctx, 'alice', 'bob');
    ctx.clock.advance(1000);
    block(ctx, 'alice', 'ghost');
    const { blocks } = await listBlocksIn(ctx, 'alice');
    expect(blocks.map((b) => [b.userId, b.person.gone])).toEqual(
      expect.arrayContaining([
        ['bob', false],
        ['ghost', true],
      ]),
    );
    expect(blocks.find((b) => b.userId === 'ghost')!.person).toEqual({ id: 'ghost', gone: true, author: null, bio: null, joinedAt: null });
  });
});

describe('bookmarks', () => {
  it('bookmarks a card the viewer may read, and CardDetail says so', async () => {
    const ctx = world();
    await putBookmarkIn(ctx, 'alice', 'bobNamed');
    expect((await getCardDetail(ctx, 'alice', 'bobNamed')).bookmarked).toBe(true);
    expect((await getCardDetail(ctx, 'carol', 'bobNamed')).bookmarked).toBe(false);
    await deleteBookmarkIn(ctx, 'alice', 'bobNamed');
    expect((await getCardDetail(ctx, 'alice', 'bobNamed')).bookmarked).toBe(false);
  });

  it("one the viewer can't read is not_found, as GET /cards answers it — an absent one alike", async () => {
    const ctx = world();
    for (const id of ['bobPrivate', 'bobConn', 'missing']) expect((await failure(putBookmarkIn(ctx, 'alice', id))).code, id).toBe('not_found');
    expect(ctx.state.rows('users/alice/bookmarks')).toEqual([]);
  });

  it('an anonymous card is bookmarked across a block either way, exactly as without one', async () => {
    const blocks: ([string, string] | null)[] = [['alice', 'bob'], ['bob', 'alice'], null];
    for (const pair of blocks) {
      const ctx = world();
      if (pair) block(ctx, pair[0], pair[1]);
      await putBookmarkIn(ctx, 'alice', 'bobAnon');
      expect((await getCardDetail(ctx, 'alice', 'bobAnon')).bookmarked).toBe(true);
    }
  });
});

describe('people, connections and invites', () => {
  it('looks people up by id in the order asked, a missing one gone, a block changing nothing', async () => {
    const ctx = world();
    block(ctx, 'bob', 'alice');
    const { users } = await lookupUsersIn(ctx, ['bob', 'nobody', 'alice']);
    expect(users.map((u) => [u.id, u.gone, u.author?.handle ?? null])).toEqual([
      ['bob', false, 'bob'],
      ['nobody', true, null],
      ['alice', false, 'alice'],
    ]);
    expect(users[2]).toMatchObject({ bio: 'hi', joinedAt: '2026-01-01T00:00:00.000Z' });
  });

  it('lists connections with the people', async () => {
    const ctx = world();
    ctx.state.put('connections', 'alice_bob', { userIds: ['alice', 'bob'], establishedAt: at('2026-10-01T00:00:00Z') });
    expect(await listConnectionsIn(ctx, 'alice')).toEqual({
      connections: [{ userId: 'bob', establishedAt: '2026-10-01T00:00:00.000Z', person: expect.objectContaining({ id: 'bob', gone: false }) }],
    });
  });

  it('lists only the open invites to the viewer, and declining closes one without telling its sender', async () => {
    const ctx = world();
    ctx.state.seed('invites', {
      open: { fromUserId: 'bob', toUserId: 'alice', status: 'pending', message: 'hi', createdAt: at('2026-11-01T00:00:00Z'), expiresAt: later },
      past: { fromUserId: 'carol', toUserId: 'alice', status: 'pending', createdAt: at('2026-11-02T00:00:00Z'), expiresAt: at('2026-01-01T00:00:00Z') },
      undated: { fromUserId: 'carol', toUserId: 'alice', status: 'pending', createdAt: at('2026-11-03T00:00:00Z') },
    });
    const { invites } = await incomingInvitesIn(ctx, 'alice');
    expect(invites.map((i) => i.id)).toEqual(['open']);
    expect(invites[0]).toMatchObject({ fromUserId: 'bob', message: 'hi', from: { id: 'bob', gone: false } });

    expect((await failure(declineInviteIn(ctx, 'bob', 'open'))).code).toBe('not_found');
    await declineInviteIn(ctx, 'alice', 'open');
    await declineInviteIn(ctx, 'alice', 'open');
    expect(ctx.state.get('invites', 'open')).toMatchObject({ status: 'declined' });
    expect(ctx.realtime.touches).toEqual([{ uid: 'alice', topics: ['graph'] }]);
    expect((await failure(acceptInviteIn(ctx, 'alice', 'open'))).code).toBe('conflict');
  });

  it('accepting an invite touches both graphs', async () => {
    const ctx = world();
    ctx.state.put('invites', 'i1', { fromUserId: 'bob', toUserId: 'alice', status: 'pending', expiresAt: later });
    await acceptInviteIn(ctx, 'alice', 'i1');
    expect(ctx.realtime.touches).toEqual([
      { uid: 'alice', topics: ['graph'] },
      { uid: 'bob', topics: ['graph'] },
    ]);
  });
});

describe('resonances signal the connections they make and end', () => {
  it('a resonance with a named card connects the two and touches both; taking it back touches both again', async () => {
    const ctx = world();
    ctx.state.put('cards', 'aliceReply', card('alice', { visibility: 'public' }));
    await resonateWithIn(ctx, 'alice', 'bobNamed', 'aliceReply');
    expect(ctx.state.get('connections', 'alice_bob')).not.toBeNull();
    expect(ctx.realtime.touches).toEqual([
      { uid: 'alice', topics: ['graph'] },
      { uid: 'bob', topics: ['graph'] },
    ]);
    await unresonateIn(ctx, 'alice', 'bobNamed', 'aliceReply');
    expect(ctx.state.get('connections', 'alice_bob')).toBeNull();
    expect(ctx.realtime.touches.slice(2)).toEqual([
      { uid: 'alice', topics: ['graph'] },
      { uid: 'bob', topics: ['graph'] },
    ]);
  });

  it('a resonance with an anonymous card connects no one and touches no one', async () => {
    const ctx = world();
    ctx.state.put('cards', 'aliceReply', card('alice'));
    await resonateWithIn(ctx, 'alice', 'bobAnon', 'aliceReply');
    expect(ctx.realtime.touches).toEqual([]);
  });
});

describe('PATCH /me: photo, translation languages, hint counts', () => {
  it('takes our pictures only, by key or URL', async () => {
    const ctx = world();
    await updateProfileIn(ctx, 'alice', { avatarKey: 'image/2026-11/a1b2.webp' });
    expect(ctx.state.get('users', 'alice')).toMatchObject({ avatarUrl: 'https://media.test/image/2026-11/a1b2.webp' });
    await updateProfileIn(ctx, 'alice', { avatarUrl: 'https://media.test/image/2026-11/c3.webp' });
    expect((await getMe(ctx, 'alice')).avatarUrl).toBe('https://media.test/image/2026-11/c3.webp');
    for (const input of [{ avatarUrl: 'https://tracker.example/pixel.gif' }, { avatarKey: '../x' }]) {
      expect((await failure(updateProfileIn(ctx, 'alice', input))).code).toBe('invalid_request');
    }
  });

  it('keeps the translation languages and merges hint counts: each only rises', async () => {
    const ctx = world();
    ctx.state.merge('users', 'alice', { hintsSeen: { 'feed-reason': 2, other: 3 } });
    await updateProfileIn(ctx, 'alice', { autoTranslateTo: ['en', 'en'], hintsSeen: { 'feed-reason': 1, other: 4, fresh: 1 } });
    const me = await getMe(ctx, 'alice');
    expect(me.autoTranslateTo).toEqual(['en']);
    expect(me.hintsSeen).toEqual({ 'feed-reason': 2, other: 4, fresh: 1 });
  });

  it('refuses more hints than the rules hold', () => {
    const stored = Object.fromEntries(Array.from({ length: 50 }, (_, i) => [`h${i}`, 1]));
    expect(mergedHints(stored, { h1: 2 })).toEqual({ h1: 2 });
    expect(() => mergedHints(stored, { extra: 1 })).toThrow(ApiFailure);
    expect(mergedHints({ a: 3 }, { a: 3 })).toBeNull();
  });
});
