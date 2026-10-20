import { NextResponse, after } from 'next/server';
import { ApiFailure, parse, routeParam, withUser, type RouteContext } from '@/lib/api/v1/http';
import { trashCard } from '@/lib/api/v1/trash';
import { CardIdParam } from '@/lib/api/v1/schemas';
import { revalidateLocalized } from '@/lib/api/revalidate';
import { spend } from '@/lib/api/rateLimit';
import { getAdminDb } from '@/lib/db/firestore/admin';
import { isReservedId } from '@/lib/db/firestore/reservedId';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/cards/{id}/trash — move your card to the trash (see
 * trashCard): private to everyone until you restore it, deleted for good in
 * 30 days. Its pages are revalidated after the response.
 */
export const POST = withUser(async (user, _req, ctx: RouteContext<'key'>) => {
  const id = parse(CardIdParam, await routeParam(ctx, 'key'));
  // An id Firestore keeps for itself names no card: answered as one, before it costs any of the budget.
  if (isReservedId(id)) throw new ApiFailure('not_found', 'No such card.');
  const db = getAdminDb();
  await spend(db, user.id, 'trash');
  const { stale, ...result } = await trashCard(db, user.id, id);
  if (stale.length) after(() => void revalidateLocalized(stale));
  return NextResponse.json(result);
});
