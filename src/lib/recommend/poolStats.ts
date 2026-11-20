import { FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/db/firestore/admin';
import { poolStats, type PoolStats } from './match';
import { getVectorStore } from './vectorStore';
import type { IVectorStore } from './vectorStore/interfaces';
import type { VectorRecord } from './vectorStore/types';

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
export const POOL_STATS_DOC = 'config/recommendPool';

/** A vector made by a model other than the index's current one is left out (§A2.2, D8); a record from before round 26 names none: it is 3-small's. */
const LEGACY_EMBED_MODEL = 'text-embedding-3-small';
export const recordModel = (r: Pick<VectorRecord, 'embedModel'>) => r.embedModel || LEGACY_EMBED_MODEL;

export interface StoredPoolStats extends PoolStats {
  /** How many listed public cards the pool held. */
  cards: number;
  embedModel: string;
  at: number;
}

/** The pool's public records of the current model, by card author (never the reader's own). */
export async function publicPool(store: IVectorStore, embedModel: string): Promise<VectorRecord[]> {
  return (await store.listByVisibility('public')).filter((r) => recordModel(r) === embedModel);
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
const poolMemos = new WeakMap<IVectorStore, Map<string, PoolMemo>>();

function memoOf(store: IVectorStore, embedModel: string, now: number): PoolMemo | undefined {
  const memo = poolMemos.get(store)?.get(embedModel);
  return memo && memo.until > now ? memo : undefined;
}

function keepMemo(store: IVectorStore, embedModel: string, memo: PoolMemo) {
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
 * fails is not kept; two builds asking at once share one read.
 */
export function cachedPublicPool(store: IVectorStore, embedModel: string, now: number = Date.now()): Promise<VectorRecord[]> {
  const known = memoOf(store, embedModel, now);
  if (known) return known.records;
  const memo: PoolMemo = { until: now + POOL_MEMO_MS, records: publicPool(store, embedModel) };
  keepMemo(store, embedModel, memo);
  memo.records.catch(() => {
    if (poolMemos.get(store)?.get(embedModel) === memo) poolMemos.get(store)!.delete(embedModel);
  });
  return memo.records;
}

/** poolStats(records) for the pool cachedPublicPool answered — worked out once per read, not at every build. */
export function cachedPoolStats(store: IVectorStore, embedModel: string, records: VectorRecord[], now: number = Date.now()): PoolStats {
  const memo = memoOf(store, embedModel, now);
  if (!memo) return poolStats(records);
  memo.stats ??= poolStats(records);
  return memo.stats;
}

/** Work the pool's numbers out and keep them (the warm-up cron, daily). */
export async function refreshPoolStats(embedModel: string, opts: { db?: Firestore; store?: IVectorStore } = {}): Promise<{ cards: number; parts: number }> {
  const db = opts.db ?? getAdminDb();
  const store = opts.store ?? getVectorStore();
  const records = await publicPool(store, embedModel);
  const stats = poolStats(records);
  // The builds that follow (the cron's own, right after) take this read rather than making it again.
  keepMemo(store, embedModel, { until: Date.now() + POOL_MEMO_MS, records: Promise.resolve(records), stats });
  const cards = new Set(records.map((r) => r.cardId)).size;
  await db.doc(POOL_STATS_DOC).set({ ...stats, cards, embedModel, at: FieldValue.serverTimestamp() });
  return { cards, parts: records.length };
}

/** The kept numbers, or null (none yet, another model's, or unreadable). */
export async function readPoolStats(embedModel: string, db: Firestore = getAdminDb()): Promise<StoredPoolStats | null> {
  const data = (await db.doc(POOL_STATS_DOC).get()).data();
  if (!data || data.embedModel !== embedModel) return null;
  const vec = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is number => typeof x === 'number') : []);
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  const r: Record<string, number> = {};
  if (data.r && typeof data.r === 'object') for (const [k, v] of Object.entries(data.r as Record<string, unknown>)) if (typeof v === 'number') r[k] = v;
  return {
    mu: { insight: vec(data.mu?.insight), situation: vec(data.mu?.situation) },
    r,
    tau: num(data.tau),
    tauSituation: num(data.tauSituation),
    cards: num(data.cards),
    embedModel,
    at: data.at instanceof Timestamp ? data.at.toMillis() : 0,
  };
}
