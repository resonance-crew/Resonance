import { parse, withUser } from '@/lib/api/v1/http';
import { CardBoxShelvesQuery } from '@/lib/api/v1/schemas';
import { serverCtx } from '@/server/ctx';
import { getCardBoxShelves } from '@/server/app/cardsRead';
import { OWN, cachedJson } from '@/lib/api/v1/cache';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/me/cardbox?shelves=published,private,draft — several shelves of
 * the viewer's card box in one request, each exactly what /me/cards?tab=
 * answers.
 */
export const GET = withUser(async (user, req) => {
  const { shelves } = parse(CardBoxShelvesQuery, Object.fromEntries(new URL(req.url).searchParams));
  return cachedJson(req, await getCardBoxShelves(serverCtx(), user.id, shelves), OWN);
});
