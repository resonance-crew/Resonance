/** Pure rules of the weekly read summary (lib/push/readSummary re-exports these and tells its story). */

export const READ_SUMMARY = 'read_summary';
/** The capability an app build registers once it draws the `read_summary` row. */
export const BELL_READ_SUMMARY_CAPABILITY = 'bell-read-summary';
/** Fewer readers than this in a week, and the author hears nothing. */
export const READ_SUMMARY_MIN = 3;
export const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** The run's day, as yyyymmdd. */
const dayOf = (ms: number) => new Date(ms).toISOString().slice(0, 10).replace(/-/g, '');
/** The card's summary row for a run on the UTC day of `ms`. */
export const readSummaryId = (cardId: string, ms: number) => `rsum_${cardId}_${dayOf(ms)}`;

/** A reading record as the week's count needs it. */
export interface WeekRead {
  cardId: string;
  userId: string;
  /** When they last read it to the end (ms). */
  reachedEndAt: number;
  /** When they last came back to read it again (ms), if ever. */
  rereadAt: number | null;
}

export interface WeekTally {
  readers: number;
  reread: boolean;
}

/**
 * The week ending at `now`: each card's distinct readers who read it to the
 * end in [now − 7 days, now), and whether one of them read it again in that
 * time. Pure.
 */
export function weekTally(reads: WeekRead[], now: number): Map<string, WeekTally> {
  const since = now - WEEK_MS;
  const inWeek = (t: number | null) => t !== null && t >= since && t < now;
  const byCard = new Map<string, { readers: Set<string>; reread: boolean }>();
  for (const r of reads) {
    if (!inWeek(r.reachedEndAt)) continue;
    const entry = byCard.get(r.cardId) ?? { readers: new Set<string>(), reread: false };
    entry.readers.add(r.userId);
    entry.reread ||= inWeek(r.rereadAt);
    byCard.set(r.cardId, entry);
  }
  return new Map([...byCard].map(([id, e]) => [id, { readers: e.readers.size, reread: e.reread }]));
}
