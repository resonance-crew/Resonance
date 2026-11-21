import { embeddedCardKeys } from '@/lib/api/v1/embeds';
import { ApiFailure } from '@/lib/api/v1/http';
import { presentLinkPreviews, toAuthor, toFeedCard, visibilityOf } from '@/lib/api/v1/present';
import { publicList } from '@/lib/api/v1/publicLists';
import {
  CARD_KEYS_MAX,
  type CardBoxBody,
  type CardBoxTabName,
  type CardDetailBody,
  type CardInclude,
  type CardListBody,
  type FeedCardBody,
  type FeedPageBody,
  type MeBody,
  type ProfileBody,
  type ProfileInclude,
  type RecommendedFeedBody,
} from '@/lib/api/v1/schemas';
import type { ListCard } from '@/lib/api/v1/summary';
import { blankFeedCard, unlistedCard } from '@/lib/cards/blank';
import { trashExpired } from '@/lib/cards/trash';
import type { Card, RecommendationItem, User } from '@/lib/db/types';
import type { ServerCtx } from '@/server/ctx';
import { anonymousBySlugCard } from '@/server/domain/cards';
import { resolvedMediaUrl } from '@/server/domain/media';
import { blockHides, inTrash, trashedAtOf } from '@/server/domain/visibility';
import type { CardPage, PageStart } from '@/server/ports/repos/cards';
import type { PersonRow } from '@/server/ports/repos/users';
import { authorsOf, canView, visibleTo } from './viewer';

/**
 * The read side of cards and people (feed, card page, author page, card box,
 * the signed-out lists), on the ports: `(ctx, …) → the contract's body`. The
 * web reads the same data through firestore.rules; a server bypasses them, so
 * visibility (`canView`), blocks and anonymity are enforced here and asserted
 * in test/emulator/apiV1Reads.emulator.test.ts (through the legacy facades in
 * src/lib/api/v1/{reads,service}.ts) and on memoryCtx
 * (src/server/app/cardsRead.test.ts).
 *
 * Every card and person leaves through the presenters (toFeedCard, toAuthor):
 * no answer here carries an author's id itself — an anonymous card's least of
 * all (src/server/app/presenter.test.ts holds that).
 *
 * Reads that don't depend on each other run together — the viewer's blocks
 * beside the list they filter — but a key shaped like a slug is resolved
 * before its document is read (reading both at once would double the reads
 * of the usual case, a slug that hits); one that can't be a slug the server
 * made, an id, is read both ways at once (findByKey).
 *
 * Lists read their cards without the story: a card shows its stored summary,
 * and only a card without a current one has its story read, once the list
 * knows which cards it shows (withStories).
 */

const RELATED_LIMIT = 3;
const RESONANCE_LIMIT = 30;
const LINK_LIMIT = 30;
/** The web's profile lists (and counts) an author's first 40 public cards. */
const PROFILE_COUNT_LIMIT = 40;

const notFound = () => new ApiFailure('not_found', 'No such card.');

function str(v: unknown): string | null {
  return typeof v === 'string' && v.length ? v : null;
}

/**
 * `shared: false` reads no pass (src/lib/api/v1/sharedCards.ts): for an app
 * build that would draw someone else's 私人卡 with answers the server refuses
 * (clientBuild knowsSharedCards). Default true.
 */
export interface SharedOption {
  shared?: boolean;
}

/* ───────────── one card ───────────── */

/** visibleCard, saying whether the viewer reads it only through a shared-card pass (`pass`: answer nothing on it). */
async function readableCard(ctx: ServerCtx, viewerId: string, key: string, opts: SharedOption = {}): Promise<{ card: Card; pass: boolean }> {
  const found = await ctx.data.cards.findByKey(key);
  const card = found && !anonymousBySlugCard(found, key, viewerId) ? found : null;
  const shared = opts.shared ?? true;
  if (!card) throw notFound();
  if (await canView(ctx.data.users, card, viewerId)) return { card, pass: false };
  if (shared && (await ctx.data.cards.sharedAmong(viewerId, [card])).has(card)) return { card, pass: true };
  throw notFound();
}

/**
 * A card the viewer may read, by slug or document id — else not_found (never
 * "forbidden": that would confirm it exists). One its author shared with the
 * viewer in their conversation counts (sharedCards): this shows a card
 * (GET /cards/{key}) and reports one, and answers none.
 */
export async function visibleCard(ctx: ServerCtx, viewerId: string, key: string, opts: SharedOption = {}): Promise<Card> {
  return (await readableCard(ctx, viewerId, key, opts)).card;
}

/**
 * A card the viewer may read, by its document id only — for the routes whose
 * parameter is always an id (a card's lists, notes, a message's card): no
 * slug lookup first. `fields` reads only those (they must hold what canView
 * asks: CARD_VISIBILITY_FIELDS) — a note or a message needs no story.
 */
export async function visibleCardById(ctx: ServerCtx, viewerId: string, id: string, fields?: readonly string[]): Promise<Card> {
  if (!id || id.includes('/')) throw notFound();
  const card = await ctx.data.cards.get(id, fields);
  if (!card || !(await canView(ctx.data.users, card, viewerId))) throw notFound();
  return card;
}

/* ───────────── presenting lists ───────────── */

interface PresentOptions {
  reasons?: Map<string, string>;
  /** Cards shown though the rules would keep them from the viewer: shared with them in a conversation. */
  shared?: ReadonlySet<ListCard>;
  /** The viewer's blocks when the caller already read them (beside its own query). */
  blocked?: Set<string>;
  /** The cards visibleTo already let through for this viewer (B13). */
  readable?: ReadonlySet<ListCard>;
}

/**
 * Several lists at once, each as present() would answer it: whether the
 * viewer is connected to each connections-only author, each author's
 * profile, and the stories of the cards shown without a stored summary are
 * read once for all of them.
 */
async function presentAll(
  ctx: ServerCtx,
  viewerId: string,
  lists: ListCard[][],
  blocked: Set<string>,
  reasons?: Map<string, string>,
  shared?: ReadonlySet<ListCard>,
  /** The cards visibleTo already let through for this viewer (B13): not worked out again. */
  readable?: ReadonlySet<ListCard>,
): Promise<FeedCardBody[][]> {
  // A card in the trash is in no list but the trash shelf — not even its
  // author's (a thought map falling back to ?keys=, a thread's shared card
  // read the same by both people); to everyone else it is private anyway.
  const unblocked = lists.map((cards) => cards.filter((c) => !blockHides(c, blocked) && !inTrash(c)));
  const visible = new Set(readable ? unblocked.flat().filter((c) => readable.has(c)) : await visibleTo(ctx.data.users, viewerId, unblocked.flat()));
  for (const c of unblocked.flat()) if (shared?.has(c)) visible.add(c);
  const [authors] = await Promise.all([authorsOf(ctx.data.users, [...visible]), ctx.data.cards.withStories([...visible])]);
  // An empty reason (a quick first pass has none) is no reason.
  return unblocked.map((cards) =>
    cards.filter((c) => visible.has(c)).map((c) => toFeedCard(c, authors.get(c.authorId), { reason: reasons?.get(c.id) || null })),
  );
}

/** Cards the viewer may read, in the given order, minus the named cards of people they blocked (blockHides). */
async function present(ctx: ServerCtx, viewerId: string, cards: ListCard[], opts: PresentOptions = {}): Promise<FeedCardBody[]> {
  const blocked = opts.blocked ?? (await ctx.data.users.blockedBy(viewerId));
  return (await presentAll(ctx, viewerId, [cards], blocked, opts.reasons, opts.shared, opts.readable))[0];
}

/**
 * cardByKey for many keys (slugs or ids), for a list: the keys cut to
 * CARD_KEYS_MAX, each once; a slug's holder before the card whose id the key
 * is; in key order, each card once; unknown keys drop out.
 */
export function cardsByKeys(ctx: ServerCtx, keys: string[]): Promise<ListCard[]> {
  const unique = [...new Set(keys)].filter((k) => k && !k.includes('/')).slice(0, CARD_KEYS_MAX);
  return ctx.data.cards.listByKeys(unique);
}

/**
 * The cards keys named, minus an anonymous card a slug led to for someone
 * other than its author (anonymousBySlug): named by its id it stays.
 */
function askedByKey(cards: ListCard[], keys: string[], viewerId: string): ListCard[] {
  const asked = new Set(keys);
  return cards.filter((c) => !(c.anonymous === true && !asked.has(c.id) && c.authorId !== viewerId));
}

/**
 * GET /cards?keys= — summaries of the cards named (slugs or ids), in the
 * order asked, for previews: those the viewer may read, minus the named
 * cards of people they blocked; anonymous ones without a byline (and never
 * left out for a block, see blockHides). A card in the trash is left out for
 * everyone, its author too (presentAll): its slug still names it, so the key
 * names nothing else.
 */
export async function getCardsByKeys(ctx: ServerCtx, viewerId: string, keys: string[], opts: SharedOption = {}): Promise<CardListBody> {
  const [found, blocked] = await Promise.all([cardsByKeys(ctx, keys), ctx.data.users.blockedBy(viewerId)]);
  const cards = askedByKey(found, keys, viewerId);
  if (opts.shared === false) return { cards: await present(ctx, viewerId, cards, { blocked }) };
  // A thread's bubbles ask for the cards sent in it: one its author shared with
  // the viewer there is shown though the rules would keep it from them.
  // Side by side (B13): what the viewer may read, and which of the rest were shared with them — every card
  // a stranger might not read (anything but a published public one) asked about, so neither waits on the other.
  const maybeHidden = cards.filter((c) => !inTrash(c) && !(c.visibility === 'public' && c.publishedAt));
  const [visible, sharedAll] = await Promise.all([visibleTo(ctx.data.users, viewerId, cards), ctx.data.cards.sharedAmong(viewerId, maybeHidden)]);
  const readable = new Set(visible);
  const shared = new Set([...sharedAll].filter((c) => !readable.has(c)));
  return { cards: await present(ctx, viewerId, cards, { blocked, shared, readable }) };
}

/** The cards a story embeds; one that can't be read for them gives none (embeds only save the reader a request each). */
function embedKeysOf(ctx: ServerCtx, id: string, story: string): string[] {
  try {
    return embeddedCardKeys(story);
  } catch (e) {
    ctx.log.error('[api/v1] embeds', id, e);
    return [];
  }
}

/* ───────────── the feeds ───────────── */

/** A page of the latest public cards before anyone's blocks: listed ones only, their authors and summaries read. */
async function publicFeedPage(ctx: ServerCtx, limit: number, start?: PageStart) {
  const page = await ctx.data.cards.feedPage(limit, start);
  // A card the server marked as not for lists (lib/cards/blank: thin, a placeholder) goes as a blocked author's does.
  const cards = page.cards.filter((c) => !unlistedCard(c));
  const [authors] = await Promise.all([authorsOf(ctx.data.users, cards), ctx.data.cards.withStories(cards)]);
  // Pages are cut on the *raw* query so a page of blocked authors doesn't end the feed early.
  return { cards, authors, end: page.end };
}

/**
 * Latest public cards, newest first — the web's latest-feed query, minus
 * the named cards of people the viewer blocked (`viewerId` null: a signed-out
 * reader, who has none). Anonymous cards come without their byline, and a
 * block never takes one out (it would name its author, see blockHides).
 * Pages are cut on the *raw* query so a page of blocked authors doesn't end
 * the feed early.
 */
export async function getFeed(ctx: ServerCtx, viewerId: string | null, limit: number, start?: PageStart): Promise<FeedPageBody> {
  // The page as anyone sees it, kept a few seconds for every reader (publicLists, B3); the viewer's blocks after it.
  const [page, blocked] = await Promise.all([
    publicList(ctx.data.cards.scope, `feed|${limit}|${start?.pageToken ?? ''}|${start?.cursor ?? ''}`, () => publicFeedPage(ctx, limit, start)),
    viewerId ? ctx.data.users.blockedBy(viewerId) : new Set<string>(),
  ]);
  return {
    // A blank card (lib/cards/blank) is left out after the query, as a blocked author's is: the page may run short, never end early.
    cards: page.cards
      .filter((c) => !blockHides(c, blocked))
      .map((c) => toFeedCard(c, page.authors.get(c.authorId)))
      .filter((c) => !blankFeedCard(c)),
    ...page.end,
  };
}

/**
 * The reader's recommendations with their reasons, resolved to cards the
 * viewer may read, and whether they are today's (`status`). The recommender
 * answers from what it stored and builds today's after the response
 * (lib/recommend/daily); if it fails the reader still gets the latest feed,
 * so this answers empty rather than 500.
 */
export async function getRecommendedFeed(
  ctx: ServerCtx,
  viewerId: string,
  load: () => Promise<{ items: RecommendationItem[]; status?: 'fresh' | 'stale' }>,
): Promise<RecommendedFeedBody> {
  let loaded: { items: RecommendationItem[]; status?: 'fresh' | 'stale' };
  try {
    loaded = await load();
  } catch (e) {
    ctx.log.error('recommendations failed', e);
    return { cards: [], status: 'stale' };
  }
  const reasons = new Map(loaded.items.map((i) => [i.cardId, i.reason]));
  const [cards, blocked] = await Promise.all([ctx.data.cards.listByIds(loaded.items.map((i) => i.cardId)), ctx.data.users.blockedBy(viewerId)]);
  return {
    // A blank, thin or placeholder card (lib/cards/blank) recommended before its vectors went is never shown.
    cards: (await present(ctx, viewerId, cards.filter((c) => c.publishedAt && !unlistedCard(c)), { reasons, blocked })).filter((c) => !blankFeedCard(c)),
    status: loaded.status ?? 'fresh',
  };
}

/* ───────────── a card's page ───────────── */

/**
 * Of these recent cards, the ones a stranger may be shown (round 26 §A1.7):
 * related cards pick for readers who may not know the author, so a card its
 * reading keeps from strangers is left out (it stays in the feed and on its
 * author's profile).
 */
async function listedOnly(ctx: ServerCtx, cards: ListCard[]): Promise<ListCard[]> {
  const hidden = await ctx.data.cards.unlistedForStrangers(cards.map((c) => c.id));
  return cards.filter((c) => !hidden.has(c.id));
}

/**
 * The recent public cards strangers may be shown (listedOnly), the same for
 * every card page and every reader: kept a few seconds (publicLists, B3).
 * Each caller still drops the card itself, blank and trashed ones, and the
 * viewer's blocks (present) after it.
 */
const recentListed = (ctx: ServerCtx): Promise<ListCard[]> =>
  publicList(ctx.data.cards.scope, 'recent', () => ctx.data.cards.recentPublic(RELATED_LIMIT + 6).then((cards) => listedOnly(ctx, cards)));

/** Recent cards other than `base`, those sharing the most of its tags first. */
function relatedPool(base: Card, recent: ListCard[]): ListCard[] {
  const tags = (base.tags ?? []).slice(0, 5);
  const overlap = (c: Card) => (c.tags ?? []).filter((t) => tags.includes(t)).length;
  return recent.filter((c) => c.id !== base.id && !unlistedCard(c)).sort((a, b) => overlap(b) - overlap(a));
}

/** The related cards a page shows of the presented pool: the first few that aren't blank (lib/cards/blank). */
const relatedOf = (pool: FeedCardBody[]) => pool.filter((c) => !blankFeedCard(c)).slice(0, RELATED_LIMIT);

/** The cards whose card links point at this one, newest link first. */
async function cardsLinkingTo(ctx: ServerCtx, cardId: string): Promise<ListCard[]> {
  return ctx.data.cards.listByIds(await ctx.data.cards.linkSourcesTo(cardId, LINK_LIMIT));
}

/**
 * A card the viewer may read, with its story — and, as `include` asks, the
 * lists its page shows: exactly what GET /cards/{id}/resonances, /related and
 * /links answer, plus the cards its story embeds. One visibility check and
 * one read of the viewer's blocks serve them all, and the lists' queries run
 * side by side.
 */
export async function getCardDetail(
  ctx: ServerCtx,
  viewerId: string,
  key: string,
  include: ReadonlySet<CardInclude> = new Set(),
  opts: SharedOption = {},
): Promise<CardDetailBody> {
  const { cards, users } = ctx.data;
  const { card, pass } = await readableCard(ctx, viewerId, key, opts);
  const isOwner = card.authorId === viewerId;
  // Your own card in the trash (no one else's to read): the card and its
  // story, the cards it embeds — and none of the lists around it, which a
  // card in the trash stands in none of (it answers nothing while there).
  const trashed = isOwner && trashedAtOf(card) != null;
  const lists = trashed ? new Set<CardInclude>([...include].filter((i) => i === 'embeds')) : include;
  const ownerLinks = lists.has('links') && isOwner;
  const embedKeys = include.has('embeds') ? embedKeysOf(ctx, card.id, String(card.story ?? '')) : [];
  // The card itself is never kept from the viewer by their blocks: a named
  // one by someone they blocked is the client's to hide (its page knows the
  // byline), and an anonymous one is there for everyone (blockHides). The
  // viewer's blocks only thin the lists around it.
  // One read of the viewer's blocks for the lists and the tap's people (B4).
  const blockedP = card.referenceCardId || include.size ? users.blockedBy(viewerId) : null;
  const [author, reference, blocked, resonances, recent, linking, embedded, tap, bookmarked] = await Promise.all([
    card.anonymous ? null : users.getRow(card.authorId),
    card.referenceCardId ? cards.listByIds([card.referenceCardId]) : [],
    blockedP ?? new Set<string>(),
    lists.has('resonances') ? cards.resonancesOf(card.id, RESONANCE_LIMIT) : [],
    lists.has('related') ? recentListed(ctx) : [],
    ownerLinks ? cardsLinkingTo(ctx, card.id) : [],
    embedKeys.length ? cardsByKeys(ctx, embedKeys).then((found) => askedByKey(found, embedKeys, viewerId)) : [],
    // The resonance tap (taps): who resonated as the viewer may see them — none through a shared-card pass.
    cards.tapOf(viewerId, card, { pass, ...(blockedP ? { blocked: blockedP } : {}) }),
    // The viewer's own bookmark of it (users/{viewer}/bookmarks): theirs alone, so it tells no one anything.
    viewerId ? ctx.data.social.isBookmarked(viewerId, card.id) : null,
  ]);
  const [referenceCard, resonanceCards, relatedCards, linkCards, embedCards] = await presentAll(
    ctx,
    viewerId,
    [reference, resonances, relatedPool(card, recent), linking, embedded],
    blocked,
  );
  return {
    card: toFeedCard(card, author ?? undefined, { own: isOwner }),
    story: String(card.story ?? ''),
    visibility: visibilityOf(card.visibility),
    anonymous: card.anonymous === true,
    resonanceCount: Number(card.resonanceCount ?? 0),
    // The reading's through line: its author's alone (round 26 §A1.6) — no screen shows a reader what the model read.
    coreInsight: isOwner ? card.signature?.coreInsight || null : null,
    isOwner,
    referenceCard: referenceCard[0] ?? null,
    tap,
    ...(bookmarked === null ? {} : { bookmarked }),
    ...(include.has('resonances') ? { resonances: { cards: resonanceCards } } : {}),
    ...(include.has('related') ? { related: { cards: relatedOf(relatedCards) } } : {}),
    ...(include.has('links') ? { links: { cards: linkCards } } : {}),
    ...(include.has('embeds') ? { embeds: { cards: embedCards } } : {}),
    // Pages, never people: an anonymous card's previews name no one.
    linkPreviews: presentLinkPreviews(card.linkPreviews),
  };
}

/** Public cards written in response to this one, newest first. */
export async function getResonances(ctx: ServerCtx, viewerId: string, id: string): Promise<CardListBody> {
  const [, found, blocked] = await Promise.all([
    visibleCardById(ctx, viewerId, id),
    ctx.data.cards.resonancesOf(id, RESONANCE_LIMIT),
    ctx.data.users.blockedBy(viewerId),
  ]);
  return { cards: await present(ctx, viewerId, found, { blocked }) };
}

/** A few recent public cards, those sharing the most tags first (the web's getRelatedCards). */
export async function getRelated(ctx: ServerCtx, viewerId: string, id: string): Promise<CardListBody> {
  const [base, recent, blocked] = await Promise.all([visibleCardById(ctx, viewerId, id), recentListed(ctx), ctx.data.users.blockedBy(viewerId)]);
  return { cards: relatedOf(await present(ctx, viewerId, relatedPool(base, recent), { blocked })) };
}

/** What a stranger's related cards read of the card they sit under: its tags, and whether anyone may read it. */
const PUBLIC_BASE_FIELDS = ['tags', 'visibility', 'publishedAt', 'trashedAt'] as const;

/**
 * getRelated for a reader nobody is signed in as (GET /api/cards/related, the
 * web's signed-out card page): the same pool — recent public cards, only those
 * their reading lets strangers see (listedOnly, round 26 §A1.7: the browser
 * can't read `cardSignatures`), the ones sharing the most of the card's tags
 * first — without a viewer, so without blocks, the same for everyone; an
 * anonymous card without its byline, as the signed-out feed has it. Null for a
 * card no one signed out may read (not public, not published, in the trash).
 */
export async function getPublicRelated(ctx: ServerCtx, id: string): Promise<CardListBody | null> {
  if (!id || id.includes('/')) return null;
  const [base, recent] = await Promise.all([ctx.data.cards.get(id, PUBLIC_BASE_FIELDS), recentListed(ctx)]);
  if (!base || base.visibility !== 'public' || !base.publishedAt || base.trashedAt != null) return null;
  const pool = relatedPool(base, recent).filter((c) => !inTrash(c));
  const [authors] = await Promise.all([authorsOf(ctx.data.users, pool), ctx.data.cards.withStories(pool)]);
  return { cards: relatedOf(pool.map((c) => toFeedCard(c, authors.get(c.authorId)))) };
}

/** Cards that link to this one — shown to its author only, as on the web. */
export async function getLinksToCard(ctx: ServerCtx, viewerId: string, id: string): Promise<CardListBody> {
  const card = await visibleCardById(ctx, viewerId, id);
  if (card.authorId !== viewerId) return { cards: [] };
  const [cards, blocked] = await Promise.all([cardsLinkingTo(ctx, card.id), ctx.data.users.blockedBy(viewerId)]);
  return { cards: await present(ctx, viewerId, cards, { blocked }) };
}

/* ───────────── people ───────────── */

/** The person who goes by a pen name, and their profile: through its reservation (lib/db/firestore/handles). */
async function userByHandle(ctx: ServerCtx, handle: string): Promise<{ id: string; row: PersonRow }> {
  const uid = await ctx.data.users.idForHandle(handle);
  const row = uid ? await ctx.data.users.getRow(uid) : null;
  if (!uid || !row) throw new ApiFailure('not_found', 'No such person.');
  return { id: uid, row };
}

/** GET /users/{handle}/cards' page size when none is asked for (FeedQuery's default). */
const DEFAULT_PAGE = 12;
const EMPTY_PAGE: FeedPageBody = { cards: [], nextCursor: null, nextPageToken: null };

/**
 * A page of a profile's cards from its query's page (`limit` asked): public,
 * attributed (the query's own filter, see the cards repository's authorPage),
 * properly published. The anonymous filter here only backs the query up.
 */
async function profilePage(ctx: ServerCtx, page: CardPage, author: PersonRow): Promise<FeedPageBody> {
  const cards = page.cards.filter((c) => !c.anonymous);
  await ctx.data.cards.withStories(cards);
  return { cards: cards.map((c) => toFeedCard(c, author)), nextCursor: page.end.nextCursor, nextPageToken: page.end.nextPageToken };
}

/**
 * A person's profile as the viewer sees it — and, as `include` asks, exactly
 * what GET /users/{handle}/cards (its first page, of `limit` cards) and
 * /links answer. One read of the viewer's blocks serves the profile and its
 * links; the count is an aggregation over the page's own query.
 *
 * `preLetterBuild`: the request comes from an app build made before letters
 * (clientBuild), which is told it is connected to someone whose letter waits
 * for its answer (letterReadsAsConnection) — read beside the rest, for those
 * builds only.
 */
export async function getProfile(
  ctx: ServerCtx,
  viewerId: string,
  handle: string,
  opts: { include?: ReadonlySet<ProfileInclude>; limit?: number; preLetterBuild?: boolean } = {},
): Promise<ProfileBody> {
  const { cards, users } = ctx.data;
  const include = opts.include ?? new Set();
  // The count's query holds the page, so a page is never longer than it.
  const limit = Math.min(opts.limit ?? DEFAULT_PAGE, PROFILE_COUNT_LIMIT);
  const user = await userByHandle(ctx, handle);
  const isSelf = user.id === viewerId;
  const [blocks, isConnected, cardCount, published, linking, letter] = await Promise.all([
    // The whole block list when the links need it (it answers isBlocked too), else the one document.
    include.has('links') ? users.blockedBy(viewerId) : isSelf ? null : users.hasBlocked(viewerId, user.id).then((b) => (b ? new Set([user.id]) : null)),
    isSelf ? Promise.resolve(false) : users.connected(viewerId, user.id),
    // The count is an aggregation (B11: a read per thousand index entries, not 40 documents); the page reads its own.
    cards.countAuthorCards(user.id, PROFILE_COUNT_LIMIT),
    include.has('cards') ? cards.authorPage(user.id, limit) : null,
    include.has('links') ? cardsLinkingToAuthor(ctx, user.id, viewerId) : [],
    opts.preLetterBuild && !isSelf ? users.letterReadsAsConnection(viewerId, user.id) : false,
  ]);
  const blocked = !isSelf && !!blocks?.has(user.id);
  const u = user.row;
  const joined = u.joinedAt instanceof Date ? u.joinedAt : new Date(0);
  const [page, links] = await Promise.all([
    include.has('cards') && !blocked && published ? profilePage(ctx, published, u) : EMPTY_PAGE,
    include.has('links') ? present(ctx, viewerId, linking, { blocked: blocks ?? new Set() }) : [],
  ]);
  // A build before letters: a letter of theirs waiting for the viewer's answer reads as a connection.
  const answerable = !isConnected && !blocked && letter;
  return {
    author: toAuthor(user.id, u),
    bio: typeof u.bio === 'string' && u.bio ? u.bio : null,
    joinedAt: joined.toISOString(),
    // Over the same query as the page: named cards only, so the count says nothing of anonymous ones.
    cardCount: blocked ? 0 : cardCount,
    isSelf,
    isConnected: isConnected || answerable,
    isBlocked: blocked,
    ...(include.has('cards') ? { cards: page } : {}),
    ...(include.has('links') ? { links: { cards: links } } : {}),
  };
}

/**
 * The author's public cards, newest first. Anonymous cards never appear on a
 * profile (ux §6); nothing is listed for someone the viewer blocked.
 */
export async function getProfileCards(ctx: ServerCtx, viewerId: string, handle: string, limit: number, start?: PageStart): Promise<FeedPageBody> {
  const user = await userByHandle(ctx, handle);
  const [blocked, page] = await Promise.all([
    user.id === viewerId ? false : ctx.data.users.hasBlocked(viewerId, user.id),
    ctx.data.cards.authorPage(user.id, limit, start),
  ]);
  if (blocked) return EMPTY_PAGE;
  return profilePage(ctx, page, user.row);
}

/**
 * Cards by others linking to this author's cards, newest link first. To
 * anyone but the author, only links into their attributed cards count: a
 * link into one of their anonymous cards would tie that card to them (and a
 * link whose card isn't theirs at all names them wrongly).
 */
async function cardsLinkingToAuthor(ctx: ServerCtx, userId: string, viewerId: string): Promise<ListCard[]> {
  let pairs = await ctx.data.cards.linkPairsToAuthor(userId, LINK_LIMIT);
  if (viewerId !== userId) {
    const targets = await ctx.data.cards.listByIds(pairs.map((p) => p.target));
    const named = new Set(targets.filter((c) => c.authorId === userId && c.anonymous !== true).map((c) => c.id));
    pairs = pairs.filter((p) => named.has(p.target));
  }
  return ctx.data.cards.listByIds(pairs.map((p) => p.source));
}

/** Cards by others that link to this author's cards (the profile's "linked" tab). */
export async function getProfileLinks(ctx: ServerCtx, viewerId: string, handle: string): Promise<CardListBody> {
  const user = await userByHandle(ctx, handle);
  const [cards, blocked] = await Promise.all([cardsLinkingToAuthor(ctx, user.id, viewerId), ctx.data.users.blockedBy(viewerId)]);
  return { cards: await present(ctx, viewerId, cards, { blocked }) };
}

/** The stored hint counts that are counts (a hand-edited profile may hold anything). */
function hintsOf(v: unknown): Record<string, number> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
  return Object.fromEntries(Object.entries(v as Record<string, unknown>).filter((e): e is [string, number] => Number.isInteger(e[1])));
}

/** The signed-in account, with its scheduled deletion if any (read beside the profile). */
export async function getMe(ctx: ServerCtx, uid: string): Promise<MeBody> {
  const [u, deletion] = await Promise.all([ctx.data.users.getRow(uid), ctx.data.users.deletionOf(uid)]);
  if (!u) throw new ApiFailure('not_found', 'This account has no profile yet.');
  return {
    id: uid,
    handle: String(u.handle ?? ''),
    initials: String(u.initials ?? ''),
    accentColor: String(u.accentColor ?? ''),
    bio: str(u.bio),
    avatarUrl: resolvedMediaUrl(ctx.media, u.avatarUrl, u.avatarKey),
    region: str(u.region),
    primaryLocale: u.primaryLocale === 'en' || u.primaryLocale === 'zh-TW' ? u.primaryLocale : null,
    handleChangedAt: u.handleChangedAt instanceof Date ? u.handleChangedAt.toISOString() : null,
    deletion: deletion ? { requestedAt: deletion.requestedAt.toISOString(), purgeAfter: deletion.purgeAfter.toISOString() } : null,
    // Each only once the account has one (and only the values the contract names).
    ...(Array.isArray(u.autoTranslateTo) ? { autoTranslateTo: [...new Set(u.autoTranslateTo.filter((l): l is 'en' | 'zh-TW' => l === 'en' || l === 'zh-TW'))] } : {}),
    ...(u.hintsSeen && typeof u.hintsSeen === 'object' ? { hintsSeen: hintsOf(u.hintsSeen) } : {}),
  };
}

/* ───────────── the card box ───────────── */

const BOX_LIMIT = 40;
/** The most replies the resonated shelf reads. */
const RESONATED_SCAN = 60;
/** The trash shelf shows the newest this many (emptying it takes them all). */
export const TRASH_SHELF_LIMIT = 100;

type OwnShelf = 'published' | 'private' | 'draft' | 'trash';
type OthersShelf = Exclude<CardBoxTabName, OwnShelf>;
const OWN_SHELVES: readonly OwnShelf[] = ['published', 'private', 'draft', 'trash'];
const OTHERS_SHELVES: readonly OthersShelf[] = ['resonated', 'linked', 'bookmarks'];

/**
 * One of the viewer's own shelves. One query per shelf: with a shared "newest
 * 40" query, an author's 41st published card pushed every draft (publishedAt
 * null sorts last) out of the box, and private cards crowded out public ones.
 */
async function ownShelf(ctx: ServerCtx, viewerId: string, shelf: OwnShelf, now: number): Promise<ListCard[]> {
  if (shelf !== 'trash') return ctx.data.cards.ownShelf(viewerId, shelf, BOX_LIMIT);
  // The trash shelf: the latest in first, minus any past its purge date, which is gone to its owner too before the
  // cron reaches it (lib/cards/trash). Read without their stories (a draft's comes in withStories: it has no summary).
  const cards = await ctx.data.cards.trashShelf(viewerId, TRASH_SHELF_LIMIT);
  return cards.filter((c) => {
    const at = trashedAtOf(c);
    return at != null && !trashExpired(at, now);
  });
}

/** The ids on a shelf of others' cards, in shelf order. */
function othersShelfIds(ctx: ServerCtx, viewerId: string, shelf: OthersShelf): Promise<string[]> {
  if (shelf === 'resonated') return ctx.data.cards.answeredIds(viewerId, RESONATED_SCAN);
  if (shelf === 'linked') return ctx.data.cards.linkPairsToAuthor(viewerId, LINK_LIMIT).then((pairs) => pairs.map((p) => p.source));
  // A bookmarked card that has since gone private simply drops out.
  return ctx.data.cards.bookmarkIds(viewerId, BOX_LIMIT * 2);
}

/**
 * Shelves of the viewer's card box (the web's useMyCardBox), each exactly as
 * GET /me/cards?tab= answers it: their own published, private and draft
 * cards (keeping their byline even when published anonymously, marked
 * `anonymous`) and their trash; the originals they wrote a resonance for;
 * cards linking to theirs; their bookmarks. Everything the shelves need is read side by side,
 * once: the shelves' queries, the viewer's profile and blocks, one batched
 * read of the others' cards, and the stories a summary can't stand in for.
 */
export async function getCardBoxShelves(ctx: ServerCtx, viewerId: string, shelves: ReadonlySet<CardBoxTabName>, now = Date.now()): Promise<CardBoxBody> {
  const own = OWN_SHELVES.filter((s) => shelves.has(s));
  const others = OTHERS_SHELVES.filter((s) => shelves.has(s));
  const [me, ownCards, blocked, otherIds] = await Promise.all([
    own.length ? ctx.data.users.getRow(viewerId) : null,
    Promise.all(own.map((s) => ownShelf(ctx, viewerId, s, now))),
    others.length ? ctx.data.users.blockedBy(viewerId) : new Set<string>(),
    Promise.all(others.map((s) => othersShelfIds(ctx, viewerId, s))),
  ]);
  const byId = new Map((await ctx.data.cards.listByIds(otherIds.flat())).map((c) => [c.id, c]));
  const otherCards = otherIds.map((ids) => [...new Set(ids)].map((id) => byId.get(id)).filter((c): c is ListCard => !!c));
  const [, presented] = await Promise.all([ctx.data.cards.withStories(ownCards.flat()), presentAll(ctx, viewerId, otherCards, blocked)]);

  const box: CardBoxBody = {};
  own.forEach((s, i) => {
    // The trash shelf's cards say when they went in, when they go and what restoring brings back; the
    // others when each was last changed (the apps' 草稿 shelf holds drafts and private cards together).
    box[s] = { cards: ownCards[i].map((c) => toFeedCard(c, me ?? undefined, { deanonymize: true, own: s === 'trash', edited: s !== 'trash' })) };
  });
  others.forEach((s, i) => {
    box[s] = { cards: presented[i] };
  });
  return box;
}

/** One shelf of the viewer's card box (GET /me/cards?tab=): getCardBoxShelves for that shelf alone. */
export async function getCardBox(ctx: ServerCtx, viewerId: string, tab: CardBoxTabName, now = Date.now()): Promise<CardListBody> {
  return (await getCardBoxShelves(ctx, viewerId, new Set([tab]), now))[tab] ?? { cards: [] };
}

/* ───────────── the card page's server render ───────────── */

/** A card page's server read. */
export interface LoadedCard {
  /**
   * The document the URL segment names (any visibility), or null — null for
   * a card in its author's trash too, which is gone to everyone else
   * (cardByKeyForAnyone).
   */
  id: string | null;
  /** The card, only when a signed-out reader may read it (public and published). */
  card: Card | null;
  /** Its author's profile — never read for an anonymous card. */
  author: User | null;
}

/**
 * The card a URL segment names, as the world sees it. There is no viewer
 * here: the result becomes cached HTML served to everyone, so only what a
 * signed-out reader may read comes back — firestore.rules' `cardVisible` for
 * no one: published, and public — and what depends on the viewer (their
 * blocks, their own or connections-only cards) is left to the browser.
 */
export async function readCardForPage(ctx: ServerCtx, key: string): Promise<LoadedCard> {
  const found = await ctx.data.cards.findForAnyone(key);
  if (!found) return { id: null, card: null, author: null };
  const { id, card } = found;
  if (card.visibility !== 'public' || !found.stamped) return { id, card: null, author: null };
  if (card.anonymous || !card.authorId || card.authorId.includes('/')) return { id, card, author: null };
  return { id, card, author: await ctx.data.users.getUser(card.authorId) };
}
