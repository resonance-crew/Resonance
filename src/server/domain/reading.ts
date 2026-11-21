/**
 * How a reader read a card, as pure policy (round 26 §R3): what a reading
 * report does to a reader's record of one card. Its store and its reasons are
 * src/lib/api/v1/reading.ts's comment (`readerSignals`); the service is
 * src/server/app/reading.ts.
 */

import type { ReadingReportInput } from '@/lib/api/v1/schemas';

/** A report's fields the fold reads. */
export type ReadingReport = Pick<ReadingReportInput, 'session' | 'activeSeconds' | 'progress' | 'reachedEnd' | 'shared'>;

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

export const DAY_MS = 24 * 60 * 60 * 1000;

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

export const finite = (n: unknown): number => (typeof n === 'number' && Number.isFinite(n) ? n : 0);
export const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

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
  report: ReadingReport,
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
