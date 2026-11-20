import { parse, routeParam, withUser, type RouteContext } from '@/lib/api/v1/http';
import { FeedQuery, HandleParam } from '@/lib/api/v1/schemas';
import { serverCtx } from '@/server/ctx';
import { getProfileCards } from '@/server/app/cardsRead';
import { BRIEF, cachedJson } from '@/lib/api/v1/cache';

export const dynamic = 'force-dynamic';

/** GET /api/v1/users/{handle}/cards?limit=&pageToken= (or the older &cursor=) — their public cards, newest first. */
export const GET = withUser(async (user, req, ctx: RouteContext<'handle'>) => {
  const handle = parse(HandleParam, await routeParam(ctx, 'handle'));
  const { limit, cursor, pageToken } = parse(FeedQuery, Object.fromEntries(new URL(req.url).searchParams));
  return cachedJson(req, await getProfileCards(serverCtx(), user.id, handle, limit, { cursor, pageToken }), BRIEF);
});
