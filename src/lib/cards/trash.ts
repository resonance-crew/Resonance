/**
 * The trash's clock, shared by the server and the browser (no firebase-admin
 * here). A card moved to the trash keeps `trashedAt` (the server's time when
 * it went in) and is purged TRASH_DAYS later by the daily cron
 * (/api/cron/purge-trash). The purge date is computed, never stored, and a
 * card past it is gone to its owner too — off the trash shelf, refused to
 * restore, not found in the writer and on its page — even before the cron
 * reaches it, so a cron running late never stretches the promise.
 */

export const TRASH_DAYS = 30;
export const DAY_MS = 86_400_000;

type Instant = Date | number;
const ms = (t: Instant) => (typeof t === 'number' ? t : t.getTime());

/** When a card moved to the trash at `trashedAt` is deleted for good. */
export function purgeAtOf(trashedAt: Instant): Date {
  return new Date(ms(trashedAt) + TRASH_DAYS * DAY_MS);
}

/** Whether a card moved to the trash at `trashedAt` is past its purge date at `now`. */
export function trashExpired(trashedAt: Instant, now: Instant = Date.now()): boolean {
  return purgeAtOf(trashedAt).getTime() <= ms(now);
}

/**
 * What the trash says of a card's time left: `lastDay` within its last day
 * (「一天內永久刪除」), else whole days, rounded up, never fewer than one
 * (「{count} 天後永久刪除」).
 */
export function daysLeft(purgeAt: Instant, now: Instant = Date.now()): { lastDay: boolean; days: number } {
  const left = ms(purgeAt) - ms(now);
  return { lastDay: left <= DAY_MS, days: Math.max(1, Math.ceil(left / DAY_MS)) };
}

/** The visibilities a card in the trash can come back as (its `trashedFrom.visibility`). */
export type TrashedVisibility = 'public' | 'connections' | 'private';

/**
 * Where a card in the trash came from, as the server parked it: the
 * visibility it comes back with, and the card it answered (put back on
 * restore, unless that would break the one-card-per-original rule).
 */
export interface TrashedFrom {
  visibility: TrashedVisibility;
  referenceCardId: string | null;
}

/** A stored visibility the trash can restore (anything else comes back private, as the rules read it). */
export function restorableVisibility(v: unknown): TrashedVisibility {
  return v === 'public' || v === 'connections' || v === 'private' ? v : 'private';
}
