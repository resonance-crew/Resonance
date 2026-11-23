import { describe, expect, it } from 'vitest';
import { ApiFailure } from '@/lib/api/v1/http';
import type { Bucket, RateLimiter } from '@/server/ports/rateLimit';
import { memoryCtx } from '@/server/infra/memory/ctx';
import { countCardReadIn } from './cardReads';
import { reportReadingIn } from './reading';
import { cardTapIn, listTapsIn, setTapIn } from './taps';

// The taps aggregate's services on the memory context — no Firestore at all:
// a tap turned on, asked again (nothing changes, nothing rings), taken back
// and on again (one ring ever); the blocks (a named card refused across one,
// an anonymous one tapped as without it, the author's side leaving the
// blocked out); a reading report kept once per session and day; a card's read
// counted once a reader and day, its budget spent only when counted.

const NOW = Date.parse('2026-11-19T10:00:00Z');
const HOUR = 3600_000;
const profile = (handle: string) => ({ handle, handleLower: handle, initials: handle.slice(0, 2).toUpperCase(), accentColor: 'oklch(90% 0.05 200)' });
const card = (authorId: string, extra: Record<string, unknown> = {}) => ({
  authorId,
  thoughtCore: 'A walk after the rain',
  story: 'words '.repeat(200),
  tags: [],
  visibility: 'public',
  anonymous: false,
  publishedAt: new Date(NOW - 24 * HOUR),
  trashedAt: null,
  readCount: 0,
  ...extra,
});

/** A budget of `room` per bucket, spent in memory. */
function limiter(room = 100): RateLimiter & { spent: Partial<Record<Bucket, number>> } {
  const spent: Partial<Record<Bucket, number>> = {};
  const spend = async (_uid: string, bucket: Bucket, weight = 1) => {
    if ((spent[bucket] ?? 0) + weight > room) throw new ApiFailure('rate_limited', 'Slow down.');
    spent[bucket] = (spent[bucket] ?? 0) + weight;
  };
  return {
    spent,
    spend,
    spendAll: async (uid, spends) => {
      for (const [bucket, weight] of spends) await spend(uid, bucket, weight);
    },
    limited: async () => null,
  };
}

/** bob wrote `walk` (named) and `masked` (anonymous); alice reads, connected to carol; bob blocked dan. */
function world(room?: number) {
  const limits = limiter(room);
  const ctx = memoryCtx({ limits });
  ctx.clock.set(NOW);
  ctx.state.seed('users', { alice: profile('alice'), bob: profile('bob'), carol: profile('carol'), dan: profile('dan'), nopen: { initials: 'NO' } });
  ctx.state.seed('cards', { walk: card('bob'), masked: card('bob', { anonymous: true }), draft: card('bob', { publishedAt: null }) });
  ctx.state.seed('connections', { alice_carol: { userIds: ['alice', 'carol'] } });
  ctx.state.seed('blocks', { 'bob/dan': {} });
  return { ctx, limits };
}

async function code(p: Promise<unknown>): Promise<string> {
  const e = await p.then(() => null, (err: unknown) => err);
  expect(e).toBeInstanceOf(ApiFailure);
  return (e as ApiFailure).code;
}

describe('the taps services on memory', () => {
  it('a tap on, on again (no change), off, on again: one ring ever, and the document kept', async () => {
    const { ctx } = world();
    expect(await setTapIn(ctx, 'alice', 'walk', true)).toEqual({ on: true, changed: true, ring: true });
    expect(ctx.state.get('resonanceTaps', 'walk_alice')).toEqual({ cardId: 'walk', userId: 'alice', on: true, at: new Date(NOW), rangAt: null });
    expect(await setTapIn(ctx, 'alice', 'walk', true)).toEqual({ on: true, changed: false, ring: false });

    // lib/push/tapBell rings the author and marks it.
    ctx.state.merge('resonanceTaps', 'walk_alice', { rangAt: new Date(NOW) });
    expect(await setTapIn(ctx, 'alice', 'walk', false)).toEqual({ on: false, changed: true, ring: false });
    expect(await setTapIn(ctx, 'alice', 'walk', false)).toEqual({ on: false, changed: false, ring: false });
    expect(ctx.state.get('resonanceTaps', 'walk_alice')).toMatchObject({ on: false, rangAt: new Date(NOW) });
    ctx.clock.advance(HOUR);
    expect(await setTapIn(ctx, 'alice', 'walk', true)).toEqual({ on: true, changed: true, ring: false });
    expect(ctx.state.get('resonanceTaps', 'walk_alice')).toMatchObject({ on: true, at: new Date(NOW + HOUR), rangAt: new Date(NOW) });
  });

  it('refuses in order: no card, a draft, their own, no pen name; a named card across a block, never an anonymous one', async () => {
    const { ctx } = world();
    expect(await code(setTapIn(ctx, 'alice', 'nothing', true))).toBe('not_found');
    expect(await code(setTapIn(ctx, 'alice', 'draft', true))).toBe('not_found');
    expect(await code(setTapIn(ctx, 'bob', 'walk', true))).toBe('invalid_request');
    expect(await code(setTapIn(ctx, 'nopen', 'walk', true))).toBe('forbidden');
    expect(await code(setTapIn(ctx, 'dan', 'walk', true))).toBe('blocked');
    expect(await setTapIn(ctx, 'dan', 'masked', true)).toMatchObject({ on: true, changed: true });
    // The budget is awaited before anything is written.
    await expect(setTapIn(ctx, 'carol', 'walk', true, NOW, Promise.reject(new ApiFailure('rate_limited', 'Slow down.')))).rejects.toBeInstanceOf(ApiFailure);
    expect(ctx.state.get('resonanceTaps', 'walk_carol')).toBeNull();
  });

  it("who resonated: a reader sees themselves then everyone (an anonymous card never turning on its author's blocks); the author everyone but across a block", async () => {
    const { ctx } = world();
    await setTapIn(ctx, 'carol', 'masked', true);
    ctx.clock.advance(1000);
    await setTapIn(ctx, 'dan', 'masked', true);
    ctx.clock.advance(1000);
    await setTapIn(ctx, 'alice', 'masked', true);

    const asAlice = await cardTapIn(ctx, 'alice', (await ctx.data.taps.visibleCard('alice', 'masked'))!, { pass: false });
    expect(asAlice).toMatchObject({ mine: true, more: false, mayNote: true });
    expect(asAlice!.faces.map((f) => f.handle)).toEqual(['alice', 'dan', 'carol']);

    const list = await listTapsIn(ctx, 'bob', 'masked');
    expect(list.people.map((p) => p.author.handle)).toEqual(['alice', 'carol']);
    expect(list.people.every((p) => p.note === null)).toBe(true);
    expect(list.nextPageToken).toBeNull();
    expect(await cardTapIn(ctx, 'alice', (await ctx.data.taps.visibleCard('alice', 'masked'))!, { pass: true })).toBeNull();
  });

  it('a reading report: a session counted once however often it reports, at most once a day in days', async () => {
    const { ctx, limits } = world();
    const report = { session: 's1', activeSeconds: 30, progress: 0.4, reachedEnd: false };
    expect(await reportReadingIn(ctx, 'alice', 'walk', report)).toBe(true);
    expect(await reportReadingIn(ctx, 'alice', 'walk', { ...report, activeSeconds: 50, progress: 0.6 })).toBe(true);
    expect(await reportReadingIn(ctx, 'alice', 'walk', report)).toBe(true);
    const row = ctx.state.get('readerSignals', 'alice_walk')!;
    expect(row).toMatchObject({ userId: 'alice', cardId: 'walk', activeSeconds: 50, maxProgress: 0.6, days: ['2026-11-19'], reportsToday: 3 });
    expect(row.sessions).toHaveLength(1);
    expect(limits.spent.readReport).toBe(3);

    // Its author, a draft, a named card across a block: nothing kept, nothing spent.
    expect(await reportReadingIn(ctx, 'bob', 'walk', report)).toBe(false);
    expect(await reportReadingIn(ctx, 'alice', 'draft', report)).toBe(false);
    expect(await reportReadingIn(ctx, 'dan', 'walk', report)).toBe(false);
    expect(await reportReadingIn(ctx, 'dan', 'masked', report)).toBe(true);
    expect(limits.spent.readReport).toBe(4);
  });

  it("a card's read counted once a reader and day, never its author's, the budget spent only when counted", async () => {
    const { ctx, limits } = world();
    expect(await countCardReadIn(ctx, 'alice', 'walk')).toBe(true);
    expect(await countCardReadIn(ctx, 'alice', 'walk')).toBe(false);
    expect(await countCardReadIn(ctx, 'bob', 'walk')).toBe(false);
    expect(await countCardReadIn(ctx, 'dan', 'walk')).toBe(false);
    expect(await countCardReadIn(ctx, 'carol', 'walk')).toBe(true);
    expect(ctx.state.get('cards', 'walk')!.readCount).toBe(2);
    expect(limits.spent.read).toBe(2);
    expect(ctx.state.get('cardReads', 'alice_walk')).toEqual({ userId: 'alice', cardId: 'walk', day: '2026-11-19', expireAt: new Date('2026-11-21T00:00:00Z') });

    ctx.clock.advance(24 * HOUR);
    expect(await countCardReadIn(ctx, 'alice', 'walk')).toBe(true);
    expect(ctx.state.get('cards', 'walk')!.readCount).toBe(3);

    // Over budget: uncounted, quietly.
    const tight = world(0);
    expect(await countCardReadIn(tight.ctx, 'alice', 'walk')).toBe(false);
    expect(tight.ctx.state.get('cards', 'walk')!.readCount).toBe(0);
  });
});
