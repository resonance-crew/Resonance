import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/db/firestore/admin';
import { purgeExpiredTrash } from '@/lib/api/v1/trash';
import { revalidateLocalized } from '@/lib/api/revalidate';
import { cronAuthorized } from '@/lib/api/cronAuth';

export const maxDuration = 300;

/** How long a run starts work: maxDuration less a margin for the deletes under way. Cards not reached wait for the next run. */
const PURGE_BUDGET_MS = (maxDuration - 30) * 1000;

/**
 * Daily purge of the trash (vercel.json, 02:30 Taipei — half an hour after
 * the account purge): every card in it for 30 days or more is deleted for
 * good (purgeExpiredTrash). Vercel Cron sends `Authorization: Bearer
 * $CRON_SECRET`; any other caller is refused, and so is every caller when the
 * secret is unset.
 */
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const run = await purgeExpiredTrash(getAdminDb(), {
    budgetMs: PURGE_BUDGET_MS,
    // A purged card must not live on in its cached pages.
    revalidate: revalidateLocalized,
  });
  return NextResponse.json({ purged: run.purged, skipped: run.skipped, failed: run.failed, deferred: run.deferred });
}
