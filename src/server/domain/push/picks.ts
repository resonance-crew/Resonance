import type { PickLog } from './settings';

/** Pure rules of tonight's card (lib/push/picks re-exports these and tells its story). */

export const PICK_PUSHES = 'pickPushes';
/** Pick pushes a reader gets in any seven days (today and the six before). */
export const PICKS_PER_WEEK = 3;
export const PICK_WEEK_DAYS = 7;
/** A card pushed to a reader isn't pushed to them again for this long. */
export const PICK_REPEAT_DAYS = 30;
/** How many pushed cards the log keeps. */
export const PICK_RECENT_MAX = 30;

export const DAY_MS = 24 * 60 * 60 * 1000;

/** The UTC day of `at`, yyyy-mm-dd — lib/recommend/stored's recommendationDay, the picks' own day. */
export const utcDay = (at: number) => new Date(at).toISOString().slice(0, 10);
const dayOf = utcDay;

/** Whether the log lets one more pick push go at `now`: none yet today (UTC), fewer than three in the seven days ending today. */
export function pickGate(log: PickLog, now: number): 'ok' | 'sent-today' | 'week-cap' {
  const today = dayOf(now);
  if (log.sentAt.some((at) => dayOf(at) === today)) return 'sent-today';
  const weekStart = dayOf(now - (PICK_WEEK_DAYS - 1) * DAY_MS);
  return log.sentAt.filter((at) => dayOf(at) >= weekStart).length >= PICKS_PER_WEEK ? 'week-cap' : 'ok';
}

/** The cards pushed to the reader in the last 30 days. */
export function recentlyPushed(log: PickLog, now: number): Set<string> {
  return new Set(log.recent.filter((r) => now - r.at < PICK_REPEAT_DAYS * DAY_MS).map((r) => r.cardId));
}

/** The log once `cardId` is pushed at `now`: the last 30 days' cards (at most PICK_RECENT_MAX) and the last week's sends. */
export function loggedPick(log: PickLog, cardId: string, now: number): PickLog {
  return {
    recent: [...log.recent.filter((r) => now - r.at < PICK_REPEAT_DAYS * DAY_MS), { cardId, at: now }].slice(-PICK_RECENT_MAX),
    sentAt: [...log.sentAt.filter((at) => now - at < PICK_WEEK_DAYS * DAY_MS), now],
  };
}
