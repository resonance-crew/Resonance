import { blockHides, cardVisible } from '@/lib/api/v1/present';
import { isReservedId } from '@/lib/db/firestore/reservedId';
import type { Card, RecommendationItem } from '@/lib/db/types';
import { runPool } from '@/lib/push/pool';
import { reasonSafe } from '@/lib/recommend/select';
import type { ServerCtx } from '@/server/ctx';
import { groupByLocale } from '@/server/domain/push/devices';
import { loggedPick, pickGate, recentlyPushed, utcDay } from '@/server/domain/push/picks';
import { dailyWalkStart, type PickLog } from '@/server/domain/push/settings';
import { PICKS_CHANNEL, cardRoute, pickText } from '@/server/domain/push/text';
import { sendAndForget, type PushGroup } from './pushSend';
import { optedInIn } from './pushSettings';

/** Tonight's card (`/api/cron/push-picks`; lib/push/picks tells the story). */

/** Readers pushed at once. */
const CONCURRENCY = 8;

export type PickOutcome = 'sent' | 'opted-out' | 'no-device' | 'opened-today' | 'sent-today' | 'week-cap' | 'no-card' | 'claimed';

export interface PickResult {
  outcome: PickOutcome;
  cardId?: string;
  /** Devices the push service took it for. */
  sent?: number;
}

/** The first pick that may be pushed to the reader now (lib/push/picks), with its reason. */
async function chooseCard(ctx: ServerCtx, uid: string, items: RecommendationItem[], log: PickLog, now: number): Promise<{ card: Card; reason: string } | null> {
  const state = ctx.data.pushState;
  const pushed = recentlyPushed(log, now);
  const order = [...new Map(items.map((i) => [i.cardId, i])).values()].filter((i) => !pushed.has(i.cardId) && !isReservedId(i.cardId));
  if (!order.length) return null;
  const [candidates, blocked, unlisted] = await Promise.all([
    state.getPickCandidates(order.map((i) => i.cardId)),
    state.listBlocked(uid),
    // A card its reading keeps from strangers (round 26 §A1.7) is pushed only by a connection's hand: see below.
    state.unlistedForStrangers(order.map((i) => i.cardId)),
  ]);
  // A blank card (lib/cards/blank) is never pushed: no title, or a story with no words.
  const byId = new Map(candidates.filter((c) => !c.blank && !c.unlisted).map((c) => [c.card.id, c.card]));
  for (const item of order) {
    const card = byId.get(item.cardId);
    if (!card || card.authorId === uid) continue;
    // Published and public now — the recommended feed's own filter (cardVisible), for a public card.
    if (card.visibility !== 'public' || !cardVisible(card, uid, () => false)) continue;
    if (blockHides(card, blocked)) continue;
    // Their block of the reader as well — for a named card only (blockHides says why never an anonymous one).
    if (card.anonymous !== true && (await state.isBlocked(card.authorId, uid))) continue;
    if (await state.answeredWithPublished(uid, card.id)) continue;
    // Not for strangers: only a card by someone the reader is connected with (cold start's first, named only).
    if (unlisted.has(card.id) && (card.anonymous === true || !(await state.connected(uid, card.authorId)))) continue;
    // A stored reason goes on the lock screen only if it tells nothing of what the reader did, nor names a sensitive
    // situation (round 26 §A3.7): otherwise the push's own line.
    const reason = typeof item.reason === 'string' && reasonSafe(item.reason) ? item.reason : '';
    return { card, reason };
  }
  return null;
}

/** Claim tonight's push of `cardId` for the reader, once: false when the log no longer allows it. */
function claimPick(ctx: ServerCtx, uid: string, cardId: string, now: number): Promise<boolean> {
  return ctx.uow.run(
    async (tx) => {
      const log = await tx.pushState.getPickLog(uid);
      if (pickGate(log, now) !== 'ok' || recentlyPushed(log, now).has(cardId)) return false;
      tx.pushState.putPickLog(uid, loggedPick(log, cardId, now));
      return true;
    },
    { label: 'claim pick' },
  );
}

/** Tonight's card for one reader. Throws only when the database or the push service does. */
export async function pushPickIn(ctx: ServerCtx, uid: string, opts: { now?: number } = {}): Promise<PickResult> {
  const now = opts.now ?? ctx.clock.now();
  const state = ctx.data.pushState;
  const [settings, targets, picks, log] = await Promise.all([state.getSettings(uid), state.listDevices(uid), state.getStoredPicks(uid), state.getPickLog(uid)]);
  if (!settings.picks) return { outcome: 'opted-out' };
  if (!targets.length) return { outcome: 'no-device' };
  // They opened their picks themselves today (a warm build ahead of them doesn't count).
  if (picks?.askedOn === utcDay(now)) return { outcome: 'opened-today' };
  const gate = pickGate(log, now);
  if (gate !== 'ok') return { outcome: gate };

  const chosen = picks?.items.length ? await chooseCard(ctx, uid, picks.items, log, now) : null;
  if (!chosen) return { outcome: 'no-card' };
  const { card, reason } = chosen;
  if (!(await claimPick(ctx, uid, card.id, now))) return { outcome: 'claimed', cardId: card.id };

  // No notificationId: no bell row stands behind it (see lib/push/chat on why an empty one is worse than none).
  const data = { type: 'pick', cardId: card.id, route: cardRoute(card) };
  const groups: PushGroup[] = [...groupByLocale(targets)].map(([locale, group]) => ({
    targets: group,
    // One evening's card replaces the last one's.
    message: { ...pickText(locale, String(card.thoughtCore), reason), data, channel: PICKS_CHANNEL, tag: PICKS_CHANNEL, threadId: PICKS_CHANNEL },
  }));
  const { sent } = await sendAndForget(ctx, groups);
  return { outcome: 'sent', cardId: card.id, sent };
}

export interface PickRun {
  /** Readers with the switch on that the run reached. */
  readers: number;
  outcomes: Partial<Record<PickOutcome | 'failed', number>>;
  /** Readers left for lack of time. */
  deferred: number;
}

/**
 * The evening's run: every reader with `picks` on, a few at a time, starting
 * none past `deadline` (ms on `clock`); one reader's failure is logged and
 * the rest go on. The walk starts at the day's point in the user ids
 * (dailyWalkStart) and goes round.
 */
export async function pushPicksIn(ctx: ServerCtx, opts: { now?: number; deadline?: number; clock?: () => number; concurrency?: number } = {}): Promise<PickRun> {
  const clock = opts.clock ?? (() => ctx.clock.now());
  const now = opts.now ?? clock();
  const stop = () => opts.deadline !== undefined && clock() >= opts.deadline;
  const run: PickRun = { readers: 0, outcomes: {}, deferred: 0 };
  const tally = (o: PickOutcome | 'failed') => (run.outcomes[o] = (run.outcomes[o] ?? 0) + 1);
  for await (const uids of optedInIn(ctx, 'picks', { from: dailyWalkStart(now) })) {
    if (stop()) {
      run.deferred += uids.length;
      continue;
    }
    run.readers += uids.length;
    const { notStarted } = await runPool(
      uids,
      opts.concurrency ?? CONCURRENCY,
      (uid) => pushPickIn(ctx, uid, { now }).then((r) => tally(r.outcome), (e) => (tally('failed'), Promise.reject(e))),
      { stop, tag: '[push-picks]' },
    );
    run.readers -= notStarted;
    run.deferred += notStarted;
  }
  if (run.deferred) ctx.log.warn(`[push-picks] out of time: ${run.deferred} readers left (tomorrow's walk starts elsewhere)`);
  return run;
}
