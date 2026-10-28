import { parse, routeParam, withUser, type RouteContext } from '@/lib/api/v1/http';
import { wasSharedPrivately } from '@/lib/api/v1/sharedCards';
import { CardIdParam } from '@/lib/api/v1/schemas';
import { getAdminDb } from '@/lib/db/firestore/admin';
import { OWN, cachedJson } from '@/lib/api/v1/cache';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/cards/{id}/private-shares — whether your card was ever sent
 * privately in a message: the publish step warns before it goes out
 * anonymous (its recipient knows whose it is). Anyone else's card is a 404.
 */
export const GET = withUser(async (user, req, ctx: RouteContext<'key'>) => {
  const id = parse(CardIdParam, await routeParam(ctx, 'key'));
  return cachedJson(req, { sharedPrivately: await wasSharedPrivately(getAdminDb(), user.id, id) }, OWN);
});
