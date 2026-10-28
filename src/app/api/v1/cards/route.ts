import { parse, withUser } from '@/lib/api/v1/http';
import { getCardsByKeys } from '@/lib/api/v1/reads';
import { knowsSharedCards } from '@/lib/api/v1/clientBuild';
import { CardKeysQuery } from '@/lib/api/v1/schemas';
import { getAdminDb } from '@/lib/db/firestore/admin';
import { BRIEF, NEVER, cachedJson } from '@/lib/api/v1/cache';

export const dynamic = 'force-dynamic';

/** GET /api/v1/cards?keys=a,b,c — summaries of several cards (slugs or ids) at once, in the order asked. */
export const GET = withUser(async (user, req) => {
  const { keys } = parse(CardKeysQuery, Object.fromEntries(new URL(req.url).searchParams));
  const body = await getCardsByKeys(getAdminDb(), user.id, keys, { shared: knowsSharedCards(req) });
  // A 私人卡 among them (someone's shared with the viewer — or the viewer's own): read on a pass its author can
  // end at any moment (api/v1/sharedCards), so the answer is never kept.
  const kept = body.cards.some((c) => c.visibility === 'private' || !c.publishedAt);
  return cachedJson(req, body, kept ? NEVER : BRIEF);
});
