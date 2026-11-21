import { describe, expect, it } from 'vitest';
import { ApiFailure } from '@/lib/api/v1/http';
import { memoryCtx } from '@/server/infra/memory/ctx';
import { acceptInviteIn } from './invites';
import { letterReadsAsConnectionIn } from './preLetter';
import { resonateWithIn, tryReachResonanceIn, unresonateIn } from './resonate';

// The graph aggregate's services on the memory context — no Firestore at all:
// a resonance connects the two with a reason and rings the original's author
// once; taking it back removes the reason and, none left, the connection; a
// second resonance with the same card connects no one and rings no one; an
// invite accepted once (twice is harmless); a block refuses a named card and
// an invite, never an anonymous card (which then reaches no one).

const DAY = 24 * 3600_000;
const profile = (handle: string) => ({ handle, handleLower: handle, initials: handle.slice(0, 2).toUpperCase(), accentColor: 'oklch(90% 0.05 200)' });

function setup() {
  const ctx = memoryCtx();
  const now = ctx.clock.now();
  const card = (authorId: string, extra: Record<string, unknown> = {}) => ({
    authorId,
    thoughtCore: 'A walk after the rain',
    story: 'words '.repeat(50),
    tags: [],
    visibility: 'public',
    anonymous: false,
    publishedAt: new Date(now - DAY),
    trashedAt: null,
    ...extra,
  });
  ctx.state.seed('users', { alice: profile('alice'), bob: profile('bob'), carol: profile('carol'), dave: profile('dave') });
  ctx.state.seed('cards', {
    walk: card('alice'),
    reply: card('bob', { slug: 'reply-bob' }),
    second: card('bob'),
    daves: card('dave'),
    davesAnon: card('dave', { anonymous: true }),
    bobsOther: card('bob'),
  });
  return { ctx, now };
}

const failure = async (p: Promise<unknown>) => {
  const e = await p.then(() => null, (x: unknown) => x);
  expect(e).toBeInstanceOf(ApiFailure);
  return (e as ApiFailure).code;
};

describe('graph services on memory', () => {
  it('resonate → connected with a reason and rung once; unresonate removes the reason → disconnected; again connects and rings no one', async () => {
    const { ctx } = setup();
    const s = ctx.state;
    const first = await resonateWithIn(ctx, 'bob', 'walk', 'reply');
    expect(first).toMatchObject({ changed: true, notificationId: 'resonance_bob_walk' });
    expect(first.card).toMatchObject({ id: 'reply', referenceCardId: 'walk', author: { handle: 'bob' } });
    expect(first.stale.length).toBeGreaterThan(0);
    expect(s.get('cards', 'reply')?.referenceCardId).toBe('walk');
    expect(s.get('connections', 'alice_bob')?.userIds).toEqual(['alice', 'bob']);
    expect(Object.keys(s.get('connectionOrigins', 'alice_bob')?.reasons as object)).toEqual(['resonance_bob_reply']);
    expect(s.get('notifications', 'resonance_bob_walk')).toMatchObject({ userId: 'alice', type: 'resonance', payload: { fromUserId: 'bob', cardId: 'walk' } });

    // Asked again: nothing changes, nothing rings.
    expect(await resonateWithIn(ctx, 'bob', 'walk', 'reply')).toMatchObject({ changed: false, notificationId: null, stale: [] });
    // One card per reader and original.
    expect(await failure(resonateWithIn(ctx, 'bob', 'walk', 'second'))).toBe('conflict');

    expect((await unresonateIn(ctx, 'bob', 'walk', 'reply')).changed).toBe(true);
    expect(s.get('cards', 'reply')).not.toHaveProperty('referenceCardId');
    expect(s.get('connections', 'alice_bob')).toBeNull();
    expect(s.get('connectionOrigins', 'alice_bob')).toBeNull();
    // The bell stays: the reader rang once.
    expect(s.get('notifications', 'resonance_bob_walk')).not.toBeNull();
    expect(await unresonateIn(ctx, 'bob', 'walk', 'reply')).toEqual({ changed: false, stale: [] });

    // Answering that card again rings no one and connects no one.
    expect(await resonateWithIn(ctx, 'bob', 'walk', 'second')).toMatchObject({ changed: true, notificationId: null });
    expect(s.get('connections', 'alice_bob')).toBeNull();
  });

  it('a second reason keeps the two connected when the first is taken back; a published resonance reaches through tryReachResonance', async () => {
    const { ctx, now } = setup();
    const s = ctx.state;
    s.put('cards', 'aliceAnswer', { ...s.get('cards', 'walk'), thoughtCore: 'An answer', referenceCardId: 'bobsOther', publishedAt: new Date(now - DAY) });
    await resonateWithIn(ctx, 'bob', 'walk', 'reply');
    // alice's own published resonance with bob's card reaches him: one more reason, no second connection.
    expect(await tryReachResonanceIn(ctx, 'alice', 'aliceAnswer')).toBe('resonance_alice_bobsOther');
    expect(Object.keys(s.get('connectionOrigins', 'alice_bob')?.reasons as object).sort()).toEqual(['resonance_alice_aliceAnswer', 'resonance_bob_reply']);
    expect(s.get('connectionOrigins', 'alice_bob')?.resonanceCards).toEqual(['reply', 'aliceAnswer']);
    await unresonateIn(ctx, 'bob', 'walk', 'reply');
    expect(s.get('connections', 'alice_bob')).not.toBeNull();
    expect(s.get('connectionOrigins', 'alice_bob')?.resonanceCards).toEqual(['aliceAnswer']);
    // No such card reaches no one.
    expect(await tryReachResonanceIn(ctx, 'alice', 'no/such')).toBeNull();
  });

  it('accepts an invite once — connected naming it, the sender rung, a waiting letter answered — and twice harmlessly', async () => {
    const { ctx, now } = setup();
    const s = ctx.state;
    s.put('invites', 'inv', { fromUserId: 'carol', toUserId: 'bob', status: 'pending', expiresAt: new Date(now + DAY) });
    s.put('letters', 'carol_bob', { from: 'carol', to: 'bob', count: 2 });
    s.put('conversations', 'bob_carol', { participants: ['bob', 'carol'], request: { from: 'carol', count: 2 } });
    expect(await letterReadsAsConnectionIn(ctx, 'bob', 'carol', 'carol')).toBe(true);

    expect(await failure(acceptInviteIn(ctx, 'alice', 'inv'))).toBe('not_found');
    const accepted = await acceptInviteIn(ctx, 'bob', 'inv');
    expect(accepted.connectionId).toBe('bob_carol');
    expect(accepted.notificationId).toBeTruthy();
    expect(s.get('notifications', accepted.notificationId!)).toMatchObject({ userId: 'carol', type: 'invite_accepted', payload: { inviteId: 'inv', fromUserId: 'bob', fromHandle: 'bob' } });
    expect(s.get('invites', 'inv')?.status).toBe('accepted');
    expect(s.get('connections', 'bob_carol')).toMatchObject({ userIds: ['bob', 'carol'], inviteId: 'inv' });
    expect(Object.keys(s.get('connectionOrigins', 'bob_carol')?.reasons as object)).toEqual(['invite_inv']);
    expect(s.get('letters', 'carol_bob')).toBeNull();
    expect(s.get('conversations', 'bob_carol')).not.toHaveProperty('request');

    expect(await acceptInviteIn(ctx, 'bob', 'inv')).toEqual({ connectionId: 'bob_carol', notificationId: null });
    expect(s.rows('notifications', (r) => r.type === 'invite_accepted')).toHaveLength(1);

    // An expired one is closed and refused.
    s.put('invites', 'old', { fromUserId: 'alice', toUserId: 'bob', status: 'pending', expiresAt: new Date(now - 1) });
    expect(await failure(acceptInviteIn(ctx, 'bob', 'old'))).toBe('conflict');
    expect(s.get('invites', 'old')?.status).toBe('expired');
  });

  it('a block refuses a named card and an invite, either way; an anonymous card is answered and reaches no one', async () => {
    const { ctx, now } = setup();
    const s = ctx.state;
    s.put('blocks', 'dave/bob', { blockedUid: 'bob' });
    expect(await failure(resonateWithIn(ctx, 'bob', 'daves', 'reply'))).toBe('blocked');
    expect(s.get('cards', 'reply')).not.toHaveProperty('referenceCardId');

    const anon = await resonateWithIn(ctx, 'bob', 'davesAnon', 'reply');
    expect(anon).toMatchObject({ changed: true, notificationId: null });
    expect(s.get('connections', 'bob_dave')).toBeNull();
    expect(s.rows('notifications')).toHaveLength(0);

    s.put('invites', 'inv', { fromUserId: 'dave', toUserId: 'bob', status: 'pending', expiresAt: new Date(now + DAY) });
    expect(await failure(acceptInviteIn(ctx, 'bob', 'inv'))).toBe('blocked');
    expect(s.get('invites', 'inv')?.status).toBe('pending');
    expect(s.get('connections', 'bob_dave')).toBeNull();
    // Their block of the viewer: no letter reads as a connection.
    expect(await letterReadsAsConnectionIn(ctx, 'bob', 'dave', 'dave')).toBe(false);
  });
});
