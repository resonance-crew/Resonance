'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import useSWRInfinite from 'swr/infinite';
import { useAuth } from '@/components/providers/AuthProvider';
import type { Card, CardBoxTab, User } from '@/lib/db';
import {
  getCardById,
  getCardBySlugOrId,
  getCardsByAuthor,
  getMyDrafts,
  getCurrentUserProfile,
  getMyResonanceCard,
  getPublicCardView,
  getPublicCardsByAuthor,
  getPublicFeedPage,
  getRelatedCards,
  getResonanceCards,
  getUserById,
  getUserByHandle,
  getUsersByIds,
  isConnected,
  listMyConnectionUids,
  resolveCardId,
} from '@/lib/db/firestore/client/reads';
import { loadMyThoughtMap, type ThoughtMapData } from '@/lib/db/firestore/client/thoughtMap';
import { listenConversations } from '@/lib/db/firestore/client/messages';
import { listenNotifications } from '@/lib/db/firestore/client/notifications';
import { getMyBlockedIds } from '@/lib/db/firestore/client/blocks';
import { ApiError, callApi } from '@/lib/db/firestore/client/api';
import { getFirebaseClientAuth, hasSessionMark, sessionMarkUid } from '@/lib/auth/firebase/client';
import { linkPreviewsOf } from '@/lib/links/previewShape';
import { trashExpired } from '@/lib/cards/trash';
import type {
  CardBoxBody,
  CardBoxTabName,
  CardDetailBody,
  CardListBody,
  CardTapBody,
  FeedPageBody,
  ProfileBody,
  RecommendedFeedBody,
} from '@/lib/api/v1/schemas';
import type { Conversation, Notification } from '@/lib/db/types';
import { useLive, type LiveState } from './live';
import { anonymousAuthor, cardKey } from './cardPrefill';
import type { CardSeed, PublicCardView } from './cardSeed';
import { profileUser, summaryAuthor, summaryCard, summaryList } from './summaries';

/**
 * For what the viewer edits themselves — their card, card box, map, profile:
 * SWR's own short deduping window instead of the app-wide 30 s
 * (SWRProvider), so coming back from the editor reads their change.
 */
const OWN_CONTENT = { dedupingInterval: 2_000 } as const;
/** Stays live when the reader returns to the tab (the app-wide default doesn't). */
const LIVE_ON_FOCUS = { revalidateOnFocus: true } as const;

export interface CardsWithAuthors {
  cards: Card[];
  authors: Record<string, User>;
}

/**
 * Where a page's reads go for this viewer. Signed in: `v1` — one /api/v1
 * request per page, the server applying their blocks, connections and
 * anonymity (it answers exactly what the apps get). Signed out: `public` —
 * Firestore through the rules, which needs no viewer (and keeps the reads
 * that are the same for everyone off the server). `null` while it can't tell:
 * auth is still restoring in a browser someone signed in in. A browser nobody
 * signed in in starts the public reads at once.
 */
export type ReadPath = 'v1' | 'public' | null;

export function useReadPath(): ReadPath {
  return useReadViewer().path;
}

/**
 * {@link useReadPath} and whose reads they are. While Auth restores in a
 * browser holding a live session cookie (its mark: `sessionMarkUid`), `v1`
 * at once under the uid the cookie was minted for (W10): `callApi` has no ID
 * token yet, so the request goes with the cookie, which /api/v1 GETs take —
 * the first screen no longer waits for the SDK to load and restore (and
 * refresh an expired token). Once Auth has restored, its user keys the reads:
 * the same uid keeps what was read, another one reads again under its own key.
 * A mark whose cookie has run out is no reason to read: `null` until Auth
 * says.
 */
export function useReadViewer(): { path: ReadPath; uid?: string } {
  const { user, loading } = useAuth();
  if (!loading) return user ? { path: 'v1', uid: user.id } : { path: 'public' };
  const marked = sessionMarkUid();
  if (marked) return { path: 'v1', uid: marked };
  return hasSessionMark() ? { path: null } : { path: 'public' };
}

/**
 * A v1 GET for the signed-in viewer. One sent with the cookie alone (Auth
 * still restoring, W10) that the server refuses (401: the cookie revoked or
 * gone) is sent again once Auth has restored a user, with their ID token.
 */
async function v1Get<T>(path: string): Promise<T> {
  try {
    return await callApi<T>(path);
  } catch (e) {
    if (!(e instanceof ApiError && e.status === 401)) throw e;
    const auth = getFirebaseClientAuth();
    if (!auth.currentUser) await auth.authStateReady();
    if (!auth.currentUser) throw e;
    return callApi<T>(path);
  }
}

/** A v1 GET for the signed-in viewer, or null when the server says there is no such thing (404): never retried. */
async function getOrNull<T>(path: string): Promise<T | null> {
  try {
    return await v1Get<T>(path);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}

/**
 * Whose profiles a list of cards may fetch: every byline except someone
 * else's anonymous card. The card itself still names its author's uid (rules
 * can't redact a field), but the viewer's browser never downloads the
 * profile a card is anonymous from — every surface shows the anonymous
 * byline for it anyway.
 */
function bylineAuthorIds(cards: Card[], viewerId: string | undefined): string[] {
  return cards.filter((c) => !c.anonymous || c.authorId === viewerId).map((c) => c.authorId);
}

/**
 * Cards plus their authors, minus cards by people the viewer has blocked (see
 * client/blocks.ts). The block list is read beside the cards, not after them:
 * it waits for Auth to restore the viewer, as the cards' own read does.
 * Lists show every anonymous card — the viewer's own too — under the
 * anonymous byline, so no anonymous author is fetched.
 */
async function withAuthors(read: Card[] | Promise<Card[]>): Promise<CardsWithAuthors> {
  const [cards, blocked] = await Promise.all([read, getMyBlockedIds()]);
  const visible = blocked.size ? cards.filter((c) => !blocked.has(c.authorId)) : cards;
  const authors = await getUsersByIds(bylineAuthorIds(visible, undefined));
  return { cards: visible, authors };
}

export interface RecommendedFeed extends CardsWithAuthors {
  /** cardId → 「為什麼這篇可能對你有共鳴」 one-liner from the funnel. */
  reasons: Record<string, string>;
}

/**
 * The signed-in viewer's personalized「為你共振」feed: today's picks as cards,
 * in one request — GET /api/v1/feed/recommended (as the apps ask), which
 * resolves the funnel's picks to the cards the viewer may read, minus the
 * named cards of people they blocked, an anonymous one without its byline
 * (and never left out for a block), each with its reason.
 * Gated on a signed-in viewer — the API requires auth, and an anonymous user
 * has no profile to match from.
 *
 * The request carries the viewer's ID token (like `callApi`), so it never
 * waits for the session cookie. `isLoading` also covers the moments before
 * the fetch can start (auth still restoring), so the home page can tell
 * "not yet" from "nothing for you". A failed request is no picks — the
 * latest cards carry the feed.
 */
export function useRecommendedFeed() {
  const { user, loading } = useAuth();
  const swr = useSWR<RecommendedFeed>(user && !loading ? `feed:recommended:${user.id}` : null, async () => {
    let body: RecommendedFeedBody;
    try {
      body = await callApi<RecommendedFeedBody>('/api/v1/feed/recommended');
    } catch {
      return { cards: [], authors: {}, reasons: {} };
    }
    const reasons: Record<string, string> = {};
    for (const c of body.cards) if (c.reason) reasons[c.id] = c.reason;
    return { ...summaryList(body.cards), reasons };
  });
  return { ...swr, isLoading: swr.isLoading || loading };
}

const FEED_PAGE_SIZE = 12;

/** One fetched feed page. The server cuts pages on its raw query (before
 * blocked authors are dropped), so a filtered-short page never ends the feed. */
interface FeedPage extends CardsWithAuthors {
  /** The next page's cursor; null at the end. */
  next: string | null;
}

export interface FeedState {
  data?: CardsWithAuthors;
  isLoading: boolean;
  /** A further page is currently being fetched (the "load more" spinner). */
  isLoadingMore: boolean;
  /** False once the newest fetch came back short — the feed is exhausted. */
  hasMore: boolean;
  /**
   * How many cards each page fetched so far holds, in order (`data.cards` is
   * them one after another): the home feed shows a page only once its reader
   * asks for it (「顯示更多」), while the next one is already fetched.
   */
  pageSizes?: number[];
  loadMore: () => void;
}

/**
 * Latest public feed for the home page, a page at a time, from the server:
 * anonymous cards are in it without their byline, which the rules keep out
 * of the browser's own queries (their documents name their authors). Signed
 * in: GET /api/v1/feed, minus authors the viewer blocked. Signed out: GET
 * /api/cards/latest, the same for everyone (and kept by the CDN).
 */
export function useFeed(): FeedState {
  const { path, uid } = useReadViewer();
  const viewer = path === 'v1' ? uid! : 'anon';
  const { data, isLoading, size, setSize } = useSWRInfinite<FeedPage>(
    (index, prev: FeedPage | null) => {
      // Until it's known who is reading (auth restoring in a signed-in browser).
      if (!path) return null;
      // The server says when it ran out.
      if (prev && prev.next === null) return null;
      return ['feed:latest', viewer, index === 0 ? null : prev!.next];
    },
    async ([, who, cursor]: [string, string, string | null]) => {
      const page =
        who === 'anon'
          ? await getPublicFeedPage(FEED_PAGE_SIZE, cursor ?? undefined)
          : await v1Get<FeedPageBody>(
              `/api/v1/feed?limit=${FEED_PAGE_SIZE}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
            );
      return { ...summaryList(page.cards), next: page.nextCursor };
    },
    // Fetching ahead takes the next page only — not page one again.
    { revalidateFirstPage: false },
  );

  const pages = data ?? [];
  // The same object until a page comes or goes, so the feed's grid and cards
  // don't re-render with each render of the page.
  const merged = useMemo<CardsWithAuthors | undefined>(
    () =>
      data && data.length > 0
        ? {
            cards: data.flatMap((p) => p.cards),
            authors: Object.assign({}, ...data.map((p) => p.authors)),
          }
        : undefined,
    [data],
  );
  const pageSizes = useMemo(() => (data ?? []).map((p) => p.cards.length), [data]);
  return {
    data: merged,
    isLoading: isLoading || !path,
    isLoadingMore: size > pages.length,
    hasMore: pages.length > 0 && pages[pages.length - 1].next !== null,
    pageSizes,
    loadMore: () => void setSize((s) => s + 1),
  };
}

/** A card and the byline a card page shows for it (null: its author's profile is gone). */
export interface CardView {
  card: Card;
  author: User | null;
}

/**
 * Card URL segment → the document id it names, as the card page's server
 * render found it (and as the browser learnt since). Every reader of a card's
 * SWR key fetches through {@link fetchCardView} — the page, and any other
 * reader of the key beside it (an embed of the same card), whose fetch may
 * well be the one that runs (SWR starts a hook holding fallbackData a frame
 * later) — so whichever does skips the slug lookup.
 */
const serverCardIds = new Map<string, string>();

/**
 * Card URL segment → whose card the server render showed for it (`''`: an
 * anonymous one, whose author it never names) — only for a public card it
 * rendered whole. Someone else's card the signed-in reader's browser then
 * takes from the card page's one v1 request ({@link sharedCardDetail}), not
 * from a second read of the same story through the rules (W3); someone else's
 * anonymous card, which the rules never read here, goes straight to the
 * server (W4).
 */
const serverCardAuthors = new Map<string, { id: string; authorId: string }>();

/** How long a settled GET /api/v1/cards/{id}?include=… answer may still serve the page's other reader of it. */
const SHARED_DETAIL_MS = 3_000;

interface SharedDetail {
  promise: Promise<CardDetailBody | null>;
  /** When it settled; undefined while in flight. */
  settledAt?: number;
  /** Who has had it: each reader takes one answer once, so its own next read asks again. */
  takers: Set<'card' | 'lists'>;
}

/** By `{uid}:{key}` (the card's id, and its slug once answered). */
const sharedDetails = new Map<string, SharedDetail>();

/**
 * The card page's one signed-in request, GET /api/v1/cards/{key}?include=…,
 * shared by its two readers — the card ({@link useCard}) and the lists around
 * it ({@link useCardPageLists}) — which start together: whichever asks
 * second, while the request is in flight or for a moment after, takes the
 * same answer instead of asking again. Each reader takes an answer once, so a
 * later read of either (a revalidation after an edit) always asks the server.
 */
export function sharedCardDetail(key: string, uid: string, who: 'card' | 'lists'): Promise<CardDetailBody | null> {
  const now = Date.now();
  for (const [k, e] of sharedDetails) if (e.settledAt !== undefined && now - e.settledAt > SHARED_DETAIL_MS) sharedDetails.delete(k);
  const hit = sharedDetails.get(`${uid}:${key}`);
  if (hit && !hit.takers.has(who)) {
    hit.takers.add(who);
    return hit.promise;
  }
  const entry: SharedDetail = {
    promise: getOrNull<CardDetailBody>(`/api/v1/cards/${encodeURIComponent(key)}?include=${CARD_PAGE_INCLUDE}`),
    takers: new Set([who]),
  };
  sharedDetails.set(`${uid}:${key}`, entry);
  entry.promise.then(
    (body) => {
      entry.settledAt = Date.now();
      // The other reader may ask by the card's id or its slug (unless the entry was dropped meanwhile).
      if (body && sharedDetails.get(`${uid}:${key}`) === entry) for (const alias of [body.card.id, body.card.slug]) if (alias && alias !== key) sharedDetails.set(`${uid}:${alias}`, entry);
    },
    () => {
      // A failure is no one else's answer: the other reader asks for itself.
      for (const [k, e] of sharedDetails) if (e === entry) sharedDetails.delete(k);
    },
  );
  return entry.promise;
}

/** Forget the shared answers (tests). */
export function resetSharedCardDetails() {
  sharedDetails.clear();
}

/**
 * A card by URL segment (slug or legacy doc id), read through the rules, with
 * the byline this viewer is shown: someone else's anonymous card gets the
 * anonymous one, and the profile it is anonymous from is never downloaded.
 * Null: no such card, or not one this viewer may read.
 *
 * Someone else's anonymous card the rules won't read here at all (its
 * document names its author): when the rules refuse, the server is asked —
 * GET /api/v1/cards/{key} signed in (which applies the viewer's blocks to it
 * too), the card page's public seed signed out — and answers it without its
 * author (`authorId` empty). The viewer's own card in their trash is found
 * the same way: the server render and the slug lookup, which answer anyone,
 * know no card there (it is gone to everyone else), but GET /api/v1/cards/{key}
 * knows its author.
 *
 * `knownId` is the id the page's server render found for the segment (by
 * default, whatever {@link useCard} was handed for it): it is read directly,
 * and the server is asked again only when it no longer reads (the slug may
 * have gone to another card since that render).
 */
export async function fetchCardView(
  key: string,
  viewerId: string | undefined,
  knownId: string | undefined = serverCardIds.get(key),
): Promise<CardView | null> {
  const shown = serverCardAuthors.get(key);
  if (shown && shown.authorId !== viewerId) {
    // Someone else's card, as the server render showed it. Signed in: the
    // page's one v1 request answers it (W3) — the lists beside it share it.
    if (viewerId) {
      // By the id the render found, as the lists ask (useCardPageLists).
      const body = await sharedCardDetail(shown.id, viewerId, 'card');
      if (body) return cardViewOfDetail(body, key, viewerId);
      // Gone, or the id no longer the slug's: the server finds what the key names now.
      return serverCardView(key, viewerId);
    }
    // Signed out, an anonymous card: the rules never read one here (W4).
    if (shown.authorId === '') return serverCardView(key, undefined);
  }
  let card: Card | null;
  if (knownId) {
    card = await getCardById(knownId);
    if (!card) {
      const id = await resolveCardId(key);
      if (id) serverCardIds.set(key, id);
      else serverCardIds.delete(key);
      card = id && id !== knownId ? await getCardById(id) : null;
    }
  } else {
    card = await getCardBySlugOrId(key);
  }
  // Its author's own card past its 30 days in the trash is gone to them too, before the purge reaches it.
  if (card?.trashedAt && trashExpired(card.trashedAt)) return null;
  if (!card) return serverCardView(key, viewerId);
  if (card.anonymous && card.authorId !== viewerId) return { card, author: anonymousAuthor(card) };
  return { card, author: await getUserById(card.authorId) };
}

/** A card the rules wouldn't read here, as the server answers it (see fetchCardView). */
async function serverCardView(key: string, viewerId: string | undefined): Promise<CardView | null> {
  if (!viewerId) {
    const seed = await getPublicCardView(key);
    return seed?.view ? seedCardView(seed.view) : null;
  }
  const body = await getOrNull<CardDetailBody>(`/api/v1/cards/${encodeURIComponent(key)}`);
  if (!body) return null;
  return cardViewOfDetail(body, key, viewerId);
}

/** A v1 CardDetail as the card page's view: the viewer's own card read whole through the rules, anyone else's as answered. */
async function cardViewOfDetail(body: CardDetailBody, key: string, viewerId: string): Promise<CardView | null> {
  if (body.isOwner) {
    // The viewer's own card, which the slug lookup didn't name: one in their
    // trash, gone to everyone else (/api/cards/resolve answers it as a miss).
    // The server knows whose it is; the card itself is read whole through the
    // rules by the id it answered — which then stands for the key, so the
    // next read goes straight to it.
    let own: Card | null = null;
    try {
      own = await getCardById(body.card.id);
    } catch {
      // Not read here: the server's answer will do.
    }
    if (own) {
      serverCardIds.set(key, own.id);
      return { card: own, author: await getUserById(viewerId) };
    }
  }
  return detailCardView(body, viewerId);
}

/** GET /api/v1/cards/{key}'s answer as the card page's card and byline. */
async function detailCardView(body: CardDetailBody, viewerId: string): Promise<CardView> {
  // A summary's shape, with the whole story — never marked a summary.
  const { summary: _summary, ...shown } = summaryCard(body.card);
  const card: Card = {
    ...shown,
    // The server never names an anonymous card's author; the viewer's own card is theirs.
    authorId: body.isOwner ? viewerId : (body.card.author?.id ?? ''),
    story: body.story,
    visibility: body.visibility,
    anonymous: body.anonymous,
    resonanceCount: body.resonanceCount,
    ...previewsOf(body.linkPreviews),
  };
  if (body.isOwner) return { card, author: await getUserById(viewerId) };
  if (body.anonymous || !body.card.author) return { card, author: body.anonymous ? anonymousAuthor(card) : null };
  return { card, author: summaryAuthor(body.card.author) };
}

/**
 * A card's link previews as an answer carried them (the seed, a v1 detail —
 * maybe from an older deployment, without them), checked again here: they
 * came over the network.
 */
function previewsOf(value: unknown): Pick<Card, 'linkPreviews'> {
  const linkPreviews = linkPreviewsOf(value);
  return linkPreviews.length ? { linkPreviews } : {};
}

/** The server render's public card (see CardSeed) in the shapes the page draws. */
export function seedCardView({ card: c, author: a }: PublicCardView): CardView {
  const card: Card = {
    id: c.id,
    authorId: c.authorId,
    ...(c.slug ? { slug: c.slug } : {}),
    thoughtCore: c.thoughtCore,
    story: c.story,
    tags: c.tags,
    ...(c.media ? { media: c.media } : {}),
    originalLocale: c.originalLocale,
    translations: {},
    visibility: 'public',
    ...(c.referenceCardId ? { referenceCardId: c.referenceCardId } : {}),
    publishedAt: c.publishedAt ? new Date(c.publishedAt) : null,
    readCount: 0,
    resonanceCount: c.resonanceCount,
    inviteCount: 0,
    ...(c.accentHue != null ? { accentHue: c.accentHue } : {}),
    anonymous: c.anonymous,
    ...previewsOf(c.linkPreviews),
  };
  const author: User = a
    ? {
        id: a.id,
        handle: a.handle,
        ...(a.bio ? { bio: a.bio } : {}),
        region: a.region,
        primaryLocale: c.originalLocale,
        autoTranslateTo: [],
        verified: a.verified,
        phoneHash: '',
        avatarSeed: a.avatarSeed,
        ...(a.avatarUrl ? { avatarUrl: a.avatarUrl } : {}),
        initials: a.initials,
        accentColor: a.accentColor,
        joinedAt: new Date(0),
        handleChangedAt: new Date(0),
      }
    : anonymousAuthor(card);
  return { card, author };
}

/**
 * A single card plus its author, keyed by URL segment (slug or legacy doc id).
 * `data === null` means not found / not visible.
 *
 * `seed` is what the card page's server render found (see CardSeed): its id
 * spares the browser the slug lookup, and a public card is shown at once
 * (`fromServer`) until the browser's own read — through the rules, as this
 * viewer — replaces it, or turns it into not-found when the card is no longer
 * one this viewer may read.
 */
export function useCard(slugOrId: string | undefined, seed?: CardSeed | null) {
  // A card may be public (anonymous-readable) or private/connections (only its
  // owner / connected viewers). Wait for auth to *settle* before fetching:
  // firing during the client SDK's async auth restoration would read as an
  // anonymous viewer and 404 the owner's own private card, which SWR would then
  // cache against a static key. Re-keying on the viewer id also refetches with
  // the right permissions when the viewer signs in or out.
  // A list prefills this key when a card in it is clicked (cardPrefill.ts).
  const { user, loading } = useAuth();
  const key = slugOrId && !loading ? cardKey(slugOrId, user?.id) : null;
  const view = seed?.view;
  const fallback = useMemo(() => (view ? seedCardView(view) : undefined), [view]);
  // Recorded while rendering, before any hook's fetch can start (see serverCardIds).
  if (slugOrId && seed?.id && !serverCardIds.has(slugOrId)) serverCardIds.set(slugOrId, seed.id);
  if (slugOrId && seed) {
    if (view && seed.id === view.card.id) serverCardAuthors.set(slugOrId, { id: seed.id, authorId: view.card.authorId });
    else serverCardAuthors.delete(slugOrId);
  }
  const swr = useSWR<CardView | null>(key, () => fetchCardView(slugOrId!, user?.id), {
    ...OWN_CONTENT,
    fallbackData: fallback,
  });
  // While auth is still settling (or we have no id yet) the SWR key is null, so
  // SWR reports isLoading=false with data=undefined — which would briefly render
  // the "not found" state before the real fetch begins. Treat that pre-fetch
  // window as loading so the skeleton shows first. A card already in hand (a
  // list prefilled it, or the server rendered it) is never "loading", though
  // SWR's first render says so.
  return {
    ...swr,
    isLoading: swr.data === undefined && (swr.isLoading || (!!slugOrId && key === null)),
    /** What's shown is still the server render's, not yet this browser's own read. */
    fromServer: fallback !== undefined && swr.data === fallback,
  };
}

/**
 * Cards related to the given card, with their bylines, for the public path
 * (useCardPageLists): from the server (GET /api/cards/related), the same for
 * everyone — only it may leave out the cards their reading keeps from
 * strangers (round 26 §A1.7). It needs no viewer, so it fetches as soon as
 * there is a card id; the block list is read beside it, for a browser whose
 * viewer turns out signed in (an anonymous card is never left out for one).
 */
export function useRelated(id: string | undefined) {
  return useSWR<CardsWithAuthors>(id ? `related:${id}` : null, async () => {
    const [body, blocked] = await Promise.all([getRelatedCards(id!), getMyBlockedIds()]);
    const { cards, authors } = summaryList(body);
    return { cards: blocked.size ? cards.filter((c) => c.anonymous || !blocked.has(c.authorId)) : cards, authors };
  });
}

/**
 * Two block lists hold the same people. SWR compares what a fetcher answers
 * with dequal/lite, to which any two Sets are equal (they have no keys of
 * their own): read again after a block, the list would never reach the page.
 */
const sameIds = (a?: Set<string>, b?: Set<string>) =>
  a === b || (!!a && !!b && a.size === b.size && [...a].every((id) => b.has(id)));

/** The uids the signed-in viewer has blocked (empty set when signed out). */
export function useMyBlockedIds() {
  const { user, loading } = useAuth();
  return useSWR<Set<string>>(user && !loading ? `blocks:${user.id}` : null, () => getMyBlockedIds(), {
    ...LIVE_ON_FOCUS,
    compare: sameIds,
  });
}

const myProfileKey = (uid: string) => `profile:${uid}`;

/**
 * The signed-in viewer's own profile. Many surfaces hold it (the shell, the
 * header, me, settings, the publish step, a card's page): with the app-wide
 * dedupe (W14), not read again on every page change — settings, the one place
 * it is changed, reads it again after each save ({@link useRefreshMyProfile}).
 */
export function useMyProfile() {
  const { user } = useAuth();
  return useSWR(user ? myProfileKey(user.id) : null, () => getCurrentUserProfile());
}

/** Reads the viewer's own profile again: after a write to it. */
export function useRefreshMyProfile(): () => void {
  const { user } = useAuth();
  const { mutate } = useSWRConfig();
  const uid = user?.id;
  return useCallback(() => {
    if (uid) void mutate(myProfileKey(uid));
  }, [mutate, uid]);
}

/**
 * A shelf of the card box: the viewer's own published / private / draft
 * cards, the originals they resonated with, cards other people linked to
 * theirs ("link with a card"), their bookmarks (private, visible only here),
 * and their trash.
 */
export type CardBoxShelf = CardBoxTab | 'linked' | 'bookmarks' | 'trash';

/** One shelf's cards with their bylines. */
export type CardBoxShelfData = CardsWithAuthors;

/**
 * One of the card box's shelves of other people's cards, from the server
 * (GET /api/v1/me/cards?tab=): those the viewer may read, minus the named
 * cards of people they blocked, an anonymous one without its byline (a block
 * never hides one) — the rules won't read someone else's anonymous card in
 * the browser, nor any card link.
 */
async function othersShelf(tab: Extract<CardBoxTabName, 'resonated' | 'linked' | 'bookmarks'>): Promise<CardsWithAuthors> {
  return summaryList(await callApi<CardListBody>(`/api/v1/me/cards?tab=${tab}`));
}

/**
 * A shelf: the viewer's own cards read through the rules, the others' from
 * the server — and the trash from the server too: its list summaries (never a
 * hundred whole stories through the rules), each saying when it went in and
 * what restoring brings back. A summary never prefills a card page.
 */
async function readShelf(uid: string, shelf: CardBoxShelf): Promise<CardBoxShelfData> {
  // A bookmarked card that has since gone private simply drops out.
  if (shelf === 'resonated' || shelf === 'linked' || shelf === 'bookmarks') return othersShelf(shelf);
  if (shelf === 'trash') return summaryList(await callApi<CardListBody>('/api/v1/me/cards?tab=trash'));
  // 草稿: drafts and the cards kept private, together (round 8 §1.1).
  const cards = shelf === 'draft' ? await getMyDrafts(uid) : await getCardsByAuthor(uid, shelf);
  return { cards, authors: await getUsersByIds(bylineAuthorIds(cards, uid)) };
}

/**
 * One shelf of the signed-in viewer's card box — the one on screen, read when
 * it is shown (the box used to read all six before showing any). `null`: no
 * shelf chosen yet. The viewer's own anonymous cards keep their byline here.
 */
export function useMyCardBox(shelf: CardBoxShelf | null) {
  const { user } = useAuth();
  return useSWR<CardBoxShelfData>(user && shelf ? `cardbox:${user.id}:${shelf}` : null, async () => {
    return readShelf(user!.id, shelf!);
  }, OWN_CONTENT);
}

export interface MyThoughtMap extends ThoughtMapData {
  /** Every card placeable on the map (own published / private / draft, plus
   * the originals the viewer resonated with), keyed by id — drives both node
   * rendering and the "add a card" tray. */
  cards: Record<string, Card>;
  /** Ids of cards the viewer doesn't own but resonated with — the tray marks
   * these with the resonance glyph instead of the card/pen icon. */
  resonatedIds: string[];
}

/** The own shelves the thought map places and offers (GET /api/v1/me/cardbox). */
const MAP_SHELVES = 'published,private,draft';

/**
 * The signed-in viewer's thought map plus their own + resonated cards — as
 * list summaries (W11): the viewer's own shelves in one GET
 * /api/v1/me/cardbox (the server reads them without their stories), the
 * other cards it places in GET /api/v1/cards?keys= (30 a request), instead of
 * some 320 whole stories through the rules and a read for each card beside
 * them. A summary never stands for the card in an editor: a card opened from
 * the map is read whole there (readWriterCard).
 */
export function useMyThoughtMap() {
  const { user } = useAuth();
  return useSWR<MyThoughtMap>(user ? `thoughtmap:${user.id}` : null, async () => {
    const uid = user!.id;
    const [map, box] = await Promise.all([loadMyThoughtMap(), callApi<CardBoxBody>(`/api/v1/me/cardbox?shelves=${MAP_SHELVES}`)]);
    // (Cards in the trash are on none of these shelves.)
    const own = [box.published, box.private, box.draft].flatMap((shelf) => summaryList(shelf).cards).filter((c) => !c.trashedAt);
    const ownIds = new Set(own.map((c) => c.id));
    // The originals the viewer resonated with, named by their own resonance
    // cards just read — not a second scan of the same cards (the card box's
    // resonated shelf reads its own) — and, beside them, the cards placed on
    // the map long ago, older than the newest the shelves bring. The server
    // answers them as this viewer may read them (someone else's anonymous
    // card without its author; none in the trash, the viewer's own neither,
    // whose node, arrows and group stay stored so a restore puts it back);
    // should that fail, those cards are just not shown this time — the map
    // keeps their places.
    const refIds = [...new Set(own.flatMap((c) => (c.referenceCardId ? [c.referenceCardId] : [])))];
    const missing = [...new Set(map.nodes.map((n) => n.cardId))].filter((id) => !ownIds.has(id) && !refIds.includes(id));
    const wanted = [...refIds, ...missing];
    const found = new Map<string, Card>();
    if (wanted.length) for (const c of (await fetchCardSummaries(wanted).catch(() => EMPTY)).cards) if (!c.trashedAt) found.set(c.id, c);
    const resonated = refIds.flatMap((id) => found.get(id) ?? []);
    const older = missing.flatMap((id) => found.get(id) ?? []);
    const cards: Record<string, Card> = {};
    // Resonated originals first so an own card by the same id (self-reference)
    // keeps its own-card entry.
    for (const c of [...resonated, ...own, ...older]) cards[c.id] = c;
    const resonatedIds = resonated.map((c) => c.id).filter((id) => cards[id].authorId !== uid);
    // Drop nodes whose card has been deleted since being placed on the map.
    return { ...map, nodes: map.nodes.filter((n) => cards[n.cardId]), cards, resonatedIds };
  }, OWN_CONTENT);
}

/**
 * Public cards that resonate with (reference) a card, with their authors.
 * Anonymous-readable — drives the card-detail resonance section.
 */
export function useResonanceCards(cardId: string | undefined) {
  return useSWR<CardsWithAuthors>(cardId ? `resonanceCards:${cardId}` : null, async () => {
    return withAuthors(getResonanceCards(cardId!));
  });
}

/**
 * The original card that a resonance (response) card references, with its
 * author — wrapped as {@link CardsWithAuthors} (zero or one card) so it can feed
 * the same {@link MiniCardGrid} as the incoming resonance list. Anonymous-
 * readable; resolves to an empty list when the original is missing or private.
 */
export function useReferencedCard(cardId: string | undefined) {
  return useSWR<CardsWithAuthors>(cardId ? `referencedCard:${cardId}` : null, async () => {
    return withAuthors(getCardById(cardId!).then((card) => (card ? [card] : [])));
  });
}

/**
 * The signed-in viewer's own resonance card for a given original (draft or
 * published), or null. Re-keys on the viewer so it refreshes on sign-in/out.
 * Drives the「共振 / 修改」button and prefills the inline editor.
 */
export function useMyResonance(cardId: string | undefined) {
  const { user, loading } = useAuth();
  const key = cardId && user && !loading ? `myResonance:${cardId}:${user.id}` : null;
  return useSWR<Card | null>(key, () => getMyResonanceCard(cardId!), OWN_CONTENT);
}

/**
 * Cards a page already has for the embeds it draws (see useCardEmbed):
 * `loading` while they are on their way.
 */
export type CardEmbedSource =
  | { status: 'loading' }
  | {
      status: 'ready';
      cards: CardsWithAuthors;
      /**
       * The cards (slugs or ids) this answer covers, for a source that grows
       * (a thread's): a card outside them is still on its way. Absent: the
       * answer covers every card the page has.
       */
      asked?: ReadonlySet<string>;
      /** Cards whose request failed: each of those embeds reads its own card. */
      failed?: ReadonlySet<string>;
    };

/** The lists around a card on its page; each is undefined until it arrives. */
export interface CardPageLists {
  /** The card this one resonates with (when the viewer may read it), then the cards resonating with it — each once. */
  resonances?: CardsWithAuthors;
  /** A few recent public cards, those sharing its tags first. */
  related?: CardsWithAuthors;
  /** Cards by others linking to it — only ever its author's. */
  links?: CardsWithAuthors;
  /**
   * The cards its story embeds, for its embeds to look up — or null: on the
   * public path (and if the request failed) each embed reads its own card.
   */
  embeds: CardEmbedSource | null;
  /**
   * The resonance tap (共振, round 26) as the server answers this viewer (`CardDetail.tap`): signed in, from the
   * same request as the lists; undefined while it loads and on the public path (signed out); null where no one
   * may tap or see the taps (a draft, the trash, a shared card, a block).
   */
  tap?: CardTapBody | null;
}

/** Several lists as one, each card once (the first time it appears). */
function mergeLists(...lists: (CardsWithAuthors | undefined)[]): CardsWithAuthors {
  const seen = new Set<string>();
  const cards: Card[] = [];
  const authors: Record<string, User> = {};
  for (const list of lists) {
    if (!list) continue;
    for (const c of list.cards) {
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      cards.push(c);
    }
    Object.assign(authors, list.authors);
  }
  return { cards, authors };
}

/** What a card page asks the server for, besides the card (CardDetail's `include`). */
const CARD_PAGE_INCLUDE = 'resonances,related,links,embeds';

const EMPTY: CardsWithAuthors = { cards: [], authors: {} };

export interface LoadedCardPageLists {
  resonances: CardsWithAuthors;
  related: CardsWithAuthors;
  links: CardsWithAuthors;
  embeds: CardsWithAuthors;
  /** `CardDetail.tap` (null from a server older than the field, as for a card no one may tap). */
  tap: CardTapBody | null;
}

/** The SWR key of the card page's one signed-in request (the lists and the tap): the tap's toggle writes through it. */
export const cardPageKey = (id: string, uid: string) => `cardPage:${id}:${uid}`;

/** One GET /api/v1/cards/{id}?include=…, as the lists the page draws; null: the viewer can't read the card. */
async function fetchCardPageLists(id: string, uid: string): Promise<LoadedCardPageLists | null> {
  const body = await sharedCardDetail(id, uid, 'lists');
  if (!body) return null;
  return {
    resonances: mergeLists(summaryList(body.referenceCard ? [body.referenceCard] : []), summaryList(body.resonances)),
    related: summaryList(body.related),
    links: summaryList(body.links),
    embeds: summaryList(body.embeds),
    tap: body.tap ?? null,
  };
}

/**
 * The lists a card page shows around the card — what resonates with it (and
 * what it resonates with), related cards, and for its author the cards
 * linking to it — plus the cards its story embeds.
 *
 * Signed in, they are one request: GET /api/v1/cards/{id} with `include`,
 * which applies the viewer's blocks and visibility on the server, and whose
 * embeds the story's embedded cards look up instead of reading one each.
 * It starts with the id the server render found, beside the page's own read
 * of the card. Signed out, the resonances read public cards through the
 * rules, as before, the related cards come from the server's signed-out
 * route (useRelated), and each embed reads its own card.
 *
 * `id` is the card's document id; `referenceCardId` the card it resonates
 * with (the public path reads it; the server finds it on its own).
 */
export function useCardPageLists(id: string | undefined, referenceCardId: string | undefined): CardPageLists {
  const { path, uid } = useReadViewer();
  const signedIn = useSWR(path === 'v1' && id ? cardPageKey(id, uid!) : null, () => fetchCardPageLists(id!, uid!));
  const pub = path === 'public';
  const related = useRelated(pub ? id : undefined);
  const incoming = useResonanceCards(pub ? id : undefined);
  const source = useReferencedCard(pub ? referenceCardId : undefined);

  // The same object until something in it changes: the page re-renders for
  // many reasons, and its story's embeds (which read `embeds` from context)
  // and lists shouldn't re-render with it.
  const d = signedIn.data;
  const failed = !!signedIn.error;
  return useMemo<CardPageLists>(() => {
    if (path === 'v1') {
      if (d === undefined) return { embeds: failed ? null : LOADING };
      if (d === null) return { resonances: EMPTY, related: EMPTY, links: EMPTY, embeds: NONE_EMBEDDED, tap: null };
      return { resonances: d.resonances, related: d.related, links: d.links, embeds: { status: 'ready', cards: d.embeds }, tap: d.tap };
    }
    if (path === null) return { embeds: LOADING };
    return {
      resonances: incoming.data || source.data ? mergeLists(source.data, incoming.data) : undefined,
      related: related.data,
      // Cards linking to a card are its author's to see — never a signed-out reader.
      links: EMPTY,
      embeds: null,
    };
  }, [path, d, failed, incoming.data, source.data, related.data]);
}

const LOADING: CardEmbedSource = { status: 'loading' };
const NONE_EMBEDDED: CardEmbedSource = { status: 'ready', cards: EMPTY };

/** GET /api/v1/cards?keys= takes at most this many (CARD_KEYS_MAX in lib/api/v1/schemas). */
const CARD_KEYS_MAX = 30;

/** Summaries of the cards named (ids or slugs), in the order asked: those the viewer may read, minus authors they blocked. */
async function fetchCardSummaries(keys: string[]): Promise<CardsWithAuthors> {
  const chunks: string[][] = [];
  for (let i = 0; i < keys.length; i += CARD_KEYS_MAX) chunks.push(keys.slice(i, i + CARD_KEYS_MAX));
  const lists = await Promise.all(
    chunks.map((chunk) => callApi<CardListBody>(`/api/v1/cards?keys=${chunk.map(encodeURIComponent).join(',')}`)),
  );
  return summaryList(lists.flatMap((l) => l.cards));
}

interface CardSummariesState {
  uid: string | null;
  cards: CardsWithAuthors;
  asked: ReadonlySet<string>;
  failed: ReadonlySet<string>;
}

const noSummaries = (uid: string | null): CardSummariesState => ({
  uid,
  cards: { cards: [], authors: {} },
  asked: new Set(),
  failed: new Set(),
});

/**
 * Previews of several cards by id or slug — the cards a thread is about —
 * for those cards' embeds to look up (see useCardEmbed), read a few at a time
 * (GET /api/v1/cards?keys=, up to 30 a request) instead of one read each.
 * Signed-in viewers only; null when there is nothing to look up.
 *
 * Each card is asked for once: as the list grows (a new message, an older
 * page, a search reading the whole conversation) only the cards not asked
 * for yet go out, and what was already here stays up meanwhile — the answer
 * names the cards it covers (`asked`), so a card still on its way reads as
 * loading, never as one the viewer can't see. A card whose request failed is
 * listed as `failed`, and its embed reads it by itself.
 */
export function useCardSummaries(keys: string[]): CardEmbedSource | null {
  const { user, loading } = useAuth();
  const uid = user && !loading ? user.id : null;
  const wanted = [...new Set(keys)].sort();
  const wantedKey = wanted.join(',');
  const [state, setState] = useState<CardSummariesState>(() => noSummaries(uid));
  const known = state.uid === uid ? state : noSummaries(uid);
  const inFlight = useRef(new Set<string>());

  useEffect(() => {
    if (state.uid !== uid) {
      inFlight.current = new Set();
      setState(noSummaries(uid));
      return;
    }
    if (!uid) return;
    const todo = wanted.filter((k) => !state.asked.has(k) && !state.failed.has(k) && !inFlight.current.has(k));
    if (!todo.length) return;
    const flying = inFlight.current;
    todo.forEach((k) => flying.add(k));
    fetchCardSummaries(todo).then(
      (list) =>
        setState((prev) =>
          prev.uid !== uid
            ? prev
            : {
                ...prev,
                cards: { cards: [...prev.cards.cards, ...list.cards], authors: { ...prev.cards.authors, ...list.authors } },
                asked: new Set([...prev.asked, ...todo]),
              },
        ),
      () => setState((prev) => (prev.uid !== uid ? prev : { ...prev, failed: new Set([...prev.failed, ...todo]) })),
    ).finally(() => todo.forEach((k) => flying.delete(k)));
    // `wantedKey` stands for `wanted`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, wantedKey, state]);

  if (!uid || !wanted.length) return null;
  if (!known.asked.size && !known.failed.size) return { status: 'loading' };
  return { status: 'ready', cards: known.cards, asked: known.asked, failed: known.failed };
}

export interface ConversationsData {
  conversations: Conversation[];
  /** The other participant of each conversation, keyed by uid. */
  people: Record<string, User>;
  /** Connected users with no conversation yet — the "start one" list. */
  connectedWithoutConversation: User[];
  /** Sum of the viewer's unread counters — drives the header badge. */
  unreadTotal: number;
}

/**
 * The viewer's newest 50 conversations, live: one listener (client/realtime,
 * loaded once the page is idle) shared by the header's badge and the messages
 * list, instead of reading every conversation again on a timer. Unfiltered —
 * see {@link visibleConversations}.
 */
function useLiveConversations(): LiveState<Conversation[]> {
  const { user, loading } = useAuth();
  const uid = user && !loading ? user.id : null;
  return useLive<Conversation[]>(uid ? `conversations:live:${uid}` : null, (emit, fail) =>
    listenConversations(uid!, emit, fail),
  );
}

/**
 * One conversation as the live list holds it (W15) — what a thread opened
 * from the list starts on, before its own read of the conversation answers.
 * Undefined while the list hasn't heard it (yet, or ever: an older one).
 */
export function useLiveConversation(pairId: string | undefined): Conversation | undefined {
  const live = useLiveConversations();
  return pairId ? live.data?.find((c) => c.id === pairId) : undefined;
}

/**
 * Conversations this browser is deleting (round 21): gone from the list and
 * the badge at once, before the server answers; `hideConversation` returns
 * what brings one back (a refusal). One the server deleted stays hidden a
 * while after, until the live list has heard it went.
 */
const leavingConversations = new Set<string>();
const leavingListeners = new Set<() => void>();
let leavingVersion = 0;
function leavingChanged() {
  leavingVersion++;
  leavingListeners.forEach((l) => l());
}
const subscribeLeaving = (l: () => void) => {
  leavingListeners.add(l);
  return () => void leavingListeners.delete(l);
};
function useLeavingConversations(): number {
  return useSyncExternalStore(subscribeLeaving, () => leavingVersion, () => 0);
}

export function hideConversation(pair: string): { putBack: () => void; gone: () => void } {
  leavingConversations.add(pair);
  leavingChanged();
  const show = () => {
    if (leavingConversations.delete(pair)) leavingChanged();
  };
  return { putBack: show, gone: () => setTimeout(show, 10_000) };
}

/**
 * Conversations minus those with someone the viewer blocked (the thread itself
 * is frozen by rules — the connection is gone) and those being deleted here.
 * Undefined until both the list and the block list are in.
 */
function visibleConversations(all: Conversation[] | undefined, blocked: Set<string> | undefined): Conversation[] | undefined {
  if (!all || !blocked) return undefined;
  return all.filter((c) => !leavingConversations.has(c.id) && !c.participants.some((p) => blocked.has(p)));
}

function unreadOf(conversations: Conversation[], uid: string): number {
  return conversations.reduce((sum, c) => sum + (c.unread[uid] ?? 0), 0);
}

/**
 * The header's unread-messages badge: the viewer's unread counters summed over
 * the live conversation list — no profiles, no connections (those are the
 * messages page's). 0 until known.
 */
export function useUnreadMessages(): number {
  useLeavingConversations();
  const { user } = useAuth();
  const live = useLiveConversations();
  const { data: blocked } = useMyBlockedIds();
  const conversations = visibleConversations(live.data, blocked);
  return user && conversations ? unreadOf(conversations, user.id) : 0;
}

/**
 * The signed-in viewer's conversation list plus connected people they haven't
 * talked to yet: the live list (shared with the header's badge), the people in
 * it from the page-wide profile cache, and the viewer's connections
 * (`conversations:{uid}`; mutate it after a block or a delete).
 */
export function useConversations(): { data: ConversationsData | undefined; error: unknown } {
  useLeavingConversations();
  const { user, loading } = useAuth();
  const uid = user && !loading ? user.id : null;
  const live = useLiveConversations();
  const { data: blocked } = useMyBlockedIds();
  // Not read again on coming back to the tab (W21): what changes them here — a block, a resonance taken back,
  // a delete — mutates this key (dependsOnConnections), and a new connection is a new conversation in the live
  // list, which this joins.
  const connections = useSWR<string[]>(uid ? `conversations:${uid}` : null, () => listMyConnectionUids());
  const conversations = visibleConversations(live.data, blocked);
  const otherUids = conversations?.map((c) => c.participants.find((p) => p !== uid) ?? '');
  const ids =
    otherUids && connections.data ? [...new Set([...otherUids, ...connections.data])].filter(Boolean).sort() : null;
  // Profiles come from the page-wide cache (client/reads): a new conversation
  // reads only its new person. The list stays up while it does.
  const people = useSWR<Record<string, User>>(ids ? `people:${ids.join(',')}` : null, () => getUsersByIds(ids!), {
    keepPreviousData: true,
  });
  const error = live.error ?? connections.error ?? people.error;
  if (!uid || !conversations || !otherUids || !connections.data || !people.data) return { data: undefined, error };
  const talked = new Set(otherUids);
  const connectedWithoutConversation = connections.data
    .filter((id) => !talked.has(id))
    .map((id) => people.data![id])
    .filter((u): u is User => Boolean(u));
  return {
    data: { conversations, people: people.data, connectedWithoutConversation, unreadTotal: unreadOf(conversations, uid) },
    error,
  };
}

/**
 * The viewer's newest notifications, live (the bell's badge and list): a new
 * row, or one marked read on another device, shows without a reload.
 */
export function useNotifications(max = 20): LiveState<Notification[]> {
  const { user, loading } = useAuth();
  const uid = user && !loading ? user.id : null;
  return useLive<Notification[]>(uid ? `notifications:live:${uid}:${max}` : null, (emit, fail) =>
    listenNotifications(uid!, emit, fail, max),
  );
}

/** What the bell's rows draw beside their words. */
export interface BellExtras {
  /** Who each row is from, by uid — a deleted account is absent (its row keeps the pen name it was written with). */
  people: Record<string, User>;
  /** The card each row is about, by id — one the viewer can't read any more (deleted, in the trash) is absent. */
  cards: Record<string, Card>;
}

const NO_BELL_EXTRAS: BellExtras = { people: {}, cards: {} };

/**
 * Who each bell row is from (their face) and the card it is about (its cover,
 * or its colours and title), read together: the people through the page's
 * profile cache, the cards in one GET /api/v1/cards?keys= — the viewer's own
 * cards, the anonymous ones too, which their author reads whole. Either read
 * failing leaves its half empty and the rows draw initials and plain tiles;
 * a new row reads again, keeping the last answer up meanwhile.
 */
export function useBellExtras(items: Notification[] | undefined): BellExtras | undefined {
  const { user, loading } = useAuth();
  const uid = user && !loading ? user.id : null;
  const idsOf = (of: (n: Notification) => unknown) =>
    [...new Set((items ?? []).map(of).filter((v): v is string => typeof v === 'string' && v !== ''))].sort();
  // Who each row is from: `fromUserId`, or a resonance tap's newest (round 26: its row names `fromUserIds`).
  const from = idsOf((n) => n.payload.fromUserId ?? (Array.isArray(n.payload.fromUserIds) ? n.payload.fromUserIds[0] : undefined));
  const cardIds = idsOf((n) => n.payload.cardId);
  const key = uid && (from.length || cardIds.length) ? `bell-extras:${uid}:${from.join(',')}|${cardIds.join(',')}` : null;
  // The cards already answered for, by id (null: the viewer can't read it): a new row asks only for its own
  // card (W21), not the twenty again. For this viewer, for as long as the bell is drawn.
  const knownCards = useRef<{ uid: string | null; cards: Map<string, Card | null> }>({ uid, cards: new Map() });
  if (knownCards.current.uid !== uid) knownCards.current = { uid, cards: new Map() };
  const { data } = useSWR<BellExtras>(
    key,
    async () => {
      const known = knownCards.current.cards;
      const newIds = cardIds.filter((id) => !known.has(id));
      const [people, read] = await Promise.all([
        from.length ? getUsersByIds(from).catch(() => ({})) : {},
        newIds.length ? fetchCardSummaries(newIds).catch(() => null) : EMPTY,
      ]);
      if (read) {
        for (const id of newIds) known.set(id, null);
        for (const c of read.cards) known.set(c.id, c);
      }
      const cards: Record<string, Card> = {};
      for (const id of cardIds) {
        const c = known.get(id);
        if (c) cards[c.id] = c;
      }
      return { people, cards };
    },
    { keepPreviousData: true },
  );
  return key ? data : items ? NO_BELL_EXTRAS : undefined;
}

/** The head of a user's outward-facing profile: who they are, and how the viewer stands with them. */
export interface PublicProfile {
  user: User | null;
  /** True when the signed-in viewer is looking at their own public page. */
  isSelf: boolean;
  isConnected: boolean;
  /** The signed-in viewer has blocked this person — their cards are hidden. */
  isBlocked: boolean;
}

const nobody: PublicProfile = { user: null, isSelf: false, isConnected: false, isBlocked: false };
const strangers = { isConnected: false, isBlocked: false };

/**
 * A person by pen name (null: nobody goes by it). Profiles are public, so this
 * doesn't wait for auth; the profile page's hooks share the one read.
 */
function usePersonByHandle(handle: string | undefined) {
  return useSWR<User | null>(handle ? personKey(handle) : null, () => getUserByHandle(handle!));
}

/**
 * The one SWR key of a person read by pen name (getUserByHandle) — the profile
 * page's and a thread's alike (W21), so the two share one read.
 */
export const personKey = (handle: string) => `person:${handle}`;

/**
 * A user's outward-facing, blog-style profile keyed by handle: the person, and
 * whether the viewer is them, is connected with them, or has blocked them.
 * Their cards and the cards linking to them are {@link useProfileCards} and
 * {@link useProfileLinks}, read beside this rather than after it.
 *
 * Works for anonymous visitors as well as signed-in viewers: the person is
 * read at once, and the viewer's side — the block list and the connection,
 * read together — once auth has settled (keyed on the viewer, so it refreshes
 * on sign-in/out). A signed-out visitor or the person themselves needs no read.
 */
export function useProfileByHandle(handle: string | undefined) {
  const { user: viewer, loading } = useAuth();
  const person = usePersonByHandle(handle);
  const uid = person.data?.id;
  const relation = useSWR<typeof strangers>(uid && !loading ? `relation:${uid}:${viewer?.id ?? 'anon'}` : null, async () => {
    if (!viewer || viewer.id === uid) return strangers;
    const [blocked, connected] = await Promise.all([getMyBlockedIds(), isConnected(viewer.id, uid!)]);
    return { isBlocked: blocked.has(uid!), isConnected: connected };
  });
  const personData = person.data;
  const relationData = relation.data;
  const data: PublicProfile | undefined =
    personData === null
      ? nobody
      : personData && relationData
        ? { user: personData, isSelf: !!viewer && viewer.id === personData.id, ...relationData }
        : undefined;
  const error = person.error ?? relation.error;
  // Until both halves are in, this is loading — including the moments before
  // auth settles, when the viewer's half hasn't started (a null SWR key reports
  // isLoading=false, which would flash "user not found"). A failed read ends it.
  return { data, error, isLoading: data === undefined && !error };
}

/**
 * A person's public cards, newest first (anonymous ones never: ux §6). The
 * same for every viewer and anonymous-readable, so it starts as soon as the
 * person is known — beside the viewer's block and connection reads. The page
 * shows none of them to a viewer who blocked the person.
 */
export function useProfileCards(handle: string | undefined) {
  const uid = usePersonByHandle(handle).data?.id;
  return useSWR<Card[]>(uid ? `profileCards:${uid}` : null, () => getPublicCardsByAuthor(uid!));
}

/**
 * Cards by others that link to one of this person's cards, for a signed-out
 * reader: none. Card links name both cards' authors — an anonymous card's
 * too — so only the server reads them (GET /api/v1/users/{handle}?include=
 * links, for a signed-in reader), as with a card page's links.
 */
export function useProfileLinks(handle: string | undefined): { data: CardsWithAuthors | undefined } {
  return { data: handle ? { cards: [], authors: {} } : undefined };
}

/** Everything a profile page shows; each part undefined until it arrives. */
export interface ProfilePage {
  /** The person and how the viewer stands with them. */
  head?: PublicProfile;
  /** Their public cards, newest first (their first 40, as the page lists them). */
  cards?: Card[];
  /** Cards by others linking to theirs. */
  links?: CardsWithAuthors;
  /** The head is still on its way (or can't start yet). */
  isLoading: boolean;
  /** Reading their cards failed. */
  cardsError?: unknown;
}

/** The profile page lists a person's first 40 public cards; one v1 page holds 30 at most (FeedQuery's limit). */
const PROFILE_CARDS = 40;
const PROFILE_PAGE_MAX = 30;

/**
 * One GET /api/v1/users/{handle}?include=cards,links: the person, the
 * viewer's standing with them, their cards and the cards linking to theirs.
 * Only someone with more than a page of cards costs a second request (the
 * rest of their first 40). Null: nobody goes by that pen name.
 */
async function fetchProfilePage(handle: string): Promise<Required<Omit<ProfilePage, 'isLoading' | 'cardsError'>> | null> {
  const path = `/api/v1/users/${encodeURIComponent(handle)}`;
  const body = await getOrNull<ProfileBody>(`${path}?include=cards,links&limit=${PROFILE_PAGE_MAX}`);
  if (!body) return null;
  const page = body.cards ?? { cards: [], nextCursor: null };
  let cards = page.cards;
  if (page.nextCursor && !body.isBlocked) {
    const rest = await v1Get<FeedPageBody>(
      `${path}/cards?limit=${PROFILE_CARDS - PROFILE_PAGE_MAX}&cursor=${encodeURIComponent(page.nextCursor)}`,
    );
    cards = [...cards, ...rest.cards];
  }
  return {
    head: { user: profileUser(body), isSelf: body.isSelf, isConnected: body.isConnected, isBlocked: body.isBlocked },
    cards: summaryList(cards).cards,
    links: summaryList(body.links),
  };
}

/**
 * Everything the profile page shows. Signed in: one request to /api/v1 (the
 * server reads the person, the viewer's blocks and connection, the cards and
 * the links together). Signed out: {@link useProfileByHandle},
 * {@link useProfileCards} and {@link useProfileLinks} through the rules, side
 * by side — the person and their cards without waiting for auth.
 */
export function useProfilePage(handle: string | undefined): ProfilePage {
  const { path, uid } = useReadViewer();
  const publicHandle = path === 'public' ? handle : undefined;
  const head = useProfileByHandle(publicHandle);
  const cards = useProfileCards(publicHandle);
  const links = useProfileLinks(publicHandle);
  const signedIn = useSWR(path === 'v1' && handle ? `profilePage:${handle}:${uid!}` : null, () => fetchProfilePage(handle!));

  if (path === 'v1') {
    const d = signedIn.data;
    if (d === null) return { head: nobody, isLoading: false };
    // A failed read ends the loading (the page then says it can't find them, as the public path does).
    return { head: d?.head, cards: d?.cards, links: d?.links, isLoading: d === undefined && !signedIn.error, cardsError: signedIn.error };
  }
  if (path === null) return { isLoading: true };
  return { head: head.data, cards: cards.data, links: links.data, isLoading: head.isLoading, cardsError: cards.error };
}
