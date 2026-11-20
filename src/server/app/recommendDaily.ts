import type { RecommendationItem } from '@/lib/db/types';
import { countShown, readStored, recommendationDay, type StoredRecommendations } from '@/lib/recommend/stored';
import type { ServerCtx } from '@/server/ctx';
import type { PicksWrite } from '@/server/ports/repos/recommend';
import { recommendFeedIn, type FunnelOptions, type FunnelResult } from './recommendFeed';

export { readStored, recommendationDay, type StoredRecommendations };

/**
 * Serving the recommended feed apart from building it. `recommendations/{uid}`
 * keeps the reader's latest result; a request answers from it at once and a
 * new day's build runs after the response, one at a time per reader (a lease
 * taken in a transaction), never more than once an hour after a failure.
 * Only a reader with nothing to show waits for a build — a quick one, inside
 * a budget well under the apps' read timeout.
 *
 * Shared by the web route (/api/recommend/feed) and /api/v1/feed/recommended,
 * and the warm-up cron (/api/cron/warm-picks, warmRecommendationsIn), which
 * builds an opted-in reader's picks ahead of the evening's push through the
 * same lease, store and failure path — marked `warm`, and never counted as
 * the reader asking (`askedOn`, see lib/recommend/stored).
 *
 * The lease is the recommend repo's, not ServerCtx.leases: it is taken only
 * while a build is still due (planServe on the row as the same transaction
 * reads it), which a bare lease can't say. Its field is the one
 * infra/firestore/lease.ts keeps (`leaseUntil` on the reader's row).
 */

/** How long a build holds the reader's document: longer than the routes' maxDuration, so a lease outlives its build. */
export const LEASE_MS = 90_000;
/** After a failed build, none is tried again for this long; the reader keeps what they had. */
export const FAILURE_COOLDOWN_MS = 60 * 60_000;
/** The most a reader with nothing to show waits for a build (the apps give up reading after 10 s). */
export const INLINE_BUDGET_MS = 6_000;
const POLL_MS = 400;

export type RecommendationStatus = 'fresh' | 'stale';

export interface DailyRecommendations {
  items: RecommendationItem[];
  /** Answered from the stored result rather than built in this request. */
  cached: boolean;
  /** 'fresh': today's picks. 'stale': earlier (or quick, unranked) picks while today's are built — ask again later. */
  status: RecommendationStatus;
  /** Today's full build when one is due, for the route to run after its response (`after()`). */
  refresh: (() => Promise<void>) | null;
  /**
   * Records that the reader asked for their picks today (`askedOn`), for the
   * route to run after its response — null when today's ask is on record
   * already (or this request's own build wrote it). The evening's pick push
   * skips a reader who did.
   */
  asked: (() => Promise<void>) | null;
}

export type BuildFeed = (uid: string, opts: FunnelOptions) => Promise<FunnelResult>;

export interface DailyDeps {
  build?: BuildFeed;
  /** The clock, in ms (tests). */
  now?: () => number;
  /** The inline build's budget (tests). */
  budgetMs?: number;
  /** How long to wait between looks while another build holds the lease (tests; POLL_MS). */
  pollMs?: number;
}

export type ServePlan =
  | { kind: 'fresh' }
  /** Something to show now; `rebuild` when a build may start. */
  | { kind: 'stale'; rebuild: boolean }
  /** Nothing to show and no build may start: one is running (wait for it) or failed within the hour. */
  | { kind: 'wait' }
  | { kind: 'cooldown' }
  /** Nothing to show: build now. */
  | { kind: 'build' };

/** How to answer from what is stored, at `nowMs`. */
export function planServe(stored: StoredRecommendations | null, nowMs: number): ServePlan {
  if (stored?.date === recommendationDay(new Date(nowMs)) && !stored.partial) return { kind: 'fresh' };
  const leased = !!stored && stored.leaseUntil > nowMs;
  const cooling = !!stored && nowMs - stored.failedAt < FAILURE_COOLDOWN_MS;
  if (stored && stored.items.length > 0) return { kind: 'stale', rebuild: !leased && !cooling };
  if (leased) return { kind: 'wait' };
  if (cooling) return { kind: 'cooldown' };
  return { kind: 'build' };
}

const buildDue = (p: ServePlan) => p.kind === 'build' || (p.kind === 'stale' && p.rebuild);

/** The default build: the funnel on this context. */
const funnelOn =
  (ctx: ServerCtx): BuildFeed =>
  (uid, opts) =>
    recommendFeedIn(ctx, uid, opts);

/** Take the reader's build lease if a build is (still) due; false when another request holds it or none is due. */
function takeLease(ctx: ServerCtx, uid: string, now: () => number): Promise<boolean> {
  return ctx.uow.run(
    async (tx) => {
      const t = now();
      if (!buildDue(planServe(await tx.recommend.getPicks(uid), t))) return false;
      tx.recommend.putLease(uid, t + LEASE_MS);
      return true;
    },
    { label: 'recommend: lease' },
  );
}

/**
 * Keep a build's result. One the reader asked for records their ask too
 * (`askedOn`); a warm one (the cron's, ahead of them) is marked `warm` and
 * leaves `askedOn` as it was. `served`: the reader is answered with these
 * items now (the inline build), so they count as shown today
 * (lib/recommend/stored countShown).
 */
async function store(ctx: ServerCtx, uid: string, day: string, result: FunnelResult, opts: { warm?: boolean; served?: boolean } = {}) {
  const picks: PicksWrite = { date: day, items: result.items, partial: result.partial, coldStart: result.coldStart === true, warm: opts.warm === true };
  if (!opts.served) return ctx.data.recommend.putPicks(uid, picks);
  return ctx.uow.run(
    async (tx) => {
      const shown = countShown(await tx.recommend.getShown(uid), result.items.map((i) => i.cardId), day);
      tx.recommend.putServedPicks(uid, picks, shown);
    },
    { label: 'recommend: store served' },
  );
}

/**
 * Note that the reader asked for their picks on `day`, and count the ones
 * they were answered with as shown (never throws: it only steers the
 * evening's push and the weights).
 */
function markAsked(ctx: ServerCtx, uid: string, day: string, served: string[]): Promise<void> {
  return ctx.uow
    .run(
      async (tx) => {
        const shown = countShown(await tx.recommend.getShown(uid), served, day);
        tx.recommend.putAsked(uid, day, shown);
      },
      { label: 'recommend: asked' },
    )
    .catch((e) => ctx.log.error('[recommend] recording the ask', e));
}

function recordFailure(ctx: ServerCtx, uid: string, now: () => number, e: unknown) {
  ctx.log.error('[recommend] build failed', e);
  return ctx.data.recommend.putFailure(uid, now()).catch((err) => ctx.log.error('[recommend] recording the failure', err));
}

/** Today's full build (every LLM step, no fallback), run after a response; never throws. */
async function rebuild(ctx: ServerCtx, uid: string, build: BuildFeed, now: () => number): Promise<void> {
  const leased = await takeLease(ctx, uid, now).catch((e) => (ctx.log.error('[recommend] lease', e), false));
  if (!leased) return;
  const day = recommendationDay(new Date(now()));
  try {
    await store(ctx, uid, day, await build(uid, { now }));
  } catch (e) {
    await recordFailure(ctx, uid, now, e);
  }
}

/**
 * A build holds this reader's lease while they have nothing to show: wait
 * for its picks, within the budget. The build may be the warm-up cron's,
 * which records no ask, or may fail — so this request's ask (`asked`) goes on
 * record unless the stored picks show it already.
 */
async function waitForBuild(
  ctx: ServerCtx,
  uid: string,
  now: () => number,
  deadline: number,
  asked: DailyRecommendations['asked'],
  pollMs: number,
): Promise<DailyRecommendations> {
  while (now() + pollMs < deadline) {
    await new Promise((resolve) => setTimeout(resolve, pollMs));
    const stored = await ctx.data.recommend.getPicks(uid);
    const day = recommendationDay(new Date(now()));
    if (stored?.date === day) {
      const status = stored.partial ? 'stale' : 'fresh';
      const servedAsk = () => markAsked(ctx, uid, day, stored.items.map((i) => i.cardId));
      return { items: stored.items, cached: true, status, refresh: null, asked: stored.askedOn === day ? null : asked && servedAsk };
    }
    if (!stored || stored.leaseUntil <= now()) break; // released without a result: it failed
  }
  return { items: [], cached: true, status: 'stale', refresh: null, asked };
}

/**
 * The reader's recommended feed for today (see the top of this file). The
 * caller runs `refresh` after its response when it is set.
 */
export async function dailyRecommendationsIn(ctx: ServerCtx, uid: string, deps: DailyDeps = {}): Promise<DailyRecommendations> {
  const build = deps.build ?? funnelOn(ctx);
  const now = deps.now ?? Date.now;
  const pollMs = deps.pollMs ?? POLL_MS;
  const started = now();
  const deadline = started + (deps.budgetMs ?? INLINE_BUDGET_MS);
  const stored = await ctx.data.recommend.getPicks(uid);
  const plan = planServe(stored, started);
  const refresh = () => rebuild(ctx, uid, build, now);
  const today = recommendationDay(new Date(started));
  // The ask goes on record once a day, after the response (a build of the reader's own writes it too), with what they were shown.
  const askedWith = (items: RecommendationItem[]) => (stored?.askedOn === today ? null : () => markAsked(ctx, uid, today, items.map((i) => i.cardId)));
  const asked = askedWith(stored?.items ?? []);

  switch (plan.kind) {
    case 'fresh':
      return { items: stored!.items, cached: true, status: 'fresh', refresh: null, asked };
    case 'stale':
      return { items: stored!.items, cached: true, status: 'stale', refresh: plan.rebuild ? refresh : null, asked };
    case 'cooldown':
      return { items: [], cached: true, status: 'stale', refresh: null, asked: askedWith([]) };
    case 'wait':
      // A build is under way (another request of theirs, or the warm-up's): wait for it.
      return waitForBuild(ctx, uid, now, deadline, asked, pollMs);
    case 'build':
      break;
  }

  // Nothing to show: build now, in a hurry. Old app builds ask once a day,
  // so an empty answer here would be an empty feed until tomorrow.
  if (!(await takeLease(ctx, uid, now))) return waitForBuild(ctx, uid, now, deadline, asked, pollMs);
  try {
    const result = await build(uid, { deadline, fallback: true, now });
    await store(ctx, uid, recommendationDay(new Date(started)), result, { served: true });
    return {
      items: result.items,
      cached: false,
      status: result.partial ? 'stale' : 'fresh',
      refresh: result.partial ? refresh : null,
      asked: null,
    };
  } catch (e) {
    await recordFailure(ctx, uid, now, e);
    return { items: [], cached: false, status: 'stale', refresh: null, asked: askedWith([]) };
  }
}

export type WarmOutcome = 'built' | 'skipped' | 'failed';

/**
 * The warm-up cron's build of one reader's picks, ahead of the evening's
 * push: today's full build (every LLM step, no fallback) through the same
 * lease, store and failure path as a reader's own — so it never runs beside
 * one of theirs, and none is tried again within the hour after a failure.
 * `skipped` when no build is due (today's picks are there, a build holds the
 * lease, or one failed within the hour). Stored as `warm`, without `askedOn`:
 * the reader didn't open anything. With `deadline` (ms on `now`), the build
 * must be done by then — the cron's own end — or it fails like any other
 * (each LLM step gets what is left, none starts too late). Never throws.
 */
export async function warmRecommendationsIn(
  ctx: ServerCtx,
  uid: string,
  deps: Pick<DailyDeps, 'build' | 'now'> & { deadline?: number } = {},
): Promise<WarmOutcome> {
  const build = deps.build ?? funnelOn(ctx);
  const now = deps.now ?? Date.now;
  const leased = await takeLease(ctx, uid, now).catch((e) => (ctx.log.error('[recommend] lease', e), false));
  if (!leased) return 'skipped';
  const opts: FunnelOptions = deps.deadline === undefined ? { now } : { now, deadline: deps.deadline };
  try {
    await store(ctx, uid, recommendationDay(new Date(now())), await build(uid, opts), { warm: true });
    return 'built';
  } catch (e) {
    await recordFailure(ctx, uid, now, e);
    return 'failed';
  }
}
