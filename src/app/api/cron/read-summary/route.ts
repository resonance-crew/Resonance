import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/db/firestore/admin';
import { runReadSummary } from '@/lib/push/readSummary';
import { cronAuthorized } from '@/lib/api/cronAuth';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** How long a run starts cards: maxDuration less a margin for the one under way (the rest wait a week). */
const SUMMARY_BUDGET_MS = (maxDuration - 30) * 1000;
const HOUR_MS = 3_600_000;

/**
 * Weekly "people read your card to the end" (vercel.json: Mondays 01:00 UTC =
 * 09:00 Taipei; see lib/push/readSummary): bell rows only, for public cards
 * three or more readers read to the end in the past seven days, never naming
 * them.
 * The week ends at the start of the UTC hour the run fires in: Vercel's Hobby
 * plan fires a cron anywhere within its hour, and a week measured from that
 * moment would overlap the last one or leave a gap, so every run covers
 * exactly [Monday 01:00 − 7 days, Monday 01:00).
 * Nothing here reaches the LLM, so it runs beside Firestore in Hong Kong.
 * Vercel Cron sends `Authorization: Bearer $CRON_SECRET`; anyone else, and
 * everyone while the secret is unset, is refused.
 */
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const started = Date.now();
  const run = await runReadSummary(getAdminDb(), { now: Math.floor(started / HOUR_MS) * HOUR_MS, deadline: started + SUMMARY_BUDGET_MS });
  console.log('[read-summary]', JSON.stringify(run));
  return NextResponse.json(run);
}
