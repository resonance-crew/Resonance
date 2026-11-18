import { Timestamp, type DocumentData, type Firestore } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/db/firestore/admin';
import type { CardEvents } from './weights';

/**
 * What a reader did, read for their own picks (round 26 §A3): the cards they
 * wrote, replied to with a card, left a note on (that one was sent — the
 * text is never read), tapped 共振, saved, read (lib/api/v1/reading's
 * records), and were shown in their picks. Each describes the reader's own
 * taste; none is counted across readers or lifts a card for anyone else.
 * Signals on an anonymous card feed only the reader's content taste: the
 * author boost below counts named originals only (safety.md).
 */

/** How many of each kind are read (the newest are what the taste keeps anyway). */
const EVENTS_READ = 300;

const ms = (v: unknown): number | null => (v instanceof Timestamp ? v.toMillis() : v instanceof Date ? v.getTime() : null);
const idOk = (id: unknown): id is string => typeof id === 'string' && id.length > 0 && !id.includes('/');
const finite = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) ? n : 0);

/** The latest of two times (null: neither). */
const latest = (a: number | undefined, b: number | null) => (b === null ? a : a === undefined ? b : Math.max(a, b));

/**
 * Everything `uid` did, by card (./weights CardEvents), and the shown counts
 * `recommendations/{uid}.shown` keeps. Reads only the fields it needs, never
 * a note's text nor a story.
 */
export async function readerEvents(uid: string, db: Firestore = getAdminDb()): Promise<CardEvents[]> {
  const [own, notes, taps, saved, reading, stored] = await Promise.all([
    db.collection('cards').where('authorId', '==', uid).select('referenceCardId', 'publishedAt', 'trashedAt').limit(EVENTS_READ).get(),
    db.collection('notes').where('fromUserId', '==', uid).select('cardId', 'createdAt').limit(EVENTS_READ).get(),
    db.collection('resonanceTaps').where('userId', '==', uid).select('cardId', 'on', 'at').limit(EVENTS_READ).get(),
    db.collection(`users/${uid}/bookmarks`).select('cardId', 'createdAt').limit(EVENTS_READ).get(),
    db
      .collection('readerSignals')
      .where('userId', '==', uid)
      .select('cardId', 'lastAt', 'reachedEndAt', 'rereads', 'rereadAt', 'shared', 'activeSeconds', 'maxProgress', 'expectedSeconds')
      .limit(EVENTS_READ)
      .get(),
    db.collection('recommendations').doc(uid).get(),
  ]);
  const byCard = new Map<string, CardEvents>();
  const of = (cardId: string) => {
    const e = byCard.get(cardId) ?? { cardId };
    byCard.set(cardId, e);
    return e;
  };
  for (const d of own.docs) {
    const at = ms(d.get('publishedAt'));
    if (at === null || d.get('trashedAt') != null) continue;
    of(d.id).wrote = at;
    const ref = d.get('referenceCardId');
    if (idOk(ref)) of(ref).replied = latest(of(ref).replied, at);
  }
  for (const d of notes.docs) {
    const cardId = d.get('cardId');
    if (idOk(cardId)) of(cardId).noted = latest(of(cardId).noted, ms(d.get('createdAt')) ?? 0);
  }
  for (const d of taps.docs) {
    const cardId = d.get('cardId');
    if (!idOk(cardId)) continue;
    of(cardId).tappedEver = true;
    if (d.get('on') === true) of(cardId).tapped = ms(d.get('at')) ?? 0;
  }
  for (const d of saved.docs) {
    const cardId = d.get('cardId') ?? d.id;
    if (idOk(cardId)) of(cardId).saved = ms(d.get('createdAt')) ?? 0;
  }
  for (const d of reading.docs) {
    const cardId = d.get('cardId');
    const lastAt = ms(d.get('lastAt'));
    if (!idOk(cardId) || lastAt === null) continue;
    const expected = d.get('expectedSeconds');
    of(cardId).reading = {
      lastAt,
      reachedEndAt: ms(d.get('reachedEndAt')),
      rereads: Math.max(0, Math.floor(finite(d.get('rereads')))),
      rereadAt: ms(d.get('rereadAt')),
      shared: d.get('shared') === true,
      activeSeconds: Math.max(0, finite(d.get('activeSeconds'))),
      maxProgress: Math.min(1, Math.max(0, finite(d.get('maxProgress')))),
      expectedSeconds: typeof expected === 'number' && Number.isFinite(expected) && expected > 0 ? expected : null,
    };
  }
  for (const [cardId, shown] of Object.entries(shownCounts(stored.data()))) of(cardId).shown = shown;
  return [...byCard.values()];
}

/** `recommendations/{uid}.shown`, read defensively: `{ [cardId]: { n, lastDay } }`. */
export function shownCounts(data: DocumentData | undefined): Record<string, { n: number; lastDay: string }> {
  const raw = data?.shown;
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, { n: number; lastDay: string }> = {};
  for (const [cardId, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!idOk(cardId) || !v || typeof v !== 'object') continue;
    const n = Math.floor(finite((v as DocumentData).n));
    const lastDay = (v as DocumentData).lastDay;
    if (n > 0 && typeof lastDay === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(lastDay)) out[cardId] = { n, lastDay };
  }
  return out;
}

/** Whose named public cards the reader is connected with (their connections' uids). */
export async function connectionIds(uid: string, db: Firestore = getAdminDb()): Promise<string[]> {
  const snap = await db.collection('connections').where('userIds', 'array-contains', uid).select('userIds').get();
  const out = new Set<string>();
  for (const d of snap.docs) for (const id of (d.get('userIds') ?? []) as unknown[]) if (idOk(id) && id !== uid) out.add(id);
  return [...out].sort();
}

/**
 * The light author boost's signal: authors whose cards this reader has
 * *responded to* by writing a card (a card with `referenceCardId`) — a
 * costly, deliberate act. A light lift for their other named cards (+0.15 in
 * the funnel), never a card's standing for anyone else.
 *
 * Only a resonance that reaches its original counts — published, public and
 * under the reader's name, as the original's list shows it: a draft or a
 * hidden one is nothing its author was ever shown, and would let a reader
 * point the boost at anyone they like to see what it lifts. And only a named
 * original: an anonymous card's author is no one's to know, and a boost would
 * point at them. Reads only the fields it needs (never the stories), the
 * originals in one batch.
 */
export async function getEngagedAuthorIds(uid: string, db: Firestore = getAdminDb()): Promise<Set<string>> {
  // The reader's own cards that reference another card = their resonances.
  const mine = await db
    .collection('cards')
    .where('authorId', '==', uid)
    .select('referenceCardId', 'publishedAt', 'visibility', 'anonymous')
    .limit(100)
    .get();
  const refIds = Array.from(
    new Set(
      mine.docs
        .filter((d) => d.get('publishedAt') != null && d.get('visibility') === 'public' && d.get('anonymous') !== true)
        .map((d) => d.get('referenceCardId'))
        .filter((id): id is string => typeof id === 'string' && id.length > 0 && !id.includes('/'))
    )
  );
  if (refIds.length === 0) return new Set();

  const referenced = await db.getAll(...refIds.map((id) => db.collection('cards').doc(id)), { fieldMask: ['authorId', 'anonymous'] });
  const authors = new Set<string>();
  for (const snap of referenced) {
    const authorId = snap.get('authorId');
    // An anonymous original names no one: boosting its author's other cards
    // would show a reader who answered only it whose card it was.
    if (snap.get('anonymous') === true) continue;
    if (typeof authorId === 'string' && authorId !== uid) authors.add(authorId);
  }
  return authors;
}

/**
 * Which of these cards are under their author's name, read as they are now
 * (the anonymity field alone, one batch): only those may be lifted for being
 * by an author the reader answered — lifting an anonymous one would say who
 * wrote it. A card gone, or one that can't be read, is left out.
 */
export async function namedCardIds(cardIds: string[], db: Firestore = getAdminDb()): Promise<Set<string>> {
  const ids = [...new Set(cardIds.filter((id) => id.length > 0 && !id.includes('/')))];
  if (!ids.length) return new Set();
  const snaps = await db.getAll(...ids.map((id) => db.collection('cards').doc(id)), { fieldMask: ['anonymous'] });
  return new Set(snaps.filter((s) => s.exists && s.get('anonymous') !== true).map((s) => s.id));
}
