import { afterAll, describe, expect, it } from 'vitest';
import { ApiFailure } from '@/lib/api/v1/http';
import type { ServerCtx } from '@/server/ctx';
import { pairKey } from '@/server/domain/graph';
import { memoryCtx } from '@/server/infra/memory/ctx';
import { withPostgres } from '@/server/infra/postgres/ctx';
import { lazyPgTestDb, PG_SKIP_REASON, PG_TEST_URL } from '@/server/infra/postgres/testing';
import { shadowRead } from './shadow';
import { listBlocksIn, listConnectionsIn } from './social';
import { cardTapIn, listTapsIn } from './taps';

// anonymousBlocks (test/emulator/anonymousBlocks.emulator.test.ts) as a
// parity probe, plan section 4.4: the same rows on memory and on PostgreSQL,
// then the reads a block changes — who tapped a named and an anonymous card,
// as their author and as a reader, the blocks and connections lists — with
// and without each block. Both backends answer exactly alike, a block hides
// people and named cards and never an anonymous card, and the shadow read
// over PostgreSQL logs no difference. Skipped without PG_TEST_URL.

const pg = lazyPgTestDb();
afterAll(() => pg.close());

const AT = new Date('2026-11-20T10:00:00Z');
const person = (handle: string) => ({ handle, handleLower: handle, initials: handle.slice(0, 2).toUpperCase(), accentColor: 'oklch(90% 0.05 200)' });

type Put = (table: string, id: string, row: Record<string, unknown>) => Promise<void>;
type Block = [string, string];

async function seed(put: Put, blocks: readonly Block[]) {
  for (const u of ['author', 'reader', 'friend', 'stranger']) await put('users', u, person(u));
  for (const [id, anonymous] of [['named', false], ['anon', true]] as const) {
    await put('cards', id, { authorId: 'author', thoughtCore: 'A walk', story: 'words '.repeat(50), tags: [], visibility: 'public', anonymous, publishedAt: AT, trashedAt: null, readCount: 0 });
    let n = 0;
    for (const t of ['friend', 'stranger', 'reader']) {
      await put('resonanceTaps', `${id}_${t}`, { cardId: id, userId: t, on: true, at: new Date(AT.getTime() + ++n * 1000), rangAt: null });
    }
  }
  await put('connections', pairKey('reader', 'friend'), { userIds: ['friend', 'reader'], establishedAt: AT });
  await put('connections', pairKey('author', 'friend'), { userIds: ['author', 'friend'], establishedAt: AT });
  await put('notes', 'n1', { cardId: 'named', fromUserId: 'friend', toUserId: 'author', text: 'Thank you for this', createdAt: AT });
  for (const [a, b] of blocks) await put('blocks', `${a}/${b}`, { blockedUid: b, createdAt: AT });
}

/** What each read answers (a refusal as its code). */
async function reads(ctx: ServerCtx) {
  const settle = async <T>(p: Promise<T>) => p.catch((e: unknown) => (e instanceof ApiFailure ? { refused: e.code } : Promise.reject(e)));
  const out: Record<string, unknown> = {};
  for (const card of ['named', 'anon']) {
    for (const viewer of ['author', 'reader', 'friend']) {
      out[`${card}.${viewer}.list`] = await settle(listTapsIn(ctx, viewer, card));
      out[`${card}.${viewer}.tap`] = await settle(
        ctx.data.taps.visibleCard(viewer, card).then((c) => cardTapIn(ctx, viewer, c, { pass: false })),
      );
    }
  }
  for (const u of ['author', 'reader']) {
    out[`${u}.blocks`] = await listBlocksIn(ctx, u);
    out[`${u}.connections`] = await listConnectionsIn(ctx, u);
  }
  return out;
}

const VARIANTS: [string, Block[]][] = [
  ['no block', []],
  ['the reader blocked the author', [['reader', 'author']]],
  ['the author blocked the reader', [['author', 'reader']]],
  ['the author blocked a tapper', [['author', 'stranger']]],
];

describe.skipIf(!PG_TEST_URL)(`anonymous cards and blocks, memory vs PostgreSQL${PG_TEST_URL ? '' : ` — ${PG_SKIP_REASON}`}`, () => {
  const answers = new Map<string, Record<string, unknown>>();

  for (const [name, blocks] of VARIANTS) {
    it(`answers alike on both backends: ${name}`, async () => {
      const db = await pg.get();
      await db.reset();
      const mem = memoryCtx();
      await seed(async (t, id, row) => mem.state.put(t === 'blocks' ? `users/${id.split('/')[0]}/blocks` : t, t === 'blocks' ? id.split('/')[1] : id, row), blocks);
      // The memory repos read a block from both the users/{uid}/blocks rows and their `blocks` mirror.
      for (const [a, b] of blocks) mem.state.put('blocks', `${a}/${b}`, { blockedUid: b, createdAt: AT });
      await seed((t, id, row) => db.docs.put(t, id, row), blocks);
      const pgCtx = withPostgres(memoryCtx(), db.pool);

      const [onMemory, onPostgres] = [await reads(mem), await reads(pgCtx)];
      expect(onPostgres).toEqual(onMemory);
      answers.set(name, onMemory);

      // The shadow read of each list, PostgreSQL behind memory, finds nothing to log.
      for (const viewer of ['author', 'reader']) {
        const body = await listTapsIn(mem, viewer, 'anon');
        shadowRead(mem, async () => pgCtx, 'GET /api/v1/cards/{id}/taps', `${viewer}:anon`, body, (s) => listTapsIn(s, viewer, 'anon'));
      }
      await mem.later.flush();
      expect(mem.log.lines.filter((l) => l.message.startsWith('[parity]'))).toEqual([]);
    });
  }

  it('a block between reader and author hides the named card, never the anonymous one', () => {
    const none = answers.get('no block')!;
    for (const name of ['the reader blocked the author', 'the author blocked the reader']) {
      const blocked = answers.get(name)!;
      expect(blocked['named.reader.list']).toEqual({ refused: 'not_found' });
      expect(blocked['anon.reader.list']).toEqual(none['anon.reader.list']);
      expect(blocked['anon.reader.tap']).toEqual(none['anon.reader.tap']);
    }
    // The author's own view leaves out whom they blocked.
    const people = (v: unknown) => (v as { people: { author: { handle: string } }[] }).people.map((p) => p.author.handle);
    expect(people(none['named.author.list'])).toContain('stranger');
    expect(people(answers.get('the author blocked a tapper')!['named.author.list'])).not.toContain('stranger');
  });
});
