import type { Card } from '@/lib/db/types';
import { linkPreviewsOf } from '@/lib/links/previewShape';
import { purgeAtOf, restorableVisibility } from '@/lib/cards/trash';
import { AUTHOR_FIELDS, authorsOf, canView as canViewBy, visibleTo as visibleAmong } from '@/server/app/viewer';
import { blockHides, CARD_VISIBILITY_FIELDS, cardVisible, trashedAtOf } from '@/server/domain/visibility';
import type { AdminDb } from '@/server/infra/firestore/db';
import { ctxFor } from '@/server/infra/firestore/ctx';
import type { PersonRow } from '@/server/ports/repos/users';
import { coverFrameOf } from '@/lib/images/coverFrame';
import { coverThumbKey, coverThumbUrl } from '@/lib/images/coverThumb';
import { publicBases, storageKeyOf } from '@/lib/storage/publicUrl';
import { resolvedMediaUrl } from '@/server/domain/media';
import { envMediaUrls, mediaUrlsOver } from '@/server/infra/env/media';
import type { AuthorBody, FeedCardBody, LinkPreviewBody } from './schemas';
import { summaryOf, type ListCard } from './summary';
import { presentSummaryTranslations } from './summaryTranslations';

/**
 * Turning stored cards and people into the contract's shapes — the one place
 * a card or a person leaves the server (an anonymous card's author never
 * does: toFeedCard drops the byline, and no service puts an `authorId` in an
 * answer itself — src/server/app/presenter.test.ts). Presenters take the
 * repositories' plain rows (Card, ListCard, PersonRow), never a store's
 * document type. Old or hand-edited documents may lack fields; nothing here
 * may throw on one, or a single bad card would fail a whole page (and the
 * clients' strict decoders).
 */

function str(v: unknown): string | null {
  return typeof v === 'string' && v.length ? v : null;
}

type Visibility = FeedCardBody['visibility'];

/**
 * A card's visibility as the contract names it. A response enum never carries
 * a value the clients don't know (see ./schemas), so a stored value outside
 * the three — or none — reads as what firestore.rules make of it: a card only
 * its author can open, i.e. private.
 */
export function visibilityOf(v: unknown): Visibility {
  return v === 'public' || v === 'connections' || v === 'private' ? v : 'private';
}

/**
 * A card's stored link previews as the contract carries them: only the ones a
 * reader may draw (an http(s) link with a title, a picture from our own
 * link-image route only — lib/links/previewShape), absent fields as null.
 */
export function presentLinkPreviews(stored: unknown): LinkPreviewBody[] {
  return linkPreviewsOf(stored).map((p) => ({
    url: p.url,
    title: p.title,
    description: p.description ?? null,
    siteName: p.siteName ?? null,
    image: p.image ?? null,
  }));
}

/** What toAuthor reads of a profile: the field mask of every profile a list reads (loadAuthors). */
export { AUTHOR_FIELDS };

/** A person as the contract shows them — from their stored profile (a PersonRow: never a store's document type). */
export function toAuthor(id: string, u: PersonRow): AuthorBody {
  return {
    id,
    handle: String(u.handle ?? ''),
    initials: String(u.initials ?? ''),
    accentColor: String(u.accentColor ?? ''),
    // From its key on the current base when one is kept (ADR 0005), else as stored.
    avatarUrl: resolvedMediaUrl(envMediaUrls(), u.avatarUrl, u.avatarKey),
    avatarSeed: u.avatarSeed == null ? null : String(u.avatarSeed),
    verified: u.verified === true,
    region: str(u.region),
  };
}

export interface FeedCardOptions {
  reason?: string | null;
  /** The viewer wrote the card (their card box): show the byline even when anonymous. */
  deanonymize?: boolean;
  /**
   * The viewer wrote the card and this answer is theirs alone (the trash
   * shelf, their card's own page, what trashing and restoring answer): a
   * card in the trash says so — when it went in, when it goes for good, and
   * what restoring it brings back. Never on anyone else's answer, where a
   * card in the trash is absent anyway.
   */
  own?: boolean;
  /**
   * The viewer's own shelf of their own cards (published, private, draft):
   * when each was last changed (`editedAt`), which the apps' 草稿 shelf orders
   * drafts and private cards together by. Never on anyone else's answer: when
   * a card is edited is its author's to know.
   */
  edited?: boolean;
}

/** When a card was last changed, as a valid date; null without one. */
function editedAtOf(c: ListCard): string | null {
  const at = c.editedAt;
  return at instanceof Date && !Number.isNaN(at.getTime()) ? at.toISOString() : null;
}

/** The trash's own fields on a FeedCard (FeedCardOptions.own). */
function trashFields(c: ListCard): Pick<FeedCardBody, 'trashedAt' | 'purgeAt' | 'restoresTo'> {
  const at = trashedAtOf(c);
  if (!at) return {};
  return { trashedAt: at.toISOString(), purgeAt: purgeAtOf(at).toISOString(), restoresTo: restorableVisibility(c.trashedFrom?.visibility) };
}

/**
 * A card as the contract shows it in a list. A card read for a list without
 * its story (LIST_FIELDS) must have been through withStories() first: its
 * excerpt and read time come from the stored summary or the story read then.
 */
export function toFeedCard(c: ListCard, author: PersonRow | undefined, opts: FeedCardOptions = {}): FeedCardBody {
  const published = c.publishedAt && !Number.isNaN(c.publishedAt.getTime()) ? c.publishedAt : null;
  const anonymous = c.anonymous === true;
  const summary = summaryOf(c);
  const title = String(c.thoughtCore ?? '');
  return {
    id: c.id,
    // Only its author is given an anonymous card's slug: made while the card
    // was named, it may end in their pen name (anonymousBySlug).
    slug: anonymous && !opts.deanonymize && !opts.own ? null : str(c.slug),
    title,
    excerpt: summary.excerpt,
    tags: Array.isArray(c.tags) ? c.tags.filter((t): t is string => typeof t === 'string') : [],
    publishedAt: published ? published.toISOString() : null,
    author: (!anonymous || opts.deanonymize) && author ? toAuthor(c.authorId, author) : null,
    anonymous,
    visibility: visibilityOf(c.visibility),
    imageUrl: coverUrlOf(c.media),
    imageThumbUrl: coverThumbOf(c.media),
    imageLabel: str(c.media?.label) ?? (title ? Array.from(title).slice(0, 24).join('') : null),
    // Only beside a picture: a frame left on a cover that is gone frames nothing.
    imageFrame: str(c.media?.url) ? coverFrameOf(c.media?.frame) : null,
    summaryTranslations: presentSummaryTranslations(c, title, summary.excerpt),
    accentHue: typeof c.accentHue === 'number' && Number.isFinite(c.accentHue) ? c.accentHue : null,
    readMinutes: summary.readMinutes,
    referenceCardId: str(c.referenceCardId),
    reason: opts.reason ?? null,
    ...(opts.own ? trashFields(c) : {}),
    ...(opts.edited ? { editedAt: editedAtOf(c) } : {}),
  };
}

/**
 * A cover's ≤ 960 px copy for lists (B2): the one written on the card
 * (`media.thumbUrl`, when it is on our storage), else the copy every one of our
 * covers has beside it (lib/images/coverThumb) — so a card saved by a build
 * that never heard of copies has one too. Null for a cover hosted elsewhere,
 * or none: the client draws `imageUrl`.
 */
export function coverThumbOf(media: Card['media'], bases: readonly string[] = publicBases()): string | null {
  const stored = str(media?.url);
  if (!stored || media?.type === 'video') return null;
  const url = coverUrlOf(media, bases) ?? stored;
  const kept = str(media?.thumbUrl);
  // Only the copy of this cover: draft saves merge `media`, so a new cover can sit beside the old one's copy.
  // A cover rebuilt from its key takes its copy from the same base (the stored copy may name an older one).
  if (url === stored && kept && storageKeyOf(kept, bases) === coverThumbKey(storageKeyOf(url, bases))) return kept;
  return coverThumbUrl(url, bases);
}

/**
 * A cover's URL as answered (ADR 0005): built from its storage key
 * (`media.key`) on the current base when one is kept, else as stored.
 */
export function coverUrlOf(media: Card['media'], bases?: readonly string[]): string | null {
  const resolver = bases ? mediaUrlsOver(() => bases) : envMediaUrls();
  return resolvedMediaUrl(resolver, media?.url, media?.key);
}

/* ───────────── who may see what: through the repositories (src/server/app/viewer.ts) ───────────── */

// The pure rules, at this path for their importers.
export { blockHides, CARD_VISIBILITY_FIELDS, cardVisible, trashedAtOf };

/** Profiles of the given (non-anonymous) authors, by id — one batched read (B17: only what a byline draws). */
export function loadAuthors(db: AdminDb, cards: Card[]): Promise<Map<string, PersonRow>> {
  return authorsOf(ctxFor(db).data.users, cards);
}

/** Everyone the viewer blocked: their named cards drop out of every list (blockHides). */
export function blockedByViewer(db: AdminDb, uid: string): Promise<Set<string>> {
  return ctxFor(db).data.users.blockedBy(uid);
}

export function connected(db: AdminDb, a: string, b: string): Promise<boolean> {
  return ctxFor(db).data.users.connected(a, b);
}

/** firestore.rules `cardVisible`, for the Admin SDK (which bypasses rules). */
export function canView(db: AdminDb, card: Card, viewerId: string): Promise<boolean> {
  return canViewBy(ctxFor(db).data.users, card, viewerId);
}

/**
 * The cards the viewer may read, in order (canView for a list): whether the
 * viewer is connected to each connections-only author is read once per
 * author, in one batch.
 */
export function visibleTo(db: AdminDb, viewerId: string, cards: Card[]): Promise<Card[]> {
  return visibleAmong(ctxFor(db).data.users, viewerId, cards);
}
