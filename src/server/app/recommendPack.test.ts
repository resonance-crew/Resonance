import { describe, expect, it, vi } from 'vitest';
import { memoryCtx } from '@/server/infra/memory/ctx';
import { memoryPrivateObjectStore } from '@/server/infra/memory/objects';
import { memoryVectors } from '@/server/infra/memory/vectors';
import type { VectorRecord } from '@/server/ports/vectors';
import { PACK_MAX_AGE_MS, decodePack, encodePack, packKey, readPack } from './recommendPack';
import { PACK_CHANGES_MAX, packedPublicPool, refreshPoolStatsIn } from './recommendPool';

// P0 #7: the public pool packed into one private object by the warm-up cron, read by every instance in place of
// every part document, with what changed since laid over it — and the pool read whole whenever the pack can't be.

const DIMS = 1536;
const MODEL = 'text-embedding-3-large';

/** A unit vector, the same for the same seed. */
function unit(seed: number): number[] {
  let x = seed * 9301 + 49297;
  const v = Array.from({ length: DIMS }, () => {
    x = (x * 9301 + 49297) % 233280;
    return x / 233280 - 0.5;
  });
  const len = Math.hypot(...v);
  return v.map((n) => n / len);
}

const rec = (cardId: string, seed: number, extra: Partial<VectorRecord> = {}): VectorRecord => ({
  cardId,
  authorId: `author-${cardId}`,
  visibility: 'public',
  channel: 'insight',
  part: 0,
  vector: unit(seed),
  embedModel: MODEL,
  insightScore: 0.7,
  coreInsight: `我在 ${cardId} 學到的事`,
  situation: '一個下雨的晚上',
  lifeDomain: 'work',
  span: '雨停了',
  ...extra,
});

const dot = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i], 0);
const ids = (records: VectorRecord[]) => records.map((r) => `${r.cardId}/${r.channel}/${r.part}`).sort();

describe('the packed pool', () => {
  it('keeps every record whole but its vector, which comes back within int8 of it, at a quarter of float32', () => {
    const records = [rec('c1', 1), rec('c2', 2, { channel: 'situation', part: 1 }), rec('c3', 3)];
    const bytes = encodePack(MODEL, 1000, records);
    expect(bytes.length).toBeLessThan(records.length * DIMS * 4 * 0.3);
    const pack = decodePack(bytes)!;
    expect(pack).toMatchObject({ embedModel: MODEL, at: 1000 });
    pack.records.forEach((r, i) => {
      const { vector, ...meta } = r;
      const { vector: original, ...want } = records[i];
      expect(meta).toEqual(want);
      expect(dot(vector, vector)).toBeCloseTo(1, 6);
      expect(dot(vector, original)).toBeGreaterThan(0.999);
    });
  });

  it('is no pack when its bytes are anything else, cut short, of another model, or too old', async () => {
    expect(decodePack(new Uint8Array([1, 2, 3]))).toBeNull();
    const good = encodePack(MODEL, 5000, [rec('c1', 1)]);
    expect(decodePack(good.slice(0, good.length - 9))).toBeNull();
    const store = memoryPrivateObjectStore();
    await store.put(packKey(MODEL), good, 'application/octet-stream');
    expect(await readPack(store, MODEL, 6000)).not.toBeNull();
    expect(await readPack(store, MODEL, 5000 + PACK_MAX_AGE_MS)).toBeNull();
    expect(await readPack(store, 'text-embedding-3-small', 6000)).toBeNull();
    await store.put(packKey(MODEL), new Uint8Array([9, 9]), 'application/octet-stream');
    expect(await readPack(store, MODEL, 6000)).toBeNull();
  });

  it('the cron packs it; the next read takes the pack and every change since, never every part document', async () => {
    let t = Date.now();
    const vectors = memoryVectors([rec('c1', 1), rec('c2', 2), rec('c3', 3), rec('priv', 4, { visibility: 'private' }), rec('old', 5, { embedModel: 'other' })], () => t);
    const ctx = memoryCtx({ vectors });
    ctx.clock.set(t);
    const out = await refreshPoolStatsIn(ctx, MODEL);
    expect(out).toMatchObject({ cards: 3, parts: 3 });
    expect(out.packed).toBeGreaterThan(0);

    // After it: c4 published, c2 made private (its trash or the author's choice), c3 read again into two parts.
    t += 60_000;
    await vectors.upsert([rec('c4', 6)]);
    await vectors.setVisibility('c2', 'private');
    await vectors.upsert([rec('c3', 7), rec('c3', 8, { channel: 'situation' })]);

    const whole = vi.spyOn(vectors, 'listByVisibility');
    const pool = await packedPublicPool(vectors, MODEL, ctx.chatObjects, t);
    expect(whole).not.toHaveBeenCalled();
    expect(ids(pool)).toEqual(['c1/insight/0', 'c3/insight/0', 'c3/situation/0', 'c4/insight/0']);
    // A changed card's parts are its new ones, read from the index; the others the pack's.
    expect(dot(pool.find((r) => r.cardId === 'c3' && r.channel === 'insight')!.vector, unit(7))).toBeCloseTo(1, 9);
    expect(dot(pool.find((r) => r.cardId === 'c1')!.vector, unit(1))).toBeGreaterThan(0.999);
    // Exactly what the pool read whole answers, card for card.
    whole.mockRestore();
    expect(ids(pool)).toEqual(ids((await vectors.listByVisibility('public')).filter((r) => r.embedModel === MODEL)));
  });

  it('reads the pool whole with no store, no pack, a broken one, a store that cannot say what changed, or too many changes', async () => {
    const t = Date.now();
    const vectors = memoryVectors([rec('c1', 1), rec('c2', 2)], () => t);
    const whole = vi.spyOn(vectors, 'listByVisibility');
    const pack = memoryPrivateObjectStore();

    expect(ids(await packedPublicPool(vectors, MODEL, null, t))).toEqual(['c1/insight/0', 'c2/insight/0']);
    expect(ids(await packedPublicPool(vectors, MODEL, pack, t))).toHaveLength(2);
    await pack.put(packKey(MODEL), new Uint8Array([0, 1]), 'application/octet-stream');
    expect(ids(await packedPublicPool(vectors, MODEL, pack, t))).toHaveLength(2);
    const failing = { ...pack, get: async () => Promise.reject(new Error('R2 down')) };
    expect(ids(await packedPublicPool(vectors, MODEL, failing, t))).toHaveLength(2);
    expect(whole).toHaveBeenCalledTimes(4);

    await pack.put(packKey(MODEL), encodePack(MODEL, t, [rec('c1', 1)]), 'application/octet-stream');
    const { listChangedSince: _gone, ...blind } = vectors;
    expect(ids(await packedPublicPool(blind, MODEL, pack, t))).toHaveLength(2);
    const flooded = { ...vectors, listChangedSince: vi.fn(async () => null) };
    expect(ids(await packedPublicPool(flooded, MODEL, pack, t))).toHaveLength(2);
    expect(flooded.listChangedSince).toHaveBeenCalledWith(expect.any(Date), PACK_CHANGES_MAX);
    expect(whole).toHaveBeenCalledTimes(6);
  });

  it('writes no pack without the private bucket, and a failed write changes nothing else', async () => {
    const vectors = memoryVectors([rec('c1', 1)]);
    expect((await refreshPoolStatsIn(memoryCtx({ vectors, chatObjects: null }), MODEL)).packed).toBe(0);
    const broken = { ...memoryPrivateObjectStore(), put: async () => Promise.reject(new Error('no bucket')) };
    const ctx = memoryCtx({ vectors, chatObjects: broken });
    expect(await refreshPoolStatsIn(ctx, MODEL)).toEqual({ cards: 1, parts: 1, packed: 0 });
    expect(ctx.state.get('config', 'recommendPool')).toBeTruthy();
  });
});
