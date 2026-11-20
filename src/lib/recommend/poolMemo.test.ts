import { describe, expect, it, vi } from 'vitest';
import { cachedPoolStats, cachedPublicPool, POOL_MEMO_MS } from './poolStats';
import type { IVectorStore } from './vectorStore/interfaces';
import type { VectorRecord } from './vectorStore/types';

// B1: the public pool (900–1800 part documents with their vectors) is read once per instance for a few
// minutes and shared by every build — the warm-up cron's workers and `after()` rebuilds — not at each one.

const record = (cardId: string, embedModel = 'm'): VectorRecord =>
  ({ cardId, authorId: `a-${cardId}`, channel: 'insight', part: 0, vector: [1, 0, 0], visibility: 'public', embedModel }) as unknown as VectorRecord;

function store(records: VectorRecord[]) {
  const listByVisibility = vi.fn(async () => records);
  return { store: { listByVisibility } as unknown as IVectorStore, listByVisibility };
}

describe('the public pool, kept for a few minutes', () => {
  it('is read once for builds that come together or soon after, of the one model, and again once it is old', async () => {
    const { store: s, listByVisibility } = store([record('c1'), record('c2'), record('old', 'other')]);
    const t = 1_000_000;
    const [a, b] = await Promise.all([cachedPublicPool(s, 'm', t), cachedPublicPool(s, 'm', t)]);
    expect(a.map((r) => r.cardId)).toEqual(['c1', 'c2']);
    expect(b).toBe(a);
    expect(await cachedPublicPool(s, 'm', t + POOL_MEMO_MS - 1)).toBe(a);
    expect(listByVisibility).toHaveBeenCalledTimes(1);
    await cachedPublicPool(s, 'm', t + POOL_MEMO_MS + 1);
    expect(listByVisibility).toHaveBeenCalledTimes(2);
  });

  it('works the pool’s own numbers out once per read', async () => {
    const { store: s } = store([record('c1'), record('c2')]);
    const records = await cachedPublicPool(s, 'm', 5);
    expect(cachedPoolStats(s, 'm', records, 6)).toBe(cachedPoolStats(s, 'm', records, 7));
  });

  it('keeps no failed read', async () => {
    const listByVisibility = vi.fn().mockRejectedValueOnce(new Error('down')).mockResolvedValue([record('c1')]);
    const s = { listByVisibility } as unknown as IVectorStore;
    await expect(cachedPublicPool(s, 'm', 10)).rejects.toThrow('down');
    await Promise.resolve();
    expect((await cachedPublicPool(s, 'm', 11)).map((r) => r.cardId)).toEqual(['c1']);
  });
});
