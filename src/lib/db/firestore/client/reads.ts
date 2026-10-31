'use client';

import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit as fbLimit,
  orderBy,
  query,
  startAfter,
  where,
  Timestamp,
} from './sdk';
import { blankCard } from '@/lib/cards/blank';
import type { Card, User } from '@/lib/db/types';
import type { CardBoxTab } from '@/lib/db/interfaces';
import type { CardSeed } from '@/lib/data/cardSeed';
import type { FeedPageBody } from '@/lib/api/v1/schemas';
import { getFirebaseClientAuth } from '@/lib/auth/firebase/client';
import { getClientDb } from './init';
import { isAbsent } from './errors';
import { mapCard, mapUser } from './map';

function connectionId(a: string, b: string): string {
  return [a, b].sort().join('_');
}

// --- cards ---
//
// An anonymous card's document names its author, so the rules let only its
// author read it (and list it) from here; every public list asks for
// `anonymous == false`. Anyone else gets an anonymous card from the server,
// which leaves the author out (getPublicCardView, the /api/v1 reads).

/**
 * Single card. Firestore rules enforce visibility; denied/missing → null. A
 * read that failed for any other reason (offline, a server error) throws —
 * it says nothing about the card, and must not be shown, or kept, as "no such
 * card".
 */
export async function getCardById(id: string): Promise<Card | null> {
  try {
    const snap = await getDoc(doc(getClientDb(), 'cards', id));
    return snap.exists() ? mapCard(snap.id, snap.data()) : null;
  } catch (e) {
    // permission-denied (not visible to this viewer) reads as "not found"
    if (isAbsent(e)) return null;
    throw e;
  }
}

/**
 * Single card by URL segment, which may be a slug or a legacy doc id. We resolve
 * the segment → doc id on the server (admin, returns only the id), then read the
 * card through the visibility-enforced `get` rule via {@link getCardById}. This
 * keeps private cards gated by the same rule path as before — the slug index
 * never exposes their content. (The card page usually has the id already, from
 * its server render.)
 */
export async function getCardBySlugOrId(key: string): Promise<Card | null> {
  const id = await resolveCardId(key);
  return id ? getCardById(id) : null;
}

/**
 * A card URL segment → the document id it names (null: none). The server's
 * answer for a hit is CDN-cached (/api/cards/resolve). When the server can't
 * be reached, the segment itself is taken for a doc id.
 */
export async function resolveCardId(key: string): Promise<string | null> {
  try {
    const res = await fetch(`/api/cards/resolve?key=${encodeURIComponent(key)}`);
    if (res.ok) return ((await res.json()) as { id: string | null }).id;
  } catch {
    // Network hiccup — fall through.
  }
  return key;
}

/**
 * A card as a signed-out reader sees it, from the server (GET
 * /api/cards/view: the card page's seed) — for a card the rules won't let
 * this browser read itself, an anonymous one. Null: nothing public there.
 */
export async function getPublicCardView(key: string): Promise<CardSeed | null> {
  try {
    const res = await fetch(`/api/cards/view?key=${encodeURIComponent(key)}`);
    return res.ok ? ((await res.json()) as CardSeed) : null;
  } catch {
    return null;
  }
}

/**
 * The latest public cards for a signed-out reader, from the server (GET
 * /api/cards/latest) — anonymous ones included, without their byline, which
 * the rules keep out of the browser's own queries.
 */
export async function getPublicFeedPage(limit: number, cursor?: string): Promise<FeedPageBody> {
  const params = new URLSearchParams({ limit: String(limit), ...(cursor ? { cursor } : {}) });
  const res = await fetch(`/api/cards/latest?${params}`);
  if (!res.ok) throw new Error(`Feed request failed (${res.status})`);
  return (await res.json()) as FeedPageBody;
}

/** Latest public, published cards that name their author (anonymous ones are the server's to hand out). */
export async function getLatestPublishedFeed(limit = 12, cursor?: Date): Promise<Card[]> {
  const db = getClientDb();
  const constraints = [
    where('visibility', '==', 'public'),
    where('anonymous', '==', false),
    where('publishedAt', '!=', null),
    orderBy('publishedAt', 'desc'),
    fbLimit(limit),
  ];
  const q = cursor
    ? query(collection(db, 'cards'), ...constraints, startAfter(Timestamp.fromDate(cursor)))
    : query(collection(db, 'cards'), ...constraints);
  const snap = await getDocs(q);
  return snap.docs.map((d) => mapCard(d.id, d.data()));
}

/** Cards sharing tags with the given card. Mirrors FirestoreCardRepository.findRelated. */
export async function getRelatedCards(cardId: string, limit = 3): Promise<Card[]> {
  // An anonymous card is its author's alone to read here: then there are no tags to match.
  const base = await getDoc(doc(getClientDb(), 'cards', cardId)).catch(() => null);
  const tags = ((base?.data()?.tags ?? []) as string[]).slice(0, 5);
  const pool = await getLatestPublishedFeed(limit + 6);
  let cards = pool.filter((c) => c.id !== cardId && !blankCard(c));
  if (tags.length) {
    cards = cards.sort((a, b) => {
      const as = a.tags.filter((tag) => tags.includes(tag)).length;
      const bs = b.tags.filter((tag) => tags.includes(tag)).length;
      return bs - as;
    });
  }
  return cards.slice(0, limit);
}

/**
 * Public cards that resonate with (reference) the given card, newest first.
 * Readable signed out: every match is public, published and attributed
 * (`anonymous == false`), as the Firestore `list` rule asks. Used for the
 * card-detail resonance section and the author-only resonator avatar group.
 */
export async function getResonanceCards(cardId: string, limit = 30): Promise<Card[]> {
  const snap = await getDocs(
    query(
      collection(getClientDb(), 'cards'),
      where('referenceCardId', '==', cardId),
      where('visibility', '==', 'public'),
      where('anonymous', '==', false),
      where('publishedAt', '!=', null),
      orderBy('publishedAt', 'desc'),
      fbLimit(limit)
    )
  );
  return snap.docs.map((d) => mapCard(d.id, d.data()));
}

/**
 * The signed-in viewer's own resonance card for a given original (draft or
 * published), or null. Pure-equality query — no composite index needed. Drives
 * the「共振 / 修改」button and prefills the inline editor.
 */
export async function getMyResonanceCard(cardId: string): Promise<Card | null> {
  const uid = getFirebaseClientAuth().currentUser?.uid;
  if (!uid) return null;
  const snap = await getDocs(
    query(
      collection(getClientDb(), 'cards'),
      where('authorId', '==', uid),
      where('referenceCardId', '==', cardId),
      fbLimit(1)
    )
  );
  const d = snap.docs[0];
  return d ? mapCard(d.id, d.data()) : null;
}

/** Author's cards filtered by box tab. Mirrors FirestoreCardRepository.findByAuthor. */
export async function getCardsByAuthor(authorId: string, tab: CardBoxTab): Promise<Card[]> {
  const db = getClientDb();

  if (tab === 'resonated') {
    // A "resonated" card now means an original I wrote a response card for: take
    // my own cards that reference another card, then resolve those originals.
    const mine = await getDocs(
      query(collection(db, 'cards'), where('authorId', '==', authorId), fbLimit(60))
    );
    const refIds = Array.from(
      new Set(
        mine.docs
          .map((d) => d.data().referenceCardId)
          .filter((id): id is string => typeof id === 'string' && id.length > 0)
      )
    );
    const cards = await Promise.all(refIds.map((id) => getCardById(id)));
    return cards.filter((c): c is Card => Boolean(c));
  }

  // One query per shelf: with a shared "newest 40" query, an author's 41st
  // published card pushed every draft (publishedAt null sorts last) out of
  // the box, and private cards crowded out public ones.
  const own = [collection(db, 'cards'), where('authorId', '==', authorId)] as const;
  // A card in the trash is on the trash shelf alone (read from the server).
  // It is private while there, so the published shelf's query leaves it out
  // on its own; the private and draft shelves leave it out before they are
  // cut to size, so a trash full of newer cards never crowds out the rest.
  const kept = (d: { data: () => Record<string, unknown> }) => d.data().trashedAt == null;
  if (tab === 'draft') {
    const snap = await getDocs(query(...own, where('publishedAt', '==', null), fbLimit(DRAFT_SCAN)));
    // Most recently edited first (sorted here: drafts are few, and this needs no composite index).
    const edited = (d: (typeof snap.docs)[number]) => {
      const at = d.data().updatedAt;
      return at instanceof Timestamp ? at.toMillis() : 0;
    };
    return snap.docs
      .filter(kept)
      .sort((a, b) => edited(b) - edited(a))
      .slice(0, BOX_LIMIT)
      .map((d) => mapCard(d.id, d.data()));
  }
  const isPrivate = tab === 'private';
  const snap = await getDocs(
    query(
      ...own,
      where('visibility', 'in', isPrivate ? ['private'] : ['public', 'connections']),
      orderBy('publishedAt', 'desc'),
      // Private cards share their query with the trash's (private while there): read past them.
      fbLimit(isPrivate ? BOX_LIMIT * 2 : BOX_LIMIT)
    )
  );
  return snap.docs
    .filter(kept)
    .map((d) => mapCard(d.id, d.data()))
    .filter((c) => c.publishedAt)
    .slice(0, BOX_LIMIT);
}

/**
 * The card box's 草稿 shelf (round 8 §1.1): the viewer's cards no one else
 * reads — drafts never published and published cards kept private, which are
 * drafts to their author — the most recently changed first, at most
 * BOX_LIMIT. The two reads are the draft and private shelves' own (no new
 * index); a card in the trash is on the trash shelf alone.
 */
export async function getMyDrafts(authorId: string): Promise<Card[]> {
  const db = getClientDb();
  const own = [collection(db, 'cards'), where('authorId', '==', authorId)] as const;
  const [drafts, kept] = await Promise.all([
    getDocs(query(...own, where('publishedAt', '==', null), fbLimit(DRAFT_SCAN))),
    getDocs(query(...own, where('visibility', 'in', ['private']), orderBy('publishedAt', 'desc'), fbLimit(BOX_LIMIT * 2))),
  ]);
  const edited = (d: (typeof drafts.docs)[number]) => {
    const at = d.data().updatedAt;
    return at instanceof Timestamp ? at.toMillis() : 0;
  };
  const seen = new Set<string>();
  return [...drafts.docs, ...kept.docs.filter((d) => d.data().publishedAt)]
    .filter((d) => d.data().trashedAt == null && !seen.has(d.id) && seen.add(d.id))
    .sort((a, b) => edited(b) - edited(a))
    .slice(0, BOX_LIMIT)
    .map((d) => mapCard(d.id, d.data()));
}

/** A card box shelf's size, and how many drafts are read to find the latest ones. */
const BOX_LIMIT = 40;
const DRAFT_SCAN = 200;

/**
 * Public cards for an author's outward-facing profile, newest first.
 *
 * Unlike {@link getCardsByAuthor}, this constrains the query to
 * `visibility == "public"` so it satisfies the Firestore `list` rule for
 * anonymous (signed-out) viewers — a logged-out visitor can read a blog-style
 * profile without tripping a permission error.
 *
 * Anonymous cards never surface here — the outward-facing profile is exactly
 * the place they must not be attributable (ux §6). They stay reachable via
 * their own card page and the feed, just without a byline.
 */
export async function getPublicCardsByAuthor(authorId: string): Promise<Card[]> {
  const snap = await getDocs(
    query(
      collection(getClientDb(), 'cards'),
      where('authorId', '==', authorId),
      where('visibility', '==', 'public'),
      // The rules list public cards only once published, and only attributed
      // ones — the query must say so.
      where('anonymous', '==', false),
      where('publishedAt', '!=', null),
      orderBy('publishedAt', 'desc'),
      fbLimit(40)
    )
  );
  return snap.docs
    .map((d) => mapCard(d.id, d.data()))
    .filter((c) => c.publishedAt && !c.anonymous);
}

// --- users ---

// Profiles are public (`users/*` allows a get to anyone, never a list), and
// every list shows its cards' authors — the same few people over and over. So
// a page-wide cache keeps them for a few minutes, and the ones it lacks are
// read side by side, a get each, 30 at a time.

/** How long a cached profile is trusted. */
const USER_TTL_MS = 5 * 60 * 1000;
/** Profiles read at once. */
const USERS_AT_ONCE = 30;

const userCache = new Map<string, { user: User | null; at: number }>();
const userReads = new Map<string, Promise<User | null>>();

function cachedUser(id: string): User | null | undefined {
  const hit = userCache.get(id);
  if (!hit) return undefined;
  if (Date.now() - hit.at > USER_TTL_MS) {
    userCache.delete(id);
    return undefined;
  }
  return hit.user;
}

function remember(id: string, user: User | null): void {
  userCache.set(id, { user, at: Date.now() });
}

/** Drop a cached profile — after the viewer edits their own, say. No id clears them all. */
export function forgetCachedUser(id?: string): void {
  if (id === undefined) userCache.clear();
  else userCache.delete(id);
}

/**
 * Read one chunk (≤ 30) of profiles — a get each, side by side (the rules list
 * no profiles: a list query can page through the whole directory) — and cache
 * what came back, absent ones as null.
 */
function readUserChunk(ids: string[]): Promise<Map<string, User>> {
  const read = Promise.all(ids.map((id) => getDoc(doc(getClientDb(), 'users', id)))).then((snaps) => {
    const found = new Map<string, User>();
    for (const d of snaps) if (d.exists()) found.set(d.id, mapUser(d.id, d.data()));
    for (const id of ids) remember(id, found.get(id) ?? null);
    return found;
  });
  for (const id of ids) {
    const one = read.then((found) => found.get(id) ?? null);
    userReads.set(id, one);
    void one.catch(() => undefined).finally(() => {
      if (userReads.get(id) === one) userReads.delete(id);
    });
  }
  return read;
}

/** A profile by uid, from the cache when it has it. */
export async function getUserById(id: string): Promise<User | null> {
  const hit = cachedUser(id);
  if (hit !== undefined) return hit;
  const pending = userReads.get(id);
  if (pending) return pending;
  const read = getDoc(doc(getClientDb(), 'users', id)).then((snap) => {
    const user = snap.exists() ? mapUser(snap.id, snap.data()) : null;
    remember(id, user);
    return user;
  });
  userReads.set(id, read);
  try {
    return await read;
  } finally {
    if (userReads.get(id) === read) userReads.delete(id);
  }
}

/** Profiles by uid, keyed by uid (missing ones left out): cached ones as they are, the rest in batched reads. */
export async function getUsersByIds(ids: string[]): Promise<Record<string, User>> {
  const unique = Array.from(new Set(ids)).filter((id) => id && !id.includes('/'));
  const out: Record<string, User> = {};
  const waits: Promise<unknown>[] = [];
  const missing: string[] = [];
  for (const id of unique) {
    const hit = cachedUser(id);
    if (hit !== undefined) {
      if (hit) out[id] = hit;
      continue;
    }
    const pending = userReads.get(id);
    if (pending) {
      waits.push(
        pending.then((u) => {
          if (u) out[id] = u;
        }),
      );
      continue;
    }
    missing.push(id);
  }
  for (let i = 0; i < missing.length; i += USERS_AT_ONCE) {
    waits.push(
      readUserChunk(missing.slice(i, i + USERS_AT_ONCE)).then((found) => {
        for (const [id, u] of found) out[id] = u;
      }),
    );
  }
  await Promise.all(waits);
  return out;
}

/**
 * The person who goes by a pen name: its reservation (handles/{name}, kept
 * by the server with each profile write) names them.
 */
export async function getUserByHandle(handle: string): Promise<User | null> {
  const key = handle.trim().toLowerCase();
  if (!key) return null;
  // Every pen name is reserved (handles/{name}, backfill.ts handles): no reservation, no such person.
  let uid: unknown = null;
  try {
    const reserved = await getDoc(doc(getClientDb(), 'handles', key));
    uid = reserved.exists() ? reserved.data().uid : null;
  } catch (err) {
    // A name that can't be a document id (`..`, a `/` from a hand-typed URL) names no one; offline is a failure.
    if (!isAbsent(err)) throw err;
  }
  return typeof uid === 'string' && uid ? getUserById(uid) : null;
}

/**
 * The signed-in viewer's own profile document, or null if not signed in / no
 * profile. Always read fresh (it's what the viewer just edited), and handed to
 * the cache for the lists that show them.
 */
export async function getCurrentUserProfile(): Promise<User | null> {
  const uid = getFirebaseClientAuth().currentUser?.uid;
  if (!uid) return null;
  const snap = await getDoc(doc(getClientDb(), 'users', uid));
  const user = snap.exists() ? mapUser(snap.id, snap.data()) : null;
  remember(uid, user);
  return user;
}

// --- connections ---

export async function isConnected(a: string, b: string): Promise<boolean> {
  try {
    const snap = await getDoc(doc(getClientDb(), 'connections', connectionId(a, b)));
    return snap.exists();
  } catch (e) {
    // Someone else's pair is unreadable: "denied/missing" is simply not
    // connected. A failed read (offline) is no answer, and throws.
    if (isAbsent(e)) return false;
    throw e;
  }
}

/** The uids the signed-in viewer is connected with. */
export async function listMyConnectionUids(): Promise<string[]> {
  const uid = getFirebaseClientAuth().currentUser?.uid;
  if (!uid) return [];
  const snap = await getDocs(
    query(collection(getClientDb(), 'connections'), where('userIds', 'array-contains', uid)),
  );
  return snap.docs
    .map((d) => (d.data().userIds as string[]).find((u) => u !== uid))
    .filter((u): u is string => Boolean(u));
}
