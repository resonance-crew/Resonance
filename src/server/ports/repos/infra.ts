import type { LinkPreview } from '@/lib/db/types';

/**
 * The `infra` aggregate's repositories (uploads, quotas and other bookkeeping no aggregate owns).
 *
 * Filled by whichever lane first needs it (it says so in its report; the coordinator keeps one owner per wave).
 * Methods take and answer domain types (`Date`, `Instant`, plain objects),
 * never a Firestore `DocumentData`, `Timestamp`, `DocumentReference`,
 * snapshot, `Transaction` or `FieldValue`.
 *
 * Phase 1 media lane: link previews (src/server/app/links.ts) and slug
 * collisions (src/server/app/slugs.ts) — what of a card or a message those
 * two need, and nothing else of them.
 */

/**
 * What a link unfurl reads of a published card (cards/{id}: no signature,
 * no cover, no summary). The stored previews come as stored — a reader
 * shapes them (linkPreviewsOf) — and `undefined` when the field is absent.
 */
export interface CardLinksRow {
  story: unknown;
  linkPreviews?: unknown;
  linkPreviewsFor?: unknown;
  authorId?: unknown;
}

/** What a message's unfurl reads of it (conversations/{pair}/messages/{id}). */
export interface MessagePreviewRow {
  text: unknown;
  /** It has a preview already. */
  hasPreview: boolean;
  /** It was unsent (it carries nothing but its sender and times). */
  unsent: boolean;
}

/** What naming a card reads of it (the publish transaction hands the same fields as `known`). */
export interface SlugCardRow {
  slug?: unknown;
  thoughtCore?: unknown;
  anonymous?: unknown;
  authorId?: unknown;
}

/** A card's link previews as stored; null removes both fields. */
export type CardLinkPreviews = { previews: LinkPreview[]; links: string[] } | null;

/** Inside `uow.run`: every read before any write (ports/uow.ts). */
export interface InfraTxRepo {
  /** The card's links as they are now; null when it is gone or still a draft. */
  getPublishedCardLinks(cardId: string): Promise<CardLinksRow | null>;
  /** Write (or, null, remove) its previews and the links they were made for — never `updatedAt` or `excerptAt`. */
  setCardLinkPreviews(cardId: string, value: CardLinkPreviews): void;
  /** The message as it is now; null when it is gone. */
  getMessageForPreview(conversationId: string, messageId: string): Promise<MessagePreviewRow | null>;
  setMessagePreview(conversationId: string, messageId: string, preview: LinkPreview): void;
}

/** Outside a transaction: reads, and writes that need none (batches, bulk deletes). */
export interface InfraData {
  getPublishedCardLinks(cardId: string): Promise<CardLinksRow | null>;
  getMessageForPreview(conversationId: string, messageId: string): Promise<MessagePreviewRow | null>;
  /** The card, for naming it; null when there is none. */
  getCardForSlug(cardId: string): Promise<SlugCardRow | null>;
  /**
   * The card a slug leads to (of those holding it, the first published —
   * cardKey slugHolder); null when no card holds it.
   */
  slugHolderId(slug: string): Promise<string | null>;
  /** Whether a candidate slug is taken by another card than `cardId`, or retired with a card deleted for good. */
  slugTaken(candidate: string, cardId: string): Promise<boolean>;
  /** The pen name a slug may carry ('' when none). */
  getUserHandle(uid: string): Promise<string>;
  /** Name the card — an update, never a merge; false when the card is gone. */
  setCardSlug(cardId: string, slug: string): Promise<boolean>;
}
