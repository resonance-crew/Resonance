/**
 * The film's cards (SPEC §2), server only: which real stories it shows. The rule, its constants and their comments are
 * the data research's (`.lab-tmp/filmCards.ts`, ported as is): lead eligibility; tier 0 the owner's pin
 * (`config/landingFilm`); tier 1 a real resonance; tier 2 kin (insight ≤ 0.40, situation ≤ 0.70, one per author, a
 * daily rotation among the top 3 at Taipei midnight); tier 3 alone; the sky from latestForLanding minus the leads.
 * And the end's list (the owner, round 4: 「直接顯示現在推薦的…五六篇就好」, one recommendation for everyone who isn't
 * signed in): `recommendedIds`, from the same window — no pair, no place for the leads.
 * Read-only against Firestore. `loadFilm` memoizes the answer per Taipei day (10 minutes) and falls back to the
 * landing grid's read when the picks fail. What leaves here is `toModel`'s FilmModel: never a Card, never a score.
 */
import type { DocumentData, Firestore } from 'firebase-admin/firestore';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { blankCard, unlistedCard } from '@/lib/cards/blank';
import { LIST_FIELDS, blankBySummary, storedSummary } from '@/lib/api/v1/summary';
import { LANDING_CARD_FIELDS, latestForLanding } from '@/lib/db/firestore/landing';
import { getAdminDb } from '@/lib/db/firestore/admin';
import { mapCard, mapUser } from '@/lib/db/firestore/mapper';
import { isReservedId } from '@/lib/db/firestore/reservedId';
import { publicBases } from '@/lib/storage/publicUrl';
import type { Card, User } from '@/lib/db/types';
import { PICKS, type FilmModel } from './model';
import { toModel } from './tiles';

/** The newest public cards the film chooses among (one query, no stories: LIST_FIELDS + the score). */
export const FILM_WINDOW = 120;
/** The written card's pool: the best lead of each author, this many authors by insight score (one findNearest each). */
export const FILM_POOL = 6;
/** Hits per findNearest: the first leadable one by someone else is the kin. */
export const KIN_K = 10;
/** A lead reads as a story worth a stranger's look. */
export const LEAD_MIN_INSIGHT = 0.8;
export const LEAD_TITLE_MAX = 32; // graphemes: two lines of the floating card on a phone
export const LEAD_EXCERPT_MIN = 60; // graphemes of the stored excerpt (itself ≤ 96 + …)
/**
 * Two cards are kin (one may stand for the other's answer) when their insight vectors are this close (COSINE, 1 − cos)
 * and their situations don't disagree. Tuned on 2026-11-09's 105 lead pairs (min 0.352, p10 0.452, median 0.555): 4 pass
 * (3 by different authors). Re-tune when the embedding model or INDEX_VERSION changes.
 */
export const KIN_INSIGHT_MAX = 0.4;
export const KIN_SITUATION_MAX = 0.7;
/** The film rotates daily among this many best pairs. */
export const FILM_ROTATION = 3;
export const SKY_MAX = 12;

/**
 * The end's list, for a visitor nobody knows: the window's listed cards by
 *   value = insight score + PICK_RECENCY × 0.5 ^ (age in days ÷ PICK_HALF_LIFE_DAYS)
 * — what the index thought of the story (0–1; a card not indexed yet counts 0), and a light lift for a new one (a card
 * published today +0.15, two weeks old +0.075, two months old next to nothing), so a good story stays for weeks and a
 * new one of the same worth stands before it. Age is counted to the end of the Taipei day: the order holds all day.
 */
export const PICK_RECENCY = 0.15;
export const PICK_HALF_LIFE_DAYS = 14;
/** One card per named author; a second only when the list would otherwise run short. */
export const PICK_AUTHOR_MAX = 2;
/** At most this many anonymous cards (more only when the list would otherwise run short): a list of 匿名 names no one. */
export const PICK_ANONYMOUS = 2;
/** Candidates read whole: a few more than the list shows, to stand in for one that changed meanwhile or has no byline. */
export const PICKS_READ = 10;

/** A pin (server-only `config/landingFilm`: the rules deny every client read and write of config/*). */
interface Pin { written?: string; answer?: string; until?: Timestamp }

export type FilmRelation = 'resonance' | 'kin' | 'alone';
export interface FilmCards {
  written: Card;
  /** null: the answer beat shows a blank card (the visitor's own, to come). */
  answer: Card | null;
  /** `resonance` = the answer really answers it (its card page says so); `kin` = a nearby story, never captioned as a reply. */
  relation: FilmRelation;
  pinned: boolean;
  sky: Card[];
  /** The end's list, best first (`recommendedIds`): at most `PICKS`, as the page may show them. */
  picks: Card[];
  /** Bylines only (latestForLanding's), never an anonymous card's author. */
  authors: Record<string, User>;
}

const seg = new Intl.Segmenter('und', { granularity: 'grapheme' });
const glen = (s: unknown) => (typeof s === 'string' ? [...seg.segment(s.trim())].length : 0);
const OUR_COVER = (url: unknown, bases: readonly string[]) => typeof url === 'string' && bases.some((b) => url.startsWith(`${b}/`));
/** Taipei's calendar day: the film turns at its main audience's midnight. */
export const taipeiDayIndex = (now: Date) => Math.floor((now.getTime() + 8 * 3_600_000) / 86_400_000);

/** May this card play a lead (written or answer)? Decided on stored fields only; never on who reads. */
function leadable(d: DocumentData, bases: readonly string[]): boolean {
  return (
    d.visibility === 'public' && d.publishedAt != null && d.trashedAt == null &&
    d.anonymous !== true && // the two leads connect; an anonymous card connects no one (and its author is never read here)
    !unlistedCard(d) && !blankBySummary(d) &&
    d.media?.type === 'image' && OUR_COVER(d.media.url, bases) &&
    glen(d.thoughtCore) >= 2 && glen(d.thoughtCore) <= LEAD_TITLE_MAX &&
    glen(storedSummary(d)?.excerpt ?? '') >= LEAD_EXCERPT_MIN &&
    typeof d.signature?.insightScore === 'number' && d.signature.insightScore >= LEAD_MIN_INSIGHT
  );
}

export type Row = { id: string; d: DocumentData };

/** May a list that picks cards for readers show this one (lib/cards/blank)? Stored fields only, never who reads. */
const listed = (d: DocumentData) =>
  d.visibility === 'public' && d.publishedAt != null && d.trashedAt == null && !unlistedCard(d) && !blankBySummary(d);
const millis = (v: unknown) => (v instanceof Timestamp ? v.toMillis() : v instanceof Date ? v.getTime() : 0);

/**
 * The stories recommended to anyone (the end's list), best first, as card ids — from the window's rows, no read of its
 * own. Listed cards only (public, published, not in the trash, not blank, not unlisted), by `value` (above), newer
 * first when equal, then by id. Variety before rank: first one card per named author and at most `PICK_ANONYMOUS`
 * anonymous ones; only if that leaves fewer than `most`, a second per author and further anonymous ones, after them.
 * An anonymous card is never counted with its author's: whether it shows must not turn on whose it is.
 */
export function recommendedIds(rows: readonly Row[], day: number, most: number = PICKS_READ): string[] {
  const dayEnd = (day + 1) * 86_400_000 - 8 * 3_600_000; // the Taipei day's last moment
  const ranked = rows
    .filter((r) => listed(r.d))
    .map((r) => {
      const at = millis(r.d.publishedAt);
      const raw = r.d.signature?.insightScore;
      const insight = typeof raw === 'number' && Number.isFinite(raw) ? Math.min(1, Math.max(0, raw)) : 0;
      const days = Math.max(0, (dayEnd - at) / 86_400_000);
      return { id: r.id, d: r.d, at, value: insight + PICK_RECENCY * 0.5 ** (days / PICK_HALF_LIFE_DAYS) };
    })
    .sort((x, y) => y.value - x.value || y.at - x.at || x.id.localeCompare(y.id));
  const out: string[] = [];
  const byAuthor = new Map<string, number>();
  let anonymous = 0;
  const take = (authorMax: number, anonymousMax: number) => {
    for (const r of ranked) {
      if (out.length >= most) return;
      if (out.includes(r.id)) continue;
      if (r.d.anonymous === true) {
        if (anonymous >= anonymousMax) continue;
        anonymous++;
      } else {
        const author = String(r.d.authorId ?? '');
        const n = byAuthor.get(author) ?? 0;
        if (n >= authorMax) continue;
        byAuthor.set(author, n + 1);
      }
      out.push(r.id);
    }
  };
  take(1, PICK_ANONYMOUS);
  take(PICK_AUTHOR_MAX, Infinity);
  return out;
}
const cosine = (x: number[], y: number[]) => { let s = 0; for (let i = 0; i < x.length; i++) s += x[i] * y[i]; return 1 - s; }; // unit vectors

/** What the page may hold of a card: latestForLanding's own strip. */
const forPage = (c: Card): Card => {
  const { thin: _t, signature: _s, ...card } = c;
  return card.anonymous ? { ...card, authorId: '' } : card;
};

export async function filmCards(db: Firestore, opts: { storageBases: readonly string[]; now?: Date }): Promise<FilmCards | null> {
  const now = opts.now ?? new Date();
  const day = taipeiDayIndex(now);
  const bases = opts.storageBases;

  const [windowSnap, pinSnap] = await Promise.all([
    db.collection('cards').where('visibility', '==', 'public').where('publishedAt', '!=', null).orderBy('publishedAt', 'desc')
      .select(...LIST_FIELDS, 'signature.insightScore', 'resonanceCount').limit(FILM_WINDOW).get(),
    db.doc('config/landingFilm').get(),
  ]);
  const rows = windowSnap.docs.map((s) => ({ id: s.id, d: s.data() }));
  const pickIds = recommendedIds(rows, day);
  const leads = rows.filter((r) => leadable(r.d, bases));
  const byId = new Map(leads.map((r) => [r.id, r]));
  // Pen names: a lead's author must have one (only named leads get here).
  const authorIds = [...new Set(leads.map((r) => String(r.d.authorId)))].filter((id) => id && !id.includes('/') && !isReservedId(id));
  const profiles = authorIds.length ? await db.getAll(...authorIds.map((id) => db.doc(`users/${id}`)), { fieldMask: ['handle'] }) : [];
  const named = new Set(profiles.filter((p) => p.exists && String(p.get('handle') ?? '').trim()).map((p) => p.id));
  const ok = leads.filter((r) => named.has(String(r.d.authorId)));
  const score = (r: { d: DocumentData }) => Number(r.d.signature.insightScore);
  const okIds = new Set(ok.map((r) => r.id));

  let pair: { w: string; a: string | null; relation: FilmRelation; pinned: boolean } | null = null;

  // 0. The owner's pin, while it lasts — a preference, never a pass: both cards must still be leadable now.
  const pin = (pinSnap.exists ? pinSnap.data() : undefined) as Pin | undefined;
  if (pin?.written && okIds.has(pin.written) && (!pin.until || pin.until.toMillis() > now.getTime())) {
    const a = pin.answer && okIds.has(pin.answer) && byId.get(pin.answer)!.d.authorId !== byId.get(pin.written)!.d.authorId ? pin.answer : null;
    const real = a != null && byId.get(a)!.d.referenceCardId === pin.written;
    pair = { w: pin.written, a, relation: a ? (real ? 'resonance' : 'kin') : 'alone', pinned: true };
  }

  // 1. Real resonances: a named, listed public answer by someone else to a named, listed public card.
  if (!pair) {
    const real = ok
      .filter((r) => typeof r.d.referenceCardId === 'string' && okIds.has(r.d.referenceCardId) && byId.get(r.d.referenceCardId)!.d.authorId !== r.d.authorId)
      .map((r) => ({ w: r.d.referenceCardId as string, a: r.id, key: Math.min(score(r), score(byId.get(r.d.referenceCardId)!)) }))
      .sort((x, y) => y.key - x.key || x.a.localeCompare(y.a))
      .slice(0, FILM_ROTATION);
    if (real.length) { const p = real[day % real.length]; pair = { w: p.w, a: p.a, relation: 'resonance', pinned: false }; }
  }

  // 2. Kin: for each of the best leads (one per author), the nearest leadable card by someone else, by the insight
  //    vectors (the recommender's own index); kept when the two insights are close and their situations don't disagree.
  const bestOfAuthor = new Map<string, Row>();
  for (const r of [...ok].sort((x, y) => score(y) - score(x) || y.id.localeCompare(x.id))) if (!bestOfAuthor.has(String(r.d.authorId))) bestOfAuthor.set(String(r.d.authorId), r);
  const pool = [...bestOfAuthor.values()].slice(0, FILM_POOL);
  if (!pair && pool.length && ok.length >= 2) {
    const own = await db.getAll(...pool.map((r) => db.doc(`cardVectors/${r.id}__insight`)), { fieldMask: ['vector'] });
    const near = await Promise.all(own.map(async (vdoc, i) => {
      const vec = vdoc.exists ? ((vdoc.get('vector')?.toArray?.() ?? []) as number[]) : [];
      if (!vec.length) return null;
      const hits = await db.collection('cardVectors').where('visibility', '==', 'public').where('channel', '==', 'insight')
        .select('cardId', '__distance') // never the vector, nor the signature fields the records carry
        .findNearest({ vectorField: 'vector', queryVector: FieldValue.vector(vec), limit: KIN_K, distanceMeasure: 'COSINE', distanceResultField: '__distance' })
        .get();
      const w = pool[i];
      for (const h of hits.docs) {
        const a = byId.get(String(h.get('cardId')));
        if (!a || !okIds.has(a.id) || a.id === w.id || a.d.authorId === w.d.authorId) continue;
        const di = Number(h.get('__distance'));
        return di <= KIN_INSIGHT_MAX ? { w, a, di } : null;
      }
      return null;
    }));
    const found = near.filter((x): x is { w: Row; a: Row; di: number } => !!x);
    // Situations: the pair's two records, read by id.
    const sit = found.length ? await db.getAll(...found.flatMap((p) => [db.doc(`cardVectors/${p.w.id}__situation`), db.doc(`cardVectors/${p.a.id}__situation`)]), { fieldMask: ['vector'] }) : [];
    const sv = new Map(sit.filter((s) => s.exists).map((s) => [s.id, (s.get('vector')?.toArray?.() ?? []) as number[]]));
    const seen = new Set<string>();
    const kin = found
      .filter((p) => { const x = sv.get(`${p.w.id}__situation`), y = sv.get(`${p.a.id}__situation`); return !x?.length || !y?.length || cosine(x, y) <= KIN_SITUATION_MAX; })
      .map((p) => (score(p.a) > score(p.w) ? { w: p.a, a: p.w, di: p.di } : p)) // the written card is the higher-scoring
      .filter((p) => { const k = [p.w.id, p.a.id].sort().join(); if (seen.has(k)) return false; seen.add(k); return true; })
      .sort((x, y) => x.di - y.di)
      .slice(0, FILM_ROTATION);
    if (kin.length) { const p = kin[day % kin.length]; pair = { w: p.w.id, a: p.a.id, relation: 'kin', pinned: false }; }
  }

  // 3. Nothing close enough: the best card alone (rotating among the top three); the answer beat is a blank card.
  if (!pair && pool.length) pair = { w: pool[day % Math.min(FILM_ROTATION, pool.length)].id, a: null, relation: 'alone', pinned: false };
  if (!pair) return null; // no lead at all: the page plays the film with blank cards only

  // The two again, whole and as the page may show them (the grid's projection: no signature beyond `placeholder`) —
  // and, in the same read, the end's candidates.
  const ids = [pair.w, ...(pair.a ? [pair.a] : [])];
  const wanted = [...new Set([...ids, ...pickIds])];
  const full = await db.getAll(...wanted.map((id) => db.doc(`cards/${id}`)), { fieldMask: [...LANDING_CARD_FIELDS] });
  const cards = full.filter((s) => s.exists).map((s) => mapCard(s.id, s.data()!)).filter((c) => !blankCard(c));
  // A candidate is asked again as it is now: a card hidden, trashed or emptied since the window was read is left out.
  const pickCards = pickIds
    .map((id) => cards.find((c) => c.id === id))
    .filter((c): c is Card => !!c && c.visibility === 'public' && c.publishedAt != null && c.trashedAt == null && !unlistedCard(c));
  const written = cards.find((c) => c.id === pair!.w);
  if (!written) return null; // changed in the last moment: the next render picks again
  const answer = pair.a ? cards.find((c) => c.id === pair!.a) ?? null : null;

  // The sky: the landing grid's own read (anonymous cards too, authorless), minus the two.
  const latest = await latestForLanding(db, SKY_MAX + 2);
  const sky = latest.cards.filter((c) => !ids.includes(c.id)).slice(0, SKY_MAX);

  const leadAuthors = [written, answer].filter((c): c is Card => !!c).map((c) => c.authorId);
  // The named candidates' bylines ride in the leads' read; an anonymous card's author is never asked for.
  const pickAuthors = pickCards.filter((c) => c.anonymous !== true).map((c) => String(c.authorId ?? '')).filter((id) => id && !id.includes('/') && !isReservedId(id));
  const missing = [...new Set([...leadAuthors, ...pickAuthors])].filter((id) => !latest.authors[id]);
  const extra = missing.length ? await db.getAll(...missing.map((id) => db.doc(`users/${id}`)), { fieldMask: ['handle', 'initials', 'avatarUrl', 'avatarSeed', 'accentColor', 'primaryLocale', 'verified'] }) : [];
  const authors = { ...latest.authors };
  // latestForLanding's byline() (export it) — here only the fields it keeps.
  for (const p of extra) if (p.exists) { const u = mapUser(p.id, p.data()!); authors[p.id] = { ...u, region: '', autoTranslateTo: [], phoneHash: '', joinedAt: new Date(0), handleChangedAt: new Date(0) }; }

  // A named card goes under its author's pen name or not at all (without one it would read as an anonymous card).
  const picks = pickCards
    .filter((c) => c.anonymous === true || String(authors[c.authorId]?.handle ?? '').trim())
    .slice(0, PICKS)
    .map(forPage);

  return { written: forPage(written), answer: answer ? forPage(answer) : null, relation: answer ? pair.relation : 'alone', pinned: pair.pinned, sky, picks, authors };
}

/* ───────────── the page's read: memoized, with a fallback ───────────── */

interface Memo {
  day: number;
  at: number;
  ttl: number;
  model: FilmModel;
}
const MEMO_MS = 10 * 60_000;
/**
 * Where stored covers live. The lab's local env may predate the move to img.resonance.channel (CLAUDE.md, Storage), so
 * the current host is always accepted beside whatever the env names.
 */
const filmBases = () => [...new Set([...publicBases(), 'https://img.resonance.channel'])];
const FALLBACK_MS = 60_000;
/** The memo's key carries the model's shape: a dev server keeps globalThis across reloads, and an older shape's memo
 *  (round 2's: no tags, the kin card apart from B; round 3's: no `picks`) must not be served to the code of this one. */
const MEMO_KEY = '__filmMemoV4';
const store = globalThis as typeof globalThis & { [MEMO_KEY]?: Memo };

/**
 * The fallback (the picks failed): the landing grid's newest 13 — A the first named card with a cover, alone; the
 * end's list the landing grid's own, its newest six.
 */
export async function fallbackModel(db: Firestore): Promise<FilmModel> {
  const latest = await latestForLanding(db, 13);
  const written = latest.cards.find((c) => !c.anonymous && c.media?.type === 'image' && c.media.url && latest.authors[c.authorId]) ?? null;
  const sky = latest.cards.filter((c) => c.id !== written?.id).slice(0, SKY_MAX);
  const picks = latest.cards.filter((c) => c.trashedAt == null && (c.anonymous === true || latest.authors[c.authorId])).slice(0, PICKS);
  return toModel({ written, answer: null, relation: 'alone', sky, picks, authors: latest.authors });
}

/**
 * The film's cards for a render. One run takes 1–2 s and about 150 reads, so the answer is kept for 10 minutes within
 * the Taipei day (dev re-renders on every reload). On a throw or null: `[film] picks failed`, then the fallback; with
 * no cards at all, A is drawn too.
 */
export async function loadFilm(_locale: string, now: Date = new Date()): Promise<FilmModel> {
  const day = taipeiDayIndex(now);
  const memo = store[MEMO_KEY];
  if (memo && memo.day === day && now.getTime() - memo.at < memo.ttl) return memo.model;
  const db = getAdminDb();
  let model: FilmModel;
  let ttl = MEMO_MS;
  try {
    const f = await filmCards(db, { storageBases: filmBases(), now });
    if (!f) throw new Error('no picks');
    model = toModel({ written: f.written, answer: f.answer, relation: f.relation, sky: f.sky, picks: f.picks, authors: f.authors });
  } catch (error) {
    console.warn('[film] picks failed', error instanceof Error ? error.message : error);
    ttl = FALLBACK_MS;
    try {
      model = await fallbackModel(db);
    } catch (e) {
      console.warn('[film] fallback failed', e instanceof Error ? e.message : e);
      model = { a: null, b: null, relation: 'alone', sky: [], picks: [] };
    }
  }
  store[MEMO_KEY] = { day, at: now.getTime(), ttl, model };
  return model;
}
