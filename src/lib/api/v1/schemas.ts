import { z } from 'zod';

/**
 * The versioned API contract for the native apps (and anything else outside
 * the web client). These Zod schemas are the single source of truth: routes
 * validate with them, and `npm run api:openapi` turns them into
 * openapi/v1/openapi.json, from which the Swift and Kotlin clients are
 * generated. Changing a schema is changing the contract — additive only
 * within v1 (new optional fields, new endpoints); clients must tolerate
 * fields they do not know.
 *
 * Response enums are the exception to "additive": a generated client decodes
 * an enum into a closed type, and one value it does not know fails the whole
 * answer (a feed page, a profile) — so adding a value to an enum a response
 * carries (visibility, primaryLocale, status, …) is a breaking change within
 * v1, and the server never sends anything else: what it reads from Firestore
 * is normalized to the documented values first (`visibilityOf` in
 * ./present). Request enums may grow (an old client just never sends the
 * new value).
 */
export const apiRegistry = z.registry<{ id: string }>();

function named<T extends z.ZodType>(schema: T, id: string, description?: string): T {
  const s = (description ? schema.describe(description) : schema) as T;
  apiRegistry.add(s, { id });
  return s;
}

export const ErrorCode = named(
  z.enum(['unauthenticated', 'invalid_request', 'forbidden', 'blocked', 'not_found', 'conflict', 'rate_limited', 'internal']),
  'ErrorCode',
);

export const ApiError = named(
  z.object({
    error: z.object({
      code: ErrorCode,
      message: z.string(),
      /** Field-level problems for `invalid_request`. */
      issues: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
    }),
  }),
  'ApiError',
  'Every non-2xx response has this shape.',
);

export const AccountDeletionStatus = named(
  z.object({
    requestedAt: z.iso.datetime(),
    /** When the account is purged; signing in before then can cancel it. */
    purgeAfter: z.iso.datetime(),
  }),
  'AccountDeletionStatus',
  'A scheduled deletion of the account (what GET /api/account/deletion answers as `deletion`).',
);

export const Me = named(
  z.object({
    id: z.string(),
    handle: z.string(),
    initials: z.string(),
    accentColor: z.string(),
    bio: z.string().nullable(),
    avatarUrl: z.string().nullable(),
    /** ISO 3166 code (e.g. TW) or free text; null when never set. */
    region: z.string().nullable(),
    primaryLocale: z.enum(['en', 'zh-TW']).nullable(),
    /** When the pen name last changed (the settings hint: once every 30 days). */
    handleChangedAt: z.iso.datetime().nullable(),
    /**
     * The account's scheduled deletion (the undo banner shows until
     * `purgeAfter`), null when none — so the app needs no second request.
     * Absent only from servers older than the field.
     */
    deletion: AccountDeletionStatus.nullable().optional(),
    /** The languages the account reads stories translated into (PATCH /me `autoTranslateTo`). Absent when never set, and from older servers. */
    autoTranslateTo: z.array(z.enum(['en', 'zh-TW'])).optional(),
    /** How often each hint was shown, by its key (PATCH /me `hintsSeen`). Absent when none was, and from older servers. */
    hintsSeen: z.record(z.string(), z.number().int()).optional(),
  }),
  'Me',
  'The signed-in account.',
);

export const Author = named(
  z.object({
    id: z.string(),
    handle: z.string(),
    initials: z.string(),
    accentColor: z.string(),
    avatarUrl: z.string().nullable(),
    /** Seeds the hand-drawn avatar's wobble, so it matches the web. */
    avatarSeed: z.string().nullable(),
    verified: z.boolean(),
    region: z.string().nullable(),
  }),
  'Author',
);

export const CoverFrame = named(
  z.object({
    /** The picture's point at the frame's centre, as a fraction of its width (0…1). */
    cx: z.number().min(0).max(1),
    /** …and of its height (0…1). */
    cy: z.number().min(0).max(1),
    /** 1 = the picture just covers the frame; up to 2. */
    zoom: z.number().min(1).max(2),
    /** The picture's width ÷ height when it was framed (0.2…5): draw the crop without measuring the picture. */
    ar: z.number().min(0.2).max(5),
  }),
  'CoverFrame',
  "Where a cover is looked at: every shape it is drawn in centres its own crop on (cx, cy) at `zoom`, moved to lie inside " +
    'the picture (coverCrop, pinned by native/fixtures/cover-frame.json). Null or absent: the centre at zoom 1.',
);

export const SummaryTranslation = named(
  z.object({
    title: z.string(),
    /** Plain text, at most 96 characters, as `excerpt`. */
    excerpt: z.string(),
  }),
  'SummaryTranslation',
  "A card's title and excerpt translated by AI into one interface language.",
);

export const SummaryTranslations = named(
  z.object({
    en: SummaryTranslation.optional(),
    'zh-TW': SummaryTranslation.optional(),
  }),
  'SummaryTranslations',
  "A published public card's title and excerpt translated by AI, made when it was published or last edited: into " +
    'English for a Chinese story, into 繁體中文 for a Latin-script one, both for Japanese or Korean. Sent only while ' +
    'they still describe the card as it is. Show one only when the reader turned auto-translate on, and mark it.',
);

export const FeedCard = named(
  z.object({
    id: z.string(),
    slug: z.string().nullable(),
    title: z.string(),
    /** Plain text (Markdown stripped), at most 96 characters as on the web's story cards. */
    excerpt: z.string(),
    tags: z.array(z.string()),
    /** ISO 8601; null for a draft (only its author ever sees one). */
    publishedAt: z.string().nullable(),
    /**
     * Null for anonymous cards: the byline is never revealed — except to the
     * author, in their own card box (which marks the card `anonymous`).
     */
    author: Author.nullable(),
    anonymous: z.boolean(),
    visibility: z.enum(['public', 'connections', 'private']),
    imageUrl: z.string().nullable(),
    /**
     * The cover made smaller for lists (≤ 960 px on its longer edge, WebP), when the server kept one beside it;
     * null when it didn't (an older cover, a generated one) — then draw `imageUrl`. Only for lists and small
     * pictures: a card's own page and its share image keep `imageUrl`. Absent only from servers older than the field.
     */
    imageThumbUrl: z.string().nullable().optional(),
    imageLabel: z.string().nullable(),
    /**
     * Where the cover is looked at (CoverFrame); null for the centre, or
     * without a cover. Absent only from servers older than the field.
     */
    imageFrame: CoverFrame.nullable().optional(),
    /**
     * The title and excerpt translated by AI, by interface language (only
     * a published public card's, and only while current); null when there
     * are none. Absent only from servers older than the field.
     */
    summaryTranslations: SummaryTranslations.nullable().optional(),
    /** The cover's dominant hue, which picks the card's palette (lib/design/dominantHue). */
    accentHue: z.number().nullable(),
    readMinutes: z.number().int(),
    /** The card this one resonates with (a response card), if any. */
    referenceCardId: z.string().nullable(),
    /** Recommended feed only: why this card was picked for the reader. */
    reason: z.string().nullable(),
    /**
     * Your own card in the trash only (the trash shelf, your card's page,
     * what trashing and restoring it answer): when it went in (ISO 8601).
     * Absent everywhere else — a card in the trash is no one else's to see.
     */
    trashedAt: z.string().nullable().optional(),
    /** Beside `trashedAt`: when it is deleted for good (ISO 8601), 30 days after it went in. */
    purgeAt: z.string().nullable().optional(),
    /**
     * Beside `trashedAt`: the visibility restoring it brings back (it is
     * private while in the trash) — say so before a restore republishes it.
     */
    restoresTo: z.enum(['public', 'connections', 'private']).nullable().optional(),
    /**
     * Your own card on your own card box shelves only (published, private,
     * draft): when it was last changed (ISO 8601) — the 草稿 shelf lists drafts
     * and private cards together by it. Absent everywhere else: when a card is
     * edited is no one else's to read.
     */
    editedAt: z.string().nullable().optional(),
  }),
  'FeedCard',
);

export const FeedPage = named(
  z.object({
    cards: z.array(FeedCard),
    /**
     * Pass back as `cursor` for the next page; null at the end. The last
     * card's time to the millisecond: cards sharing that millisecond can be
     * skipped — prefer `nextPageToken`.
     */
    nextCursor: z.string().nullable(),
    /**
     * Pass back as `pageToken` for the next page (opaque; it resumes exactly
     * after this page's last card); null at the end. Absent only from servers
     * older than the field.
     */
    nextPageToken: z.string().nullable().optional(),
  }),
  'FeedPage',
);

export const CardList = named(z.object({ cards: z.array(FeedCard) }), 'CardList');

export const CardBox = named(
  z.object({
    published: CardList.optional(),
    private: CardList.optional(),
    draft: CardList.optional(),
    resonated: CardList.optional(),
    linked: CardList.optional(),
    bookmarks: CardList.optional(),
    trash: CardList.optional(),
  }),
  'CardBox',
  'Shelves of your card box, each one asked for (and only those) exactly as GET /me/cards?tab= answers it.',
);

export const RecommendedFeed = named(
  z.object({
    cards: z.array(FeedCard),
    /**
     * `fresh`: today's picks. `stale`: earlier picks, or a quick first pass
     * without reasons, while today's are being prepared — asking again a
     * minute or so later brings them. Absent means `fresh`. No other value
     * is added within v1.
     */
    status: z
      .enum(['fresh', 'stale'])
      .optional()
      .describe("fresh: today's picks. stale: earlier (or quick, reason-less) picks while today's are prepared; ask again later. Absent: fresh."),
  }),
  'RecommendedFeed',
  "Today's picks (a CardList, plus whether they are today's).",
);

export const LinkPreview = named(
  z.object({
    /** The link, normalized (an http(s) URL); match it to a standalone link in the story. */
    url: z.string(),
    title: z.string(),
    description: z.string().nullable(),
    siteName: z.string().nullable(),
    /**
     * The page's picture as a SITE-RELATIVE path ('/api/link-image?u=…&s=…'),
     * served by this API's origin (resolve it against the base URL); null
     * when the page had none.
     */
    image: z
      .string()
      .nullable()
      .describe("A site-relative path ('/api/link-image?u=…&s=…'): resolve it against the API's origin. Null when the page had no picture."),
  }),
  'LinkPreview',
  'What a link says about itself: the title, description, site name and picture of its page, as the server read it.',
);

/** The faces CardTap shows at most; `more` says there are others. */
export const TAP_FACES_MAX = 3;

export const TapPassage = named(
  z.object({
    /** The passage's id (8 hex characters): pass it to PUT /cards/{id}/tap/passage. The same sentence keeps it. */
    id: z.string(),
    /** One sentence or clause of the story, exactly as its author wrote it (whitespace read as one space). Show it whole. */
    text: z.string(),
  }),
  'TapPassage',
  "One passage a card offers after you resonate with it (round 27): the author's own words, picked when it was published.",
);

export const TapPicked = named(
  z.object({
    /** The passage id the picks carry (8 hex characters): GET /cards/{id}/taps?passage= lists who picked it. */
    id: z.string(),
    /** The sentence, as it was picked (whitespace read as one space): one piece of one block of the story as it is now. */
    text: z.string(),
    /** Who picked it, newest first, at most 3 — never the author, never across a block either way. */
    people: z.array(Author),
    /** Others picked it too (a boolean, never a count): the list says who. */
    more: z.boolean(),
  }),
  'TapPicked',
  "A sentence of the author's story that readers picked after they resonated, and the faces of who picked it (round 29).",
);

export const CardTap = named(
  z.object({
    /** The viewer resonated with this card (共振, the tap) and hasn't taken it back. Always false for its author. */
    mine: z.boolean(),
    /**
     * Who resonated, as faces, at most 3, newest first. A reader sees themselves first (when `mine`), then the
     * people they are connected with who resonated — never strangers. The card's author sees the 3 newest of
     * everyone who resonated. Never a count.
     */
    faces: z.array(Author),
    /** More people than these 3 faces. Never shown as a number (since round 29 not drawn either: say it, if anything). */
    more: z.boolean(),
    /**
     * Whether a note (POST /notes) from the viewer on this card would be taken now: false while 3 notes of theirs
     * wait for the author's answer (and always for the author). Says nothing of a pen name: ask for one first.
     */
    mayNote: z.boolean(),
    /**
     * For a reader (round 27): up to 3 passages of the story, word for word, to ask which part stayed with them right
     * after they resonate — the same for every reader. Absent or empty: the card offers none (a short story, or not made
     * yet). Never for the card's author.
     */
    passages: z.array(TapPassage).optional(),
    /** Beside `passages`: the id of the passage the reader picked, when it is one of them now; else null. */
    passage: z.string().nullable().optional(),
    /**
     * For the card's author only (round 29): each sentence readers picked that is in the story now — whether or not it
     * is still one of the card's passages —, in the story's order, with up to 3 of its pickers. Absent for every reader,
     * and for the author while there is none to show.
     */
    picked: z.array(TapPicked).optional(),
  }),
  'CardTap',
  'The resonance tap (共振) on a card: whether you resonated, and the faces of who did as you may see them.',
);

export const CardDetail = named(
  z.object({
    card: FeedCard,
    /** The story, as stored: Markdown (see src/lib/markdown/editorSchema.ts). */
    story: z.string(),
    visibility: z.enum(['public', 'connections', 'private']),
    anonymous: z.boolean(),
    resonanceCount: z.number().int(),
    /**
     * The through line the card's reading found (round 26: ≤ 60 characters, the story's language), if read — for
     * its author only; null to everyone else (no screen shows a reader what the model read).
     */
    coreInsight: z.string().nullable(),
    /** The viewer wrote this card. */
    isOwner: z.boolean(),
    /** The card this one responds to, when the viewer may see it. */
    referenceCard: FeedCard.nullable(),
    /**
     * The resonance tap (共振): for a reader who may resonate with the card (published, not their own, read without
     * a shared-card pass) and for its author on their published card. Null for anyone else: a draft, a card in the
     * trash, someone else's 私人卡 shared in a conversation, a named card across a block either way. Absent only
     * from servers older than the field.
     */
    tap: CardTap.nullable().optional(),
    /** The viewer bookmarked this card (PUT /me/bookmarks/{cardId}). Absent from older servers. */
    bookmarked: z.boolean().optional(),
    // The card page's lists, when asked for with `include` (absent otherwise):
    // each is exactly what its own endpoint answers this viewer.
    /** `include=resonances`: GET /cards/{id}/resonances. */
    resonances: CardList.optional(),
    /** `include=related`: GET /cards/{id}/related. */
    related: CardList.optional(),
    /** `include=links`: GET /cards/{id}/links (empty unless the viewer wrote the card). */
    links: CardList.optional(),
    /**
     * `include=embeds`: the cards the story embeds (a card link standing alone
     * in its paragraph), in reading order, each once — those the viewer may
     * read, minus authors they blocked. Match a link's /card/{key} to a card's
     * slug or id; a link with no card here is drawn as a plain link.
     */
    embeds: CardList.optional(),
    /**
     * Previews of the links standing alone in the story, in reading order: a
     * paragraph whose only content is one http(s) link (`[text](url)`,
     * `<url>`, a reference link, or the bare address — see
     * native/fixtures/story-link-cards.json). Draw such a paragraph as a link
     * card when its normalized URL has a preview here, else as the plain
     * link. Absent from older servers; at most 10.
     */
    linkPreviews: z
      .array(LinkPreview)
      .optional()
      .describe(
        'Previews of the links standing alone in the story, in reading order (at most 10). Draw such a paragraph as a link card when its normalized URL has a preview here, else as the plain link. Absent from older servers.',
      ),
  }),
  'CardDetail',
);

export const Profile = named(
  z.object({
    author: Author,
    bio: z.string().nullable(),
    joinedAt: z.string().describe('ISO 8601'),
    /** Public, attributed cards, counted like the web's profile (its first 40). */
    cardCount: z.number().int(),
    isSelf: z.boolean(),
    isConnected: z.boolean(),
    /** The viewer blocked this person: their cards are not listed. */
    isBlocked: z.boolean(),
    /** `include=cards`: the first page of GET /users/{handle}/cards (with this request's `limit`). */
    cards: FeedPage.optional(),
    /** `include=links`: GET /users/{handle}/links. */
    links: CardList.optional(),
  }),
  'Profile',
);

/**
 * A user or card id as the client sends it. Ids become Firestore document
 * paths on the server, so a `/` would let a caller point a read at another
 * user's subcollection (e.g. `alice/blocks/bob`); Firebase uids and
 * auto-ids never contain one.
 */
const DocId = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/, 'Not a valid id.');

// Optional request fields accept `null` as "absent": generated clients differ
// (Swift omits a nil field, Kotlin's kotlinx.serialization sends `null`).

/** The web's limits: a pen name of 2–20 characters (any script), an 80-character bio. */
export const HANDLE_MIN = 2;
export const HANDLE_MAX = 20;
export const BIO_MAX = 80;

/**
 * A pen name as it is saved: trimmed, 2–20 characters, any script — but never
 * a path or query (it is the /u/{handle} segment), no control characters,
 * and nothing Firestore can't take as its reservation's id (`..`, `__…__`).
 */
const Handle = z
  .string()
  .trim()
  .min(HANDLE_MIN)
  .max(HANDLE_MAX)
  .regex(/^[^/?#\\\p{Cc}]+$/u, 'Not a valid pen name.')
  .refine((h) => h !== '..' && !/^__.*__$/.test(h.toLowerCase()), 'Not a valid pen name.')
  .refine((h) => !hasInvisible(h), 'Not a valid pen name.');

/**
 * Whether a pen name holds a character that shows nothing: a format character
 * (zero-width space, bidi overrides and isolates, …) would let a second
 * account hold a name that renders exactly as someone else's — the
 * reservation tells only case apart. The zero-width joiner stays where it
 * joins two emoji (👨‍👩‍👧).
 */
export function hasInvisible(h: string): boolean {
  if (/(?!\u200D)\p{Cf}/u.test(h)) return true;
  const joinedEmoji = /(\p{Extended_Pictographic}\uFE0F?)\u200D(?=\p{Extended_Pictographic})/gu;
  return h.replace(joinedEmoji, '$1').includes('\u200D');
}
const Locale = z.enum(['en', 'zh-TW']);
const Region = z.string().trim().min(1).max(40);

export const CreateProfileRequest = named(
  z.object({ handle: Handle, region: Region, primaryLocale: Locale }),
  'CreateProfileRequest',
  'Onboarding: the pen name, region and writing language of a new account.',
);

// The rules' limits on a client's own `users/{uid}` write (firestore.rules validProfileChanges), which PATCH /me
// keeps too (2a-social): src/lib/api/v1/profileLimits.test.ts holds them equal.
export const AUTO_TRANSLATE_MAX = 5;
export const HINTS_SEEN_MAX = 50;
export const HINT_COUNT_MAX = 10;
export const AVATAR_URL_MAX = 2048;
/** A hint's key (lib/hints): never a `.`, which would make it a path inside `hintsSeen`. */
export const HintKey = z.string().regex(/^[A-Za-z0-9_:-]{1,64}$/, 'Not a valid hint key.');

export const UpdateProfileRequest = named(
  z.object({
    handle: Handle.nullish(),
    /** An empty string clears the bio. */
    bio: z.string().trim().max(BIO_MAX).nullish(),
    region: Region.nullish(),
    primaryLocale: Locale.nullish(),
    /** A profile photo by its URL: one of our stored pictures (`/api/upload` `purpose=avatar` answers it). */
    avatarUrl: z.string().max(AVATAR_URL_MAX).nullish(),
    /** …or by its storage key (the same upload's `key`); with both, `avatarKey` wins. */
    avatarKey: z.string().max(512).nullish(),
    /** The languages to read stories translated into (replaces the list). */
    autoTranslateTo: z.array(Locale).max(AUTO_TRANSLATE_MAX).nullish(),
    /**
     * How often hints were shown, by key: merged into the stored counts, each the larger of the two (a count never
     * falls), at most 50 keys in all.
     */
    hintsSeen: z.record(HintKey, z.number().int().min(0).max(HINT_COUNT_MAX)).nullish(),
  }),
  'UpdateProfileRequest',
  'Only the fields sent change.',
);

export const UpdateCardRequest = named(
  z.object({
    visibility: z.enum(['public', 'connections', 'private']).nullish(),
    anonymous: z.boolean().nullish(),
  }),
  'UpdateCardRequest',
  'Your card\'s visibility and byline; only the fields sent change.',
);

export const TranslationLanguage = z.enum(['en', 'zh-TW']);

export const TranslationRequest = named(
  z.object({
    /** The reader's interface language: what the story is translated into. */
    to: TranslationLanguage,
  }),
  'TranslationRequest',
);

export const TranslationResponse = named(
  z.object({
    /** The language asked for (`en` or `zh-TW`) — a string, not an enum, so no client must know every value. */
    to: z.string(),
    /** The title, translated. */
    title: z.string(),
    /** The story, translated: Markdown, as `CardDetail.story`. */
    story: z.string(),
  }),
  'TranslationResponse',
  "A story translated by AI into the reader's interface language (title and story only).",
);

export const PublishResponse = named(
  z.object({
    id: z.string(),
    /** The English URL slug; null if generating it failed (the card is live at its id). */
    slug: z.string().nullable(),
    /** False when it was already live (publishing again never re-dates a card). */
    firstPublish: z.boolean(),
  }),
  'PublishResponse',
);

export const ApplyEditResponse = named(
  z.object({
    id: z.string(),
    /** Where the card lives: its English slug, or null (it is served at its id). */
    slug: z.string().nullable(),
    /** False when there was no pending edit to apply (applying twice changes nothing). */
    applied: z.boolean(),
  }),
  'ApplyEditResponse',
);

export const TrashedCard = named(
  z.object({
    /** Your card as the trash shelf shows it (with `trashedAt`, `purgeAt`, `restoresTo`). */
    card: FeedCard,
    /** False when it was in the trash already: nothing was written, and its 30 days run from when it first went in. */
    changed: z.boolean(),
  }),
  'TrashedCard',
);

export const RestoredCard = named(
  z.object({
    /** Your card as your card box shows it, out of the trash. */
    card: FeedCard,
    /** False when it wasn't in the trash: nothing was written. */
    changed: z.boolean(),
    /**
     * A resonance that came back on its own: it no longer answers the card it
     * answered (another of your cards answers that one now, or that card
     * answers this one). Say so; there is nothing to do about it.
     */
    droppedResonance: z.boolean(),
  }),
  'RestoredCard',
);

export const EmptiedTrash = named(
  z.object({
    /** Cards deleted for good by this call. */
    deleted: z.number().int(),
    /** Cards still in the trash from before `before`: call again with `before` while this and `deleted` are both above 0. */
    remaining: z.number().int(),
    /** What this emptying takes (cards moved to the trash up to this moment, ISO 8601): send it back on the next call. */
    before: z.string(),
  }),
  'EmptiedTrash',
);

export const ResonateRequest = named(
  z.object({
    /** One of your published, public cards that answers no other card yet (its id). */
    cardId: DocId,
  }),
  'ResonateRequest',
  'Make a card you have already written a resonance of this one.',
);

export const ResonateResponse = named(
  z.object({
    /** Your card as your card box shows it, now answering this one (`referenceCardId`). */
    card: FeedCard,
    /** False when it already answered this card: nothing was written, no one was rung. */
    changed: z.boolean(),
  }),
  'ResonateResponse',
);

export const TapResponse = named(
  z.object({
    /** Whether you resonate with the card now. */
    on: z.boolean(),
    /** False when it already was so: nothing was written, no one was told. */
    changed: z.boolean(),
  }),
  'TapResponse',
);

export const TapNote = named(
  z.object({
    /** The first line of the latest note this person left you on the card, at most 80 characters. */
    excerpt: z.string(),
  }),
  'TapNote',
);

export const TapPassageQuote = named(
  z.object({
    /** The words of the passage, as they were when it was picked. */
    text: z.string(),
  }),
  'TapPassageQuote',
);

export const TapPassageRequest = named(
  z.object({
    /** One of `CardDetail.tap.passages`' ids, or null to clear your pick. */
    passage: z
      .string()
      .regex(/^[0-9a-f]{8}$/, 'Not a passage id.')
      .nullable(),
  }),
  'TapPassageRequest',
);

export const TapPassageResponse = named(
  z.object({
    /** The id of the passage you picked now, or null. */
    passage: z.string().nullable(),
  }),
  'TapPassageResponse',
);

export const TapPerson = named(
  z.object({
    author: Author,
    /** Their latest note on this card, for the card's author on a named card only (open their conversation); else null. */
    note: TapNote.nullable(),
    /**
     * The passage this person picked (round 27): on the rows of the card's author's list; on a reader's list only on
     * their own row. Absent or null: no pick (every other row of a reader's list). Kept as they picked it, so it stays
     * after an edit.
     */
    passage: TapPassageQuote.nullable().optional(),
  }),
  'TapPerson',
);

export const TapList = named(
  z.object({
    /** Newest first. */
    people: z.array(TapPerson),
    /** Pass back as `pageToken` for the next page (the author's list, 30 a page); null at the end. */
    nextPageToken: z.string().nullable(),
  }),
  'TapList',
  'Who resonated with a card (共振): everyone, for its author; the people you are connected with, for a reader.',
);

export const TapListQuery = z.object({
  pageToken: z.string().min(1).max(512).nullish(),
  /** Round 29: the author's list of one picked sentence's people (a `TapPicked.id`); changes nothing for a reader. */
  passage: z.string().regex(/^[0-9a-f]{8}$/, 'Not a passage id.').nullish(),
});

/** POST /cards/{id}/reading's session id: one per page view, made by the client. */
const ReadingSession = z.string().regex(/^[A-Za-z0-9-]{8,40}$/, 'Not a valid session.');

export const ReadingReportRequest = named(
  z.object({
    /** The page view's own id (8–40 of A–Z a–z 0–9 -), kept for every report of that view. */
    session: ReadingSession,
    /** Seconds the page was in front and in use so far in this session (its running total, never a delta). */
    activeSeconds: z.number(),
    /** How much of the story was scrolled through so far in this session, 0…1. */
    progress: z.number(),
    /** The end of the story came into view in this session. */
    reachedEnd: z.boolean(),
    /** The share button was used in this session. */
    shared: z.boolean().nullish(),
  }),
  'ReadingReportRequest',
  "How a reader read a card in one page view, as the session's running totals so far (send it again as they grow).",
);

/** The web's limits (client/notes.ts, client/messages.ts; mirrored in firestore.rules). */
export const NOTE_TEXT_MAX = 2000;
export const MESSAGE_TEXT_MAX = 2000;

/** A sender's own id for what they send (SendNoteRequest, SendMessageRequest): 16–64 of [A-Za-z0-9_-]. */
const ClientId = z.string().regex(/^[A-Za-z0-9_-]{16,64}$/, 'Not a valid client id.');

export const SendNoteRequest = named(
  z.object({
    cardId: DocId,
    text: z.string().trim().min(1).max(NOTE_TEXT_MAX),
    /**
     * The sender's own id for this note, made when they press send and kept
     * for every retry of it: it becomes the note's id, so sending it again (a
     * retry after a lost answer) finds the note already left — answered as
     * the first send was, ringing no one twice — instead of leaving it twice,
     * for as long as the note is there (a card deleted takes its notes with
     * it: a resend then is the 404 of a missing card).
     */
    clientId: ClientId.nullish(),
  }),
  'SendNoteRequest',
  "A note to a card's author (the server finds the author — anonymous cards too).",
);

export const SendNoteResponse = named(z.object({ id: z.string() }), 'SendNoteResponse');

export const NoteRef = named(z.object({ cardId: DocId, noteId: DocId }), 'NoteRef', 'The note a message answers.');

export const StickerRef = named(
  z.object({
    pack: z.string().regex(/^[a-z0-9-]{1,32}$/, 'Not a sticker pack.'),
    id: z.string().regex(/^[a-z0-9-]{1,40}$/, 'Not a sticker.'),
  }),
  'StickerRef',
  'A 小紙團 sticker: its pack and its id in the pack (public/stickers/catalog.json).',
);

export const AlbumRef = named(
  z
    .object({
      id: ClientId,
      index: z.number().int().min(0).max(9),
      count: z.number().int().min(2).max(10),
    })
    .refine((a) => a.index < a.count, { message: 'An album index is below its count.', path: ['index'] }),
  'AlbumRef',
  'Several pictures sent together: the album, this picture\'s place in it, and how many it has.',
);

export const SendMessageRequest = named(
  z.object({
    /** The other person's user id. */
    to: DocId,
    /** May be empty when a card or a picture is attached. */
    text: z.string().trim().max(MESSAGE_TEXT_MAX),
    /** A card attached to the message (its id). */
    cardRef: DocId.nullish(),
    /**
     * A picture sent with the message: one this sender uploaded for this
     * conversation (POST /chat-images), by its id, sent with no other message.
     * A message carries a card or a picture, never both.
     */
    image: DocId.nullish(),
    /**
     * A 小紙團 sticker (round 22): a pack and a sticker of the catalog. A sticker is sent on its own — no text, card,
     * picture or note — though it may answer a message (`replyTo`).
     */
    sticker: StickerRef.nullish(),
    /**
     * One of several pictures sent together (only beside `image`): the album's id (the sender's own, as a clientId),
     * this picture's place in it and how many pictures it has. Only the first rings the other person's devices.
     */
    album: AlbumRef.nullish(),
    noteRef: NoteRef.nullish(),
    /** The message this one answers: one in the same conversation (its id). The thread quotes it above the reply. */
    replyTo: DocId.nullish(),
    /**
     * The sender's own id for this message, made before it is sent: it becomes
     * the message's id, so sending it again (a retry after a lost answer) finds
     * the one already written instead of writing it twice.
     */
    clientId: ClientId.nullish(),
  }),
  'SendMessageRequest',
);

/** POST /chat-images's form fields beside its `file` (multipart, so not a JSON body: described in openapi.ts). */
export const ChatImageUploadForm = z.object({
  /** The other person's user id. */
  to: DocId,
  clientId: ClientId.nullish(),
});

export const ChatImageResponse = named(
  z.object({
    /** What a message names the picture by (SendMessageRequest.image) and where it is read (GET /chat-images/{id}). */
    id: z.string(),
    /** Its size in pixels as kept (upright, at most 2048 on its longest side: lib/storage/image). */
    width: z.number().int(),
    height: z.number().int(),
  }),
  'ChatImageResponse',
  'A picture uploaded for a conversation, ready to be sent in a message.',
);

export const SendMessageResponse = named(
  z.object({
    /** conversations/{id}: the two user ids, sorted, joined by "_". */
    conversationId: z.string(),
    id: z.string(),
  }),
  'SendMessageResponse',
);

export const AcceptInviteResponse = named(
  z.object({
    /** connections/{id}: the two user ids, sorted, joined by "_". */
    connectionId: z.string(),
  }),
  'AcceptInviteResponse',
);

export const RegisterDeviceRequest = named(
  z.object({
    /** The FCM registration token (iOS: FCM's token for the APNs one). */
    token: z.string().min(1).max(4096),
    platform: z.enum(['ios', 'android']),
    /** The app's UI language — pushes are written in it ("zh…" reads zh-TW, anything else en). */
    locale: z.string().max(35).nullish(),
    appVersion: z.string().max(40).nullish(),
    /**
     * What this build can do with a push beyond showing it. `chat-push`: an
     * Android build that draws a conversation's messages itself, so its chat
     * pushes come as data (each message, stacked per conversation). Unknown
     * values are kept and ignored.
     */
    capabilities: z.array(z.string().regex(/^[a-z0-9-]{1,32}$/)).max(8).nullish(),
    /**
     * The device's time zone, an IANA name (`Asia/Taipei`; iOS
     * `TimeZone.current.identifier`, Android `ZoneId.systemDefault().id`).
     * Kept for sending scheduled pushes at the reader's own evening; one the
     * server's time zone data doesn't know is kept as unknown, never refused.
     */
    timeZone: z.string().max(64).nullish(),
  }),
  'RegisterDeviceRequest',
  "This install's push token. Register after sign-in and whenever the token, the app's language or the time zone changes.",
);

export const NotificationSettings = named(
  z.object({
    /**
     * "A card for tonight": up to three evenings a week (around 20:00 Taipei
     * time), one card from your picks that you haven't been sent before —
     * not on a day you opened your picks yourself.
     */
    picks: z.boolean(),
    /** A push when someone you're connected with publishes a new public card under their pen name. */
    connectionCards: z.boolean(),
    /**
     * Pushes of messages and notes sent to you. On until turned off; older
     * servers leave it out, and its absence means on.
     */
    messages: z.boolean().optional(),
    /**
     * A push when someone resonates with your card (共振, the tap) — once per person and card, ever. On until turned
     * off; older servers leave it out, and its absence means on.
     */
    resonanceTaps: z.boolean().optional(),
  }),
  'NotificationSettings',
  'Which pushes you want. picks and connectionCards go beyond the ones answering you and are off until turned on; messages (messages and notes) and resonanceTaps (someone resonated with your card) are on until turned off. A card answering yours always rings.',
);

export const UpdateNotificationSettingsRequest = named(
  z.object({
    picks: z.boolean().nullish(),
    connectionCards: z.boolean().nullish(),
    messages: z.boolean().nullish(),
    resonanceTaps: z.boolean().nullish(),
  }),
  'UpdateNotificationSettingsRequest',
  'Only the switches sent change; turning one on records when you agreed to it.',
);

/** firestore.rules' cap on a report's details (REPORT_DETAIL_MAX on the web). */
export const REPORT_DETAIL_MAX = 1000;

const ReportReason = z.enum(['spam', 'harassment', 'hate', 'sexual', 'self_harm', 'violence', 'other']);

export const ReportCardRequest = named(
  z.object({
    reason: ReportReason,
    detail: z.string().trim().max(REPORT_DETAIL_MAX).nullish(),
  }),
  'ReportCardRequest',
  "Report a card — anonymous ones too: the server knows its author, the app doesn't.",
);

export const CreateReportRequest = named(
  z.object({
    /** `user`: a person (their profile). `message`: a message someone sent you. Cards: POST /cards/{key}/report. */
    targetType: z.enum(['user', 'message']),
    /** `user`: their user id. `message`: the message's id — or the conversation's own id, to report it as a whole. */
    targetId: DocId,
    /** `message`: the conversation it is in (conversations/{id}). */
    conversationId: DocId.nullish(),
    reason: ReportReason,
    detail: z.string().trim().max(REPORT_DETAIL_MAX).nullish(),
  }),
  'CreateReportRequest',
  'Report a person or a message. The server keeps a copy of what was reported, so deleting it later erases no evidence.',
);

export const CreateReportResponse = named(z.object({ id: z.string() }), 'CreateReportResponse');

/**
 * A message's reaction (round 16 §4): the five stickers, by meaning. Clients draw an id they don't know as
 * nothing, so a sixth later is additive.
 */
export const Reaction = named(z.enum(['heart', 'moved', 'laugh', 'hug', 'thumbs']), 'Reaction', 'A reaction to a message.');

export const SetReactionRequest = named(
  z.object({ reaction: Reaction }),
  'SetReactionRequest',
  'Answer a message with a reaction (it replaces your own earlier one on that message).',
);


export const PrivateShares = named(
  z.object({ sharedPrivately: z.boolean() }),
  'PrivateShares',
  'Whether your card was ever sent privately in a message (a 私人卡 shared in a conversation). Its recipient knows ' +
    'you wrote it, so making it anonymous hides it from no one who read it then.',
);

export const HandleAvailability = named(
  z.object({ handle: z.string(), available: z.boolean() }),
  'HandleAvailability',
  'Whether a pen name is free (your own counts as free).',
);

export const FeedQuery = z.object({
  limit: z.coerce.number().int().min(1).max(30).default(12),
  cursor: z.iso.datetime().optional(),
  /** A page's `nextPageToken` (checked by the service: lib/api/v1/paging). Wins over `cursor`. */
  pageToken: z.string().min(1).max(512).optional(),
});

/** A comma-separated list of names (`include=a,b`): the known ones, as a set; unknown names are ignored. */
function includeList<const T extends readonly string[]>(names: T) {
  return z
    .string()
    .max(200)
    .optional()
    .transform((v) => new Set((v ?? '').split(',').map((n) => n.trim()).filter((n): n is T[number] => (names as readonly string[]).includes(n))));
}

/** What GET /cards/{key} can bring along (`include=`). */
export const CARD_INCLUDES = ['resonances', 'related', 'links', 'embeds'] as const;
export const CardDetailQuery = z.object({ include: includeList(CARD_INCLUDES) });

/** What GET /users/{handle} can bring along (`include=`), and the included cards page's size. */
export const PROFILE_INCLUDES = ['cards', 'links'] as const;
export const ProfileQuery = z.object({ include: includeList(PROFILE_INCLUDES), limit: FeedQuery.shape.limit });

/** The card box's shelves (the web's me page). */
export const CardBoxTab = z.enum(['published', 'private', 'draft', 'resonated', 'linked', 'bookmarks', 'trash']);
export const CardBoxQuery = z.object({ tab: CardBoxTab });
/** GET /me/cardbox?shelves=: the shelves asked for, comma-separated CardBoxTab names (required); unknown names are ignored. */
export const CardBoxShelvesQuery = z.object({
  shelves: z
    .string()
    .max(200)
    .transform(
      (v) =>
        new Set(
          v
            .split(',')
            .map((n) => n.trim())
            .filter((n): n is z.infer<typeof CardBoxTab> => (CardBoxTab.options as readonly string[]).includes(n)),
        ),
    ),
});

/** DELETE /me/trash?before=: take only cards moved to the trash up to this moment (the first call's answer); absent, now. */
export const EmptyTrashQuery = z.object({ before: z.iso.datetime({ offset: true }).nullish() });
/** DELETE /cards/{id}?onlyIfTrashed=true: refuse (409) a card no longer in the trash. */
export const DeleteCardQuery = z.object({ onlyIfTrashed: z.enum(['true', 'false']).nullish() });

/** A card's URL segment: its English slug or (older cards) its document id. */
export const CardKey = z.string().regex(/^[A-Za-z0-9_-]{1,160}$/, 'Not a valid card.');
export const CardIdParam = DocId;
/** GET /cards?keys=: at most this many slugs or ids at once. */
export const CARD_KEYS_MAX = 30;
export const CardKeysQuery = z.object({
  keys: z
    .string()
    .transform((v) => v.split(',').map((k) => k.trim()).filter(Boolean))
    .pipe(z.array(CardKey).min(1).max(CARD_KEYS_MAX)),
});
export const InviteIdParam = DocId;
export const NotificationIdParam = DocId;
/** An app install's own stable id (a UUID it keeps; Firebase Installations' id also fits). */
export const InstallationIdParam = z.string().regex(/^[A-Za-z0-9_.:-]{8,128}$/, 'Not a valid installation id.');
/** A conversation's id: its two participants' uids, sorted, joined by `_` (as the connection's). */
export const ConversationIdParam = z.string().min(3).max(257).regex(/^[^/]+_[^/]+$/, 'Not a valid conversation id.');
/** A message of a conversation (its document id; a `clientId` became one). */
export const MessageIdParam = DocId;
/** Pen names may be any script (2–20 characters); never a path. */
export const HandleParam = z.string().trim().min(1).max(40).regex(/^[^/?#]+$/, 'Not a valid handle.');

// --- Phase 2 social (2a-social)
// The client-config, the people lookups, bookmarks, blocks, connections and incoming invites the clients read and
// wrote straight from Firestore until Phase 2 (src/server/app/social.ts, clientConfig).

export const ClientBuilds = named(
  z.object({ ios: z.number().int().min(0), android: z.number().int().min(0) }),
  'ClientBuilds',
  'A build number per app (iOS CFBundleVersion, Android versionCode).',
);

export const ClientFeatures = named(
  z.object({
    /** Listen to signals/{uid} and pull on its counters. */
    signals: z.boolean(),
    /** Bookmarks, blocks, connections, profile lookups and invites through /api/v1. */
    apiSocial: z.boolean(),
    /** Conversations and messages through /api/v1. */
    apiInbox: z.boolean(),
    /** The bell through /api/v1. */
    apiBell: z.boolean(),
    /** The thought map through /api/v1. */
    apiThoughtMap: z.boolean(),
    /** Drafts and pending edits through /api/v1. */
    apiDrafts: z.boolean(),
  }),
  'ClientFeatures',
  "Which paths an app build takes: the /api/v1 path when true, its older Firestore path when false (the server's rollback).",
);

export const ClientConfig = named(
  z.object({
    /** Builds below these must update before going on (the update screen). 0: none must. */
    minBuild: ClientBuilds,
    /** Builds below these are asked, not made, to update. 0: none is. */
    recommendedBuild: ClientBuilds,
    features: ClientFeatures,
  }),
  'ClientConfig',
  'What the apps ask at launch (GET /client-config, no sign-in needed): the builds they need, and which paths to take.',
);

export const Person = named(
  z.object({
    id: z.string(),
    /** No such account (deleted, or never was): `author` and the rest are null. */
    gone: z.boolean(),
    author: Author.nullable(),
    bio: z.string().nullable(),
    joinedAt: z.iso.datetime().nullable(),
  }),
  'Person',
  'A profile by its id, as anyone may read it.',
);

/** GET /users?ids=: at most this many at once. */
export const USERS_IDS_MAX = 30;
export const UsersQuery = z.object({
  ids: z
    .string()
    .transform((v) => [...new Set(v.split(',').map((k) => k.trim()).filter(Boolean))])
    .pipe(z.array(DocId).min(1).max(USERS_IDS_MAX)),
});

export const PersonList = named(z.object({ users: z.array(Person) }), 'PersonList', 'The people asked for, in the order asked, each once.');

export const BlockedPerson = named(
  z.object({ userId: z.string(), blockedAt: z.iso.datetime().nullable(), person: Person }),
  'BlockedPerson',
);

export const BlockList = named(z.object({ blocks: z.array(BlockedPerson) }), 'BlockList', 'Everyone you blocked, the latest first.');

export const Connection = named(
  z.object({ userId: z.string(), establishedAt: z.iso.datetime().nullable(), person: Person }),
  'Connection',
);

export const ConnectionList = named(z.object({ connections: z.array(Connection) }), 'ConnectionList', 'The people you are connected with, the latest first.');

export const IncomingInvite = named(
  z.object({
    id: z.string(),
    fromUserId: z.string(),
    message: z.string(),
    referenceCardId: z.string().nullable(),
    createdAt: z.iso.datetime().nullable(),
    /** Answer before this (POST /invites/{id}/accept). */
    expiresAt: z.iso.datetime(),
    from: Person,
  }),
  'IncomingInvite',
);

export const InviteList = named(z.object({ invites: z.array(IncomingInvite) }), 'InviteList', 'Legacy invites waiting for your answer, the latest first.');

export const InvitesQuery = z.object({ box: z.enum(['incoming']) });

/** Another account's uid in a path (blocks). */
export const UserIdParam = DocId;

export type ClientConfigBody = z.infer<typeof ClientConfig>;
export type ClientFeaturesBody = z.infer<typeof ClientFeatures>;
export type PersonBody = z.infer<typeof Person>;
export type PersonListBody = z.infer<typeof PersonList>;
export type BlockListBody = z.infer<typeof BlockList>;
export type ConnectionListBody = z.infer<typeof ConnectionList>;
export type InviteListBody = z.infer<typeof InviteList>;
// --- end Phase 2 social (2a-social)
// --- Phase 2 writer (2a-writer) ---
// The thought map, drafts and a published card's pending edit through the server (任務 #3 Phase 2): what the
// clients wrote straight to Firestore, held to the same limits as firebase/firestore.rules
// (src/server/domain/writer.test.ts pins every number to the rules' text).

/** The rules' `shortId`: a card or group id on the map, 1–128 characters (never a path, nor an id Firestore keeps). */
export const MAP_ID_MAX = 128;
/** The rules' `optionalString(…, "label", 500)` on an arrow and `title.size() <= 500` on a group. */
export const MAP_LABEL_MAX = 500;
export const MAP_TITLE_MAX = 500;
/** Ops in one `POST /me/thought-map/ops` batch (a group dragged with every card in it is one batch). */
export const MAP_OPS_MAX = 200;
/** A draft's id as the clients make one (Firestore's auto ids; the rules' `^[A-Za-z0-9]{20}$`). */
export const DRAFT_ID_PATTERN = /^[A-Za-z0-9]{20}$/;
/** The rules' `optionalString(…, "originalLocale", 10)` and `referenceCardId.size() <= 64`. */
export const ORIGINAL_LOCALE_MAX = 10;
export const REFERENCE_CARD_ID_MAX = 64;
/** The rules' `storedFile`: at most 2048 characters. */
export const MEDIA_URL_MAX = 2048;
/** The rules' title, story, tags and cover label limits (lib/db/firestore/cardContent CARD_LIMITS). */
export const DRAFT_TITLE_MAX = 200;
export const DRAFT_STORY_MAX = 200_000;
export const DRAFT_TAGS_MAX = 30;
export const DRAFT_TAGS_JOINED_MAX = 1000;
export const MEDIA_LABEL_MAX = 200;

/** A string of `min`–`max` UTF-16 units, as the rules' `size()` and JavaScript's `length` count (Zod's own `max` counts code points: an emoji is two units, one code point). */
const text = (max: number, min = 0) => z.string().min(min).max(max).refine((s) => s.length <= max, `At most ${max} characters.`);
const notReserved = (id: string) => id !== '.' && id !== '..' && !/^__.*__$/.test(id);
const MapId = text(MAP_ID_MAX, 1).regex(/^[^/]+$/, 'Not a valid id.').refine(notReserved, 'Not a valid id.');
/** An arrow's id: `{sourceCardId}_{targetCardId}`. */
const MapEdgeId = text(MAP_ID_MAX * 2 + 1, 3).regex(/^[^/]+$/, 'Not a valid id.').refine(notReserved, 'Not a valid id.');
const Coord = z.number();

export const MapNode = named(
  z.object({
    /** The node's id: the card's id (a card is on the map once). */
    id: z.string(),
    cardId: z.string(),
    x: z.number(),
    y: z.number(),
    /** The group it is filed in; null when unfiled. */
    groupId: z.string().nullable(),
    /** ISO 8601; null when the stored node has none. */
    createdAt: z.string().nullable(),
    updatedAt: z.string().nullable(),
  }),
  'MapNode',
  'A card placed on your thought map. Only its id: what the card is, `GET /cards?keys=` answers as for any card.',
);

export const MapEdge = named(
  z.object({
    /** `{sourceCardId}_{targetCardId}`. */
    id: z.string(),
    sourceCardId: z.string(),
    targetCardId: z.string(),
    label: z.string(),
    createdAt: z.string().nullable(),
  }),
  'MapEdge',
  'An arrow between two cards on your map, with its words.',
);

export const MapGroup = named(
  z.object({
    id: z.string(),
    title: z.string(),
    hue: z.number(),
    x: z.number(),
    y: z.number(),
    w: z.number(),
    h: z.number(),
    createdAt: z.string().nullable(),
  }),
  'MapGroup',
  'A titled region of your map that files the cards inside it.',
);

export const ThoughtMap = named(
  z.object({ nodes: z.array(MapNode), edges: z.array(MapEdge), groups: z.array(MapGroup) }),
  'ThoughtMap',
  'Your whole thought map (yours alone: no one else can read it). Numbers a stored item lacks read as the clients ' +
    "read them: x, y 0; a group's hue 55, w 320, h 240.",
);

const op = <K extends string, S extends z.ZodRawShape>(kind: K, shape: S) => z.strictObject({ op: z.literal(kind), ...shape });
const MapLabel = text(MAP_LABEL_MAX);
const MapTitle = text(MAP_TITLE_MAX);

/** Each op's own fields (its null fields dropped first: a Kotlin client sends every field, null when unset). */
const MapOpKinds = z.discriminatedUnion('op', [
  /** Place a card (again): the node is written whole — unfiled, stamped now. */
  op('addNode', { cardId: MapId, x: Coord, y: Coord }),
  /** Move a card; `groupId` files it (absent leaves its group: unfile with setNodeGroup). */
  op('moveNode', { cardId: MapId, x: Coord, y: Coord, groupId: MapId.optional() }),
  /** File a card in a group, or unfile it (no `groupId`). */
  op('setNodeGroup', { cardId: MapId, groupId: MapId.optional() }),
  /** Take a card off the map with every arrow touching it (the card itself stays). */
  op('removeNode', { cardId: MapId }),
  /** Draw an arrow (again: written whole); never from a card to itself. Its id is `{source}_{target}`. */
  op('addEdge', { sourceCardId: MapId, targetCardId: MapId, label: MapLabel.optional() }),
  op('setEdgeLabel', { id: MapEdgeId, label: MapLabel }),
  op('removeEdge', { id: MapEdgeId }),
  /** Make a group under the id the client chose (an offline queue names it before it exists); written whole. */
  op('addGroup', { groupId: MapId, title: MapTitle, hue: Coord, x: Coord, y: Coord, w: Coord, h: Coord }),
  /** Change a group: only the fields sent. */
  op('updateGroup', {
    groupId: MapId,
    title: MapTitle.optional(),
    hue: Coord.optional(),
    x: Coord.optional(),
    y: Coord.optional(),
    w: Coord.optional(),
    h: Coord.optional(),
  }),
  /** Delete a group; the cards in it stay on the map, unfiled. */
  op('removeGroup', { groupId: MapId }),
]);

/** One map op, its kind's fields only (what the server applies). */
export type MapOpInput = z.infer<typeof MapOpKinds>;

const withoutNulls = (value: unknown): unknown =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value).filter(([, v]) => v !== null && v !== undefined))
    : value;

/** A flat op (as MapOp takes it) as its kind: its null fields dropped, every field its kind's (else it throws). */
export function mapOpOf(flat: unknown): MapOpInput {
  return MapOpKinds.parse(withoutNulls(flat));
}

export const MAP_OP_KINDS = MapOpKinds.options.map((o) => o.shape.op.value);

export const MapOp = named(
  z
    .strictObject({
      op: z.enum(['addNode', 'moveNode', 'setNodeGroup', 'removeNode', 'addEdge', 'setEdgeLabel', 'removeEdge', 'addGroup', 'updateGroup', 'removeGroup']),
      /** addNode, moveNode, setNodeGroup, removeNode. */
      cardId: z.string().nullish(),
      x: z.number().nullish(),
      y: z.number().nullish(),
      /** moveNode (absent: its group kept), setNodeGroup (absent: unfiled), addGroup, updateGroup, removeGroup. */
      groupId: z.string().nullish(),
      /** addEdge. */
      sourceCardId: z.string().nullish(),
      targetCardId: z.string().nullish(),
      /** addEdge, setEdgeLabel. */
      label: z.string().nullish(),
      /** An arrow's id (`{sourceCardId}_{targetCardId}`): setEdgeLabel, removeEdge. */
      id: z.string().nullish(),
      /** addGroup, updateGroup. */
      title: z.string().nullish(),
      hue: z.number().nullish(),
      w: z.number().nullish(),
      h: z.number().nullish(),
    })
    .superRefine((value, ctx) => {
      const kind = MapOpKinds.safeParse(withoutNulls(value));
      if (!kind.success) for (const issue of kind.error.issues) ctx.addIssue({ code: 'custom', path: issue.path, message: issue.message });
    }),
  'MapOp',
  'One change to your thought map, named by `op`, with that op\'s fields only (a null field is absent): addNode ' +
    '{cardId, x, y} places a card (again: written whole, unfiled); moveNode {cardId, x, y, groupId?} moves it (and files it ' +
    'when groupId is sent); setNodeGroup {cardId, groupId?} files or unfiles it; removeNode {cardId} takes it off with every ' +
    'arrow touching it; addEdge {sourceCardId, targetCardId, label?} draws an arrow (never to itself; id ' +
    '`{source}_{target}`); setEdgeLabel {id, label}; removeEdge {id}; addGroup {groupId, title, hue, x, y, w, h} under the ' +
    'id the client chose; updateGroup {groupId, …the fields that change}; removeGroup {groupId} (its cards stay, unfiled). ' +
    `Ids are 1–${MAP_ID_MAX} characters, labels and titles at most ${MAP_LABEL_MAX}. A change to a node, arrow or group ` +
    'that is not there (any more) is skipped.',
);

export const MapOpsRequest = named(
  z.strictObject({ ops: z.array(MapOp).min(1).max(MAP_OPS_MAX) }),
  'MapOpsRequest',
  `Up to ${MAP_OPS_MAX} changes, applied in order and all together (none when one is refused).`,
);

export const MapOpsResponse = named(
  z.object({
    /** How many ops changed something. */
    applied: z.number().int(),
    /** The indexes of the ops skipped: what they change was not there. */
    skipped: z.array(z.number().int()),
  }),
  'MapOpsResponse',
);

export const DraftMedia = named(
  z.strictObject({
    type: z.enum(['image', 'video']),
    url: text(MEDIA_URL_MAX).regex(/^(https:\/\/\S+|http:\/\/localhost:[0-9]+\/\S+)$/, 'Not a stored picture.'),
    /** The cover's ≤ 960 px copy the upload answered (`…-w960.webp`). */
    thumbUrl: text(MEDIA_URL_MAX)
      .regex(/^(https:\/\/\S+|http:\/\/localhost:[0-9]+\/\S+)-w960\.webp$/, "Not the cover's copy.")
      .nullish(),
    label: text(MEDIA_LABEL_MAX).nullish(),
    frame: CoverFrame.nullish(),
  }),
  'DraftMedia',
  'A cover as a draft or a pending edit keeps it. Sent, it replaces the cover whole: a field left out or null (a ' +
    '`frame`, a `thumbUrl`) is gone from it.',
);

const DraftTags = z
  .array(z.string())
  .max(DRAFT_TAGS_MAX)
  .refine((tags) => tags.join(' ').length <= DRAFT_TAGS_JOINED_MAX, `The tags take at most ${DRAFT_TAGS_JOINED_MAX} characters.`);
const DraftVisibility = z.enum(['public', 'connections', 'private']);
const DraftHue = z.number().min(0).max(360);
const DraftRev = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);

export const CreateDraftRequest = named(
  z.strictObject({
    /** The id the client made (20 letters and digits, as Firestore's auto ids): never one in use or deleted for good. */
    id: z.string().regex(DRAFT_ID_PATTERN, 'Not a valid draft id.'),
    thoughtCore: text(DRAFT_TITLE_MAX),
    story: text(DRAFT_STORY_MAX),
    tags: DraftTags,
    visibility: DraftVisibility,
    originalLocale: text(ORIGINAL_LOCALE_MAX).nullish(),
    media: DraftMedia.nullish(),
    accentHue: DraftHue.nullish(),
    /** The card this draft answers (用卡片回應): one you may read, never across a block unless it is anonymous. */
    referenceCardId: text(REFERENCE_CARD_ID_MAX, 1).nullish(),
    anonymous: z.boolean().nullish(),
  }),
  'CreateDraftRequest',
  'A new draft under the id the client made. Anonymous and for connections only is refused (`400`).',
);

export const CreatedDraft = named(
  z.object({
    id: z.string(),
    /** False when your draft was there already under this id (a create sent again): nothing was written. */
    created: z.boolean(),
    /** The draft's stored `rev` (0 for a new one): the next `PATCH …/draft` sends one above it. */
    rev: z.number().int(),
  }),
  'CreatedDraft',
);

/** A field `PATCH …/draft` can remove (`clear`). */
export const DraftField = z.enum(['media', 'accentHue']);

export const UpdateDraftRequest = named(
  z.strictObject({
    /** The client's count of this draft's saves, one higher each save: applied only when above the stored `rev`. */
    rev: DraftRev,
    thoughtCore: text(DRAFT_TITLE_MAX).nullish(),
    story: text(DRAFT_STORY_MAX).nullish(),
    tags: DraftTags.nullish(),
    visibility: DraftVisibility.nullish(),
    anonymous: z.boolean().nullish(),
    /** The cover, replaced whole (see DraftMedia). */
    media: DraftMedia.nullish(),
    accentHue: DraftHue.nullish(),
    /** Fields to remove: `media` (no cover), `accentHue` (no hue). A null field removes nothing: it is absent. */
    clear: z.array(DraftField).max(2).nullish(),
  }),
  'UpdateDraftRequest',
  'Only the fields sent change; a field that is null or absent is left as it is.',
);

export const DraftSaved = named(
  z.object({
    /**
     * False when the stored `rev` is already this one or higher (a save that arrived late, or one sent again):
     * nothing was written, and `rev` is the stored one. A client holding newer words than the server's (its count
     * fell behind another device's) sends them again with `rev` one above it.
     */
    applied: z.boolean(),
    rev: z.number().int(),
    /** When it was saved (ISO 8601); null when nothing was written. */
    updatedAt: z.string().nullable(),
  }),
  'DraftSaved',
);

export const PendingEditRequest = named(
  z.strictObject({
    /** As a draft's: applied only when above the stored copy's `rev` (a copy saved without one counts as 0). */
    rev: DraftRev,
    thoughtCore: text(DRAFT_TITLE_MAX),
    story: text(DRAFT_STORY_MAX),
    tags: DraftTags,
    visibility: DraftVisibility,
    anonymous: z.boolean(),
    /** The cover; absent or null: none. */
    media: DraftMedia.nullish(),
    accentHue: DraftHue.nullish(),
  }),
  'PendingEditRequest',
  'The whole working copy of your published card, replacing the one kept (never merged).',
);

export const PendingEdit = named(
  z.object({
    thoughtCore: z.string(),
    story: z.string(),
    tags: z.array(z.string()),
    visibility: z.enum(['public', 'connections', 'private']),
    anonymous: z.boolean(),
    media: DraftMedia.nullable(),
    accentHue: z.number().nullable(),
    /** ISO 8601; null when the kept copy has no time. */
    updatedAt: z.string().nullable(),
    /** The stored `rev` (0 for a copy an older app saved, without one). */
    rev: z.number().int(),
  }),
  'PendingEdit',
  'Your unsaved working copy of a published card (`edits/current`).',
);

export const PendingEditBox = named(
  z.object({ edit: PendingEdit.nullable() }),
  'PendingEditBox',
  'Your pending edit of the card, or null when there is none.',
);

export const DeletedPendingEdit = named(z.object({ deleted: z.boolean() }), 'DeletedPendingEdit', 'False when there was none to delete.');

export type ThoughtMapBody = z.infer<typeof ThoughtMap>;
export type MapOpsResponseBody = z.infer<typeof MapOpsResponse>;
export type DraftMediaInput = z.infer<typeof DraftMedia>;
export type CreateDraftInput = z.infer<typeof CreateDraftRequest>;
export type CreatedDraftBody = z.infer<typeof CreatedDraft>;
export type UpdateDraftInput = z.infer<typeof UpdateDraftRequest>;
export type DraftSavedBody = z.infer<typeof DraftSaved>;
export type PendingEditInput = z.infer<typeof PendingEditRequest>;
export type PendingEditBody = z.infer<typeof PendingEdit>;
export type PendingEditBoxBody = z.infer<typeof PendingEditBox>;
// --- end Phase 2 writer (2a-writer) ---

export type ApiErrorBody = z.infer<typeof ApiError>;
export type MeBody = z.infer<typeof Me>;
export type FeedCardBody = z.infer<typeof FeedCard>;
export type CoverFrameBody = z.infer<typeof CoverFrame>;
export type SummaryTranslationsBody = z.infer<typeof SummaryTranslations>;
export type TranslationResponseBody = z.infer<typeof TranslationResponse>;
export type FeedPageBody = z.infer<typeof FeedPage>;
export type RecommendedFeedBody = z.infer<typeof RecommendedFeed>;
export type AuthorBody = z.infer<typeof Author>;
export type CardDetailBody = z.infer<typeof CardDetail>;
export type CardTapBody = z.infer<typeof CardTap>;
export type TapResponseBody = z.infer<typeof TapResponse>;
export type TapListBody = z.infer<typeof TapList>;
export type TapPersonBody = z.infer<typeof TapPerson>;
export type TapPassageBody = z.infer<typeof TapPassage>;
export type TapPickedBody = z.infer<typeof TapPicked>;
export type TapPassageResponseBody = z.infer<typeof TapPassageResponse>;
export type ReadingReportInput = z.infer<typeof ReadingReportRequest>;
export type LinkPreviewBody = z.infer<typeof LinkPreview>;
export type ProfileBody = z.infer<typeof Profile>;
export type CardBoxTabName = z.infer<typeof CardBoxTab>;
export type CardBoxBody = z.infer<typeof CardBox>;
export type CreateProfileInput = z.infer<typeof CreateProfileRequest>;
export type UpdateProfileInput = z.infer<typeof UpdateProfileRequest>;
export type NotificationSettingsBody = z.infer<typeof NotificationSettings>;
export type UpdateNotificationSettingsInput = z.infer<typeof UpdateNotificationSettingsRequest>;
export type ReportCardInput = z.infer<typeof ReportCardRequest>;
export type CreateReportInput = z.infer<typeof CreateReportRequest>;
export type SetReactionInput = z.infer<typeof SetReactionRequest>;
export type UpdateCardInput = z.infer<typeof UpdateCardRequest>;
export type ResonateResponseBody = z.infer<typeof ResonateResponse>;
export type TrashedCardBody = z.infer<typeof TrashedCard>;
export type RestoredCardBody = z.infer<typeof RestoredCard>;
export type EmptiedTrashBody = z.infer<typeof EmptiedTrash>;
export type CardListBody = z.infer<typeof CardList>;
export type CardInclude = (typeof CARD_INCLUDES)[number];
export type ProfileInclude = (typeof PROFILE_INCLUDES)[number];

// --- Phase 2 inbox (2a-inbox)
// The conversation list, a thread's messages and the bell, read through the
// server instead of the clients' Firestore listeners (phase2-spec, 2a-inbox):
// the same rows, ordered as those listeners ordered them, each field as it is
// stored today. A client refetches one of these when its `signals/{uid}`
// topic moves (`inbox`, `threads.{pair}`, `bell`), with If-None-Match.
// Times are ISO 8601 UTC strings to the microsecond
// (`2026-11-20T03:04:05.123456Z`): plain strings, never decoded as dates by
// the contract, so nothing between two messages sent in one millisecond is
// lost. Cursors are opaque (`c1.`…): pass them back as they came.

/** Conversations a page (the clients' listener's limit). */
export const CONVERSATIONS_PAGE = 50;
/** A thread's newest window (the clients' listener's), and the most one page answers. */
export const THREAD_PAGE = 50;
export const THREAD_PAGE_MAX = 100;
/** Bell rows a page (the web's listener's), and the most one page answers (the apps listened to 50). */
export const BELL_PAGE = 20;
export const BELL_PAGE_MAX = 50;
/** Bell rows one POST /notifications/read may name; how many of the newest rows up to `before` one call reads. */
export const BELL_READ_IDS_MAX = 50;
export const BELL_READ_BEFORE_SCAN = 100;

const MicroTime = z.string().describe('ISO 8601 UTC to the microsecond (2026-11-20T03:04:05.123456Z).');

export const ConversationLastMessage = named(
  z.object({
    /** The preview's words (a sticker's fallback words, a card's title when the message had none); '' when none. */
    text: z.string(),
    senderId: z.string(),
    sentAt: MicroTime.nullable(),
    /** A picture: drawn as 「傳送了圖片」 (or `albumCount` of them). */
    image: z.boolean(),
    sticker: z.boolean(),
    /** How many pictures were sent together (2–10), else null. */
    albumCount: z.number().int().nullable(),
    /** The last message was unsent (only when nothing else is said beside it: the words win). */
    unsent: z.boolean(),
  }),
  'ConversationLastMessage',
  "The conversation list's preview of the last message.",
);

export const ConversationLetter = named(
  z.object({
    /** Who left the notes (a uid): the other person waits for your answer when it isn't you. */
    from: z.string(),
    cardId: z.string().nullable(),
    count: z.number().int(),
  }),
  'ConversationLetter',
  'The letter a conversation holds: notes left by someone not connected, waiting for an answer.',
);

export const Conversation = named(
  z.object({
    /** Its two participants' uids, sorted, joined by `_`. */
    id: z.string(),
    participants: z.array(z.string()),
    /** The other participant's uid. */
    otherId: z.string(),
    /**
     * The other participant as their profile is now; null when the account is gone (or never chose a pen name),
     * drawn as today's clients draw a missing profile. A block changes nothing here: the list is yours to filter
     * by your blocks, as before.
     */
    other: Author.nullable(),
    /** Your unread messages in it. */
    unread: z.number().int(),
    lastMessage: ConversationLastMessage.nullable(),
    request: ConversationLetter.nullable(),
    createdAt: MicroTime.nullable(),
    updatedAt: MicroTime.nullable(),
    originCardId: z.string().nullable(),
  }),
  'Conversation',
  'One of your conversations, as the list shows it.',
);

export const ConversationList = named(
  z.object({
    /** The most recently active first. */
    conversations: z.array(Conversation),
    /** Pass back as `pageToken` for the next page; null at the end. */
    nextPageToken: z.string().nullable(),
  }),
  'ConversationList',
  'Your conversations, the most recently active first, 50 a page.',
);

export const MessageQuote = named(
  z.object({
    id: z.string(),
    senderId: z.string(),
    /** '' for an unsent one. */
    text: z.string(),
    cardRef: z.string().optional(),
    image: z.boolean().optional(),
    sticker: StickerRef.optional(),
    /** The quoted message was unsent since: only who sent it is kept. */
    unsent: z.boolean().optional(),
  }),
  'MessageQuote',
  "A reply's snapshot of the message it answers.",
);

export const MessagePicture = named(
  z.object({
    /** GET /chat-images/{id}. */
    id: z.string(),
    /** 0 when the server kept no size (drawn square). */
    width: z.number(),
    height: z.number(),
  }),
  'MessagePicture',
);

export const ThreadMessage = named(
  z.object({
    id: z.string(),
    /** This message's place in the thread: pass it as `before` (older ones) or `after` (newer ones). */
    cursor: z.string(),
    senderId: z.string(),
    /** '' for an unsent message. */
    text: z.string(),
    sentAt: MicroTime,
    /** `note` for a 小紙條 in the thread; a kind this build doesn't know is a plain message. Absent: a plain one. */
    kind: z.string().optional(),
    cardRef: z.string().optional(),
    noteRef: z.object({ cardId: z.string(), noteId: z.string() }).optional(),
    replyTo: MessageQuote.optional(),
    image: MessagePicture.optional(),
    /** Only beside `image`. */
    album: z.object({ id: z.string(), index: z.number().int(), count: z.number().int() }).optional(),
    sticker: StickerRef.optional(),
    /** Reactions by uid (a reaction this build doesn't know is drawn as nothing). Absent when none. */
    reactions: z.record(z.string(), z.string()).optional(),
    /** Unsent: then only `senderId`, `sentAt` and this are said. */
    unsentAt: MicroTime.optional(),
    /** A pass to the sender's 私人卡 `cardRef`, until 停止分享. */
    privateShare: z.boolean().optional(),
    preview: LinkPreview.optional(),
  }),
  'ThreadMessage',
  'A message as the thread shows it, its fields as stored.',
);

export const MessagePage = named(
  z.object({
    /** Newest first. */
    messages: z.array(ThreadMessage),
    /** Pass as `before` for the page older than this one; null when there is none (and on an `after` page). */
    olderCursor: z.string().nullable(),
    /** The newest message's cursor here (or the `after` sent, when nothing came after it): the next `after`. */
    newerCursor: z.string().nullable(),
    /** An `after` page that came back full: ask again with `newerCursor` right away. */
    hasNewer: z.boolean(),
    /**
     * Asked with `updatedAfter`: the messages changed since that answer — a reaction, an unsend, a link
     * preview, 停止分享 — of any age, oldest change first, each as it is now. As many as `limit`: more may
     * have changed, so read the newest page again instead.
     */
    updated: z.array(ThreadMessage).optional(),
    /** Asked for (`changes=1` or `updatedAfter`): pass as `updatedAfter` to hear only what changed after this answer. Null: read the newest page again. */
    updatedCursor: z.string().nullable().optional(),
  }),
  'MessagePage',
  "A page of a thread's messages.",
);

export const BellPayload = named(
  z.object({
    fromUserId: z.string().optional(),
    fromHandle: z.string().optional(),
    /** `resonance_tap`: the day's readers, newest first. */
    fromUserIds: z.array(z.string()).optional(),
    cardId: z.string().optional(),
    noteId: z.string().optional(),
    /** A note's first words. */
    preview: z.string().optional(),
    count: z.number().optional(),
    /** `read_summary`: how many read the card to its end this week, and whether some read it again. */
    readers: z.number().optional(),
    reread: z.boolean().optional(),
    /** On one of your anonymous cards: open the card, never a thread. */
    anonymous: z.boolean().optional(),
    inviteId: z.string().optional(),
  }),
  'BellPayload',
  'What a bell row says, as the server wrote it (the fields the clients draw).',
);

export const BellItem = named(
  z.object({
    id: z.string(),
    /** `note`, `message`, `resonance`, `resonance_tap`, `read_summary`, `invite_accepted`, …: one a build doesn't know is drawn as before. */
    type: z.string(),
    payload: BellPayload,
    readAt: MicroTime.nullable(),
    createdAt: MicroTime,
  }),
  'BellItem',
);

export const BellPage = named(
  z.object({
    /** Newest first. */
    items: z.array(BellItem),
    /** The people these rows name (`fromUserId`, `fromUserIds`) whose profiles are there; a gone one is absent. */
    people: z.array(Author),
    /** Pass back as `pageToken` for the next page; null at the end. */
    nextPageToken: z.string().nullable(),
  }),
  'BellPage',
  'Your bell, newest first.',
);

export const MarkNotificationsReadRequest = named(
  z
    .object({
      /** These rows of yours, read now (anyone else's, and unknown ids, are ignored). */
      ids: z.array(DocId).min(1).max(BELL_READ_IDS_MAX).nullish(),
      /** Or the rows of yours made at this time or earlier (ISO 8601), of the newest 100 such, read now. */
      before: z.iso.datetime({ offset: true }).nullish(),
    })
    .refine((r) => (r.ids ? 1 : 0) + (r.before ? 1 : 0) === 1, { message: 'Send `ids` or `before`.', path: ['ids'] }),
  'MarkNotificationsReadRequest',
  'Mark bell rows read: by id, or everything up to a time.',
);

export const PageTokenQuery = z.object({ pageToken: z.string().min(1).max(512).nullish() });
/** GET /conversations?pairs=: at most this many conversations by id at once. */
export const CONVERSATION_PAIRS_MAX = 20;
/**
 * GET /conversations: a page (`pageToken`), or — `pairs`, the web's delta — only these conversations of the
 * viewer's, by id (one that is gone or not theirs is left out of the answer).
 */
export const ConversationsQuery = PageTokenQuery.extend({
  pairs: z
    .string()
    .transform((v) => [...new Set(v.split(',').map((k) => k.trim()).filter(Boolean))])
    .pipe(z.array(z.string().regex(/^[A-Za-z0-9_-]{3,257}$/, 'Not a valid id.')).min(1).max(CONVERSATION_PAIRS_MAX))
    .optional(),
});
export const BellQuery = z.object({
  pageToken: z.string().min(1).max(512).nullish(),
  limit: z.coerce.number().int().min(1).max(BELL_PAGE_MAX).default(BELL_PAGE),
});
export const MessagesQuery = z
  .object({
    before: z.string().min(1).max(512).nullish(),
    after: z.string().min(1).max(512).nullish(),
    /** An answer's `updatedCursor`: also say which messages changed since it (`updated`). Not with `before`. */
    updatedAfter: z.string().min(1).max(512).nullish(),
    /**
     * `1`: answer an `updatedCursor` (implied by `updatedAfter`). Asked for, because it is where the store
     * stood at the read: an answer carrying it is never the same twice, so never a 304.
     */
    changes: z.enum(['0', '1']).nullish(),
    limit: z.coerce.number().int().min(1).max(THREAD_PAGE_MAX).default(THREAD_PAGE),
  })
  .refine((q) => !(q.before && q.after), { message: 'Send `before` or `after`, not both.', path: ['after'] })
  .refine((q) => !(q.before && q.updatedAfter), { message: 'Send `before` or `updatedAfter`, not both.', path: ['updatedAfter'] });

export type ConversationBody = z.infer<typeof Conversation>;
export type ConversationListBody = z.infer<typeof ConversationList>;
export type ThreadMessageBody = z.infer<typeof ThreadMessage>;
export type MessagePageBody = z.infer<typeof MessagePage>;
export type BellItemBody = z.infer<typeof BellItem>;
export type BellPageBody = z.infer<typeof BellPage>;
export type MarkNotificationsReadInput = z.infer<typeof MarkNotificationsReadRequest>;

// --- Phase 3 sessions (ADR 0004)
// Resonance's own short-lived access tokens and rotating refresh tokens, traded for a sign-in at the identity
// provider (src/server/app/auth.ts). Firebase ID tokens keep working beside them (dual accept).

export const AuthExchangeRequest = named(
  z.object({
    /** The identity provider whose token this is; `firebase` (the only one today) when absent. */
    provider: z.enum(['firebase']).nullish(),
    /** The provider's token: a Firebase ID token. */
    token: z.string().min(1).max(8192),
  }),
  'AuthExchangeRequest',
  "A sign-in at the identity provider, traded for Resonance's own tokens.",
);

export const AuthRefreshRequest = named(
  z.object({ refreshToken: z.string().min(1).max(256) }),
  'AuthRefreshRequest',
  'A refresh token, traded (once) for the next pair — or, to log out, revoked.',
);

export const AuthSession = named(
  z.object({
    /** Send it as the bearer credential on every /api/v1 request. */
    accessToken: z.string(),
    tokenType: z.enum(['Bearer']),
    /** Seconds the access token lives (at most 900): refresh before then. */
    expiresIn: z.number().int(),
    /** Good once: trade it for the next pair (POST /auth/refresh). Keep it as a password. */
    refreshToken: z.string(),
    /** When the refresh token stops being good, used or not. */
    refreshExpiresAt: z.iso.datetime(),
    /** The account: the same user id the identity provider's sign-in always had. */
    userId: z.string(),
  }),
  'AuthSession',
  "Resonance's own session: a short-lived access token and the refresh token for the next one.",
);

export type AuthExchangeInput = z.infer<typeof AuthExchangeRequest>;
export type AuthRefreshInput = z.infer<typeof AuthRefreshRequest>;
export type AuthSessionBody = z.infer<typeof AuthSession>;
// --- end Phase 3 sessions
