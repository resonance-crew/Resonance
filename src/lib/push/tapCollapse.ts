import { noteRidesTap as noteRidesTapIn } from '@/server/app/pushTapCollapse';
import { ctxFor } from '@/server/infra/firestore/ctx';
import type { AdminDb } from '@/server/infra/firestore/db';

/**
 * One line per card on the author's lock screen when a reader both taps 共振
 * and leaves a note (lib/push/tapBell): the tap's push goes under the card's
 * collapse id / Android tag `rtap_{cardId}`, and a note the same reader leaves
 * on the card within TAP_NOTE_WINDOW_MS of that ring rides the same id
 * (lib/push/chat for a named card's note, ./send for an anonymous card's), so
 * the note's words replace the tap's line. The rules are src/server/domain/push/tap
 * and src/server/app/pushTapCollapse; this keeps the old entry point.
 */
export { TAP_NOTE_WINDOW_MS, tapCollapseKey } from '@/server/domain/push/tap';

/**
 * Whether a note `from` leaves on `cardId` at `at` (ms) rides their tap's
 * collapse id: their tap on the card rang at most TAP_NOTE_WINDOW_MS before.
 * The key, or null. A failed read rides nothing.
 */
export function noteRidesTap(db: AdminDb, from: string, cardId: string, at: number): Promise<string | null> {
  return noteRidesTapIn(ctxFor(db), from, cardId, at);
}
