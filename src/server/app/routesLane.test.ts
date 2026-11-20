import { describe, expect, it } from 'vitest';
import { coverThumbKey } from '@/lib/images/coverThumb';
import { memoryCtx } from '@/server/infra/memory/ctx';
import { holdAnonymousCardsIn, releaseHeldCardsIn } from './account';
import { storeOwnedIn, storeOwnedWithThumbIn } from './uploads';

// What the routes outside /api/v1 moved onto the context (任務 #3 Phase 1,
// routes lane), on the memory store: an account deletion holds the account's
// published anonymous cards in its trash and cancelling brings back those
// alone; /api/cards/tags reads an author's tag history; /api/upload and
// /api/generate-image keep a picture with its owner on record.

const story = 'The rain stopped and the street went on talking to itself for a while, softly.';
const at = new Date('2026-11-01T00:00:00Z');
const card = (extra: Record<string, unknown>) => ({
  authorId: 'alice',
  thoughtCore: 'A night',
  story,
  tags: [],
  visibility: 'public',
  anonymous: false,
  publishedAt: at,
  slug: null,
  ...extra,
});

describe('an account deletion’s held cards, on memory', () => {
  it('holds only the published anonymous cards out of the trash, and brings back only those', async () => {
    const ctx = memoryCtx();
    ctx.state.seed('users', { alice: { handle: 'alice', handleLower: 'alice', initials: 'AL' } });
    ctx.state.seed('cards', {
      anon: card({ anonymous: true }),
      named: card({}),
      draft: card({ anonymous: true, publishedAt: null }),
      binned: card({ anonymous: true, visibility: 'private', trashedAt: at, trashedFrom: { visibility: 'public' } }),
      hers: card({ authorId: 'bob', anonymous: true }),
    });

    expect(await ctx.data.cards.anonymousCardsToHold('alice')).toEqual(['anon']);
    const stale = await holdAnonymousCardsIn(ctx, 'alice');
    expect(stale).toContain('/card/anon');
    expect(ctx.state.get('cards', 'anon')).toMatchObject({ visibility: 'private', trashedFor: 'deletion' });
    expect(ctx.state.get('cards', 'named')).toMatchObject({ visibility: 'public' });
    expect(ctx.state.get('cards', 'hers')!.trashedAt ?? null).toBeNull();
    expect(ctx.state.get('cards', 'binned')!.trashedFor ?? null).toBeNull();

    expect(await ctx.data.cards.cardsHeldForDeletion('alice')).toEqual(['anon']);
    expect(await releaseHeldCardsIn(ctx, 'alice')).toContain('/card/anon');
    expect(ctx.state.get('cards', 'anon')).toMatchObject({ visibility: 'public', anonymous: true });
    expect(ctx.state.get('cards', 'anon')!.trashedAt ?? null).toBeNull();
    // The card its author put in the trash stays there.
    expect(ctx.state.get('cards', 'binned')!.trashedAt).toEqual(at);
    expect(await ctx.data.cards.cardsHeldForDeletion('alice')).toEqual([]);
  });
});

describe('an author’s tag history, on memory', () => {
  it('answers each of the author’s cards’ tags, strings only, up to the limit', async () => {
    const ctx = memoryCtx();
    ctx.state.seed('cards', { a: card({ tags: ['rain', 3, 'walk'] }), b: card({ tags: 'rain' }), c: card({ authorId: 'bob', tags: ['bob'] }) });
    expect((await ctx.data.cards.authorTagHistory('alice', 10)).sort()).toEqual([[], ['rain', 'walk']]);
    expect(await ctx.data.cards.authorTagHistory('alice', 1)).toHaveLength(1);
  });
});

describe('a picture kept with its owner on record, on memory', () => {
  const intent = { filename: 'upload.webp', contentType: 'image/webp', size: 3, ownerId: 'alice', kind: 'image' as const };

  it('stores the picture and its copy, both on record as the owner’s', async () => {
    const ctx = memoryCtx();
    const stored = await storeOwnedWithThumbIn(ctx, intent, new Uint8Array([1, 2, 3]), { contentType: 'image/webp', body: new Uint8Array([1]) });
    expect(stored.thumbUrl).toBeTruthy();
    expect((await ctx.data.conversations.uploadedKeys('alice')).sort()).toEqual([stored.key, coverThumbKey(stored.key)!].sort());
  });

  it('takes the file back out when its record fails', async () => {
    const ctx = memoryCtx();
    const deleted: string[] = [];
    const objects = { uploadObject: ctx.objects.uploadObject.bind(ctx.objects), deleteObject: async (key: string) => void deleted.push(key) };
    const data = {
      conversations: {
        ...ctx.data.conversations,
        recordUpload: async () => {
          throw new Error('down');
        },
      },
    };
    await expect(storeOwnedIn({ data, objects, clock: ctx.clock }, intent, new Uint8Array([1]))).rejects.toThrow('down');
    expect(deleted).toHaveLength(1);
  });
});
