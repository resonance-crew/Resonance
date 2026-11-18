import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import { tapRef } from '@/lib/api/v1/taps';

/**
 * One line per card on the author's lock screen when a reader both taps 共振
 * and leaves a note (lib/push/tapBell): the tap's push goes under the card's
 * collapse id / Android tag `rtap_{cardId}`, and a note the same reader leaves
 * on the card within TAP_NOTE_WINDOW_MS of that ring rides the same id
 * (lib/push/chat for a named card's note, ./send for an anonymous card's), so
 * the note's words replace the tap's line. Kept apart from ./tapBell so the
 * senders it touches don't import each other.
 */

/** A note and a tap of the same reader on the same card this close together share one line on the lock screen. */
export const TAP_NOTE_WINDOW_MS = 10 * 60 * 1000;

/** The card's collapse id and Android tag (null when it would pass APNs' 64 bytes, or isn't plain). */
export function tapCollapseKey(cardId: string): string | null {
  const key = `rtap_${cardId}`;
  return /^[A-Za-z0-9_-]+$/.test(cardId) && key.length <= 64 ? key : null;
}

/**
 * Whether a note `from` leaves on `cardId` at `at` (ms) rides their tap's
 * collapse id: their tap on the card rang at most TAP_NOTE_WINDOW_MS before.
 * The key, or null. A failed read rides nothing.
 */
export async function noteRidesTap(db: Firestore, from: string, cardId: string, at: number): Promise<string | null> {
  const key = tapCollapseKey(cardId);
  if (!key || !from || from.includes('/')) return null;
  try {
    const rangAt = (await tapRef(db, cardId, from).get()).get('rangAt');
    if (!(rangAt instanceof Timestamp)) return null;
    const since = at - rangAt.toMillis();
    return since >= 0 && since <= TAP_NOTE_WINDOW_MS ? key : null;
  } catch (e) {
    console.error('[push] tap: collapse', cardId, e);
    return null;
  }
}
