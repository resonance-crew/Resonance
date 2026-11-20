import { FieldValue, Timestamp, type Firestore, type Query, type QueryDocumentSnapshot, type Transaction } from 'firebase-admin/firestore';
import { LIST_FIELDS, LISTING_FIELDS, SUMMARY_FIELDS, blankBySummary, listCard, storedSummary, withStories, type ListCard } from '@/lib/api/v1/summary';
import { blankCard, unlistedCard } from '@/lib/cards/blank';
import { isReservedId } from '@/lib/db/firestore/reservedId';
import type { Card, User } from '@/lib/db/types';
import { CARD_SIGNATURES, unlistedForStrangers } from '@/lib/recommend/collections';
import { anonymousBySlugCard, docIdOk, properlyPublished } from '@/server/domain/cards';
import type { CardPage, CardsData, CardsTxRepo, FilmWindowRow, PageStart } from '@/server/ports/repos/cards';
import type { AdminDb } from '../db';
import { mapCard, mapUser, sanitize } from '../mapper';
import { pageEnd, pageQuery } from '../paging';

/** `cards` inside a Firestore transaction: filled by the lane that owns ports/repos/cards.ts. */
export function cardsTx(_db: AdminDb, _tx: Transaction): CardsTxRepo {
  return {};
}

/* ───────────── which card a key names (was src/lib/db/firestore/cardKey.ts, which re-exports these) ───────────── */

/**
 * Which of several cards sharing a slug the slug names: the published one
 * that took it first. Slugs are unique by construction (assignSlug), but
 * older clients could write one themselves — so a later copy, a draft
 * included, can never take over someone's URL or its share preview.
 */
export function slugHolder<T extends Pick<QueryDocumentSnapshot, 'id' | 'get'>>(docs: T[]): T | null {
  const rank = (d: T) => {
    const at = d.get('publishedAt');
    return at instanceof Timestamp ? at.toMillis() : Number.POSITIVE_INFINITY;
  };
  return [...docs].sort((a, b) => rank(a) - rank(b) || (a.id < b.id ? -1 : 1))[0] ?? null;
}

/**
 * Whether a key could be a slug the server made: slugify writes only
 * lowercase ASCII letters, digits and hyphens. A key that can't be one — an
 * auto-id nearly always has a capital — is still asked of the slugs first
 * (an older client could write a slug itself), but its document is read in
 * the same breath rather than after the miss.
 */
export const slugShaped = (key: string) => /^[a-z0-9-]+$/.test(key);

/**
 * The card a URL segment names — by its slug, else by its document id — as
 * a snapshot, or null. Shared by every server-side resolver (the card page's
 * metadata, /api/cards/resolve, the v1 card reads) so they always agree.
 *
 * A key shaped like a slug is resolved before its document is read (reading
 * both at once would double the reads of the usual case, a slug that hits);
 * any other key is read both ways at once, the slug's holder still first.
 */
export async function cardByKey(db: Firestore, key: string) {
  if (!key || key.includes('/')) return null;
  const slugQuery = () => db.collection('cards').where('slug', '==', key).limit(10).get();
  // An id Firestore keeps for itself names no card (reading it would throw).
  if (isReservedId(key)) return slugHolder((await slugQuery()).docs);
  const idRead = () => db.collection('cards').doc(key).get();
  if (!slugShaped(key)) {
    const [bySlug, byId] = await Promise.all([slugQuery(), idRead()]);
    return slugHolder(bySlug.docs) ?? (byId.exists ? byId : null);
  }
  const holder = slugHolder((await slugQuery()).docs);
  if (holder) return holder;
  const byId = await idRead();
  return byId.exists ? byId : null;
}

/**
 * {@link cardByKey} for an answer that goes to anyone — a page's server
 * render (cached HTML), /api/cards/view, /api/cards/resolve — where no viewer
 * is known: a card in its author's trash names nothing there, exactly as a
 * deleted one. "Private" would say the document is still there, and it stays
 * there until the trash's 30 days run out or its author's account is purged
 * — whichever comes first, so an anonymous card that turned from "there" to
 * "gone" in the purge's minute would tell whose it was. Its author reads it
 * through the rules or GET /api/v1/cards/{key} (cardByKey, then canView).
 */
export async function cardByKeyForAnyone(db: Firestore, key: string) {
  const snap = await cardByKey(db, key);
  return snap && snap.get('trashedAt') == null && !anonymousBySlug(snap, key, null) ? snap : null;
}

/** src/server/domain/cards.ts anonymousBySlugCard, on a snapshot. */
export function anonymousBySlug(card: Pick<QueryDocumentSnapshot, 'id' | 'get'>, key: string, viewerId: string | null): boolean {
  return anonymousBySlugCard({ id: card.id, anonymous: card.get('anonymous'), authorId: card.get('authorId') }, key, viewerId);
}

/* ───────────── tombstones (was src/lib/db/firestore/tombstones.ts, which re-exports these) ───────────── */

/**
 * A card deleted for good leaves its id behind as a tombstone, so no new card
 * takes it (firestore.rules refuse one): resonances, bookmarks, a thread's
 * cards and old links still name that id, and would follow whoever took it.
 * Written by every server path that deletes a card (deleteCard — the trash's
 * too — and the account purge). It holds no uid: it must not say whose card
 * it was.
 */
export function tombstoneRef(db: Firestore, id: string) {
  return db.doc(`cardTombstones/${id}`);
}

/** A tombstone's whole content: when, never who. */
export const TOMBSTONE = { deletedAt: FieldValue.serverTimestamp() };

/**
 * A deleted card's slug, retired with it: old links, story embeds and push
 * routes name a card by its slug, and a slug handed to a new card would take
 * them to another author's card (assignSlug skips a retired one; the old
 * address answers as a deleted card's). Written beside the tombstone by the
 * same paths. It holds neither uid nor card id.
 */
export function retiredSlugRef(db: Firestore, slug: string) {
  return db.doc(`retiredSlugs/${slug}`);
}

/** A retired slug's whole content. */
export const RETIRED_SLUG = { retiredAt: FieldValue.serverTimestamp() };

/** A slug as slugify makes one — and so a document id it can be. */
export function retirable(slug: unknown): slug is string {
  return typeof slug === 'string' && /^[a-z0-9][a-z0-9-]{0,199}$/.test(slug);
}

/* ───────────── the landing page (was src/lib/db/firestore/landing.ts) ───────────── */

/**
 * What the landing page's grid draws of a card — and what a click on one
 * seeds its card page with (usePrefillCard), so its story comes along. Read
 * with this projection: never the recommender's signature, nor the
 * server-only fields (link-preview bookkeeping, list summaries, the trash's
 * own record), all of which would otherwise be serialized into the page's
 * cached, public HTML.
 */
export const LANDING_CARD_FIELDS = [
  'authorId',
  'slug',
  'thoughtCore',
  'story',
  'tags',
  'media',
  'originalLocale',
  'translations',
  'visibility',
  'referenceCardId',
  'publishedAt',
  'readCount',
  'resonanceCount',
  'inviteCount',
  'accentHue',
  'anonymous',
  'linkPreviews',
  'trashedAt',
  ...LISTING_FIELDS,
] as const;

/** How many cards past `limit` the landing page reads, to stand in for blank ones. */
const LANDING_SPARE = 3;

/** Of each author, only what a card's byline needs. */
export const BYLINE_FIELDS = ['handle', 'initials', 'avatarUrl', 'avatarSeed', 'accentColor', 'primaryLocale', 'verified'];

/** An author as a card's byline needs them. */
export function byline(u: User): User {
  return {
    id: u.id,
    handle: u.handle,
    initials: u.initials,
    avatarUrl: u.avatarUrl,
    avatarSeed: u.avatarSeed,
    accentColor: u.accentColor,
    region: '',
    primaryLocale: u.primaryLocale,
    autoTranslateTo: [],
    verified: u.verified,
    phoneHash: '',
    joinedAt: new Date(0),
    handleChangedAt: new Date(0),
  };
}

/**
 * The landing page's newest public cards and their authors' bylines, read
 * as the page serializes them into its cached, public HTML: no author for an
 * anonymous card (not even its uid), no recommendation internals, and of
 * each author only their byline. The authors in one batched read.
 */
async function latestForLanding(db: Firestore, limit: number): Promise<{ cards: Card[]; authors: Record<string, User> }> {
  const snap = await db
    .collection('cards')
    .where('visibility', '==', 'public')
    .where('publishedAt', '!=', null)
    .orderBy('publishedAt', 'desc')
    .select(...LANDING_CARD_FIELDS)
    // A few more than it shows, so a blank or unlisted card (lib/cards/blank) left out doesn't leave a gap.
    .limit(limit + LANDING_SPARE)
    .get();
  const cards = snap.docs
    .map((d) => mapCard(d.id, d.data()))
    .filter((card) => !blankCard(card) && !unlistedCard(card))
    .slice(0, limit)
    // What decided it stays here: the page's HTML holds only what a card surface draws.
    .map(({ thin: _thin, signature: _signature, ...card }) => (card.anonymous ? { ...card, authorId: '' } : card));
  const authorIds = [...new Set(cards.map((c) => c.authorId))].filter((id) => id && !id.includes('/') && !isReservedId(id));
  const profiles = authorIds.length ? await db.getAll(...authorIds.map((id) => db.doc(`users/${id}`)), { fieldMask: BYLINE_FIELDS }) : [];
  const authors: Record<string, User> = {};
  for (const p of profiles) if (p.exists) authors[p.id] = byline(mapUser(p.id, p.data()!));
  return { cards, authors };
}

/* ───────────── the read side (cardsRead lane) ───────────── */

const toCards = (docs: QueryDocumentSnapshot[]) => docs.map((d) => listCard(d.id, d.data()));

// Other lanes' modules that reach back into this one (taps → reads, sharedCards → conversations → reads): loaded on
// first use, so building a context loads neither and no import cycle runs through them.
const tapsModule = () => import('@/lib/api/v1/taps');
const sharedCardsModule = () => import('@/lib/api/v1/sharedCards');

/** `cards` outside a transaction. */
export function cardsData(db: AdminDb): CardsData {
  /** Cards by id, for a list: in the order given, each once, missing ones left out — read without their stories. */
  const listByIds = async (ids: string[]): Promise<ListCard[]> => {
    const unique = [...new Set(ids)].filter((id) => id && !id.includes('/') && !isReservedId(id));
    if (!unique.length) return [];
    const snaps = await db.getAll(...unique.map((id) => db.doc(`cards/${id}`)), { fieldMask: [...LIST_FIELDS] });
    const byId = new Map(snaps.filter((s) => s.exists).map((s) => [s.id, listCard(s.id, s.data()!)]));
    return unique.map((id) => byId.get(id)).filter((c): c is ListCard => !!c);
  };

  /** A page of `q`'s properly published cards, cut on the raw query. */
  const page = async (q: Query, limit: number, start?: PageStart): Promise<CardPage> => {
    const snap = await pageQuery(q, start).limit(limit).get();
    return { cards: toCards(snap.docs.filter((d) => properlyPublished(d.get('publishedAt')))), end: pageEnd(snap.docs, limit) };
  };

  /**
   * An author's published public cards under their name, newest first, read
   * without their stories — the web's profile query (getPublicCardsByAuthor).
   * The query itself leaves anonymous cards out, never a filter after it: a
   * page ends at the last document the query gave (pageEnd), so a page token,
   * a cursor or a count taken over anonymous cards would name one as theirs.
   */
  const authorCards = (authorId: string) =>
    db
      .collection('cards')
      .where('authorId', '==', authorId)
      .where('visibility', '==', 'public')
      .where('anonymous', '==', false)
      // A real stamp, not ahead of now by more than an hour (properlyPublished, as a range: B11) — a range on a
      // timestamp matches timestamps only, so null and a string publishedAt stay out as `!= null` kept null out.
      .where('publishedAt', '<=', Timestamp.fromMillis(Date.now() + 60 * 60 * 1000))
      .select(...LIST_FIELDS);

  return {
    scope: db,

    async get(id, fields) {
      // An id Firestore keeps for itself names no card (reading it would throw).
      if (!docIdOk(id) || isReservedId(id)) return null;
      const ref = db.doc(`cards/${id}`);
      const snap = fields ? (await db.getAll(ref, { fieldMask: [...fields] }))[0] : await ref.get();
      return snap?.exists ? mapCard(snap.id, snap.data()!) : null;
    },

    async findByKey(key) {
      const snap = await cardByKey(db, key);
      return snap ? mapCard(snap.id, snap.data()!) : null;
    },

    async findForAnyone(key) {
      const snap = await cardByKeyForAnyone(db, key);
      if (!snap) return null;
      const data = snap.data() ?? {};
      return { id: snap.id, card: mapCard(snap.id, data), stamped: data.publishedAt != null };
    },

    listByIds,

    /**
     * cardByKey for many keys (slugs or ids): one query for the slugs, and one
     * batched read for the keys no slug named — the keys that can't be a slug
     * the server made (slugShaped) read beside the query, the rest after it.
     * Either way a slug's holder comes first, as in cardByKey. In key order,
     * each card once (a card named by both its slug and its id comes back at the
     * first); unknown keys drop out. Read without their stories, for a list.
     * The caller has already cut the keys to CARD_KEYS_MAX.
     */
    async listByKeys(unique) {
      if (!unique.length) return [];
      const read = (ids: string[]) => (ids.length ? db.getAll(...ids.map((k) => db.doc(`cards/${k}`)), { fieldMask: [...LIST_FIELDS] }) : Promise.resolve([]));
      // An id Firestore keeps for itself names no card (reading it would throw).
      const readable = unique.filter((k) => !isReservedId(k));
      const [bySlug, early] = await Promise.all([
        db.collection('cards').where('slug', 'in', unique).select(...LIST_FIELDS).get(),
        read(readable.filter((k) => !slugShaped(k))),
      ]);
      const sharing = new Map<string, QueryDocumentSnapshot[]>();
      for (const d of bySlug.docs) {
        const slug = String(d.get('slug'));
        sharing.set(slug, [...(sharing.get(slug) ?? []), d]);
      }
      const named = new Map<string, QueryDocumentSnapshot>();
      for (const [slug, docs] of sharing) {
        const holder = slugHolder(docs);
        if (holder) named.set(slug, holder);
      }
      const late = await read(readable.filter((k) => slugShaped(k) && !named.has(k)));
      const ids = new Map([...early, ...late].filter((s) => s.exists).map((s) => [s.id, s]));
      const seen = new Set<string>();
      const cards: ListCard[] = [];
      for (const key of unique) {
        const snap = named.get(key) ?? ids.get(key);
        if (!snap || seen.has(snap.id)) continue;
        seen.add(snap.id);
        cards.push(listCard(snap.id, snap.data()!));
      }
      return cards;
    },

    feedPage: (limit, start) =>
      page(db.collection('cards').where('visibility', '==', 'public').where('publishedAt', '!=', null).select(...LIST_FIELDS), limit, start),

    authorPage: (authorId, limit, start) => page(authorCards(authorId), limit, start),

    async countAuthorCards(authorId, max) {
      // An aggregation (B11: a read per thousand index entries, not `max` documents).
      const counted = await pageQuery(authorCards(authorId)).limit(max).count().get();
      return counted.data().count;
    },

    async resonancesOf(cardId, limit) {
      const snap = await db
        .collection('cards')
        .where('referenceCardId', '==', cardId)
        .where('visibility', '==', 'public')
        .where('publishedAt', '!=', null)
        .orderBy('publishedAt', 'desc')
        .select(...LIST_FIELDS)
        .limit(limit)
        .get();
      return toCards(snap.docs);
    },

    async recentPublic(limit) {
      const snap = await db
        .collection('cards')
        .where('visibility', '==', 'public')
        .where('publishedAt', '!=', null)
        .orderBy('publishedAt', 'desc')
        .select(...LIST_FIELDS)
        .limit(limit)
        .get();
      return toCards(snap.docs);
    },

    async linkSourcesTo(cardId, limit) {
      const links = await db.collection('cardLinks').where('targetCardId', '==', cardId).orderBy('createdAt', 'desc').limit(limit).get();
      return links.docs.map((d) => String(d.get('sourceCardId') ?? '')).filter(Boolean);
    },

    async linkPairsToAuthor(authorId, limit) {
      const links = await db.collection('cardLinks').where('targetAuthorId', '==', authorId).orderBy('createdAt', 'desc').limit(limit).get();
      return links.docs
        .map((d) => ({ source: String(d.get('sourceCardId') ?? ''), target: String(d.get('targetCardId') ?? '') }))
        .filter((p) => p.source);
    },

    async ownShelf(uid, shelf, limit) {
      const own = db.collection('cards').where('authorId', '==', uid);
      // A card in the trash is on the trash shelf alone. It is private while
      // there, so the published shelf's query leaves it out on its own; the
      // private and draft shelves leave it out before they are cut to size, so
      // a trash full of newer cards never crowds out the ones still in use.
      const kept = (d: QueryDocumentSnapshot) => d.get('trashedAt') == null;
      if (shelf === 'draft') {
        /** How many drafts are read to find the most recently edited ones. */
        const scan = 200;
        /** The ordered read: the shelf and a trash's worth more (drafts in the trash are left out after it). */
        const draftPage = limit + 20;
        // Read without their stories: only the drafts shown have theirs read, after the cut.
        const drafts = own.where('publishedAt', '==', null).select(...LIST_FIELDS);
        // The most recently edited, through its index (B12: authorId, publishedAt, updatedAt desc), a trash's worth
        // more than the shelf shows. Only when that comes back short is the rest scanned: a draft with no
        // updatedAt (an older build's) is in no ordered query, and sorts last anyway, so a full page needs none.
        const ordered = await drafts.orderBy('updatedAt', 'desc').limit(draftPage).get();
        // Short too when the trash took enough of the page that fewer than a shelf's worth are left.
        const short = ordered.size < draftPage || ordered.docs.filter(kept).length < limit;
        const snap = short ? await drafts.limit(scan).get() : ordered;
        const edited = (d: QueryDocumentSnapshot) => {
          const at = d.get('updatedAt');
          return at instanceof Timestamp ? at.toMillis() : 0;
        };
        // Most recently edited first.
        return snap.docs
          .filter(kept)
          .sort((a, b) => edited(b) - edited(a))
          .slice(0, limit)
          .map((d) => {
            // A draft shows a summary of its story as it is (the summary stored at publish is no draft's): only one a
            // list kept after reading the draft itself (B6: stamped after the draft's last change, never with it)
            // stands in; else the shelf reads the shown drafts' stories in its one batch (withStories).
            const card = listCard(d.id, d.data());
            const keptAt = d.get('excerptAt');
            const editedAt = d.get('updatedAt');
            const keptSince = keptAt instanceof Timestamp && editedAt instanceof Timestamp && keptAt.toMillis() > editedAt.toMillis();
            if (!keptSince) delete card.listing;
            return card;
          });
      }
      const isPrivate = shelf === 'private';
      const snap = await own
        .where('visibility', 'in', isPrivate ? ['private'] : ['public', 'connections'])
        .orderBy('publishedAt', 'desc')
        .select(...LIST_FIELDS)
        // Private cards share their query with the trash's (private while there): read past them.
        .limit(isPrivate ? limit * 2 : limit)
        .get();
      return snap.docs
        .filter(kept)
        .map((d) => listCard(d.id, d.data()))
        .filter((c) => c.publishedAt)
        .slice(0, limit);
    },

    async trashShelf(uid, limit) {
      const snap = await db
        .collection('cards')
        .where('authorId', '==', uid)
        .where('trashedAt', '!=', null)
        .orderBy('trashedAt', 'desc')
        .select(...LIST_FIELDS)
        .limit(limit)
        .get();
      return toCards(snap.docs);
    },

    async answeredIds(uid, limit) {
      // Only the cards that answer one (B12: authorId, referenceCardId), so an author's 61st card no longer hides a reply.
      const snap = await db.collection('cards').where('authorId', '==', uid).where('referenceCardId', '>', '').select('referenceCardId').limit(limit).get();
      return snap.docs.map((d) => d.get('referenceCardId')).filter((id): id is string => typeof id === 'string' && id.length > 0);
    },

    async bookmarkIds(uid, limit) {
      const marks = await db.collection(`users/${uid}/bookmarks`).orderBy('createdAt', 'desc').limit(limit).get();
      return marks.docs.map((d) => d.id);
    },

    withStories: (cards) => withStories(db, cards),

    unlistedForStrangers: (ids) => unlistedForStrangers(db, ids),

    async sharedAmong(viewerId, cards) {
      return (await sharedCardsModule()).sharedAmong(db, viewerId, cards);
    },

    async tapOf(viewerId, card, opts) {
      return (await tapsModule()).cardTap(db, viewerId, card, opts);
    },

    latestForLanding: (limit) => latestForLanding(db, limit),

    /**
     * The newest public, published cards that name no one as anonymous — what a
     * signed-out reader's card page shows with its story. Nothing else is
     * listed: the query asks for exactly these and each document is checked
     * again, so a card that is private, connections-only, anonymous, a draft,
     * stamped by hand (properlyPublished), still without a slug or blank never is.
     */
    async sitemapCards(max, now) {
      const snap = await db
        .collection('cards')
        .where('visibility', '==', 'public')
        .where('anonymous', '==', false)
        .where('publishedAt', '!=', null)
        .orderBy('publishedAt', 'desc')
        .select('slug', 'visibility', 'anonymous', 'publishedAt', ...SUMMARY_FIELDS, ...LISTING_FIELDS)
        .limit(max)
        .get();
      return snap.docs.flatMap((d) => {
        const { slug, visibility, anonymous, publishedAt, updatedAt } = d.data();
        if (visibility !== 'public' || anonymous !== false || !properlyPublished(publishedAt, now)) return [];
        if (typeof slug !== 'string' || !slug) return [];
        // A blank card (lib/cards/blank), by its stored summary: its page is there, nothing to read on it.
        if (blankBySummary(d.data()) || unlistedCard(d.data())) return [];
        // An edit's server stamp, when it is one; the author's own writes can put anything there.
        const edited = updatedAt instanceof Timestamp && updatedAt.toMillis() > publishedAt.toMillis() && updatedAt.toMillis() <= now;
        return [{ slug, lastModified: (edited ? updatedAt : publishedAt).toDate() }];
      });
    },

    async filmWindow(limit) {
      const windowSnap = await db
        .collection('cards')
        .where('visibility', '==', 'public')
        .where('publishedAt', '!=', null)
        .orderBy('publishedAt', 'desc')
        .select(...LIST_FIELDS)
        .limit(limit)
        .get();
      // The window's readings, by id: the score and the strangers' switch only.
      const readings = windowSnap.empty
        ? []
        : await db.getAll(...windowSnap.docs.map((s) => db.doc(`${CARD_SIGNATURES}/${s.id}`)), { fieldMask: ['insightScore', 'listedForStrangers'] });
      const readingOf = new Map(
        readings
          .filter((r) => r.exists)
          .map((r) => {
            const score = r.get('insightScore');
            return [r.id, { insightScore: typeof score === 'number' && Number.isFinite(score) ? score : null, listed: r.get('listedForStrangers') !== false }];
          }),
      );
      return windowSnap.docs.map((s): FilmWindowRow => {
        const data = s.data();
        return { id: s.id, d: sanitize<Record<string, unknown>>(data), reading: readingOf.get(s.id), summary: storedSummary(data), blank: blankBySummary(data) };
      });
    },

    async filmPin() {
      const snap = await db.doc('config/landingFilm').get();
      if (!snap.exists) return null;
      const pin = sanitize<Record<string, unknown>>(snap.data() ?? {});
      return {
        ...(typeof pin.written === 'string' ? { written: pin.written } : {}),
        ...(typeof pin.answer === 'string' ? { answer: pin.answer } : {}),
        ...(pin.until instanceof Date ? { until: pin.until } : {}),
      };
    },

    async partVectors(ids, channel, perCard) {
      const out = new Map<string, number[][]>();
      if (!ids.length) return out;
      const paths = ids.flatMap((id) => Array.from({ length: perCard }, (_, i) => `cardVectors/${id}__${channel}__${i}`));
      const snaps = await db.getAll(...paths.map((p) => db.doc(p)), { fieldMask: ['vector'] });
      for (const v of snaps) {
        if (!v.exists) continue;
        const vec = (v.get('vector')?.toArray?.() ?? []) as number[]; // never the signature fields the records carry
        if (!vec.length) continue;
        const id = v.id.slice(0, v.id.indexOf(`__${channel}__`));
        out.set(id, [...(out.get(id) ?? []), vec]);
      }
      return out;
    },

    async landingCards(ids) {
      if (!ids.length) return [];
      const full = await db.getAll(...ids.map((id) => db.doc(`cards/${id}`)), { fieldMask: [...LANDING_CARD_FIELDS] });
      return full.filter((s) => s.exists).map((s) => mapCard(s.id, s.data()!));
    },

    async stillPublic(ids) {
      const asked = [...new Set(ids)].filter((id) => id && !id.includes('/') && !isReservedId(id));
      if (!asked.length) return new Set();
      const snaps = await db.getAll(...asked.map((id) => db.doc(`cards/${id}`)), { fieldMask: ['visibility', 'publishedAt', 'trashedAt'] });
      return new Set(snaps.filter((s) => s.exists && s.get('visibility') === 'public' && s.get('publishedAt') != null && s.get('trashedAt') == null).map((s) => s.id));
    },
  };
}
