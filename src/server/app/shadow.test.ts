import { afterEach, describe, expect, it, vi } from 'vitest';
import { memoryCtx, type MemoryCtx } from '@/server/infra/memory/ctx';
import { shadowFromEnv } from '@/server/infra/shadow';
import { differences, hashPrefix, normalise } from '@/server/domain/parity';
import { shadowRead } from './shadow';
import { listTapsIn } from './taps';

// Shadow reads (READ_BACKEND=shadow, off by default): the primary answers,
// the shadow recomputes after the response, and a difference is logged as
// field paths and a hash — never a value, never an id. Above all: an
// anonymous card's author never reaches the log, even when the two backends
// disagree exactly about who wrote it.

afterEach(() => vi.unstubAllEnvs());

/** Every logged line, its message and the rest it carried, as one string. */
const logged = (ctx: MemoryCtx) => ctx.log.lines.map((l) => [l.message, ...l.rest.map((r) => JSON.stringify(r))].join(' ')).join('\n');

describe('shadow reads', () => {
  it('are off unless READ_BACKEND=shadow and POSTGRES_URL are both set, and then schedule nothing', () => {
    expect(shadowFromEnv({})).toBeNull();
    expect(shadowFromEnv({ READ_BACKEND: 'shadow' })).toBeNull();
    expect(shadowFromEnv({ POSTGRES_URL: 'postgres://x' })).toBeNull();
    expect(shadowFromEnv({ READ_BACKEND: 'shadow', POSTGRES_URL: 'postgres://x' })).toBeTypeOf('function');
    const ctx = memoryCtx();
    shadowRead(ctx, shadowFromEnv({}), 'GET /x', 'k', { a: 1 }, async () => ({ a: 2 }));
    expect(ctx.later.pending).toEqual([]);
  });

  it("never logs an anonymous card's author, even when the two answers differ exactly there", async () => {
    const author = 'Zq8secretAuthorUid42xYw';
    const other = 'otherAuthorUid99';
    const primary: Record<string, unknown> = { card: { id: 'card1', anonymous: true, author: { id: author, handle: 'pen' } }, seenBy: { [author]: 1 }, people: [{ id: author }] };
    const shadowed = { card: { id: 'card1', anonymous: true, author: { id: other, handle: 'pen' } }, seenBy: { [other]: 1 }, people: [{ id: other }] };
    const ctx = memoryCtx();
    shadowRead(ctx, async () => memoryCtx(), 'GET /api/v1/cards/{id}', `viewer:card1`, primary, async () => shadowed);
    await ctx.later.flush();
    const text = logged(ctx);
    expect(text).toMatch(/^\[parity\] GET \/api\/v1\/cards\/\{id\} /);
    expect(text).toContain('card.author.id');
    expect(text).toContain('people[0].id');
    for (const secret of [author, other, 'viewer', 'card1', 'pen']) expect(text).not.toContain(secret);
    // A map keyed by a uid shows its key hashed.
    expect(text).toContain(`seenBy.#${hashPrefix(author, 8)}`);
    expect(text.endsWith(hashPrefix('viewer:card1'))).toBe(true);
  });

  it('logs nothing when the shadow answers the same, and only an error name when it fails', async () => {
    const ctx = memoryCtx();
    shadowRead(ctx, async () => memoryCtx(), 'GET /a', 'k', { at: new Date(5), list: [1] }, async () => ({ list: [1], at: new Date(5) }));
    await ctx.later.flush();
    expect(ctx.log.lines).toEqual([]);
    shadowRead(ctx, async () => memoryCtx(), 'GET /a', 'k', {}, async () => {
      throw new TypeError('no such author SECRETuid');
    });
    await ctx.later.flush();
    expect(logged(ctx)).toBe(`[parity] GET /a error:TypeError ${hashPrefix('k')}`);
  });

  it('compares a real read: who tapped a card, recomputed on a shadow that lost a tap', async () => {
    const at = new Date('2026-11-20T10:00:00Z');
    const seed = (ctx: MemoryCtx, tappers: string[]) => {
      ctx.state.put('cards', 'c1', { authorId: 'author1', visibility: 'public', anonymous: true, publishedAt: at, trashedAt: null });
      for (const t of ['tapperA', 'tapperB']) ctx.state.put('users', t, { handle: t, handleLower: t, initials: 'T', accentColor: 'oklch(90% 0.05 200)' });
      for (const t of tappers) ctx.state.put('resonanceTaps', `c1_${t}`, { cardId: 'c1', userId: t, on: true, at, rangAt: null });
    };
    const primary = memoryCtx();
    const shadow = memoryCtx();
    seed(primary, ['tapperA', 'tapperB']);
    seed(shadow, ['tapperA']);
    const body = await listTapsIn(primary, 'author1', 'c1');
    expect(body.people).toHaveLength(2);
    shadowRead(primary, async () => shadow, 'GET /api/v1/cards/{id}/taps', 'author1:c1', body, (s) => listTapsIn(s, 'author1', 'c1'));
    await primary.later.flush();
    const text = logged(primary);
    expect(text).toContain('people.length');
    for (const secret of ['author1', 'tapperA', 'tapperB', 'c1_']) expect(text).not.toContain(secret);
  });

  it('normalises key order and Dates, and lists paths up to its cap', () => {
    expect(normalise({ b: 1, a: new Date(0) })).toEqual({ a: '1970-01-01T00:00:00.000Z', b: 1 });
    expect(differences({ a: 1, b: [1, 2] }, { b: [1, 3], a: 1 })).toEqual(['b[1]']);
    expect(differences(Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`f${'x'.repeat(i)}`, i])), {})).toHaveLength(20);
  });
});
