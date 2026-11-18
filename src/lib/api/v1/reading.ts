import { Timestamp, type DocumentData, type Firestore } from 'firebase-admin/firestore';
import { mapCard } from '@/lib/db/firestore/mapper';
import { isReservedId } from '@/lib/db/firestore/reservedId';
import { readSeconds } from '@/lib/readTime';
import { spend } from '@/lib/api/rateLimit';
import { ApiFailure } from './http';
import { CARD_VISIBILITY_FIELDS, canView } from './present';
import type { ReadingReportInput } from './schemas';

/**
 * How a reader read a card (round 26 §R3): the reading reports the card page
 * sends as it is left (POST /api/v1/cards/{id}/reading), kept for one purpose
 * — picking cards for that reader (the recommender's taste, run 2) — and, as
 * a weekly count of three or more with no names, for the card's author
 * (lib/push/readSummary). Never anyone's name to anyone.
 *
 * `readerSignals/{uid}_{cardId}` (server-only: the rules refuse every client
 * read and write) = `{ userId, cardId, firstAt, lastAt, days (the UTC days it
 * was read, ≤ 60), sessions (the last 5 page views: { id, active, progress,
 * startedAt, at, endSeen, end, rereadable, reread }), activeSeconds,
 * maxProgress, reachedEndAt, rereads, rereadAt, shared, reportDay,
 * reportsToday, expireAt }`. `expireAt` is 180 days after the last read, for
 * the Firestore TTL policy on the collection (firestore.indexes.json): a card
 * not opened again for half a year leaves nothing behind. Deleted with the
 * reader's account and with the card (deleteCard, the purge's `byCard`).
 *
 * A report holds its page view's running totals (`session` is that view's id):
 * the server keeps the largest seconds and progress each session has said and
 * adds sessions up — a report sent twice, or every few seconds, counts once.
 * Timestamps are the server's. What a client says is clamped: progress to
 * 0…1, active seconds to three times the story's reading time (readSeconds,
 * unrounded) plus ten minutes. At most REPORTS_PER_CARD_DAY reports a reader
 * and card a UTC day are kept, and every kept report spends the `readReport`
 * budget; past either, reports go unkept.
 *
 * - **Read to the end**: a session whose end came into view (`reachedEnd`)
 *   with at least END_ACTIVE_SHARE of the reading time spent (`reachedEndAt`,
 *   the latest such session's time) — a short card whose end shows at once is
 *   not read to the end before then.
 * - **A re-read**: a session starting at least REREAD_GAP_MS after the one
 *   before it ended, once it is REREAD_PROGRESS of the way through (`rereads`,
 *   `rereadAt`).
 *
 * Who is counted is what POST …/read counts (./cardReads): a signed-in reader
 * other than the author, of a card they may read — published, out of the
 * trash, public or connected —, never a named card across a block either way,
 * an anonymous card whoever was blocked. Whatever happens the caller is
 * answered the same 204, so asking says nothing about a card.
 */
export const READER_SIGNALS = 'readerSignals';

/** How long a reading record outlives the reader's last read of the card. */
export const SIGNAL_KEEP_DAYS = 180;
/** Reports a reader's reading of one card may keep in a UTC day. */
export const REPORTS_PER_CARD_DAY = 20;
/** The UTC days of reading a record keeps. */
export const DAYS_KEPT = 60;
/** The page views a record keeps (the latest). */
export const SESSIONS_KEPT = 5;
/** How long after a session another one starts to count as coming back. */
export const REREAD_GAP_MS = 12 * 60 * 60 * 1000;
/** How far a session coming back has to read to be a re-read. */
export const REREAD_PROGRESS = 0.3;
/** The share of the reading time a session that reached the end must have spent to have read it to the end. */
export const END_ACTIVE_SHARE = 0.4;
/** A session's seconds are clamped to this many times the reading time… */
export const ACTIVE_FACTOR = 3;
/** …plus this many seconds. */
export const ACTIVE_SLACK_SECONDS = 600;

const DAY_MS = 24 * 60 * 60 * 1000;

export const signalRef = (db: Firestore, uid: string, cardId: string) => db.collection(READER_SIGNALS).doc(`${uid}_${cardId}`);

/** One page view, as a record keeps it (times in ms). */
export interface SessionState {
  id: string;
  /** The largest active seconds the session has reported. */
  active: number;
  /** The furthest it read, 0…1. */
  progress: number;
  startedAt: number;
  /** Its latest report. */
  at: number;
  /** It reported its end in view. */
  endSeen: boolean;
  /** It read the card to the end (endSeen with the time for it). */
  end: boolean;
  /** It started REREAD_GAP_MS after the session before it. */
  rereadable: boolean;
  /** It counted as a re-read. */
  reread: boolean;
}

/** A reader's record of one card (times in ms). */
export interface SignalState {
  firstAt: number;
  lastAt: number;
  days: string[];
  sessions: SessionState[];
  activeSeconds: number;
  maxProgress: number;
  reachedEndAt: number | null;
  rereads: number;
  rereadAt: number | null;
  shared: boolean;
  reportDay: string;
  reportsToday: number;
}

/** The UTC day `ms` falls on, as YYYY-MM-DD. */
export const utcDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

const finite = (n: unknown): number => (typeof n === 'number' && Number.isFinite(n) ? n : 0);
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** The most active seconds a session of a story `expectedSeconds` long may report. */
export const activeCap = (expectedSeconds: number) => Math.max(0, finite(expectedSeconds)) * ACTIVE_FACTOR + ACTIVE_SLACK_SECONDS;

/**
 * `report` folded into the record `prev` (null: the first) at `now`, for a
 * story read in `expectedSeconds` — or null when it is not kept (the day's
 * REPORTS_PER_CARD_DAY are in). Pure: everything the module comment says a
 * report does to a record happens here.
 */
export function foldReading(
  prev: SignalState | null,
  report: Pick<ReadingReportInput, 'session' | 'activeSeconds' | 'progress' | 'reachedEnd' | 'shared'>,
  now: number,
  expectedSeconds: number,
): SignalState | null {
  const day = utcDay(now);
  const reportsToday = prev && prev.reportDay === day ? prev.reportsToday : 0;
  if (reportsToday >= REPORTS_PER_CARD_DAY) return null;
  const expected = Math.max(0, finite(expectedSeconds));
  const active = clamp(finite(report.activeSeconds), 0, activeCap(expected));
  const progress = clamp(finite(report.progress), 0, 1);
  const sessions = prev?.sessions ?? [];
  const known = sessions.find((s) => s.id === report.session);
  let session: SessionState;
  let added: number;
  if (known) {
    // A running total: the largest the session has said, whatever order its reports arrive in.
    const most = Math.max(known.active, active);
    added = most - known.active;
    session = { ...known, active: most, progress: Math.max(known.progress, progress), at: Math.max(known.at, now), endSeen: known.endSeen || report.reachedEnd };
  } else {
    const before = sessions.reduce<number | null>((latest, s) => (latest === null || s.at > latest ? s.at : latest), null);
    added = active;
    session = {
      id: report.session,
      active,
      progress,
      startedAt: now,
      at: now,
      endSeen: report.reachedEnd,
      end: false,
      rereadable: before !== null && now - before >= REREAD_GAP_MS,
      reread: false,
    };
  }
  let rereads = prev?.rereads ?? 0;
  let rereadAt = prev?.rereadAt ?? null;
  let reachedEndAt = prev?.reachedEndAt ?? null;
  if (session.rereadable && !session.reread && session.progress >= REREAD_PROGRESS) {
    session.reread = true;
    rereads += 1;
    rereadAt = now;
  }
  if (!session.end && session.endSeen && session.active >= expected * END_ACTIVE_SHARE) {
    session.end = true;
    reachedEndAt = now;
  }
  const others = sessions.filter((s) => s.id !== session.id);
  const kept = [...others, session].sort((a, b) => a.at - b.at).slice(-SESSIONS_KEPT);
  const days = (prev?.days ?? []).includes(day) ? (prev?.days ?? []) : [...(prev?.days ?? []), day].sort().slice(-DAYS_KEPT);
  return {
    firstAt: prev?.firstAt ?? now,
    lastAt: now,
    days,
    sessions: kept,
    activeSeconds: (prev?.activeSeconds ?? 0) + added,
    maxProgress: Math.max(prev?.maxProgress ?? 0, progress),
    reachedEndAt,
    rereads,
    rereadAt,
    shared: (prev?.shared ?? false) || report.shared === true,
    reportDay: day,
    reportsToday: reportsToday + 1,
  };
}

const ms = (v: unknown): number | null => (v instanceof Timestamp ? v.toMillis() : typeof v === 'number' && Number.isFinite(v) ? v : null);
const ts = (n: number) => Timestamp.fromMillis(n);

/** A stored record as the fold reads it (anything odd read as absent). */
export function signalState(data: DocumentData | undefined): SignalState | null {
  if (!data) return null;
  const sessions: SessionState[] = Array.isArray(data.sessions)
    ? data.sessions
        .filter((s: unknown): s is DocumentData => !!s && typeof s === 'object' && typeof (s as DocumentData).id === 'string')
        .map((s: DocumentData) => ({
          id: s.id,
          active: finite(s.active),
          progress: clamp(finite(s.progress), 0, 1),
          startedAt: ms(s.startedAt) ?? 0,
          at: ms(s.at) ?? 0,
          endSeen: s.endSeen === true,
          end: s.end === true,
          rereadable: s.rereadable === true,
          reread: s.reread === true,
        }))
    : [];
  return {
    firstAt: ms(data.firstAt) ?? 0,
    lastAt: ms(data.lastAt) ?? 0,
    days: Array.isArray(data.days) ? data.days.filter((d: unknown): d is string => typeof d === 'string') : [],
    sessions,
    activeSeconds: Math.max(0, finite(data.activeSeconds)),
    maxProgress: clamp(finite(data.maxProgress), 0, 1),
    reachedEndAt: ms(data.reachedEndAt),
    rereads: Math.max(0, Math.floor(finite(data.rereads))),
    rereadAt: ms(data.rereadAt),
    shared: data.shared === true,
    reportDay: typeof data.reportDay === 'string' ? data.reportDay : '',
    reportsToday: Math.max(0, Math.floor(finite(data.reportsToday))),
  };
}

/** A record as stored (server Timestamps). */
export function signalDoc(uid: string, cardId: string, s: SignalState): DocumentData {
  return {
    userId: uid,
    cardId,
    firstAt: ts(s.firstAt),
    lastAt: ts(s.lastAt),
    days: s.days,
    sessions: s.sessions.map((x) => ({ ...x, startedAt: ts(x.startedAt), at: ts(x.at) })),
    activeSeconds: s.activeSeconds,
    maxProgress: s.maxProgress,
    reachedEndAt: s.reachedEndAt === null ? null : ts(s.reachedEndAt),
    rereads: s.rereads,
    rereadAt: s.rereadAt === null ? null : ts(s.rereadAt),
    shared: s.shared,
    reportDay: s.reportDay,
    reportsToday: s.reportsToday,
    expireAt: ts(s.lastAt + SIGNAL_KEEP_DAYS * DAY_MS),
  };
}

const idOk = (id: string) => id.length > 0 && !id.includes('/') && !isReservedId(id);

async function blockedEitherWay(db: Firestore, a: string, b: string): Promise<boolean> {
  const [ab, ba] = await db.getAll(db.doc(`users/${a}/blocks/${b}`), db.doc(`users/${b}/blocks/${a}`));
  return ab.exists || ba.exists;
}

/**
 * Keep `viewerId`'s reading report on card `cardId` (see above). Resolves to
 * whether it was kept — for tests and logs only: the route answers 204
 * either way.
 */
export async function reportReading(db: Firestore, viewerId: string, cardId: string, report: ReadingReportInput, now = Date.now()): Promise<boolean> {
  if (!idOk(viewerId) || !idOk(cardId)) return false;
  const cardRef = db.doc(`cards/${cardId}`);
  const ref = signalRef(db, viewerId, cardId);
  const [snap, kept] = await db.getAll(cardRef, ref, { fieldMask: [...CARD_VISIBILITY_FIELDS, 'story', 'reportDay', 'reportsToday'] });
  if (!snap.exists) return false;
  const card = mapCard(snap.id, snap.data()!);
  if (card.authorId === viewerId || !card.publishedAt || card.trashedAt != null) return false;
  if (!(await canView(db, card, viewerId))) return false;
  if (card.anonymous !== true && (await blockedEitherWay(db, viewerId, card.authorId))) return false;
  // The day's reports already in: nothing kept, nothing spent.
  if (kept.exists && kept.get('reportDay') === utcDay(now) && Number(kept.get('reportsToday')) >= REPORTS_PER_CARD_DAY) return false;
  try {
    await spend(db, viewerId, 'readReport', 1, now);
  } catch (err) {
    // Over budget the report goes unkept, quietly: a 429 here, and not on the next card, would say this one was readable.
    if (err instanceof ApiFailure && err.code === 'rate_limited') return false;
    throw err;
  }
  const expected = readSeconds(String(card.story ?? ''));
  return db.runTransaction(async (tx) => {
    const [record, [current]] = await Promise.all([tx.get(ref), tx.getAll(cardRef, { fieldMask: ['publishedAt', 'trashedAt'] })]);
    // The card gone or trashed meanwhile.
    if (!current.exists || current.get('trashedAt') != null || current.get('publishedAt') == null) return false;
    const next = foldReading(signalState(record.data()), report, now, expected);
    if (!next) return false;
    tx.set(ref, signalDoc(viewerId, cardId, next));
    return true;
  });
}

/** Every reading record of the card `id`, a batch at a time (deleting the card). */
export async function deleteSignalsOn(db: Firestore, id: string): Promise<void> {
  const signals = db.collection(READER_SIGNALS).where('cardId', '==', id).select().limit(BATCH_MAX);
  for (;;) {
    const page = await signals.get();
    if (page.empty) return;
    const batch = db.batch();
    page.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    if (page.size < BATCH_MAX) return;
  }
}

const BATCH_MAX = 500;
