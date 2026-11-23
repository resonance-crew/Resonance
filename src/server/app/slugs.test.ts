import { describe, expect, it, vi } from 'vitest';
import type { ServerCtx } from '@/server/ctx';
import { assignSlugIn } from './slugs';

// Round 32 §P6: naming a card waits only on what its answer needs — a free
// base is checked and written the moment it is in, the pen name asked for
// beside it and waited for only when the base is taken (assignSlug.test.ts
// and apiV1Publish.emulator.test.ts cover the rest against Firestore).

function ctxWith(infra: Partial<ServerCtx['data']['infra']>): ServerCtx {
  return { data: { infra } } as unknown as ServerCtx;
}

const card = { authorId: 'alice', thoughtCore: 'A quiet night', anonymous: false };

describe('assignSlugIn', () => {
  it('names a card whose base is free without waiting for its pen name', async () => {
    const setCardSlug = vi.fn(async () => true);
    const getUserHandle = vi.fn(() => new Promise<string>(() => {})); // a slow read that never comes back
    const ctx = ctxWith({ getUserHandle, slugTaken: async () => false, setCardSlug });
    expect(await assignSlugIn(ctx, 'c1', async () => 'a-quiet-night', { ...card })).toBe('a-quiet-night');
    expect(setCardSlug).toHaveBeenCalledWith('c1', 'a-quiet-night');
    // Asked for all the same, beside the base: a collision would need it at once.
    expect(getUserHandle).toHaveBeenCalledWith('alice');
  });

  it('a pen name that fails to read fails nothing when the base is free, and the slug when it is needed', async () => {
    const failing = async () => {
      throw new Error('down');
    };
    const free = ctxWith({ getUserHandle: failing, slugTaken: async () => false, setCardSlug: async () => true });
    expect(await assignSlugIn(free, 'c1', async () => 'a-quiet-night', { ...card })).toBe('a-quiet-night');
    const taken = ctxWith({ getUserHandle: failing, slugTaken: async (s: string) => s === 'a-quiet-night', setCardSlug: async () => true });
    await expect(assignSlugIn(taken, 'c1', async () => 'a-quiet-night', { ...card })).rejects.toThrow('down');
  });

  it('on a collision, adds the pen name read beside the base', async () => {
    const ctx = ctxWith({ getUserHandle: async () => 'Alice', slugTaken: async (s: string) => s === 'a-quiet-night', setCardSlug: async () => true });
    expect(await assignSlugIn(ctx, 'c1', async () => 'a-quiet-night', { ...card })).toBe('a-quiet-night-alice');
  });

  it("never asks for an anonymous card's pen name", async () => {
    const getUserHandle = vi.fn(async () => 'alice');
    const ctx = ctxWith({ getUserHandle, slugTaken: async (s: string) => s === 'a-quiet-night', setCardSlug: async () => true });
    expect(await assignSlugIn(ctx, 'c1', async () => 'a-quiet-night', { ...card, anonymous: true })).toBe('a-quiet-night-2');
    expect(getUserHandle).not.toHaveBeenCalled();
  });
});
