/**
 * The `cards` aggregate's repositories (cards, edits, cardLinks, tombstones, retiredSlugs).
 *
 * Filled by the cardsRead lane (read half) and the cardsWrite lane (write half), each in its own section of the interface, marked by a comment. Until then the interfaces are empty: the skeleton
 * (Phase 1 wave 1) only fixed where they live, so lanes never edit each
 * other's files. Methods take and answer domain types (`Date`, `Instant`,
 * plain objects), never a Firestore `DocumentData`, `Timestamp`,
 * `DocumentReference`, snapshot, `Transaction` or `FieldValue`.
 */

import type { ListCard } from '@/lib/api/v1/summary';
import type { CardTapBody } from '@/lib/api/v1/schemas';
import type { Card, User } from '@/lib/db/types';

/** Inside `uow.run`: every read before any write (ports/uow.ts). */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface CardsTxRepo {}

// --- read side (cardsRead lane)

/** Where a newest-first list resumes: after a page token's card, or after an older client's cursor time. */
export interface PageStart {
  pageToken?: string;
  cursor?: string;
}

/** A page's way on, in both forms (src/lib/api/v1/paging.ts); nulls at the end. */
export interface PageEnd {
  nextCursor: string | null;
  nextPageToken: string | null;
}

/**
 * A page of a newest-first list: the cards of the raw page that are properly
 * published (src/lib/api/v1/service.ts properlyPublished), and where the raw
 * page ended — cut on the raw rows, so a page whose cards were all left out
 * doesn't end the list.
 */
export interface CardPage {
  cards: ListCard[];
  end: PageEnd;
}

/** One of an author's own shelves that is a plain query (the trash has its own). */
export type OwnShelfName = 'published' | 'private' | 'draft';

/** A card link: the card that links (`source`) and the one it links to (`target`). */
export interface CardLinkPair {
  source: string;
  target: string;
}

/** A card as a page's server render holds it (cardByKeyForAnyone): the document's id, the card, and whether its stored publishedAt is set at all. */
export interface PageCard {
  id: string;
  card: Card;
  /** The stored publishedAt is anything but null / absent (a draft has none). */
  stamped: boolean;
}

/** A sitemap row: a listed card's slug and when it last changed (src/app/sitemap.ts). */
export interface SitemapCard {
  slug: string;
  lastModified: Date;
}

/** A card of the landing film's window: its stored fields (times as Date) and what its reading says (`cardSignatures`). */
export interface FilmWindowRow {
  id: string;
  d: Record<string, unknown>;
  reading?: { insightScore: number | null; listed: boolean };
  /** Its stored list summary while that still describes the story (summary.ts storedSummary), else null. */
  summary?: { excerpt: string; readMinutes: number } | null;
  /** Blank by that summary (summary.ts blankBySummary). */
  blank?: boolean;
}

/** The owner's landing film pin (`config/landingFilm`). */
export interface FilmPin {
  written?: string;
  answer?: string;
  until?: Date;
}

/** Outside a transaction: reads, and writes that need none (batches, bulk deletes). */
export interface CardsData {
  // --- read side (cardsRead lane)

  /**
   * What lists the same for every reader are kept against (src/lib/api/v1/publicLists.ts):
   * the database behind this repository, so two contexts on one database share them.
   */
  readonly scope: object;
  /** The card `id`, whole or only the `fields` named — or null (an id the store keeps for itself, or a path, names none). */
  get(id: string, fields?: readonly string[]): Promise<Card | null>;
  /** The card a URL segment names — by its slug (its holder), else by its id — whole, or null (src/lib/db/firestore/cardKey.ts). */
  findByKey(key: string): Promise<Card | null>;
  /** findByKey for an answer that goes to anyone (cardByKeyForAnyone): none for a card in the trash, nor an anonymous one by its slug. */
  findForAnyone(key: string): Promise<PageCard | null>;
  /** Cards by id for a list (no story): in the order given, each once, missing ones left out. */
  listByIds(ids: string[]): Promise<ListCard[]>;
  /** Cards by slug or id for a list (src/lib/api/v1/reads.ts cardsByKeys). */
  listByKeys(keys: string[]): Promise<ListCard[]>;
  /** A page of the latest public published cards, newest first (publishedAt, then id). */
  feedPage(limit: number, start?: PageStart): Promise<CardPage>;
  /** A page of an author's public, named, published cards, newest first. */
  authorPage(authorId: string, limit: number, start?: PageStart): Promise<CardPage>;
  /** How many of those there are, counted up to `max`. */
  countAuthorCards(authorId: string, max: number): Promise<number>;
  /** Public published cards answering this one (`referenceCardId`), newest first. */
  resonancesOf(cardId: string, limit: number): Promise<ListCard[]>;
  /** The latest public published cards, newest first. */
  recentPublic(limit: number): Promise<ListCard[]>;
  /** Ids of the cards whose card links point at this card, newest link first. */
  linkSourcesTo(cardId: string, limit: number): Promise<string[]>;
  /** The card links into this author's cards, newest first. */
  linkPairsToAuthor(authorId: string, limit: number): Promise<CardLinkPair[]>;
  /** One of the author's own shelves, as reads.ts ownShelf reads it (drafts most recently edited first; none in the trash). */
  ownShelf(uid: string, shelf: OwnShelfName, limit: number): Promise<ListCard[]>;
  /** The author's cards in the trash, the latest in first. */
  trashShelf(uid: string, limit: number): Promise<ListCard[]>;
  /** Ids of the cards the author's own cards answer (`referenceCardId`). */
  answeredIds(uid: string, limit: number): Promise<string[]>;
  /** Ids of the author's bookmarks, newest first. */
  bookmarkIds(uid: string, limit: number): Promise<string[]>;
  /** Fill in the story of every card read without one and without a current stored summary (in place, the same objects). */
  withStories<T extends ListCard>(cards: T[]): Promise<T[]>;
  /** Of these card ids, the ones whose reading keeps them from strangers. */
  unlistedForStrangers(ids: string[]): Promise<Set<string>>;
  /** Of these cards, the ones their author shared with the viewer in their conversation (src/lib/api/v1/sharedCards.ts). */
  sharedAmong<C extends Card>(viewerId: string, cards: C[]): Promise<Set<C>>;
  /** CardDetail.tap for the viewer (src/lib/api/v1/taps.ts cardTap). */
  tapOf(viewerId: string, card: Card, opts: { pass: boolean; blocked?: Promise<ReadonlySet<string>> }): Promise<CardTapBody | null>;
  /** The landing grid's newest public cards and their bylines (src/lib/db/firestore/landing.ts). */
  latestForLanding(limit: number): Promise<{ cards: Card[]; authors: Record<string, User> }>;
  /** The cards a sitemap lists, newest first (src/app/sitemap.ts). */
  sitemapCards(max: number, now: number): Promise<SitemapCard[]>;
  /** The landing film's window of the latest public cards, each with its reading. */
  filmWindow(limit: number): Promise<FilmWindowRow[]>;
  /** The landing film's pin, if any. */
  filmPin(): Promise<FilmPin | null>;
  /** The vectors of these cards' parts on a channel (`cardVectors/{id}__{channel}__{i}`), by card id. */
  partVectors(ids: string[], channel: 'insight' | 'situation', perCard: number): Promise<Map<string, number[][]>>;
  /** These cards with the landing grid's fields, whole (LANDING_CARD_FIELDS). */
  landingCards(ids: string[]): Promise<Card[]>;
  /** Of these card ids, those still public, published and out of the trash. */
  stillPublic(ids: string[]): Promise<Set<string>>;
}
