import { parse, withUser } from '@/lib/api/v1/http';
import { OWN, cachedJson } from '@/lib/api/v1/cache';
import { BellQuery } from '@/lib/api/v1/schemas';
import { serverCtx } from '@/server/ctx';
import { listBellIn } from '@/server/app/inbox';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/me/bell — the viewer's bell rows, newest first, 20 a page (what
 * the clients' `notifications` listener read), with the profiles of the
 * people they name. An unchanged page answers 304 to its ETag.
 */
export const GET = withUser(async (user, req) => {
  const q = parse(BellQuery, Object.fromEntries(new URL(req.url).searchParams));
  return cachedJson(req, await listBellIn(serverCtx(), user.id, q.limit, q.pageToken), OWN);
});
