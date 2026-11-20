/**
 * Pure rules of a tap's ring (共振; lib/push/tapBell and lib/push/tapCollapse
 * re-export these — the story of the row and the push is told there).
 */

export const TAP_BELL = 'resonance_tap';
/** The capability an app build registers once it draws the `resonance_tap` row. */
export const BELL_TAP_CAPABILITY = 'bell-tap';
/** At most this many readers a row keeps (newest first). */
export const TAP_ROW_MAX = 20;

/** The UTC day of `ms`, as yyyymmdd. */
export const tapDay = (ms: number) => new Date(ms).toISOString().slice(0, 10).replace(/-/g, '');
/** The card's bell row for the UTC day of `ms`. */
export const tapBellId = (cardId: string, ms: number) => `rtap_${cardId}_${tapDay(ms)}`;

/** The row's readers with `uid` in front (once), at most TAP_ROW_MAX. */
export function withTapper(fromUserIds: unknown, uid: string): string[] {
  const before = Array.isArray(fromUserIds) ? fromUserIds.filter((id): id is string => typeof id === 'string' && id !== uid) : [];
  return [uid, ...before].slice(0, TAP_ROW_MAX);
}

/** The row's readers without `uid`. */
export function withoutTapper(fromUserIds: unknown, uid: string): string[] {
  return Array.isArray(fromUserIds) ? fromUserIds.filter((id): id is string => typeof id === 'string' && id !== uid) : [];
}

/** A note and a tap of the same reader on the same card this close together share one line on the lock screen. */
export const TAP_NOTE_WINDOW_MS = 10 * 60 * 1000;

/** The card's collapse id and Android tag (null when it would pass APNs' 64 bytes, or isn't plain). */
export function tapCollapseKey(cardId: string): string | null {
  const key = `rtap_${cardId}`;
  return /^[A-Za-z0-9_-]+$/.test(cardId) && key.length <= 64 ? key : null;
}
