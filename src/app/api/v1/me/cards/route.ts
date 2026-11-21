import { parse, withUser } from '@/lib/api/v1/http';
import { CardBoxQuery } from '@/lib/api/v1/schemas';
import { serverCtx } from '@/server/ctx';
import { getCardBox } from '@/server/app/cardsRead';
import { OWN, cachedJson } from '@/lib/api/v1/cache';

export const dynamic = 'force-dynamic';

/** GET /api/v1/me/cards?tab= — one shelf of the viewer's card box. */
export const GET = withUser(async (user, req) => {
  const { tab } = parse(CardBoxQuery, Object.fromEntries(new URL(req.url).searchParams));
  return cachedJson(req, await getCardBox(serverCtx(), user.id, tab), OWN);
});
