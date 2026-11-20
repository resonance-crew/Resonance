import type { ReactionId } from '@/lib/design/reactions';
import type { TrashedFrom } from '@/lib/cards/trash';

export type Locale = 'zh-TW' | 'en' | 'ja' | 'ko' | 'es';
export type Visibility = 'public' | 'connections' | 'private';

export interface CardTranslation {
  title: string;
  thoughtCore: string;
  story: string;
  aiGenerated: true;
}

export interface CardMedia {
  type: 'image' | 'video';
  url: string;
  label?: string;
  /**
   * Where the cover is looked at (round 25, lib/images/coverFrame): every
   * shape it is drawn in centres its crop on (cx, cy) at `zoom`. Absent =
   * the centre at zoom 1. Inside `media`, so changing or removing the
   * picture clears it.
   */
  frame?: { cx: number; cy: number; zoom: number; ar: number };
  /**
   * The cover made smaller for lists (≤ 960 px on its longer edge, WebP), kept beside it at upload (B2) — absent on
   * older covers. Only for lists and small pictures (a feed card, a mini card, a map node); a card's own page and
   * its share image keep `url`. Fall back to `url` when absent or when it fails. The v1 FeedCard's `imageThumbUrl`.
   */
  thumbUrl?: string;
}

/** A feed card's title and excerpt translated by AI (lib/api/v1/summaryTranslations), keyed by interface language. */
export interface SummaryTranslations {
  /** The hash of the title and excerpt they were made from (summaryHash). */
  of: string;
  en?: { title: string; excerpt: string };
  'zh-TW'?: { title: string; excerpt: string };
}

export interface Card {
  id: string;
  authorId: string;
  /** URL slug (English, generated from the title at publish). Absent on drafts. */
  slug?: string;
  thoughtCore: string;
  story: string;
  tags: string[];
  media?: CardMedia;
  originalLocale: Locale;
  translations: Partial<Record<Locale, CardTranslation>>;
  visibility: Visibility;
  referenceCardId?: string;
  publishedAt: Date | null;
  readCount: number;
  resonanceCount: number;
  inviteCount: number;
  /** derived: accent hue seed for organic UI */
  accentHue?: number;
  /**
   * When the recommendation pipeline last read this card and wrote its
   * vectors. Absent → never indexed. See {@link InsightSignature}.
   */
  indexedAt?: Date | null;
  /**
   * A reading is owed (round 26 §A1.8): an applied edit, or a reading that
   * didn't finish after a publish — the daily `/api/cron/index-cards` reads
   * it again. Server-only.
   */
  indexPendingAt?: Date | null;
  /**
   * What the card keeps of its reading (the reading itself is server-only,
   * `cardSignatures`). See `src/lib/recommend`.
   */
  signature?: InsightSignature;
  /**
   * Too little to read for a stranger (lib/cards/blank: thinCard), stamped by
   * the server whenever it saves a published card's story (publish, applied
   * edits) — server-only, the rules take it from no client. Lists leave such
   * a card out (unlistedCard) without reading its story.
   */
  thin?: boolean;
  /**
   * Published without attribution (ux §6). Rendering-level anonymity: every
   * card surface hides the byline and the card never appears on the author's
   * public profile; notes/resonance notifications still reach the author
   * privately. NOTE: `authorId` stays on the doc (rules can't redact fields),
   * so this shields identity from the UI and all API responses, not from
   * someone reading raw Firestore documents.
   */
  anonymous?: boolean;
  /**
   * Set only on a card the web built from an /api/v1 summary (a FeedCard,
   * lib/data/summaries) rather than read whole: `story` then holds just its
   * plain-text excerpt, and this the whole story's read time. Lists draw it;
   * it never stands in for the card itself (a card page isn't seeded with it).
   */
  summary?: { readMinutes: number };
  /**
   * What the links standing alone in the story say about themselves, in
   * reading order (server-only: written after publishing or saving an edit,
   * lib/links/cardLinks). A reader draws a card for a standalone link whose
   * URL is here, and the plain link otherwise.
   */
  linkPreviews?: LinkPreview[];
  /**
   * When its author moved it to the trash (server-only: POST
   * /api/v1/cards/{id}/trash); absent on a card that isn't there. While it
   * is, the card is private to everyone and answers nothing (its
   * `referenceCardId` parked in `trashedFrom`), and it is deleted for good
   * TRASH_DAYS later (lib/cards/trash).
   */
  trashedAt?: Date | null;
  /** What restoring it brings back (server-only, beside `trashedAt`). */
  trashedFrom?: TrashedFrom | null;
  /**
   * Its title and list excerpt translated by AI, made when it was published
   * or last edited while public (server-only: lib/api/v1/summaryTranslations).
   * Lists show them only to a reader who turned auto-translate on.
   */
  summaryTranslations?: SummaryTranslations;
}

/**
 * What a card keeps of its reading (round 26 §A1.6): the reading itself —
 * what the story's author lived through, how they thought, what they gained
 * and what changed — is server-only (`cardSignatures/{cardId}`,
 * {@link CardReading}); the card holds only what its own pages and lists
 * need. Cards indexed before round 26 may still carry the older fields
 * (`intent`, `situation`, `insightScore` …) until `scripts/backfill.ts
 * recommend-index` deletes them: nothing reads them any more.
 */
export interface InsightSignature {
  /**
   * The reading's through line (≤ 60 characters, the card's language): shown
   * to the card's author only (`CardDetail.coreInsight`), never to a reader.
   */
  coreInsight?: string;
  /**
   * The model read it as a test or placeholder (「測試」, lorem ipsum, keys
   * mashed, a word repeated): kept out of every list that picks cards for
   * readers, as a thin one is (lib/cards/blank: unlistedCard).
   */
  placeholder?: boolean;
  /** The hash of what the reading was made from (lib/recommend/indexCard): unchanged, nothing is read again. */
  contentHash?: string;
}

/**
 * One realization a card carries (round 26 §A1.4), as the reading model
 * writes it. The matching fields (situation … reader) are written in
 * Traditional Chinese for every card, so cards in two languages are compared
 * in one; `span` and `evidence` quote the story as it is written.
 */
export interface ReadingInsight {
  /** Where in the story it is (a few words of it). */
  span: string;
  /** The circumstance, in the author's own nouns. */
  situation: string;
  /** What was hard in it. */
  struggle: string;
  /** How the author thought about it then. */
  thinking: string;
  /** What they came away with. */
  gain: string;
  /** What changed, as before → after; empty when nothing did. */
  shift: string;
  /** One or two sentences, in words the author would use. */
  insight: string;
  /** Who would feel understood reading it (kept, never embedded yet). */
  reader: string;
  /** A quote from the story, ≤ 40 characters: never in anyone else's prompt. */
  evidence: string;
  /** 0–1: how clearly the story carries it. Parts under 0.5 get no vector. */
  strength: number;
}

/**
 * A card's reading (round 26 §A1), server-only in `cardSignatures/{cardId}`
 * beside how it was made: one insight for a short card, at most three for a
 * long one, and the card's own judgments.
 */
export interface CardReading {
  insights: ReadingInsight[];
  /** ≤ 60 characters in the card's language: the card's `coreInsight`. */
  throughLine: string;
  /** Feeling only: no realization, nothing changed. Not listed for strangers. */
  moodOnly: boolean;
  /** 0–1: how much a stranger could take from it. */
  insightScore: number;
  lifeDomain: string;
  emotionalRegister: string;
  /** A test or placeholder, not a piece of writing. */
  placeholder: boolean;
}

export interface User {
  id: string;
  handle: string;
  bio?: string;
  region: string;
  primaryLocale: Locale;
  autoTranslateTo: Locale[];
  verified: boolean;
  phoneHash: string;
  avatarSeed: string;
  /** uploaded avatar image URL (public R2 object); falls back to initials */
  avatarUrl?: string;
  /** display initials (derived from handle) */
  initials: string;
  /** accent color token or oklch value */
  accentColor: string;
  joinedAt: Date;
  handleChangedAt: Date;
  /**
   * Just-in-time hint display counts, keyed by hint name (see `src/lib/hints.ts`).
   * Synced from localStorage so hints stay dismissed across devices. The user
   * doc is public, but these are only innocuous UI counters.
   */
  hintsSeen?: Record<string, number>;
}

export interface Connection {
  id: string;
  userIds: [string, string];
  establishedAt: Date;
  muted?: { by: string }[];
}

export interface Invite {
  id: string;
  fromUserId: string;
  toUserId: string;
  message: string;
  referenceCardId?: string;
  status: 'pending' | 'accepted' | 'declined' | 'expired' | 'withdrawn';
  expiresAt: Date;
  createdAt: Date;
}

export interface Resonance {
  id: string;
  cardId: string;
  userId: string;
  note?: string;
  createdAt: Date;
}

/**
 * A private note (小紙條) from a reader to a card's author — the "speak to the
 * author" layer of the three-layer response structure. No audience, no counts.
 * That a note was sent feeds the sender's own taste in the recommender (round
 * 26 §A3, lib/recommend/weights): its text is never read for it, and it never
 * lifts the card for anyone else.
 */
export interface Note {
  id: string;
  /** The card the note responds to. */
  cardId: string;
  fromUserId: string;
  /** The card's author — the only person who can read it besides the sender. */
  toUserId: string;
  text: string;
  createdAt: Date;
  readAt: Date | null;
}

/**
 * A private bookmark (收藏) — the "speak to yourself" layer. Stored under
 * `users/{uid}/bookmarks/{cardId}` (doc id == card id, so toggling is
 * idempotent). Owner-only; never counted, never notified. A saved card feeds
 * its saver's own taste in the recommender (round 26 §A3, the server reads
 * it), never the card's standing for anyone else.
 */
export interface Bookmark {
  cardId: string;
  createdAt: Date;
}

export interface CardLink {
  id: string;
  /** The viewer's own card doing the linking. */
  sourceCardId: string;
  /** uid of the viewer who created the link. */
  sourceAuthorId: string;
  /** The card being linked to (the article being viewed). */
  targetCardId: string;
  /** uid of the target card's author (denormalized for profile-level queries). */
  targetAuthorId: string;
  createdAt: Date;
}

/**
 * A card placed on the owner's thought map (Zettelkasten board). Doc id == the
 * card id, so a card can sit on the map at most once. Stored under
 * `thoughtMaps/{uid}/nodes` — owner-only.
 */
export interface ThoughtMapNode {
  id: string;
  cardId: string;
  /** World-space position of the node's top-left corner. */
  x: number;
  y: number;
  /** The group (category region) this node currently sits inside, if any. */
  groupId?: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * A directed, labeled arrow between two cards on the thought map. Doc id is
 * deterministic: `{sourceCardId}_{targetCardId}` (re-linking is idempotent).
 */
export interface ThoughtMapEdge {
  id: string;
  sourceCardId: string;
  targetCardId: string;
  /** What the relation means, e.g.「支持」「反例」「延伸自」. */
  label: string;
  createdAt: Date;
}

/** A named category region on the thought map that nodes can be filed into. */
export interface ThoughtMapGroup {
  id: string;
  title: string;
  /** OKLCH hue tinting the region (matches the card palette hues). */
  hue: number;
  x: number;
  y: number;
  w: number;
  h: number;
  createdAt: Date;
}

/**
 * A private conversation (私訊) between two connected users — the last rung of
 * the response ladder (收藏 → 紙條 → 共振 → 連結 → 對話). Doc id is the
 * connection's sorted pair id (`uid1_uid2`), so a connection maps to exactly
 * one conversation and opening it is idempotent. Only participants can read;
 * creating one requires the connection doc to exist.
 */
export interface Conversation {
  /** Sorted `uid1_uid2` — identical to the Connection id. */
  id: string;
  participants: [string, string];
  createdAt: Date;
  updatedAt: Date;
  /** Denormalized preview for list rendering (no subcollection read needed). */
  lastMessage: {
    text: string;
    senderId: string;
    sentAt: Date;
    /** It carried a picture (its words, if any, are `text`). */
    image?: boolean;
    /** It was a sticker (round 22): `text` is its fallback words, for builds that can't draw one. */
    sticker?: boolean;
    /** It was one of several pictures sent together, when the server says how many (the list: 「傳送了 3 張圖片」). */
    album?: { count: number };
    /** Its sender unsent it (round 16): `text` is empty, and the list says who unsent a message. */
    unsent?: boolean;
  } | null;
  /** Per-participant unread counters; sender increments the other side's. */
  unread: Record<string, number>;
  /** The card (or the card a note referenced) this conversation grew from. */
  originCardId?: string;
  /**
   * Notes left by someone the other isn't connected with, waiting for an
   * answer (a letter): `from` wrote them, and the other's reply is what
   * connects the two. Absent when no letter waits. Written by the server only.
   */
  request?: ConversationRequest;
}

/** A conversation's waiting letter (`conversations/{pair}.request`). */
export interface ConversationRequest {
  /** Who left the notes. */
  from: string;
  /** The card of their latest note. */
  cardId?: string;
  /** How many notes they have left since the letter opened. */
  count: number;
}

/** One message inside a conversation (`conversations/{id}/messages`). */
export interface Message {
  id: string;
  senderId: string;
  text: string;
  sentAt: Date;
  /** A shared card (後期: renders as an EmbedStoryCard). */
  cardRef?: string;
  /**
   * The sender's own 私人卡 (`cardRef`), shared with the recipient by this
   * message (api/v1/sharedCards): their pass to read it, until its sender
   * stops sharing it (停止分享), unsends it or the conversation goes.
   */
  privateShare?: boolean;
  /** Set when the message quotes the 紙條 that seeded the conversation. */
  noteRef?: { cardId: string; noteId: string };
  /** The message this one answers, as it read when the reply was sent. */
  replyTo?: MessageReplyQuote;
  /** The first link's title and picture, which the server adds a moment after the message. */
  preview?: MessageLinkPreview;
  /**
   * A picture sent with it (POST /api/v1/chat-images): read only through
   * GET /api/v1/chat-images/{id}, by the two people of the conversation.
   */
  image?: MessageImage;
  /**
   * What the message is beyond words and a card: `note` — a note (小紙條)
   * its sender left on the other's card (`cardRef`), carried into the
   * thread. A kind this build doesn't know reads as a plain message.
   */
  kind?: 'note';
  /**
   * A 小紙團 sticker (round 22, `src/lib/stickers/catalog.ts`): the message carries nothing else, and its `text` is
   * the sticker's fallback words (〔貼圖：謝謝〕) for builds that can't draw it — drawn only when the sticker isn't known.
   */
  sticker?: { pack: string; id: string };
  /**
   * One of several pictures sent together (round 22): `id` shared by the album, `index` its place, `count` how many
   * were sent. The thread draws one sender's consecutive messages of an album as one grid.
   */
  album?: { id: string; index: number; count: number };
  /**
   * The two people's reactions (round 16 §4), by uid — one each. Only the
   * five this build knows are kept: a reaction it doesn't know is drawn as nothing.
   */
  reactions?: Record<string, ReactionId>;
  /**
   * Its sender unsent it (round 16 §3): it then carries nothing else but
   * `senderId` and `sentAt` (its words empty), and is drawn as a line saying so.
   */
  unsentAt?: Date;
}

export interface MessageReplyQuote {
  id: string;
  senderId: string;
  /** Up to 140 characters of the quoted text; empty when it was only a card or a picture. */
  text: string;
  cardRef?: string;
  /** The quoted message carried a picture. */
  image?: boolean;
  /** The quoted message was a sticker (its fallback words are `text`). */
  sticker?: { pack: string; id: string };
  /** The quoted message was unsent: the quote keeps only who sent it (its words empty). */
  unsent?: boolean;
}

/** A picture a message carries: its id, and its size as kept (for drawing its place before it loads). */
export interface MessageImage {
  id: string;
  width: number;
  height: number;
}

/**
 * What a link says about itself — a message's first link, a link standing
 * alone in a story — as the server unfurled it (lib/links/preview). Readers
 * take one only through `linkPreviewOf` (lib/links/previewShape).
 */
export interface LinkPreview {
  /** The http(s) address that was unfurled, normalized (lib/links/url). */
  url: string;
  title: string;
  description?: string;
  siteName?: string;
  /** A site-relative `/api/link-image?…` path, loaded from our own origin. */
  image?: string;
}

/** A message's link preview (the same shape as a story's). */
export type MessageLinkPreview = LinkPreview;

export interface Notification {
  id: string;
  userId: string;
  type:
    | 'invite'
    | 'invite_accepted'
    | 'resonance_summary'
    | 'translation_done'
    | 'invite_expired'
    | 'resonance'
    | 'note'
    | 'card_link'
    | 'message'
    // Round 26: someone resonated with your card (the tap; `fromUserIds`, newest first), and the weekly read summary.
    | 'resonance_tap'
    | 'read_summary';
  payload: Record<string, unknown>;
  readAt: Date | null;
  createdAt: Date;
}

/**
 * One entry in a user's daily recommended feed. The feed API returns these
 * (lightweight — id + reason, no card content); the client resolves the card
 * itself through the visibility-enforced `getCardById` path.
 */
export interface RecommendationItem {
  cardId: string;
  /** Which channel matched best — `insight` (same realization) or `situation` (same lived experience). */
  channel: 'insight' | 'situation';
  /** The strong model's one-line「為什麼這篇可能對你有共鳴」. */
  reason: string;
  /** Final ranking score (higher = better fit). */
  score: number;
}

export type NewCard = Omit<Card, 'id' | 'publishedAt' | 'readCount' | 'resonanceCount' | 'inviteCount' | 'translations'> & {
  publishedAt?: Date | null;
  translations?: Card['translations'];
};
