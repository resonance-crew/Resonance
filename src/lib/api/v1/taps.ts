import { FieldPath, Timestamp, type DocumentReference, type DocumentSnapshot, type Firestore, type QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { mapCard } from '@/lib/db/firestore/mapper';
import { isReservedId } from '@/lib/db/firestore/reservedId';
import type { Card } from '@/lib/db/types';
import { NOTE_REQUEST_MAX, cut, hasPenName, letterRef, lettersLeft, noPenName, openRequest, pairOf } from './conversations';
import { ApiFailure } from './http';
import { decodePageToken, encodePageToken } from './paging';
import { CARD_VISIBILITY_FIELDS, blockedByViewer, cardVisible, toAuthor, trashedAtOf } from './present';
import { visibleCardById } from './reads';
import { TAP_FACES_MAX, type AuthorBody, type CardTapBody, type TapListBody, type TapPersonBody } from './schemas';

/**
 * The resonance tap (共振, round 26): the first of the three answers under a
 * story — tapping 共振 — beside a note (小紙條) and a card written in reply
 * (用卡片回應, the older "resonance", which keeps its name in the contract:
 * `/resonances`, `referenceCardId`). Hence the names here: the collection
 * `resonanceTaps`, the endpoint `/tap`, the bell `resonance_tap`.
 *
 * `resonanceTaps/{cardId}_{uid}` = `{ cardId, userId, on, at, rangAt }`, one
 * per reader and card, server-only (the rules refuse every client read and
 * write). Taking a tap back sets `on: false` and keeps the document: its
 * `rangAt` — when the tap rang the card's author — is what keeps a reader
 * from ringing them again by tapping, taking back and tapping again (one ring
 * per reader and card, ever). `at` is when it last turned on (the lists'
 * order, newest first).
 *
 * A tap connects no one, opens no conversation and gives the author no way to
 * write to the reader (their list of who resonated opens a profile, never a
 * thread, unless that person also left a note); taking one back tells no one;
 * no count is shown anywhere. The author can't tap their own card: on an
 * anonymous card their face would show to their connections. That leaves a
 * weak inference — a reader who taps everything is never seen on their own
 * anonymous cards — which notes and reply cards leave already (no one answers
 * their own card), and is accepted.
 *
 * Blocks: a named card across a block either way is refused (`blocked`, as a
 * note is); an anonymous card across one is tapped exactly as without it —
 * the reader's own answer, face and state, and what their connections see,
 * never change with a block (the reader writes their own block list: a face
 * that vanished when they blocked a guess would name the author). Only the
 * author's side leaves them out: the author's faces and list, the bell and the
 * push (lib/push/tapBell, after the response, in their own transaction, so
 * nothing the answer waits on differs with a block).
 *
 * A card shared privately in a conversation (./sharedCards) is never tapped:
 * the routes read it by id (visibleCardById), without the pass.
 */
export const TAPS = 'resonanceTaps';

export const tapRef = (db: Firestore, cardId: string, uid: string): DocumentReference => db.doc(`${TAPS}/${cardId}_${uid}`);

/** How many people a page of the author's list holds. */
export const TAP_PAGE = 30;

const notFound = () => new ApiFailure('not_found', 'No such card.');
const docIdOk = (id: unknown): id is string => typeof id === 'string' && id.length > 0 && !id.includes('/') && !isReservedId(id);
const millisOf = (v: unknown): number => (v instanceof Timestamp ? v.toMillis() : 0);

/** What a tap's card is read with: whose it is and who may read it (no story). */
const TAP_CARD_FIELDS = CARD_VISIBILITY_FIELDS;

export interface TapOutcome {
  on: boolean;
  /** False when it already was so: nothing written, nothing to ring. */
  changed: boolean;
  /** Turned on and never rang the author: ring them after the response (lib/push/tapBell ringTap). */
  ring: boolean;
}

/** A card a reader may tap as they read it now: published, out of the trash, not theirs. */
function tappable(card: Card | null, uid: string): card is Card {
  return !!card && !!card.publishedAt && trashedAtOf(card) == null && card.trashedAt == null && card.authorId !== uid;
}

/**
 * Resonate with a card (`on: true`, PUT /cards/{id}/tap) or take it back
 * (`on: false`, DELETE). Checked in this order: the card — one the reader
 * may read, by id (never through a shared-card pass), published, not in the
 * trash, else not_found —; not their own (invalid_request); and, to turn it
 * on, their pen name (forbidden, asked before the blocks, as every path asks
 * it) and a block either way on a named card (`blocked`; an anonymous card is
 * tapped whoever was blocked). Taking back reaches no one: it needs neither,
 * and works across a block too.
 *
 * One transaction writes the tap document alone (the card read again in it:
 * one hidden or trashed meanwhile is not_found). Whatever reaches the author —
 * the ring, the bell — is the caller's to start after the response.
 */
export async function setTap(db: Firestore, uid: string, cardId: string, on: boolean, now = Date.now()): Promise<TapOutcome> {
  const card = await visibleCardById(db, uid, cardId, TAP_CARD_FIELDS);
  if (!card.publishedAt || trashedAtOf(card) != null || card.trashedAt != null) throw notFound();
  if (card.authorId === uid) throw new ApiFailure('invalid_request', 'You cannot resonate with your own card.');
  const author = card.authorId;
  if (on) {
    // Read alike for every card, whatever stands between the two: only a named card's answer turns on them.
    const [me, out, inn] = await db.getAll(db.doc(`users/${uid}`), db.doc(`users/${uid}/blocks/${author}`), db.doc(`users/${author}/blocks/${uid}`));
    if (!hasPenName(me)) throw noPenName();
    if (card.anonymous !== true && (out.exists || inn.exists)) throw new ApiFailure('blocked', 'You cannot resonate with this card.');
  }
  const ref = tapRef(db, card.id, uid);
  const cardRef = db.doc(`cards/${card.id}`);
  const connection = db.doc(`connections/${pairOf(uid, author)}`);
  return db.runTransaction(async (tx) => {
    const [snap, [current], linked] = await Promise.all([tx.get(ref), tx.getAll(cardRef, { fieldMask: [...TAP_CARD_FIELDS] }), tx.get(connection)]);
    const fresh = current.exists ? mapCard(current.id, current.data()!) : null;
    if (!tappable(fresh, uid) || fresh.authorId !== author || !cardVisible(fresh, uid, () => linked.exists)) throw notFound();
    const wasOn = snap.exists && snap.get('on') === true;
    if (wasOn === on) return { on, changed: false, ring: false };
    if (!on) {
      tx.update(ref, { on: false });
      return { on: false, changed: true, ring: false };
    }
    const rangAt = snap.exists ? (snap.get('rangAt') ?? null) : null;
    tx.set(ref, { cardId: card.id, userId: uid, on: true, at: Timestamp.fromMillis(now), rangAt });
    return { on: true, changed: true, ring: rangAt == null };
  });
}

/** Every tap on the card `id`, a batch at a time (deleting the card; an anonymous card going into the trash). */
export async function deleteTapsOn(db: Firestore, id: string): Promise<void> {
  const taps = db.collection(TAPS).where('cardId', '==', id).select().limit(BATCH_MAX);
  for (;;) {
    const page = await taps.get();
    if (page.empty) return;
    const batch = db.batch();
    page.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    if (page.size < BATCH_MAX) return;
  }
}

/** A batch's limit on writes. */
const BATCH_MAX = 500;

// --- who resonated -------------------------------------------------------------------------------------------------

interface Tapper {
  uid: string;
  at: number;
}

/** The people behind `uids` as the contract shows them, in that order — anyone without a profile left out. */
async function authorsOf(db: Firestore, uids: string[]): Promise<Map<string, AuthorBody>> {
  const ids = [...new Set(uids)].filter(docIdOk);
  const out = new Map<string, AuthorBody>();
  for (let i = 0; i < ids.length; i += 100) {
    const snaps = await db.getAll(...ids.slice(i, i + 100).map((id) => db.doc(`users/${id}`)));
    for (const s of snaps) if (s.exists) out.set(s.id, toAuthor(s.id, s.data()!));
  }
  return out;
}

/** Who among `uids` blocked `of` (users/{uid}/blocks/{of}), read in batches. */
async function blockersOf(db: Firestore, uids: string[], of: string): Promise<Set<string>> {
  const ids = uids.filter(docIdOk);
  const out = new Set<string>();
  for (let i = 0; i < ids.length; i += 100) {
    const snaps = await db.getAll(...ids.slice(i, i + 100).map((id) => db.doc(`users/${id}/blocks/${of}`)));
    snaps.forEach((s, j) => {
      if (s.exists) out.add(ids[i + j]);
    });
  }
  return out;
}

/** The card's taps that are on, newest first: a page of raw documents. */
function tapsOnQuery(db: Firestore, cardId: string) {
  return db.collection(TAPS).where('cardId', '==', cardId).where('on', '==', true).orderBy('at', 'desc');
}

const tapperOf = (d: QueryDocumentSnapshot | DocumentSnapshot): Tapper | null => {
  const uid = d.get('userId');
  return docIdOk(uid) ? { uid, at: millisOf(d.get('at')) } : null;
};

/**
 * The author's own people: everyone whose tap on the card is on, newest first
 * — strangers too —, minus anyone with a block between them and the author,
 * either way (on an anonymous card as on a named one: this is the author's
 * side, the only one a block may change). A page of `limit` raw taps from
 * `after` (a page token's boundary); `raw` says whether the page came back
 * full (so a next one may follow).
 */
async function authorPeople(
  db: Firestore,
  card: Card,
  limit: number,
  after?: { at: Timestamp; id: string },
): Promise<{ people: Tapper[]; last: QueryDocumentSnapshot | null; full: boolean }> {
  let q = tapsOnQuery(db, card.id).orderBy(FieldPath.documentId(), 'desc').limit(limit);
  if (after) q = q.startAfter(after.at, after.id);
  const [page, blocked] = await Promise.all([q.get(), blockedByViewer(db, card.authorId)]);
  const tappers = page.docs.map(tapperOf).filter((t): t is Tapper => !!t && t.uid !== card.authorId && !blocked.has(t.uid));
  const blockers = await blockersOf(db, tappers.map((t) => t.uid), card.authorId);
  return { people: tappers.filter((t) => !blockers.has(t.uid)), last: page.docs.at(-1) ?? null, full: page.size === limit };
}

/**
 * The people a reader sees: themselves first when their tap is on, then the
 * people they are connected with whose tap is on, newest first — read by
 * their own connections (`getAll` of those taps), so how long it takes turns
 * on how many people they are connected with, never on how many tapped. On a
 * named card, anyone with a block between them and the reader is left out;
 * on an anonymous card nothing here turns on a block (a block ends a
 * connection anyway).
 */
async function readerPeople(db: Firestore, viewerId: string, card: Card): Promise<{ mine: boolean; people: Tapper[] }> {
  const [own, links] = await Promise.all([
    tapRef(db, card.id, viewerId).get(),
    db.collection('connections').where('userIds', 'array-contains', viewerId).select('userIds').get(),
  ]);
  const others = [
    ...new Set(
      links.docs.flatMap((d) => {
        const ids = d.get('userIds');
        return Array.isArray(ids) ? ids.filter((id): id is string => docIdOk(id) && id !== viewerId && id !== card.authorId) : [];
      }),
    ),
  ];
  const taps: Tapper[] = [];
  for (let i = 0; i < others.length; i += 100) {
    const snaps = await db.getAll(...others.slice(i, i + 100).map((uid) => tapRef(db, card.id, uid)));
    for (const s of snaps) {
      const t = s.exists && s.get('on') === true ? tapperOf(s) : null;
      if (t) taps.push(t);
    }
  }
  taps.sort((a, b) => b.at - a.at || (a.uid < b.uid ? -1 : 1));
  let people = taps;
  if (card.anonymous !== true && taps.length) {
    const [blocked, blockers] = await Promise.all([blockedByViewer(db, viewerId), blockersOf(db, taps.map((t) => t.uid), viewerId)]);
    people = taps.filter((t) => !blocked.has(t.uid) && !blockers.has(t.uid));
  }
  const mine = own.exists && own.get('on') === true;
  return { mine, people: mine ? [{ uid: viewerId, at: Number.MAX_SAFE_INTEGER }, ...people] : people };
}

/**
 * Whether POST /notes would take a note from `viewerId` on this card now — as
 * far as the letters go (a pen name is asked for by the client first): on a
 * named card, connected, or answering a letter of the author's that waits, or
 * with fewer than NOTE_REQUEST_MAX of their own still unanswered. An anonymous
 * card always takes one (a cap there would tell whose card it is).
 */
async function mayNoteOn(db: Firestore, viewerId: string, card: Card): Promise<boolean> {
  if (card.anonymous === true) return true;
  const pair = pairOf(viewerId, card.authorId);
  const [connection, letter, convo] = await db.getAll(
    db.doc(`connections/${pair}`),
    letterRef(db, viewerId, card.authorId),
    db.doc(`conversations/${pair}`),
  );
  if (connection.exists || openRequest(convo)?.from === card.authorId) return true;
  return lettersLeft(letter) < NOTE_REQUEST_MAX;
}

/** Whether a block stands between the two, either way. */
async function blockedEitherWay(db: Firestore, a: string, b: string): Promise<boolean> {
  const [ab, ba] = await db.getAll(db.doc(`users/${a}/blocks/${b}`), db.doc(`users/${b}/blocks/${a}`));
  return ab.exists || ba.exists;
}

/** Who may see a card's taps, and as whom: its author, a reader who may tap it, or no one (null). */
async function tapViewOf(db: Firestore, viewerId: string, card: Card): Promise<'author' | 'reader' | null> {
  if (!card.publishedAt || trashedAtOf(card) != null || card.trashedAt != null) return null;
  if (card.authorId === viewerId) return 'author';
  if (card.anonymous !== true && (await blockedEitherWay(db, viewerId, card.authorId))) return null;
  return 'reader';
}

/** The first `n` people with a profile, in order, and whether more than `n` are left. */
async function firstFaces(db: Firestore, people: Tapper[], n: number): Promise<{ faces: AuthorBody[]; more: boolean }> {
  const head = people.slice(0, n + 4);
  const found = await authorsOf(db, head.map((p) => p.uid));
  const known = head.filter((p) => found.has(p.uid));
  const faces = known.slice(0, n).map((p) => found.get(p.uid)!);
  // More than the faces: another known one in the head, or anyone past it.
  return { faces, more: known.length > n || people.length > head.length };
}

/**
 * `CardDetail.tap` (GET /cards/{key}): null unless the viewer is the card's
 * author (their published card, out of the trash) or a reader who may tap
 * it — and never for a card read through a shared-card pass (`pass`).
 */
export async function cardTap(db: Firestore, viewerId: string, card: Card, opts: { pass: boolean }): Promise<CardTapBody | null> {
  if (opts.pass) return null;
  const view = await tapViewOf(db, viewerId, card);
  if (!view) return null;
  if (view === 'author') {
    // One more than the faces, past the blocks: enough to say whether there are others.
    let people: Tapper[] = [];
    let after: { at: Timestamp; id: string } | undefined;
    for (let pages = 0; pages < 5 && people.length <= TAP_FACES_MAX; pages++) {
      const page = await authorPeople(db, card, 10, after);
      people = [...people, ...page.people];
      const at = page.last?.get('at');
      if (!page.full || !page.last || !(at instanceof Timestamp)) break;
      after = { at, id: page.last.id };
    }
    const { faces, more } = await firstFaces(db, people, TAP_FACES_MAX);
    return { mine: false, faces, more, mayNote: false };
  }
  const [{ mine, people }, mayNote] = await Promise.all([readerPeople(db, viewerId, card), mayNoteOn(db, viewerId, card)]);
  const { faces, more } = await firstFaces(db, people, TAP_FACES_MAX);
  return { mine, faces, more, mayNote };
}

/** How much of a note the author's list shows: its first line, at most this many characters. */
export const TAP_NOTE_EXCERPT = 80;

/** A note's first line with words in it, trimmed and cut to TAP_NOTE_EXCERPT code points. */
export function noteExcerpt(text: string): string {
  const line = text.split(/\r?\n/).map((l) => l.trim()).find((l) => l.length > 0) ?? '';
  return cut(line, TAP_NOTE_EXCERPT);
}

/**
 * The latest note each of `uids` left `author` on the card (delivered to them:
 * one withheld across a block names no one), as its excerpt.
 */
async function latestNotes(db: Firestore, cardId: string, author: string, uids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, { at: number; text: string }>();
  const ids = uids.filter(docIdOk);
  for (let i = 0; i < ids.length; i += 30) {
    const snap = await db
      .collection('notes')
      .where('cardId', '==', cardId)
      .where('fromUserId', 'in', ids.slice(i, i + 30))
      .select('fromUserId', 'toUserId', 'text', 'createdAt')
      .get();
    for (const d of snap.docs) {
      const from = d.get('fromUserId');
      const text = d.get('text');
      if (d.get('toUserId') !== author || typeof from !== 'string' || typeof text !== 'string') continue;
      const at = millisOf(d.get('createdAt'));
      const was = out.get(from);
      if (!was || at > was.at) out.set(from, { at, text });
    }
  }
  return new Map([...out].map(([uid, n]) => [uid, noteExcerpt(n.text)]).filter(([, excerpt]) => excerpt.length > 0) as [string, string][]);
}

/**
 * GET /cards/{id}/taps?pageToken= — who resonated, as the viewer may see
 * them. The author: everyone (but across a block), newest first, TAP_PAGE a
 * page, each with the excerpt of the latest note they left on a named card
 * (`note`; on an anonymous card always null — nothing there opens a thread).
 * A reader: the same people as `CardDetail.tap.faces` without the cap — they
 * themselves first, then their connections —, one page, no notes. Anyone for
 * whom `tap` is null (a draft, a card in the trash, a named card across a
 * block, a card they can't read) is not_found.
 */
export async function listTaps(db: Firestore, viewerId: string, cardId: string, pageToken?: string | null): Promise<TapListBody> {
  const card = await visibleCardById(db, viewerId, cardId, TAP_CARD_FIELDS);
  const view = await tapViewOf(db, viewerId, card);
  if (!view) throw notFound();
  if (view === 'reader') {
    const { people } = await readerPeople(db, viewerId, card);
    const found = await authorsOf(db, people.map((p) => p.uid));
    return { people: people.filter((p) => found.has(p.uid)).map((p) => ({ author: found.get(p.uid)!, note: null })), nextPageToken: null };
  }
  const after = pageToken ? decodePageToken(pageToken) : undefined;
  const page = await authorPeople(db, card, TAP_PAGE, after);
  const uids = page.people.map((p) => p.uid);
  const [found, notes] = await Promise.all([
    authorsOf(db, uids),
    card.anonymous === true ? new Map<string, string>() : latestNotes(db, card.id, card.authorId, uids),
  ]);
  const people: TapPersonBody[] = page.people
    .filter((p) => found.has(p.uid))
    .map((p) => ({ author: found.get(p.uid)!, note: notes.has(p.uid) ? { excerpt: notes.get(p.uid)! } : null }));
  const at = page.last?.get('at');
  const nextPageToken = page.full && page.last && at instanceof Timestamp ? encodePageToken(at, page.last.id) : null;
  return { people, nextPageToken };
}
