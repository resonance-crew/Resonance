import { describe, expect, it } from 'vitest';
import { describeObjectStoreContract, describePrivateObjectStoreContract } from '@/server/contract/objects.contract';
import { memoryMediaUrls } from '../env/media';
import { memoryCtx } from './ctx';
import { memoryObjectStore, memoryPrivateObjectStore } from './objects';

describeObjectStoreContract('memory', (pageKeys) => memoryObjectStore(memoryMediaUrls(), pageKeys));
describePrivateObjectStoreContract('memory', () => memoryPrivateObjectStore());

describe('memoryCtx buckets', () => {
  it('serves stored pictures at the context’s media base, and keeps the chat bucket apart', async () => {
    const ctx = memoryCtx({ media: memoryMediaUrls('https://cdn.test') });
    const stored = await ctx.objects.putObject('image/2026-11/a.webp', 'image/webp', new Uint8Array([1]));
    expect(stored.publicUrl).toBe('https://cdn.test/image/2026-11/a.webp');
    expect(ctx.media.keyOf(stored.publicUrl)).toBe('image/2026-11/a.webp');
    await ctx.chatObjects!.put('chat/2026-11/a.webp', new Uint8Array([2]), 'image/webp');
    expect(await ctx.objects.head('chat/2026-11/a.webp')).toBeNull();
  });
});
