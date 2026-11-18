import { Timestamp, type DocumentData } from 'firebase-admin/firestore';
import type { RecommendationItem } from '@/lib/db/types';

/**
 * What `recommendations/{uid}` holds, read without the recommender itself:
 * this module imports nothing that builds picks, so a route that only reads
 * them (the evening's pick push) reaches no LLM and may run anywhere
 * (src/lib/ai/regions.test.ts follows the imports).
 */

export const RECOMMENDATIONS = 'recommendations';

/** UTC day key — the feed regenerates at most once per day per user. */
export function recommendationDay(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** What `recommendations/{uid}` holds, read defensively. */
export interface StoredRecommendations {
  /** The UTC day the items were built on. */
  date: string | null;
  items: RecommendationItem[];
  /** A quick first pass (no LLM ranking): served, but today's full build is still due. */
  partial: boolean;
  /** A build holds the document until then (ms). */
  leaseUntil: number;
  /** The last build failed then (ms). */
  failedAt: number;
  /**
   * The UTC day the reader last asked for their picks themselves (the feed
   * on the web or in an app) — never set by the warm-up cron's build, so
   * "they opened their picks today" means they did.
   */
  askedOn: string | null;
  /** The stored items were built ahead of the reader by the warm-up cron, not on their request. */
  warm: boolean;
  /** The reader had no positive card yet: the items are the coverage set (round 26 §A3.6). */
  coldStart: boolean;
}

/**
 * How often each card was in the reader's picks on days they opened them
 * (round 26 §A3.2, C6): `recommendations/{uid}.shown = { [cardId]: { n,
 * lastDay } }`, counted once a day per card when the reader is answered with
 * their picks — never for the warm-up's build nobody saw. Three times and
 * never opened, a card counts against what is near it and isn't shown again
 * for 14 days (lib/recommend/weights). Kept by the backfill; deleted with the
 * account (the whole document).
 */
export type ShownCounts = Record<string, { n: number; lastDay: string }>;
/** A count not added to for this long is dropped. */
const SHOWN_KEEP_DAYS = 60;
/** The most cards the counts keep (the most recently shown). */
const SHOWN_MAX = 300;

/** `prev` with `cardIds` shown on `day` (once a day each), old entries dropped. Pure. */
export function countShown(prev: ShownCounts, cardIds: string[], day: string): ShownCounts {
  const next: ShownCounts = { ...prev };
  for (const id of new Set(cardIds)) {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) continue;
    const was = next[id];
    if (was?.lastDay === day) continue;
    next[id] = { n: (was?.n ?? 0) + 1, lastDay: day };
  }
  const oldest = new Date(Date.parse(`${day}T00:00:00Z`) - SHOWN_KEEP_DAYS * 86_400_000).toISOString().slice(0, 10);
  const kept = Object.entries(next)
    .filter(([, v]) => v.lastDay >= oldest)
    .sort(([a, x], [b, y]) => (x.lastDay < y.lastDay ? 1 : x.lastDay > y.lastDay ? -1 : a < b ? -1 : 1))
    .slice(0, SHOWN_MAX);
  return Object.fromEntries(kept);
}

const millis = (v: unknown) => (v instanceof Timestamp ? v.toMillis() : 0);
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export function readStored(data: DocumentData | undefined): StoredRecommendations | null {
  if (!data) return null;
  const items = Array.isArray(data.items)
    ? (data.items as unknown[]).filter(
        (i): i is RecommendationItem =>
          !!i && typeof (i as RecommendationItem).cardId === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test((i as RecommendationItem).cardId),
      )
    : [];
  return {
    date: typeof data.date === 'string' ? data.date : null,
    items,
    partial: data.partial === true,
    leaseUntil: millis(data.leaseUntil),
    failedAt: millis(data.failedAt),
    askedOn: typeof data.askedOn === 'string' && DAY.test(data.askedOn) ? data.askedOn : null,
    warm: data.warm === true,
    coldStart: data.coldStart === true,
  };
}
