import { describe, expect, it, vi } from 'vitest';
import { ApiFailure } from '@/lib/api/v1/http';
import { createPreviewMemo, type PreviewFetch } from '@/lib/links/pagePreview';
import type { SafeFetchResult } from '@/lib/links/safeFetch';
import { memoryCtx } from '@/server/infra/memory/ctx';
import type { RateLimiter } from '@/server/ports/rateLimit';
import { unfurlCardLinksIn, unfurlMessageIn } from './links';
import { assignSlugIn } from './slugs';

// The link previews and a card's slug as services on the memory context: no
// Firestore, no network — the same rules the Firestore suites hold
// (src/lib/links/{cardLinks,preview}.test.ts with a fake Admin SDK,
// test/emulator/linkPreview, apiV1Publish, apiV1Edits on the emulator).

const page = (url: string, title: string): SafeFetchResult => ({
  url,
  status: 200,
  contentType: 'text/html',
  charset: 'utf-8',
  body: Buffer.from(`<head><meta property="og:title" content="${title}"><meta property="og:site_name" content="Example"></head>`),
  truncated: false,
});

function sites() {
  const asked: string[] = [];
  const fetch = vi.fn<PreviewFetch>(async (url) => {
    asked.push(url);
    return page(url, `Title of ${new URL(url).pathname}`);
  });
  return { fetch, asked };
}

function limiter(room: number) {
  const spent: { uid: string; bucket: string; weight?: number }[] = [];
  const limits: RateLimiter = {
    async spend(uid, bucket, weight) {
      if ((weight ?? 1) > room) throw new ApiFailure('rate_limited', 'Too many requests');
      room -= weight ?? 1;
      spent.push({ uid, bucket, weight });
    },
    spendAll: async () => {},
    limited: async () => null,
  };
  return { limits, spent };
}

const PUBLISHED = new Date('2026-11-01T00:00:00Z');
const preview = (path: string) => ({ url: `https://example.com/${path}`, title: `Title of /${path}`, siteName: 'Example' });

describe('unfurlCardLinksIn (memory)', () => {
  it('keeps what is stored, fetches only new links on the author’s budget, and writes previews in reading order', async () => {
    const { limits, spent } = limiter(10);
    const ctx = memoryCtx({ limits });
    ctx.state.seed('cards', {
      c1: {
        authorId: 'alice',
        publishedAt: PUBLISHED,
        updatedAt: PUBLISHED,
        story: 'One\n\nhttps://example.com/b\n\nTwo\n\nhttps://example.com/a\n\nhttps://example.com/gone-from-story-not',
        linkPreviews: [preview('a')],
        linkPreviewsFor: ['https://example.com/a'],
      },
    });
    const { fetch, asked } = sites();
    const result = await unfurlCardLinksIn(ctx, 'c1', { fetch, memo: createPreviewMemo() });

    expect(asked).toEqual(['https://example.com/b', 'https://example.com/gone-from-story-not']);
    expect(spent).toEqual([{ uid: 'alice', bucket: 'unfurl', weight: 2 }]);
    expect(result).toEqual({ links: 3, fetched: 2, previews: 3, written: true, overBudget: false });
    const card = ctx.state.get('cards', 'c1')!;
    expect(card.linkPreviewsFor).toEqual(['https://example.com/b', 'https://example.com/a', 'https://example.com/gone-from-story-not']);
    expect((card.linkPreviews as { url: string }[]).map((p) => p.url)).toEqual(card.linkPreviewsFor);
    expect(card.updatedAt).toEqual(PUBLISHED); // a preview is not an edit

    // Again: nothing new to fetch, nothing changed, nothing written.
    const again = await unfurlCardLinksIn(ctx, 'c1', { fetch, memo: createPreviewMemo() });
    expect(again).toMatchObject({ fetched: 0, written: false, previews: 3 });
    expect(asked).toHaveLength(2);
  });

  it('leaves new links for later when the budget has no room, and drops previews of links no longer in the story', async () => {
    const { limits } = limiter(0);
    const ctx = memoryCtx({ limits });
    ctx.state.seed('cards', {
      c1: { authorId: 'alice', publishedAt: PUBLISHED, story: 'Just words now\n\nhttps://example.com/new', linkPreviews: [preview('old')], linkPreviewsFor: ['https://example.com/old'] },
      c2: { authorId: 'alice', publishedAt: PUBLISHED, story: 'No links', linkPreviews: [preview('old')], linkPreviewsFor: ['https://example.com/old'] },
    });
    const { fetch, asked } = sites();
    expect(await unfurlCardLinksIn(ctx, 'c1', { fetch, memo: createPreviewMemo() })).toEqual({ links: 1, fetched: 0, previews: 0, written: true, overBudget: true });
    expect(asked).toEqual([]);
    expect(ctx.state.get('cards', 'c1')).toMatchObject({ linkPreviews: [], linkPreviewsFor: ['https://example.com/new'] });
    expect(ctx.log.lines.map((l) => l.message)).toEqual(['[unfurl] card: over budget, links left for later:']);

    await unfurlCardLinksIn(ctx, 'c2', { fetch, memo: createPreviewMemo() });
    const c2 = ctx.state.get('cards', 'c2')!;
    expect('linkPreviews' in c2 || 'linkPreviewsFor' in c2).toBe(false);
  });

  it('leaves a draft, a card that is gone and an id that cannot be one alone; the backfill charges nothing', async () => {
    const ctx = memoryCtx(); // limits not wired: charging would throw
    ctx.state.seed('cards', {
      draft: { authorId: 'alice', story: 'https://example.com/x' },
      pub: { authorId: 'alice', publishedAt: '2026-11-01T00:00:00.000000Z', story: 'https://example.com/x' },
    });
    const { fetch } = sites();
    const nothing = { links: 0, fetched: 0, previews: 0, written: false, overBudget: false };
    expect(await unfurlCardLinksIn(ctx, 'draft', { fetch })).toEqual(nothing);
    expect(await unfurlCardLinksIn(ctx, 'none', { fetch })).toEqual(nothing);
    expect(await unfurlCardLinksIn(ctx, 'a/b', { fetch })).toEqual(nothing);
    expect(await unfurlCardLinksIn(ctx, 'pub', { fetch, charge: false, memo: createPreviewMemo() })).toMatchObject({ written: true, previews: 1 });
    expect(ctx.state.get('cards', 'draft')).toEqual({ authorId: 'alice', story: 'https://example.com/x' });
  });
});

describe('unfurlMessageIn (memory)', () => {
  it('writes the first link’s preview onto the message, once; never onto one unsent', async () => {
    const ctx = memoryCtx();
    const table = 'conversations/alice_bob/messages';
    ctx.state.seed(table, {
      m1: { senderId: 'alice', text: 'look https://example.com/song and https://example.com/other' },
      m2: { senderId: 'alice', text: 'https://example.com/song', unsentAt: PUBLISHED },
      m3: { senderId: 'alice', text: 'no link' },
    });
    const { fetch, asked } = sites();
    const memo = createPreviewMemo();
    expect(await unfurlMessageIn(ctx, 'alice_bob', 'm1', { fetch, memo })).toEqual(preview('song'));
    expect(ctx.state.get(table, 'm1')?.preview).toEqual(preview('song'));
    expect(await unfurlMessageIn(ctx, 'alice_bob', 'm1', { fetch, memo })).toBeNull();
    expect(await unfurlMessageIn(ctx, 'alice_bob', 'm2', { fetch, memo })).toBeNull();
    expect(ctx.state.get(table, 'm2')?.preview).toBeUndefined();
    expect(await unfurlMessageIn(ctx, 'alice_bob', 'm3', { fetch, memo })).toBeNull();
    expect(await unfurlMessageIn(ctx, 'alice_bob', 'gone', { fetch, memo })).toBeNull();
    expect(asked).toEqual(['https://example.com/song']); // m2 came from the memory
  });
});

describe('assignSlugIn (memory)', () => {
  it('names a card by its title, then with the handle, then a number, past cards and retired slugs; keeps a slug that still leads here', async () => {
    const ctx = memoryCtx();
    ctx.state.seed('users', { alice: { handle: 'Alice' } });
    ctx.state.seed('retiredSlugs', { 'a-quiet-night': { retiredAt: PUBLISHED } });
    ctx.state.seed('cards', {
      older: { authorId: 'bob', slug: 'a-quiet-night-alice', publishedAt: new Date('2026-01-01') },
      c1: { authorId: 'alice', thoughtCore: '雨後的夜', publishedAt: PUBLISHED },
      anon: { authorId: 'alice', thoughtCore: '匿名', anonymous: true, publishedAt: PUBLISHED },
    });
    expect(await assignSlugIn(ctx, 'c1', async () => 'a-quiet-night')).toBe('a-quiet-night-alice-2');
    expect(ctx.state.get('cards', 'c1')?.slug).toBe('a-quiet-night-alice-2');
    expect(await assignSlugIn(ctx, 'c1', async () => 'never-asked')).toBe('a-quiet-night-alice-2');

    // An anonymous card's URL never carries its author's handle.
    expect(await assignSlugIn(ctx, 'anon', async () => 'rain')).toBe('rain');

    // A card whose slug an older card holds gets a fresh one; a card gone meanwhile is not brought back.
    ctx.state.merge('cards', 'c1', { slug: 'a-quiet-night-alice' });
    expect(await assignSlugIn(ctx, 'c1', async () => 'after-rain')).toBe('after-rain');
    expect(await assignSlugIn(ctx, 'gone', async () => 'x', { thoughtCore: 'x', authorId: 'alice' })).toBe('x');
    expect(ctx.state.get('cards', 'gone')).toBeNull();
  });
});
