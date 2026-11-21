import { beforeEach, describe, expect, it, vi } from 'vitest';
import { offlinePassages, passagesHash, PASSAGES_TRIES_MAX } from '@/lib/cards/tapPassages';
import { memoryCtx, type MemoryCtx } from '@/server/infra/memory/ctx';
import { PASSAGE_STORY, PASSAGE_TITLE } from '../../../test/emulator/tapPassageStory';
import { makeTapPassagesIn, type MakeTapPassagesDeps } from './tapPassages';
import { cardTapIn, listTapsIn, setTapIn, setTapPassageIn } from './taps';

// Round 27's tap passages on a memory context — no Firestore, no model: the
// pick made once for a story (its hash `of`), never asked again for the same
// words, a failure counted and the card marked owed, the passages removed
// from a card that stops offering them; and a reader's pick, which only a
// passage the card offers now may be, shown to the author's list and to the
// reader's own row, and cleared when the tap is taken back. The same as the
// emulator suites (tapPassagesMake, apiV1TapPassages) ask of Firestore.

const T0 = new Date('2026-11-21T10:00:00Z');

let ctx: MemoryCtx;
const card = (extra: Record<string, unknown> = {}) => ({
  authorId: 'alice',
  thoughtCore: PASSAGE_TITLE,
  story: PASSAGE_STORY,
  tags: [],
  visibility: 'public',
  anonymous: false,
  publishedAt: T0,
  updatedAt: T0,
  slug: 'one-city',
  ...extra,
});

const items = () => offlinePassages(PASSAGE_STORY, { title: PASSAGE_TITLE });
const deps = (over: Partial<MakeTapPassagesDeps> = {}): MakeTapPassagesDeps => ({
  pick: vi.fn(async () => ({ passages: items().map((i) => i.text), model: 'test-model' })),
  refused: () => false,
  offline: false,
  ...over,
});
const stored = (id: string) => ctx.state.get('cards', id)?.tapPassages as { of?: string; items?: unknown[]; model?: string; failed?: { tries: number } } | undefined;

beforeEach(() => {
  ctx = memoryCtx();
  ctx.state.seed('users', { alice: { handle: 'alice', penName: 'Alice' }, bob: { handle: 'bob', penName: 'Bob' } });
  ctx.state.seed('cards', { c1: card() });
});

describe('makeTapPassagesIn (memory)', () => {
  it('made once for the story, unchanged after, without a second call', async () => {
    const d = deps();
    expect(await makeTapPassagesIn(ctx, 'c1', d)).toBe('made');
    expect(stored('c1')).toMatchObject({ of: passagesHash(PASSAGE_STORY), model: 'test-model' });
    expect(stored('c1')!.items!.length).toBeGreaterThanOrEqual(2);
    expect(await makeTapPassagesIn(ctx, 'c1', d)).toBe('unchanged');
    expect(d.pick).toHaveBeenCalledTimes(1);
  });

  it('a failure is counted for the story and marks the card owed; given up after PASSAGES_TRIES_MAX', async () => {
    const d = deps({ pick: vi.fn(async () => Promise.reject(new Error('503'))) });
    for (let i = 1; i <= PASSAGES_TRIES_MAX; i++) {
      expect(await makeTapPassagesIn(ctx, 'c1', d)).toBe('failed');
      expect(stored('c1')!.failed).toMatchObject({ tries: i });
    }
    expect(ctx.state.get('cards', 'c1')!.indexPendingAt).toBeInstanceOf(Date);
    expect(await makeTapPassagesIn(ctx, 'c1', d)).toBe('given-up');
  });

  it('over budget: nothing asked, owed; a card that stops offering them has them removed', async () => {
    const d = deps({ mayCall: async () => false });
    expect(await makeTapPassagesIn(ctx, 'c1', d)).toBe('over-budget');
    expect(d.pick).not.toHaveBeenCalled();
    expect(ctx.state.get('cards', 'c1')!.indexPendingAt).toBeInstanceOf(Date);
    expect(await makeTapPassagesIn(ctx, 'c1', deps())).toBe('made');
    ctx.state.merge('cards', 'c1', { publishedAt: null });
    expect(await makeTapPassagesIn(ctx, 'c1', deps())).toBe('removed');
    expect(stored('c1')).toBeUndefined();
  });
});

describe('a reader’s pick (memory)', () => {
  beforeEach(async () => {
    await makeTapPassagesIn(ctx, 'c1', deps());
  });
  const passages = () => (stored('c1')!.items as { id: string; text: string }[]);

  it('only after resonating, only a passage the card offers; shown to the author and on the reader’s own row; cleared by taking it back', async () => {
    await expect(setTapPassageIn(ctx, 'bob', 'c1', passages()[0].id)).rejects.toMatchObject({ code: 'conflict' });
    await setTapIn(ctx, 'bob', 'c1', true, T0.getTime());
    await expect(setTapPassageIn(ctx, 'bob', 'c1', 'nope')).rejects.toMatchObject({ code: 'invalid_request' });
    expect(await setTapPassageIn(ctx, 'bob', 'c1', passages()[1].id)).toEqual({ passage: passages()[1].id });

    const full = ctx.state.get('cards', 'c1')!;
    const tap = await cardTapIn(ctx, 'bob', { id: 'c1', ...full } as never, { pass: false });
    expect(tap).toMatchObject({ mine: true, passage: passages()[1].id });
    expect(tap!.passages!.map((p) => p.id)).toEqual(passages().map((p) => p.id));

    const author = await listTapsIn(ctx, 'alice', 'c1');
    expect(author.people.map((p) => p.passage)).toEqual([{ text: passages()[1].text }]);
    const own = await listTapsIn(ctx, 'bob', 'c1');
    expect(own.people.map((p) => p.passage)).toEqual([{ text: passages()[1].text }]);

    await setTapIn(ctx, 'bob', 'c1', false, T0.getTime() + 1000);
    await setTapIn(ctx, 'bob', 'c1', true, T0.getTime() + 2000);
    expect((await listTapsIn(ctx, 'alice', 'c1')).people.map((p) => p.passage)).toEqual([undefined]);
  });
});
