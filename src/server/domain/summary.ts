import type { Card } from '@/lib/db/types';
import { excerpt, plainText } from '@/lib/markdown/plainText';
import { readMinutes } from '@/lib/readTime';

/**
 * A card's list summary — the plain-text excerpt and read time every list
 * draws — as policy, with no store behind it: what a summary is made of
 * (summarize), which fields a list reads, and which summary a list shows.
 * Where it is kept and when a stored one is still current is the store's
 * (src/server/infra/firestore/summary.ts); the whole story is told in
 * src/lib/api/v1/summary.ts, which re-exports both halves.
 */

export interface StorySummary {
  excerpt: string;
  readMinutes: number;
}

/** What a list shows of a story (a missing or malformed story reads as empty). */
export function summarize(story: unknown): StorySummary {
  const s = typeof story === 'string' ? story : '';
  return { excerpt: excerpt(plainText(s)), readMinutes: readMinutes(s) };
}

/**
 * What says a card is not for lists (lib/cards/blank: unlistedCard): the
 * save's `thin` and the index's `signature.placeholder`. A field mask that
 * picks cards for readers carries these beside the rest.
 */
export const LISTING_FIELDS = ['thin', 'signature.placeholder'] as const;

/**
 * Everything a list needs of a card: the FeedCard's fields, what visibility,
 * blocks and a shared slug are decided on, the drafts' order — and the stored
 * summary in place of the story.
 */
export const LIST_FIELDS = [
  'authorId',
  'thoughtCore',
  'tags',
  'publishedAt',
  'updatedAt',
  'anonymous',
  'visibility',
  'media',
  'accentHue',
  'referenceCardId',
  'slug',
  'excerpt',
  'readMinutes',
  'excerptAt',
  // A card in the trash: left out of lists by code (the owner's shelves, ?keys=), shown on the trash shelf.
  'trashedAt',
  'trashedFrom',
  // Whether lists may show it at all (lib/cards/blank: unlistedCard).
  ...LISTING_FIELDS,
  // Its title and excerpt translated by AI (src/lib/api/v1/summaryTranslations), shown to readers who asked.
  'summaryTranslations',
] as const;

/** What storedSummary reads, with the title: for a read that judges blankness without the story (blankBySummary). */
export const SUMMARY_FIELDS = ['thoughtCore', 'excerpt', 'readMinutes', 'excerptAt', 'updatedAt'] as const;

/**
 * A card as a list holds it: read with LIST_FIELDS (no story) and carrying
 * its stored summary when that is current — or read whole, with its story.
 */
export type ListCard = Card & {
  listing?: StorySummary;
  /** When the card was last changed (its `updatedAt`): the owner's shelves say it (FeedCard.editedAt). */
  editedAt?: Date;
};

/** The summary a FeedCard shows: from the story when the card was read whole, else the stored one. */
export function summaryOf(card: ListCard): StorySummary {
  if (typeof card.story === 'string') return summarize(card.story);
  return card.listing ?? summarize('');
}
