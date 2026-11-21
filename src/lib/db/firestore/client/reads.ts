'use client';

import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit as fbLimit,
  orderBy,
  query,
  where,
  Timestamp,
} from './sdk';
import type { Card, User } from '@/lib/db/types';
import type { CardBoxTab } from '@/lib/db/types';
import type { CardSeed } from '@/lib/data/cardSeed';
import type { CardListBody, ConnectionListBody, FeedPageBody, MeBody, PersonBody, PersonListBody, ProfileBody } from '@/lib/api/v1/schemas';
import { getFirebaseClientAuth } from '@/lib/auth/firebase/client';
import { summaryAuthor } from '@/lib/data/summaries';
import { getClientDb } from './init';
import { isAbsent } from './errors';
import { ApiError, callApi } from './api';
import { mapCard, mapUser } from './map';

/*
 * Since Phase 2 of the middleware decouple, everything a signed-in viewer
 * reads here about people — profiles, the viewer's own, connections — comes
 * from /api/v1. What is left on Firestore Lite is the reading a signed-out
 * reader does through the rules (public profiles and cards, which the v1
 * reads — all signed in — can't answer) and the card reads the writer's lane
 * converges (getCardById, the card box's shelves).
 */

/** Whether a viewer is signed in here, so the reads go to /api/v1. */
function signedIn(): boolean {
  return !!getFirebaseClientAuth().currentUser;
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

/**
 * The related cards under a card for a signed-out reader, from the server
 * (GET /api/cards/related): what a signed-in page and the apps get, without
 * a viewer — recent public cards sharing its tags, only those their reading
 * lets strangers see (round 26 §A1.7: the readings are the server's alone, so
 * the browser's own query could never leave those out), anonymous ones
 * without their byline.
 */
export async function getRelatedCards(cardId: string): Promise<CardListBody> {
  const res = await fetch(`/api/cards/related?id=${encodeURIComponent(cardId)}`);
  if (!res.ok) throw new Error(`Related request failed (${res.status})`);
  return (await res.json()) as CardListBody;
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

// Every list shows its cards' authors — the same few people over and over. So
// a page-wide cache keeps them for a few minutes, and the ones it lacks are
// read 30 at a time: one GET /api/v1/users?ids= for a signed-in viewer (a gone
// account answered as gone, never as stale data), a get each through the
// rules for a signed-out reader (profiles are public, never listed).

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

/** A v1 Person as the web's User (null: the account is gone). */
export function personUser(p: PersonBody): User | null {
  if (p.gone || !p.author) return null;
  return { ...summaryAuthor(p.author, { bio: p.bio, joinedAt: p.joinedAt ?? undefined }), avatarSeed: p.author.avatarSeed ?? '0' };
}

/** Profiles an answer brought along already in the web's shape (the bell's people): into the cache. */
export function rememberUsers(users: Record<string, User>): void {
  for (const [id, user] of Object.entries(users)) remember(id, user);
}

/** People an answer brought along (a block list, the connections, invites): into the cache, so their faces need no read. */
export function rememberPeople(people: PersonBody[]): void {
  for (const p of people) remember(p.id, personUser(p));
}

/** One chunk (≤ 30) of profiles, found ones by uid: the v1 read signed in, a get each through the rules signed out. */
async function fetchUserChunk(ids: string[]): Promise<Map<string, User>> {
  const found = new Map<string, User>();
  if (signedIn()) {
    const body = await callApi<PersonListBody>(`/api/v1/users?ids=${ids.map(encodeURIComponent).join(',')}`);
    for (const p of body.users) {
      const user = personUser(p);
      if (user) found.set(p.id, user);
    }
    return found;
  }
  const snaps = await Promise.all(ids.map((id) => getDoc(doc(getClientDb(), 'users', id))));
  for (const d of snaps) if (d.exists()) found.set(d.id, mapUser(d.id, d.data()));
  return found;
}

/** Read one chunk (≤ 30) of profiles and cache what came back, absent ones as null. */
function readUserChunk(ids: string[]): Promise<Map<string, User>> {
  const read = fetchUserChunk(ids).then((found) => {
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
  return (await readUserChunk([id])).get(id) ?? null;
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
  if (signedIn()) {
    // The profile's head alone (no lists): who goes by it now, as the viewer may see them.
    try {
      const body = await callApi<ProfileBody>(`/api/v1/users/${encodeURIComponent(handle.trim())}`);
      const user = { ...summaryAuthor(body.author, { bio: body.bio, joinedAt: body.joinedAt }), avatarSeed: body.author.avatarSeed ?? '0' };
      remember(user.id, user);
      return user;
    } catch (err) {
      // No one goes by it (404), or a name that can't be one (400).
      if (err instanceof ApiError && (err.status === 404 || err.status === 400)) return null;
      throw err;
    }
  }
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
 * The signed-in viewer's own profile, or null if not signed in / no profile:
 * GET /api/v1/me (what only they see: languages, hints, the pen name's last
 * change) beside their public face from GET /api/v1/users?ids= (the avatar's
 * seed, the verified mark, when they joined). Always read fresh (it's what
 * the viewer just edited), and handed to the cache for the lists that show
 * them.
 */
export async function getCurrentUserProfile(): Promise<User | null> {
  const uid = getFirebaseClientAuth().currentUser?.uid;
  if (!uid) return null;
  let me: MeBody;
  let face: PersonListBody;
  try {
    [me, face] = await Promise.all([callApi<MeBody>('/api/v1/me'), callApi<PersonListBody>(`/api/v1/users?ids=${encodeURIComponent(uid)}`)]);
  } catch (e) {
    // No profile yet (onboarding not finished).
    if (e instanceof ApiError && e.status === 404) {
      remember(uid, null);
      return null;
    }
    throw e;
  }
  const person = face.users.find((p) => p.id === uid);
  const user: User = {
    id: me.id,
    handle: me.handle,
    ...(me.bio ? { bio: me.bio } : {}),
    region: me.region ?? '',
    primaryLocale: me.primaryLocale ?? 'zh-TW',
    autoTranslateTo: me.autoTranslateTo ?? [],
    verified: person?.author?.verified ?? false,
    phoneHash: '',
    avatarSeed: person?.author?.avatarSeed ?? '0',
    ...(me.avatarUrl ? { avatarUrl: me.avatarUrl } : {}),
    initials: me.initials,
    accentColor: me.accentColor,
    joinedAt: person?.joinedAt ? new Date(person.joinedAt) : new Date(0),
    handleChangedAt: me.handleChangedAt ? new Date(me.handleChangedAt) : new Date(0),
    ...(me.hintsSeen ? { hintsSeen: me.hintsSeen } : {}),
  };
  remember(uid, user);
  return user;
}

// --- connections ---

// The viewer's connections, read once for everyone who asks at the same moment
// (a thread asks whether it is connected while the messages list asks for all).
let connectionsRead: { uid: string; ids: Promise<string[]> } | null = null;

/** The uids the signed-in viewer is connected with (GET /api/v1/me/connections), their profiles into the cache. */
export async function listMyConnectionUids(): Promise<string[]> {
  const uid = getFirebaseClientAuth().currentUser?.uid;
  if (!uid) return [];
  if (connectionsRead?.uid === uid) return connectionsRead.ids;
  const ids = callApi<ConnectionListBody>('/api/v1/me/connections').then((body) => {
    rememberPeople(body.connections.map((c) => c.person));
    return body.connections.map((c) => c.userId);
  });
  const entry = { uid, ids };
  connectionsRead = entry;
  // Shared only while it is on its way: each later ask reads again (SWR decides when).
  void ids.catch(() => undefined).finally(() => {
    if (connectionsRead === entry) connectionsRead = null;
  });
  return ids;
}

/** Whether the viewer (`a` or `b`) is connected with the other: their connections say. Signed out, or someone else's pair: no. */
export async function isConnected(a: string, b: string): Promise<boolean> {
  const uid = getFirebaseClientAuth().currentUser?.uid;
  if (!uid || (a !== uid && b !== uid)) return false;
  const other = a === uid ? b : a;
  return (await listMyConnectionUids()).includes(other);
}
