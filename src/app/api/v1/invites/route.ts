import { parse, withUser } from '@/lib/api/v1/http';
import { OWN, cachedJson } from '@/lib/api/v1/cache';
import { InvitesQuery } from '@/lib/api/v1/schemas';
import { serverCtx } from '@/server/ctx';
import { incomingInvitesIn } from '@/server/app/social';

export const dynamic = 'force-dynamic';

/** GET /api/v1/invites?box=incoming — the legacy invites waiting for your answer, the latest first. */
export const GET = withUser(async (user, req) => {
  parse(InvitesQuery, Object.fromEntries(new URL(req.url).searchParams));
  return cachedJson(req, await incomingInvitesIn(serverCtx(), user.id), OWN);
});
