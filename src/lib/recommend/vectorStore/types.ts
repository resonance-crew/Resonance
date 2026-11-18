import type { Visibility } from '@/lib/db/types';

/**
 * The two retrieval channels a card's parts are indexed under. `insight`
 * carries how the author thought, what they gained, what changed and the
 * realization; `situation` the circumstance and what was hard in it. A card
 * is matched on both (lib/recommend/match: insight + β × situation), so the
 * feed leans toward「跟我有同樣領悟的人」and still hears「跟我走過同一種坎的人」.
 */
export type VectorChannel = 'insight' | 'situation';

/**
 * One stored vector = one part of a card under one channel
 * (`cardVectors/{cardId}__{channel}__{part}`, round 26 §A2.1). Vectors are
 * server-only; the client never reads this collection (Firestore rules deny
 * it). The part's short lines ride along so the rerank and select prompts
 * read the hit without a second round-trip — one line each, never the story
 * nor its quoted evidence.
 */
export interface VectorRecord {
  cardId: string;
  authorId: string;
  /** Mirrors the card's visibility — the hard privacy filter at query time. */
  visibility: Visibility;
  channel: VectorChannel;
  /** Which of the card's insights (0-based); the through line's stand-in is 0. */
  part: number;
  /** Unit-normalized embedding (searched by COSINE distance). */
  vector: number[];
  /** The model that made it: the funnel leaves out a vector of any other (§A2.2). */
  embedModel: string;
  /** Card-level insight score, denormalized for cheap candidate filtering. */
  insightScore: number;
  /** The part's insight, one line (≤ 200 code points): what other readers' prompts read of a hit. */
  coreInsight: string;
  /** The part's circumstance, one line (≤ 200 code points). */
  situation: string;
  lifeDomain: string;
  /** Where in the story the part is (a few of its words). */
  span: string;
}

/** A query against one channel, with hard pre-filters applied before KNN. */
export interface VectorQuery {
  channel: VectorChannel;
  /** Unit-normalized query vector. */
  vector: number[];
  filter: {
    /** Only return records at this visibility (always `public` for others' feeds). */
    visibility: Visibility;
    /** Drop the viewer's own cards from results (a card never recommends its author to themselves). */
    excludeAuthorId?: string;
  };
  limit: number;
}

/** A single nearest-neighbour result: the stored record (without its vector) plus its distance. */
export interface NearestHit {
  record: VectorRecord;
  /** COSINE distance from Firestore, 1 − cos θ (0–2): smaller = closer. */
  distance: number;
}
