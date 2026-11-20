import { beforeEach, describe, expect, it, vi } from 'vitest';
import { summaryHash } from '@/lib/api/v1/summaryTranslations';
import { translationHash } from '@/lib/api/v1/translationHash';
import { memoryCtx, type MemoryCtx } from '@/server/infra/memory/ctx';
import { summarize } from '@/server/domain/summary';
import { backfillCardSummaries, makeSummaryTranslations } from './summary';
import { translateCard } from './translation';

// The summaries-and-translations services on a memory context — no
// Firestore, no model: a card's translated title and excerpt are made once
// for its words (the hash `of`), made again only when they change, removed
// when the card stops being public; a story's translation is kept for the
// next reader and asked of the model again only once the story changed; the
// summary backfill writes each due summary once and leaves current ones.

const T0 = new Date('2026-11-19T10:00:00Z');
const T1 = new Date('2026-11-19T11:00:00Z');
const TITLE = '外婆的醃梅子';
const STORY = '每年五月，外婆都會把青梅一顆顆擦乾，排在竹篩上曬太陽。';

let ctx: MemoryCtx;
const card = (extra: Record<string, unknown> = {}) => ({
  authorId: 'alice',
  thoughtCore: TITLE,
  story: STORY,
  tags: [],
  visibility: 'public',
  anonymous: false,
  publishedAt: T0,
  updatedAt: T0,
  slug: 'grandmas-plums',
  ...extra,
});

beforeEach(() => {
  ctx = memoryCtx();
  ctx.state.seed('users', { alice: { handle: 'alice' }, carol: { handle: 'carol' } });
  ctx.state.seed('cards', { pub1: card() });
});

describe('makeSummaryTranslations (memory)', () => {
  const translate = vi.fn(async ({ title, excerpt }: { title: string; excerpt: string }) => ({ en: { title: `EN ${title}`, excerpt: `EN ${excerpt}` } }));
  beforeEach(() => {
    translate.mockClear();
  });

  it('made once for the words as they are, unchanged after, made again when the title changes, removed when private', async () => {
    expect(await makeSummaryTranslations(ctx, 'pub1', { translate })).toBe('made');
    const of = summaryHash(TITLE, summarize(STORY).excerpt);
    expect(ctx.state.get('cards', 'pub1')?.summaryTranslations).toEqual({ of, en: { title: `EN ${TITLE}`, excerpt: `EN ${summarize(STORY).excerpt}` } });
    expect(ctx.state.get('cards', 'pub1')?.updatedAt).toEqual(T0);

    expect(await makeSummaryTranslations(ctx, 'pub1', { translate })).toBe('unchanged');
    expect(translate).toHaveBeenCalledTimes(1);

    ctx.state.merge('cards', 'pub1', { thoughtCore: '外婆的梅子' });
    expect(await makeSummaryTranslations(ctx, 'pub1', { translate })).toBe('made');
    expect(translate).toHaveBeenCalledTimes(2);
    expect((ctx.state.get('cards', 'pub1')?.summaryTranslations as { of: string }).of).toBe(summaryHash('外婆的梅子', summarize(STORY).excerpt));

    ctx.state.merge('cards', 'pub1', { visibility: 'private' });
    expect(await makeSummaryTranslations(ctx, 'pub1', { translate })).toBe('removed');
    expect(ctx.state.get('cards', 'pub1')).not.toHaveProperty('summaryTranslations');
    expect(await makeSummaryTranslations(ctx, 'pub1', { translate })).toBe('none');
    expect(await makeSummaryTranslations(ctx, 'gone', { translate })).toBe('not-found');
    expect(translate).toHaveBeenCalledTimes(2);
  });

  it('a stored summary while current is what is translated; offline and over budget ask no model; a save during the call wins', async () => {
    ctx.state.merge('cards', 'pub1', { excerpt: '曬太陽', readMinutes: 1, excerptAt: T0 });
    expect(await makeSummaryTranslations(ctx, 'pub1', { translate, offline: true })).toBe('offline');
    expect(await makeSummaryTranslations(ctx, 'pub1', { translate, mayCall: async () => false })).toBe('over-budget');
    expect(translate).not.toHaveBeenCalled();

    const slow = vi.fn(async (text: { title: string; excerpt: string }) => {
      expect(text).toEqual({ title: TITLE, excerpt: '曬太陽' });
      ctx.state.merge('cards', 'pub1', { thoughtCore: 'Changed meanwhile', updatedAt: T1 });
      return { en: { title: 'x', excerpt: 'y' } };
    });
    expect(await makeSummaryTranslations(ctx, 'pub1', { translate: slow })).toBe('moved');
    expect(ctx.state.get('cards', 'pub1')).not.toHaveProperty('summaryTranslations');
  });
});

describe('translateCard (memory)', () => {
  const translate = vi.fn(async ({ title, story }: { title: string; story: string }) => ({ title: `EN ${title}`, story: `EN ${story}` }));
  beforeEach(() => {
    translate.mockClear();
  });

  it('kept for the next reader, answered without the model; asked again once the story changed', async () => {
    const deps = { translate, model: () => 'test-model' };
    expect(await translateCard(ctx, 'carol', 'pub1', 'en', deps)).toEqual({ to: 'en', title: `EN ${TITLE}`, story: `EN ${STORY}` });
    expect(ctx.state.get('cards/pub1/translations', 'en')).toMatchObject({ hash: translationHash(TITLE, STORY), model: 'test-model', title: `EN ${TITLE}` });

    expect(await translateCard(ctx, 'carol', 'grandmas-plums', 'en', deps)).toEqual({ to: 'en', title: `EN ${TITLE}`, story: `EN ${STORY}` });
    expect(translate).toHaveBeenCalledTimes(1);

    ctx.state.merge('cards', 'pub1', { story: `${STORY}我總是蹲在旁邊看。` });
    await translateCard(ctx, 'carol', 'pub1', 'en', deps);
    expect(translate).toHaveBeenCalledTimes(2);
    expect(ctx.state.get('cards/pub1/translations', 'en')?.hash).toBe(translationHash(TITLE, `${STORY}我總是蹲在旁邊看。`));
  });

  it('with no model only a kept translation answers (503 otherwise); a private card is the missing one', async () => {
    await expect(translateCard(ctx, 'carol', 'pub1', 'en', { translate: null, model: () => 'm' })).rejects.toMatchObject({ status: 503 });
    ctx.state.put('cards/pub1/translations', 'en', { title: 'Kept', story: 'Kept story', hash: translationHash(TITLE, STORY) });
    expect(await translateCard(ctx, 'carol', 'pub1', 'en', { translate: null, model: () => 'm' })).toEqual({ to: 'en', title: 'Kept', story: 'Kept story' });

    ctx.state.merge('cards', 'pub1', { visibility: 'private' });
    await expect(translateCard(ctx, 'alice', 'pub1', 'en', { translate, model: () => 'm' })).rejects.toMatchObject({ code: 'not_found' });
    expect(translate).not.toHaveBeenCalled();
  });
});

describe('backfillCardSummaries (memory)', () => {
  it('a dry run writes nothing; a run writes each due summary once and leaves current ones alone', async () => {
    ctx.state.seed('cards', {
      cur: card({ excerpt: summarize(STORY).excerpt, readMinutes: summarize(STORY).readMinutes, excerptAt: T1 }),
      draft: card({ publishedAt: null }),
    });
    const dry = await backfillCardSummaries(ctx, { pageSize: 2 });
    expect(dry).toMatchObject({ scanned: 3, published: 2, current: 1, due: 1, written: 0, sample: ['pub1'] });
    expect(ctx.state.get('cards', 'pub1')).not.toHaveProperty('excerpt');

    const wet = await backfillCardSummaries(ctx, { pageSize: 2, write: true });
    expect(wet).toMatchObject({ due: 1, written: 1, changed: 0, failed: 0 });
    expect(ctx.state.get('cards', 'pub1')).toMatchObject(summarize(STORY));

    expect(await backfillCardSummaries(ctx, { write: true })).toMatchObject({ current: 2, due: 0, written: 0 });
  });
});
