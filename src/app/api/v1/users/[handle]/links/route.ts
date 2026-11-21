import { parse, routeParam, withUser, type RouteContext } from '@/lib/api/v1/http';
import { HandleParam } from '@/lib/api/v1/schemas';
import { serverCtx } from '@/server/ctx';
import { getProfileLinks } from '@/server/app/cardsRead';
import { BRIEF, cachedJson } from '@/lib/api/v1/cache';

export const dynamic = 'force-dynamic';

/** GET /api/v1/users/{handle}/links — cards by others that link to theirs. */
export const GET = withUser(async (user, req, ctx: RouteContext<'handle'>) => {
  const handle = parse(HandleParam, await routeParam(ctx, 'handle'));
  return cachedJson(req, await getProfileLinks(serverCtx(), user.id, handle), BRIEF);
});
