import { parse, routeParam, withUser, type RouteContext } from '@/lib/api/v1/http';
import { listTaps } from '@/lib/api/v1/taps';
import { CardIdParam, TapListQuery } from '@/lib/api/v1/schemas';
import { OWN, cachedJson } from '@/lib/api/v1/cache';
import { getAdminDb } from '@/lib/db/firestore/admin';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/cards/{id}/taps?pageToken= — who resonated with a card (共振,
 * the tap), as the viewer may see them: everyone for its author (a page at a
 * time, with the excerpt of a note each left on a named card), the people
 * they are connected with for a reader (see lib/api/v1/taps listTaps). The
 * viewer's own view of who reached them, or of their connections: no-cache.
 */
export const GET = withUser(async (user, req, ctx: RouteContext<'key'>) => {
  const id = parse(CardIdParam, await routeParam(ctx, 'key'));
  const { pageToken } = parse(TapListQuery, Object.fromEntries(new URL(req.url).searchParams));
  return cachedJson(req, await listTaps(getAdminDb(), user.id, id, pageToken), OWN);
});
