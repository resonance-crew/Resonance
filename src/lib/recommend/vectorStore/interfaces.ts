import type { Visibility } from '@/lib/db/types';
import type { NearestHit, VectorChannel, VectorQuery, VectorRecord } from './types';

/**
 * Storage-agnostic vector index. Firestore native KNN is the current backend
 * ({@link FirestoreVectorStore}); the interface keeps callers (indexCard,
 * funnel) ignorant of the backend so Cloudflare Vectorize / pgvector can drop
 * in later without touching them.
 */
export interface IVectorStore {
  /**
   * Make these records the cards' parts: each written in place by
   * `(cardId, channel, part)`, and every other part a card had — an insight
   * the new reading no longer holds, an older format's id — deleted in the
   * same batch.
   */
  upsert(records: VectorRecord[]): Promise<void>;
  /** Remove every part of a card (on delete, or when it is no longer listed). */
  deleteByCard(cardId: string): Promise<void>;
  /**
   * Follow a card's visibility change: every part takes it, so a card that is
   * no longer public leaves others' candidate pool at once (and comes back
   * when it is public again) without being embedded again.
   */
  setVisibility(cardId: string, visibility: Visibility): Promise<void>;
  /** Approximate-nearest-neighbour search within a single channel (raw vectors). */
  nearest(query: VectorQuery): Promise<NearestHit[]>;
  /**
   * Every record at this visibility, vectors included: the pool the funnel
   * scores exactly in memory while it is small (lib/recommend/match, §A2.3).
   */
  listByVisibility(visibility: Visibility, channel?: VectorChannel): Promise<VectorRecord[]>;
  /**
   * The parts of these cards, whatever their visibility, vectors included:
   * the cards a reader engaged with (their taste). Read for that reader's own
   * picks only — a private card's vectors never reach anyone else's.
   */
  listByCards(cardIds: string[]): Promise<VectorRecord[]>;
  /**
   * Every record written or changed after `since` (`updatedAt`), whatever its visibility, vectors included — what
   * the packed pool (src/server/app/recommendPack.ts) lays over itself; null when there are more than `max` (the
   * pool is then read whole). A store without it never reads the pack.
   */
  listChangedSince?(since: Date, max: number): Promise<VectorRecord[] | null>;
}
