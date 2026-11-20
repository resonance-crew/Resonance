import type { ListCard } from './summary';
import type { Card, RecommendationItem } from '@/lib/db/types';
import * as app from '@/server/app/cardsRead';
import type { AdminDb } from '@/server/infra/firestore/db';
import { ctxFor } from '@/server/infra/firestore/ctx';
import type { PageStart } from '@/server/ports/repos/cards';
import type {
  CardBoxBody,
  CardBoxTabName,
  CardDetailBody,
  CardInclude,
  CardListBody,
  FeedPageBody,
  ProfileBody,
  ProfileInclude,
  RecommendedFeedBody,
} from './schemas';

/**
 * v1 reads for the apps' reading screens (feed, card page, author page, card
 * box) — legacy facades. The services are src/server/app/cardsRead.ts, on
 * the ports; these keep the paths and signatures the routes, other services,
 * the emulator suites and the scripts call — `(db, …)` — and run the service
 * on a context bound to that Firestore (ctxFor). Visibility (`canView`),
 * blocks and anonymity are enforced there and asserted in
 * test/emulator/apiV1Reads.emulator.test.ts.
 */

export type SharedOption = app.SharedOption;
export const TRASH_SHELF_LIMIT = app.TRASH_SHELF_LIMIT;

/** A card the viewer may read, by slug or document id — else not_found (never "forbidden": that would confirm it exists). */
export function visibleCard(db: AdminDb, viewerId: string, key: string, opts: SharedOption = {}): Promise<Card> {
  return app.visibleCard(ctxFor(db), viewerId, key, opts);
}

/** A card the viewer may read, by its document id only (`fields`: read only those; they must hold CARD_VISIBILITY_FIELDS). */
export function visibleCardById(db: AdminDb, viewerId: string, id: string, fields?: readonly string[]): Promise<Card> {
  return app.visibleCardById(ctxFor(db), viewerId, id, fields);
}

/** Cards by slug or id, for a list (no story): in key order, each once, unknown keys left out. */
export function cardsByKeys(db: AdminDb, keys: string[]): Promise<ListCard[]> {
  return app.cardsByKeys(ctxFor(db), keys);
}

/** GET /cards?keys= — summaries of the cards named, those the viewer may read, minus a blocked author's named ones. */
export function getCardsByKeys(db: AdminDb, viewerId: string, keys: string[], opts: SharedOption = {}): Promise<CardListBody> {
  return app.getCardsByKeys(ctxFor(db), viewerId, keys, opts);
}

/** The reader's recommendations with their reasons, resolved to cards the viewer may read (empty, never 500, when the recommender fails). */
export function getRecommendedFeed(
  db: AdminDb,
  viewerId: string,
  load: (db: AdminDb, uid: string) => Promise<{ items: RecommendationItem[]; status?: 'fresh' | 'stale' }>,
): Promise<RecommendedFeedBody> {
  return app.getRecommendedFeed(ctxFor(db), viewerId, () => load(db, viewerId));
}

/** A card the viewer may read, with its story and, as `include` asks, the lists its page shows. */
export function getCardDetail(
  db: AdminDb,
  viewerId: string,
  key: string,
  include: ReadonlySet<CardInclude> = new Set(),
  opts: SharedOption = {},
): Promise<CardDetailBody> {
  return app.getCardDetail(ctxFor(db), viewerId, key, include, opts);
}

/** Public cards written in response to this one, newest first. */
export function getResonances(db: AdminDb, viewerId: string, id: string): Promise<CardListBody> {
  return app.getResonances(ctxFor(db), viewerId, id);
}

/** A few recent public cards, those sharing the most tags first. */
export function getRelated(db: AdminDb, viewerId: string, id: string): Promise<CardListBody> {
  return app.getRelated(ctxFor(db), viewerId, id);
}

/** getRelated for a signed-out reader (GET /api/cards/related); null for a card no one signed out may read. */
export function getPublicRelated(db: AdminDb, id: string): Promise<CardListBody | null> {
  return app.getPublicRelated(ctxFor(db), id);
}

/** Cards that link to this one — shown to its author only. */
export function getLinksToCard(db: AdminDb, viewerId: string, id: string): Promise<CardListBody> {
  return app.getLinksToCard(ctxFor(db), viewerId, id);
}

/** A person's profile as the viewer sees it, with its first page of cards and its links as `include` asks. */
export function getProfile(
  db: AdminDb,
  viewerId: string,
  handle: string,
  opts: { include?: ReadonlySet<ProfileInclude>; limit?: number; preLetterBuild?: boolean } = {},
): Promise<ProfileBody> {
  return app.getProfile(ctxFor(db), viewerId, handle, opts);
}

/** The author's public, named cards, newest first; none for someone the viewer blocked. */
export function getProfileCards(db: AdminDb, viewerId: string, handle: string, limit: number, start?: PageStart): Promise<FeedPageBody> {
  return app.getProfileCards(ctxFor(db), viewerId, handle, limit, start);
}

/** Cards by others that link to this author's cards (the profile's "linked" tab). */
export function getProfileLinks(db: AdminDb, viewerId: string, handle: string): Promise<CardListBody> {
  return app.getProfileLinks(ctxFor(db), viewerId, handle);
}

/** Shelves of the viewer's card box, each exactly as GET /me/cards?tab= answers it. */
export function getCardBoxShelves(db: AdminDb, viewerId: string, shelves: ReadonlySet<CardBoxTabName>, now = Date.now()): Promise<CardBoxBody> {
  return app.getCardBoxShelves(ctxFor(db), viewerId, shelves, now);
}

/** One shelf of the viewer's card box (GET /me/cards?tab=). */
export function getCardBox(db: AdminDb, viewerId: string, tab: CardBoxTabName, now = Date.now()): Promise<CardListBody> {
  return app.getCardBox(ctxFor(db), viewerId, tab, now);
}
