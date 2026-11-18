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

/** Work the pool's numbers out and keep them (the warm-up cron, daily). */
export async function refreshPoolStats(embedModel: string, opts: { db?: Firestore; store?: IVectorStore } = {}): Promise<{ cards: number; parts: number }> {
  const db = opts.db ?? getAdminDb();
  const records = await publicPool(opts.store ?? getVectorStore(), embedModel);
  const stats = poolStats(records);
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
