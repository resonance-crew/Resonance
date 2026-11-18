import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/db/firestore/admin';
import { runReadSummary } from '@/lib/push/readSummary';
import { cronAuthorized } from '@/lib/api/cronAuth';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** How long a run starts cards: maxDuration less a margin for the one under way (the rest wait a week). */
const SUMMARY_BUDGET_MS = (maxDuration - 30) * 1000;

/**
 * Weekly "people read your card to the end" (vercel.json: Mondays 01:00 UTC =
 * 09:00 Taipei; see lib/push/readSummary): bell rows only, for cards three or
 * more readers read to the end in the past seven days, never naming them.
 * Nothing here reaches the LLM, so it runs beside Firestore in Hong Kong.
 * Vercel Cron sends `Authorization: Bearer $CRON_SECRET`; anyone else, and
 * everyone while the secret is unset, is refused.
 */
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const started = Date.now();
  const run = await runReadSummary(getAdminDb(), { now: started, deadline: started + SUMMARY_BUDGET_MS });
  console.log('[read-summary]', JSON.stringify(run));
  return NextResponse.json(run);
}
