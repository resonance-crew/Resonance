import { purgeTapRowsIn, pushTapIn, ringTapIn, untapBellIn, type TapRing } from '@/server/app/pushTap';
import { fromPushSender, type PushSender } from '@/server/infra/fcm/push';
import { ctxFor } from '@/server/infra/firestore/ctx';
import type { AdminDb } from '@/server/infra/firestore/db';
import { NOTIFICATIONS } from '@/server/infra/firestore/repos/bell';
import type { PushResult } from './send';

export { TAP_NOTE_WINDOW_MS, noteRidesTap, tapCollapseKey } from './tapCollapse';
export { everyAppDraws } from './bellCapability';
export { BELL_TAP_CAPABILITY, TAP_BELL, TAP_ROW_MAX, tapBellId, tapDay, withTapper, withoutTapper } from '@/server/domain/push/tap';
export { tapText } from '@/server/domain/push/text';
export type { TapRing } from '@/server/app/pushTap';

/**
 * What a resonance tap (共振, lib/api/v1/taps) tells the card's author: once
 * per reader and card, ever (`rangAt` on the tap), after the PUT's response
 * and in a transaction of its own that reads the card and both directions of
 * the blocks again — across a block, on an anonymous card as on a named one,
 * nothing reaches the author (and the reader's answer never waited on that).
 *
 * **The bell row** `notifications/rtap_{cardId}_{yyyymmdd}` (one per card per
 * UTC day) = `{ userId, type: 'resonance_tap', payload: { cardId, fromUserIds
 * (newest first, ≤ 20), anonymous?: true }, readAt, createdAt, pushedAt }`:
 * made by the day's first ring, each later ring that day adding its reader in
 * front (and marking the row unread and new again). Written already pushed —
 * the push below is its own. A tap taken back takes its reader out of the
 * row, and a row left with no one is deleted; the account purge does the same
 * for a purged reader (`array-contains`, then `arrayRemove`). Opens the card,
 * named or anonymous alike — never a thread.
 *
 * App builds made before the row draw a bell type they don't know as its raw
 * string, so the row is written only when every app install the author has
 * registered declares `bell-tap` (`PUT /me/devices` capabilities); someone with
 * no app install (the web alone) gets it.
 *
 * **The push**: always (the installed builds open a push's `route`), unless the
 * author turned 有人共振 off (`notificationSettings.resonanceTaps`). Worded by
 * the server — 「{handle} 與你的卡片共振了」, or 「{handle} 和另外 {count} 人…」
 * with that day's row — in each device's language, the reader's pen name as it
 * is now. One per new ring at most, under the card's collapse id / Android tag
 * `rtap_{cardId}`, so the lock screen keeps one line per card; a note the same
 * reader leaves on the card within TAP_NOTE_WINDOW_MS rides that same id
 * (lib/push/chat, ./send), and a ring within that time after a note of theirs
 * there pushes nothing, so the lock screen keeps the note's words.
 *
 * The services are src/server/app/pushTap; these keep the old signatures.
 */

/** Ring the author of `cardId` for `uid`'s tap, once ever. Answers what to push, or null when nothing rang. */
export function ringTap(db: AdminDb, uid: string, cardId: string, now = Date.now()): Promise<TapRing | null> {
  return ringTapIn(ctxFor(db), uid, cardId, now);
}

/** A tap taken back: its reader leaves the bell row their ring wrote, and a row left with no one goes. */
export function untapBell(db: AdminDb, uid: string, cardId: string): Promise<void> {
  return untapBellIn(ctxFor(db), uid, cardId);
}

/** Push a tap's ring to the author's devices (after ringTap). */
export function pushTap(db: AdminDb, sender: PushSender, ring: TapRing & { from: string; cardId: string }, now = Date.now()): Promise<PushResult | null> {
  return pushTapIn(ctxFor(db, { push: fromPushSender(sender) }), ring, now);
}

/** The bell rows a purged reader is still named in (`payload.fromUserIds`), for the account purge. */
export function tapRowsNaming(db: AdminDb, uid: string) {
  return db.collection(NOTIFICATIONS).where('payload.fromUserIds', 'array-contains', uid);
}

/** Take a purged reader out of every row naming them (one transaction each, deleting a row left empty). */
export function purgeTapRows(db: AdminDb, uid: string): Promise<number> {
  return purgeTapRowsIn(ctxFor(db), uid);
}
