import { afterEach, describe, expect, it, vi } from 'vitest';
import { coverThumbOf, coverUrlOf, toAuthor } from '@/lib/api/v1/present';
import { memoryMediaUrls } from '@/server/infra/env/media';
import { memoryCtx } from '@/server/infra/memory/ctx';
import { getMe } from './cardsRead';
import { applyCardEditIn } from './edits';
import { updateProfileIn } from './profile';

// ADR 0005 / plan §3.8: the server keeps a picture's storage key beside its
// URL wherever it writes one (a profile photo: `avatarKey`; a cover:
// `media.key`), and answers build the URL from the key on the current base —
// so a storage move is a DNS change, and documents need no rewrite.

const NOW = 'https://img.resonance.channel';
const BEFORE = 'https://pub-0123.r2.dev';
const KEY = 'image/2026-11/0b9c6a2e-1f43-4c55-9d8e-2a1c3b4d5e6f.webp';

afterEach(() => vi.unstubAllEnvs());

describe('a profile photo (users.avatarKey)', () => {
  const make = () => {
    const ctx = memoryCtx({ media: memoryMediaUrls(NOW, [BEFORE]) });
    ctx.state.seed('users', { ann: { handle: 'ann', initials: 'AN', accentColor: 'x' } });
    return ctx;
  };

  it('keeps the key beside the URL, by key or by URL — and none for a URL that is not that key on the current base', async () => {
    const ctx = make();
    await updateProfileIn(ctx, 'ann', { avatarKey: KEY });
    expect(ctx.state.dump().users.ann).toMatchObject({ avatarUrl: `${NOW}/${KEY}`, avatarKey: KEY });
    await updateProfileIn(ctx, 'ann', { avatarUrl: `${NOW}/image/2026-11/b.webp` });
    expect(ctx.state.dump().users.ann).toMatchObject({ avatarUrl: `${NOW}/image/2026-11/b.webp`, avatarKey: 'image/2026-11/b.webp' });
    // A photo still on the former base mid-move: no key (the backfill gives it one), and the earlier key gone with its photo.
    await updateProfileIn(ctx, 'ann', { avatarUrl: `${BEFORE}/${KEY}` });
    expect(ctx.state.dump().users.ann.avatarUrl).toBe(`${BEFORE}/${KEY}`);
    expect('avatarKey' in ctx.state.dump().users.ann).toBe(false);
    // Changing something else leaves the photo and its key alone.
    await updateProfileIn(ctx, 'ann', { avatarKey: KEY });
    await updateProfileIn(ctx, 'ann', { bio: 'hi' });
    expect(ctx.state.dump().users.ann).toMatchObject({ avatarKey: KEY, bio: 'hi' });
  });

  it('is answered from its key on the current base once the storage moved (GET /me, every byline)', async () => {
    const ctx = memoryCtx({ media: memoryMediaUrls(NOW, [BEFORE]) });
    ctx.state.seed('users', { ann: { handle: 'ann', avatarUrl: `${BEFORE}/${KEY}`, avatarKey: KEY } });
    expect((await getMe(ctx, 'ann')).avatarUrl).toBe(`${NOW}/${KEY}`);
    vi.stubEnv('MEDIA_PUBLIC_BASE', NOW);
    expect(toAuthor('ann', { handle: 'ann', avatarUrl: `${BEFORE}/${KEY}`, avatarKey: KEY }).avatarUrl).toBe(`${NOW}/${KEY}`);
    // An older document (no key), or an older client that changed only the URL: the URL as stored.
    expect(toAuthor('ann', { handle: 'ann', avatarUrl: `${BEFORE}/${KEY}` }).avatarUrl).toBe(`${BEFORE}/${KEY}`);
    expect(toAuthor('ann', { handle: 'ann', avatarUrl: `${NOW}/image/2026-11/new.webp`, avatarKey: KEY }).avatarUrl).toBe(`${NOW}/image/2026-11/new.webp`);
    expect(toAuthor('ann', { handle: 'ann', avatarKey: KEY }).avatarUrl).toBeNull();
  });
});

describe('a cover (cards.media.key)', () => {
  it('applying a pending edit keeps its key, made again from its URL (never the buffer\'s)', async () => {
    const ctx = memoryCtx({ media: memoryMediaUrls(NOW, [BEFORE]) });
    const card = { authorId: 'ann', thoughtCore: 'A title', story: 'A story long enough to stand on its own.', tags: [], visibility: 'public', anonymous: false, publishedAt: new Date('2026-11-01T00:00:00Z'), slug: 'a-title' };
    ctx.state.seed('cards', { c1: card });
    ctx.state.seed('cards/c1/edits', { current: { ...card, media: { type: 'image', url: `${NOW}/${KEY}`, key: 'image/2026-01/stale.webp', label: 'rain' } } });
    await expect(applyCardEditIn(ctx, 'ann', 'c1')).resolves.toMatchObject({ applied: true });
    expect(ctx.state.dump().cards.c1.media).toEqual({ type: 'image', url: `${NOW}/${KEY}`, key: KEY, label: 'rain' });
  });

  it('is answered from its key on the current base, its list copy beside it', () => {
    const bases = [NOW, BEFORE];
    const moved = { type: 'image' as const, url: `${BEFORE}/${KEY}`, key: KEY, thumbUrl: `${BEFORE}/image/2026-11/0b9c6a2e-1f43-4c55-9d8e-2a1c3b4d5e6f-w960.webp` };
    expect(coverUrlOf(moved, bases)).toBe(`${NOW}/${KEY}`);
    expect(coverThumbOf(moved, bases)).toBe(`${NOW}/image/2026-11/0b9c6a2e-1f43-4c55-9d8e-2a1c3b4d5e6f-w960.webp`);
    // No key: exactly as before (the stored copy kept).
    const { key: _key, ...older } = moved;
    expect(coverUrlOf(older, bases)).toBe(older.url);
    expect(coverThumbOf(older, bases)).toBe(older.thumbUrl);
  });
});
