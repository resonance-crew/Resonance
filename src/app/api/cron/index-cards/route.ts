import { NextResponse } from 'next/server';
import { cronAuthorized } from '@/lib/api/cronAuth';
import { indexOwedIn } from '@/server/app/recommendIndex';
import { serverCtx } from '@/server/ctx';

export const dynamic = 'force-dynamic';
// Pinned to hnd1 in vercel.json: the readings call OpenAI, which refuses Hong Kong.
export const maxDuration = 300;

/** No reading starts past this: the one under way has its own deadline (INDEX_DEADLINE_MS, 100 s) before the function ends. */
const START_BUDGET_MS = (maxDuration - 110) * 1000;

/**
 * The daily re-reading of owed cards (vercel.json: 10:00 UTC, before the
 * warm-up of tonight's picks; see lib/recommend/indexOwed). Vercel Hobby runs
 * a cron once a day at most (an hourly one fails the deploy). Vercel Cron
 * sends `Authorization: Bearer $CRON_SECRET`; anyone else, and everyone while
 * the secret is unset, is refused.
 */
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const started = Date.now();
  const run = await indexOwedIn(serverCtx(), { deadline: started + START_BUDGET_MS });
  console.log('[index-cards]', JSON.stringify(run));
  return NextResponse.json(run);
}
