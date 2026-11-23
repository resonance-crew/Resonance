import { poolStats, type PoolStats } from '@/lib/recommend/match';
import type { ServerCtx } from '@/server/ctx';
import type { PrivateObjectStore } from '@/server/ports/objects';
import type { VectorRecord, VectorStore } from '@/server/ports/vectors';
import { PACK_SKEW_MS, overlay, readPack, writePack } from './recommendPack';

/**
 * The pool's numbers kept for a pool too big to read whole at each build
 * (round 26 §A2.3, C1): the mean vector μ of each channel, every part's
 * r(x) and the median pair scores τ — worked out once a day by the warm-up
 * cron (/api/cron/warm-picks, before it builds anyone's picks) and kept in
 * the server-only `config/recommendPool` (the rules refuse every client read
 * and write of config/*). While the pool is small (match EXACT_POOL_MAX) a
 * build reads it whole and works these out itself; the stored copy also
 * tells a build how big the pool is.
 */

/** A vector made by a model other than the index's current one is left out (§A2.2, D8); a record from before round 26 names none: it is 3-small's. */
const LEGACY_EMBED_MODEL = 'text-embedding-3-small';
export const recordModel = (r: Pick<VectorRecord, 'embedModel'>) => r.embedModel || LEGACY_EMBED_MODEL;

/** The pool's public records of the current model, by card author (never the reader's own). */
export async function publicPool(store: VectorStore, embedModel: string): Promise<VectorRecord[]> {
  return (await store.listByVisibility('public')).filter((r) => recordModel(r) === embedModel);
}

/** At most this many parts changed since the pack are laid over it; more, and the pool is read whole (P0 #7). */
export const PACK_CHANGES_MAX = 2000;

/**
 * The public pool from its pack (src/server/app/recommendPack.ts, P0 #7) with every change since laid over it —
 * one private object and the few parts written since, in place of every part document — or, with no usable pack
 * (none, stale, another model, unreadable) or a store that can't say what changed, publicPool as before. A pack that
 * fails to read is never an error: the pool is read whole.
 */
export async function packedPublicPool(store: VectorStore, embedModel: string, pack: PrivateObjectStore | null | undefined, now: number): Promise<VectorRecord[]> {
  if (pack && store.listChangedSince) {
    try {
      const found = await readPack(pack, embedModel, now);
      if (found) {
        const changed = await store.listChangedSince(new Date(found.at - PACK_SKEW_MS), PACK_CHANGES_MAX);
        if (changed) return overlay(found.records, changed, embedModel, recordModel);
      }
    } catch (e) {
      console.warn('[recommend] the packed pool could not be read; reading it whole', e instanceof Error ? e.message : e);
    }
  }
  return publicPool(store, embedModel);
}

/** How long an instance keeps the public pool it read (B1): a card published since joins the next read. */
export const POOL_MEMO_MS = 5 * 60_000;

interface PoolMemo {
  until: number;
  records: Promise<VectorRecord[]>;
  /** The pool's own numbers, worked out at most once per read (only when the kept ones are stale). */
  stats?: PoolStats;
}

/** Per store and model: every build on an instance (the cron's four workers, `after()` rebuilds) shares one read. */
const poolMemos = new WeakMap<VectorStore, Map<string, PoolMemo>>();

function memoOf(store: VectorStore, embedModel: string, now: number): PoolMemo | undefined {
  const memo = poolMemos.get(store)?.get(embedModel);
  return memo && memo.until > now ? memo : undefined;
}

function keepMemo(store: VectorStore, embedModel: string, memo: PoolMemo) {
  const byModel = poolMemos.get(store) ?? new Map<string, PoolMemo>();
  byModel.set(embedModel, memo);
  poolMemos.set(store, byModel);
}

/**
 * The public pool (publicPool) as this instance last read it, for
 * POOL_MEMO_MS (B1): 900–1800 part documents with their vectors, 11–21 MB,
 * read once rather than at every build. Only public records, the same for
 * every reader: each build still drops the reader's own cards and the ones
 * held back from them after it, and a card made private or trashed since is
 * still refused when its picks are served (present, stillPublic). A read that
 * fails is not kept; two builds asking at once share one read. With `pack`
 * (the private bucket), the read is the packed pool and what changed since
 * (packedPublicPool, P0 #7).
 */
export function cachedPublicPool(store: VectorStore, embedModel: string, now: number = Date.now(), pack?: PrivateObjectStore | null): Promise<VectorRecord[]> {
  const known = memoOf(store, embedModel, now);
  if (known) return known.records;
  const memo: PoolMemo = { until: now + POOL_MEMO_MS, records: packedPublicPool(store, embedModel, pack, now) };
  keepMemo(store, embedModel, memo);
  memo.records.catch(() => {
    if (poolMemos.get(store)?.get(embedModel) === memo) poolMemos.get(store)!.delete(embedModel);
  });
  return memo.records;
}

/** poolStats(records) for the pool cachedPublicPool answered — worked out once per read, not at every build. */
export function cachedPoolStats(store: VectorStore, embedModel: string, records: VectorRecord[], now: number = Date.now()): PoolStats {
  const memo = memoOf(store, embedModel, now);
  if (!memo) return poolStats(records);
  memo.stats ??= poolStats(records);
  return memo.stats;
}

/**
 * Work the pool's numbers out and keep them, and pack the pool for every instance's next read (the warm-up cron,
 * daily; P0 #7). The pack is best effort: without the private bucket, or when writing it fails, the instances read
 * the pool whole as before. `packed` is its size in bytes, 0 when none was written.
 */
export async function refreshPoolStatsIn(ctx: ServerCtx, embedModel: string): Promise<{ cards: number; parts: number; packed: number }> {
  const store = ctx.vectors;
  // Taken before the read: whatever is written while it runs is read again over the pack.
  const at = ctx.clock.now();
  const records = await publicPool(store, embedModel);
  const stats = poolStats(records);
  // The builds that follow (the cron's own, right after) take this read rather than making it again.
  keepMemo(store, embedModel, { until: Date.now() + POOL_MEMO_MS, records: Promise.resolve(records), stats });
  const cards = new Set(records.map((r) => r.cardId)).size;
  await ctx.data.recommend.putPoolStats({ ...stats, cards, embedModel });
  let packed = 0;
  if (ctx.chatObjects && records.length) {
    packed = await writePack(ctx.chatObjects, embedModel, at, records).catch((e) => {
      ctx.log.warn('[recommend] the pool could not be packed', e instanceof Error ? e.message : e);
      return 0;
    });
  }
  return { cards, parts: records.length, packed };
}
