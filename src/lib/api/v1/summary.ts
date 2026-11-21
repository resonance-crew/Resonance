/**
 * A card's list summary — the plain-text excerpt and read time every list
 * draws — kept on the card document, so lists read their cards without their
 * stories (LIST_FIELDS): a page of 12 cards no longer downloads 12 stories.
 *
 * The server stores it whenever it writes a story it knows: publishing,
 * applying an edit (edits/apply), changing a card's settings, and the
 * backfill (scripts/backfill-card-summaries.ts). `excerptAt` is that write's
 * server time — the same as the `updatedAt` it writes beside it. A later
 * write to the card that doesn't refresh the summary (the web editor still
 * applies an edit from the browser) moves `updatedAt` past `excerptAt`; the
 * stored summary is then ignored and the list reads that card's story
 * instead (withStories), as it does for a card that has none yet. The
 * excerpt's rules (plainText, excerpt) are lib/markdown/plainText's, shared
 * with the web's own story cards.
 */
//
// The policy (summarize, the field lists, summaryOf) is
// src/server/domain/summary.ts; what touches Firestore (server stamps,
// Timestamps, the batched story read) src/server/infra/firestore/summary.ts.
// This module keeps every name its callers import.

export {
  LIST_FIELDS,
  LISTING_FIELDS,
  SUMMARY_FIELDS,
  summarize,
  summaryOf,
  type ListCard,
  type StorySummary,
} from '@/server/domain/summary';
export {
  blankBySummary,
  listCard,
  listingFields,
  storedSummary,
  summaryFields,
  summaryKeepsSettled,
  withStories,
} from '@/server/infra/firestore/summary';
