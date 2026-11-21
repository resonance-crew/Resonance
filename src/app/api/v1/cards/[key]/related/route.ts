import { parse, routeParam, withUser, type RouteContext } from '@/lib/api/v1/http';
import { CardIdParam } from '@/lib/api/v1/schemas';
import { serverCtx } from '@/server/ctx';
import { getRelated } from '@/server/app/cardsRead';
import { BRIEF, cachedJson } from '@/lib/api/v1/cache';

export const dynamic = 'force-dynamic';

/** GET /api/v1/cards/{id}/related — a few recent cards sharing its tags. */
export const GET = withUser(async (user, req, ctx: RouteContext<'key'>) => {
  const id = parse(CardIdParam, await routeParam(ctx, 'key'));
  return cachedJson(req, await getRelated(serverCtx(), user.id, id), BRIEF);
});
