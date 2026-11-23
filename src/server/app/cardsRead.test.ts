import { describe, expect, it } from 'vitest';
import { ApiFailure } from '@/lib/api/v1/http';
import { memoryCtx } from '@/server/infra/memory/ctx';
import { getCardDetail, getCardsByKeys, getFeed, getMe, getProfile, getPublicAuthorCards, getPublicResonances, readCardForPage } from './cardsRead';

// The cards read side as a service on the ports, with no database at all (memoryCtx): what the emulator suites
// assert through the legacy facades (apiV1Reads, anonymousBlocks, cardPage), here on plain rows.

const at = (iso: string) => new Date(iso);
const card = (authorId: string, published: string | null, extra: Record<string, unknown> = {}) => ({
  authorId,
  thoughtCore: `A card, ${published ?? "a draft"}`,
  story: "What someone wrote, long enough to be a story.",
  tags: [],
  visibility: 'public',
  anonymous: false,
  publishedAt: published ? at(published) : null,
  ...extra,
});

function world() {
  const ctx = memoryCtx();
  ctx.state.seed('users', {
    alice: { handle: 'alice', handleLower: 'alice', initials: 'AL', accentColor: 'x', joinedAt: at('2026-01-01T00:00:00Z') },
    bob: { handle: 'bob', handleLower: 'bob', initials: 'BO', accentColor: 'y', bio: 'bob writes', joinedAt: at('2026-02-01T00:00:00Z') },
    carol: { handle: 'carol', handleLower: 'carol', initials: 'CA', accentColor: 'z' },
    dave: { handle: 'dave', handleLower: 'dave', initials: 'DA', accentColor: 'w' },
  });
  ctx.state.seed('handles', { alice: { uid: 'alice' }, bob: { uid: 'bob' } });
  ctx.state.seed('cards', {
    // Two published in the same millisecond: a page boundary between them must skip neither.
    same1: card('alice', '2026-11-20T03:00:00.500Z'),
    same2: card('alice', '2026-11-20T03:00:00.500Z'),
    bobNamed: card('bob', '2026-11-20T02:00:00Z'),
    anon1: card('bob', '2026-11-20T04:00:00Z', { anonymous: true, slug: 'bobs-secret-walk' }),
    carolConn: card('carol', '2026-11-20T01:00:00Z', { visibility: 'connections' }),
    draft: card('alice', null),
  });
  // Dave blocked bob: bob's named cards leave dave's lists; his anonymous card never does (it would name him).
  ctx.state.put('users/dave/blocks', 'bob', { blockedUid: 'bob' });
  return ctx;
}

describe('the cards read side on memoryCtx', () => {
  it('pages the feed with its token: page 2 resumes after page 1, the same-millisecond pair both there', async () => {
    const ctx = world();
    const first = await getFeed(ctx, null, 2);
    expect(first.cards.map((c) => c.id)).toEqual(['anon1', 'same2']);
    expect(first.nextPageToken).toEqual(expect.any(String));
    const second = await getFeed(ctx, null, 2, { pageToken: first.nextPageToken! });
    expect(second.cards.map((c) => c.id)).toEqual(['same1', 'bobNamed']);
    const third = await getFeed(ctx, null, 2, { pageToken: second.nextPageToken! });
    expect(third.cards).toEqual([]);
    expect(third.nextPageToken).toBeNull();
  });

  it('presents an anonymous card without its author, to everyone — its slug leads nowhere but its id does', async () => {
    const ctx = world();
    const feed = await getFeed(ctx, 'alice', 10);
    const anon = feed.cards.find((c) => c.id === 'anon1')!;
    expect(anon.author).toBeNull();
    expect(anon.slug).toBeNull();
    const detail = await getCardDetail(ctx, 'alice', 'anon1');
    expect(detail.card.author).toBeNull();
    expect(detail.isOwner).toBe(false);
    expect(JSON.stringify(detail)).not.toMatch(/bob|"BO"/i);
    const byslug = await getCardDetail(ctx, 'alice', 'bobs-secret-walk').catch((e: unknown) => e);
    expect(byslug).toBeInstanceOf(ApiFailure);
    expect((await readCardForPage(ctx, 'bobs-secret-walk')).id).toBeNull();
    expect((await readCardForPage(ctx, 'anon1')).author).toBeNull();
    // Its author reads it as theirs — and even then its page reads no profile for it (the card box is where they see it
    // under their name).
    const own = await getCardDetail(ctx, 'bob', 'anon1');
    expect(own.isOwner).toBe(true);
    expect(own.card.author).toBeNull();
  });

  it('a block hides the blocked person’s named cards, never their anonymous one', async () => {
    const ctx = world();
    const feed = await getFeed(ctx, 'dave', 10);
    expect(feed.cards.map((c) => c.id)).toEqual(['anon1', 'same2', 'same1']);
    const keyed = await getCardsByKeys(ctx, 'dave', ['bobNamed', 'anon1', 'same1']);
    expect(keyed.cards.map((c) => c.id)).toEqual(['anon1', 'same1']);
    const profile = await getProfile(ctx, 'dave', 'bob', { include: new Set(['cards']) });
    expect(profile.isBlocked).toBe(true);
    expect(profile.cardCount).toBe(0);
    expect(profile.cards?.cards).toEqual([]);
  });

  it('keeps a connections-only card from strangers and shows it to a connection', async () => {
    const ctx = world();
    await expect(getCardDetail(ctx, 'alice', 'carolConn')).rejects.toBeInstanceOf(ApiFailure);
    ctx.state.put('connections', 'alice_carol', { users: ['alice', 'carol'] });
    expect((await getCardDetail(ctx, 'alice', 'carolConn')).card.author?.handle).toBe('carol');
  });

  it('answers a profile and the signed-in account from plain rows', async () => {
    const ctx = world();
    const profile = await getProfile(ctx, 'alice', 'BOB', { include: new Set(['cards']) });
    expect(profile).toMatchObject({ bio: 'bob writes', joinedAt: '2026-02-01T00:00:00.000Z', cardCount: 1, isSelf: false, isBlocked: false });
    // The profile's page never holds the anonymous card (its count neither).
    expect(profile.cards?.cards.map((c) => c.id)).toEqual(['bobNamed']);
    expect(await getMe(ctx, 'bob')).toMatchObject({ id: 'bob', handle: 'bob', bio: 'bob writes', deletion: null });
    await expect(getMe(ctx, 'nobody')).rejects.toBeInstanceOf(ApiFailure);
  });
});

// BE-9: a signed-out profile and a signed-out card page read their lists through the rules — 40 and 30 whole cards
// with their stories, for every visitor. The server answers them as summaries now (the CDN keeps them a minute):
// the same cards the rules' queries gave, never an anonymous one, never a story.
describe('the signed-out lists, from the server', () => {
  it("answers a person's named public cards, newest first — never an anonymous or a private one, never a story", async () => {
    const ctx = world();
    ctx.state.put('cards', 'bobPrivate', card('bob', '2026-11-20T05:00:00Z', { visibility: 'private' }));
    const body = await getPublicAuthorCards(ctx, 'bob');
    expect(body!.cards.map((c) => c.id)).toEqual(['bobNamed']);
    expect(body!.cards[0].author?.handle).toBe('bob');
    for (const c of body!.cards) expect(c).not.toHaveProperty('story');
    expect(await getPublicAuthorCards(ctx, 'nobody')).toBeNull();
  });

  it('answers the named public cards answering a card — not an anonymous answer — and nothing for a card no one signed out may read', async () => {
    const ctx = world();
    ctx.state.put('cards', 'reply1', card('alice', '2026-11-21T01:00:00Z', { referenceCardId: 'bobNamed' }));
    ctx.state.put('cards', 'reply2', card('carol', '2026-11-21T02:00:00Z', { referenceCardId: 'bobNamed', anonymous: true }));
    ctx.state.put('cards', 'reply3', card('dave', '2026-11-21T03:00:00Z', { referenceCardId: 'carolConn' }));
    const body = await getPublicResonances(ctx, 'bobNamed');
    expect(body!.cards.map((c) => c.id)).toEqual(['reply1']);
    for (const c of body!.cards) expect(c).not.toHaveProperty('story');
    expect(JSON.stringify(body)).not.toContain('carol');
    expect(await getPublicResonances(ctx, 'carolConn')).toBeNull();
  });
});
