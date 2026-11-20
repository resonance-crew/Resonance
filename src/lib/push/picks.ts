import { pushPickIn, pushPicksIn, type PickResult, type PickRun } from '@/server/app/pushPicks';
import { fromPushSender, type PushSender } from '@/server/infra/fcm/push';
import { ctxFor } from '@/server/infra/firestore/ctx';
import type { AdminDb } from '@/server/infra/firestore/db';

/**
 * "A card for tonight" (`/api/cron/push-picks`, once a day at 12:00 UTC =
 * 20:00 Taipei): for each reader who turned it on, one card from their
 * stored picks (`recommendations/{uid}`), pushed — never a bell row (older
 * clients draw an unknown bell type badly), never the author's name.
 *
 * This module reads the picks; it never builds them (that reaches the LLM:
 * the warm-up cron does it an hour earlier), so the send runs beside
 * Firestore in Hong Kong.
 *
 * A reader is left alone when they have no device, opened their picks
 * themselves today (`askedOn`), already had one today, or had three in the
 * last seven days. The card is the first pick that isn't theirs, isn't one
 * they answered with a published resonance, wasn't pushed to them in the
 * last 30 days, and is still published and public now — and, when it is
 * under its author's name, has no block standing between them either way.
 * A block never touches an anonymous card: one left out for it would say
 * who wrote it.
 *
 * Once only: the push is claimed in `pickPushes/{uid}` in a transaction
 * before anything is sent (`{ recent: [{cardId, at}] ≤ 30, sentAt: [...] the
 * last 7 days }`), so a cron run twice, or two at once, never rings twice.
 *
 * The services are src/server/app/pushPicks; these keep the old signatures.
 */
export { PICK_PUSHES, PICKS_PER_WEEK, PICK_RECENT_MAX, PICK_REPEAT_DAYS, pickGate, recentlyPushed } from '@/server/domain/push/picks';
export type { PickLog } from '@/server/domain/push/settings';
export { PICKS_CHANNEL, PICK_TITLE_CHARS, cardRoute, pickText } from '@/server/domain/push/text';
export { readPickLog } from '@/server/infra/firestore/repos/pushState';
export type { PickOutcome, PickResult, PickRun } from '@/server/app/pushPicks';

/** Tonight's card for one reader. Throws only when Firestore or FCM does. */
export function pushPick(db: AdminDb, uid: string, sender: PushSender, opts: { now?: number } = {}): Promise<PickResult> {
  return pushPickIn(ctxFor(db, { push: fromPushSender(sender) }), uid, opts);
}

/**
 * The evening's run: every reader with `picks` on, a few at a time, starting
 * none past `deadline` (ms on `clock`); one reader's failure is logged and
 * the rest go on. The walk starts at the day's point in the user ids
 * (dailyWalkStart) and goes round, so the readers a run has no time for
 * aren't the same ones every day.
 */
export function pushPicks(
  db: AdminDb,
  sender: PushSender,
  opts: { now?: number; deadline?: number; clock?: () => number; concurrency?: number } = {},
): Promise<PickRun> {
  return pushPicksIn(ctxFor(db, { push: fromPushSender(sender) }), { ...opts, clock: opts.clock ?? Date.now });
}
