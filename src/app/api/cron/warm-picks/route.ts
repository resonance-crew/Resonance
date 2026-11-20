import { NextResponse } from 'next/server';
import { recommendFeed } from '@/lib/recommend/funnel';
import { refreshPoolStats } from '@/lib/recommend/poolStats';
import { currentEmbedModel } from '@/lib/recommend/indexCard';
import { cronAuthorized } from '@/lib/api/cronAuth';
import { warmPicksIn } from '@/server/app/recommendWarm';
import { serverCtx } from '@/server/ctx';

export const dynamic = 'force-dynamic';
// Pinned to hnd1 in vercel.json: the builds call OpenAI, which refuses Hong Kong.
export const maxDuration = 300;

/**
 * How long a run starts builds: maxDuration less the longest a build takes
 * (two LLM steps that time out at 20 + 25 s, and their reads), so none is cut
 * off half way. Readers not reached are built when they next ask.
 */
const WARM_BUDGET_MS = (maxDuration - 60) * 1000;
/**
 * When every build must be done, whenever it started: maxDuration less a few
 * seconds to store the last ones and answer. A build that can't finish by
 * then fails like any other (and the reader's picks are built when they ask).
 */
const BUILD_DEADLINE_MS = (maxDuration - 5) * 1000;

/**
 * Daily warm-up of tonight's picks (vercel.json: 11:00 UTC, an hour before
 * /api/cron/push-picks; see lib/recommend/warm), after the pool's numbers
 * are worked out again (lib/recommend/poolStats). Vercel Cron sends
 * `Authorization: Bearer $CRON_SECRET`; anyone else, and everyone while the
 * secret is unset, is refused.
 */
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const started = Date.now();
  // First the pool's numbers (lib/recommend/poolStats: μ, r(x), τ — no model), which today's builds then use.
  const pool = await refreshPoolStats(currentEmbedModel()).catch((e) => (console.error('[warm-picks] pool stats', e), null));
  const run = await warmPicksIn(serverCtx(), { deadline: started + WARM_BUDGET_MS, buildDeadline: started + BUILD_DEADLINE_MS, build: recommendFeed });
  console.log('[warm-picks]', JSON.stringify({ pool, ...run }));
  return NextResponse.json({ pool, ...run });
}
