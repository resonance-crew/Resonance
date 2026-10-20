import { NextResponse, after } from 'next/server';
import { ApiFailure, parse, routeParam, withUser, type RouteContext } from '@/lib/api/v1/http';
import { restoreCard } from '@/lib/api/v1/trash';
import { CardIdParam } from '@/lib/api/v1/schemas';
import { revalidateLocalized } from '@/lib/api/revalidate';
import { spend } from '@/lib/api/rateLimit';
import { getAdminDb } from '@/lib/db/firestore/admin';
import { isReservedId } from '@/lib/db/firestore/reservedId';
import { ringAfter } from '@/lib/push/ring';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/cards/{id}/restore — bring your card back from the trash as
 * it was (see restoreCard). A resonance that never reached its original's
 * author rings them after the response, once ever; its pages are
 * revalidated then too. Restoring spends a budget of its own: clearing many
 * cards never uses up what their undo needs.
 */
export const POST = withUser(async (user, _req, ctx: RouteContext<'key'>) => {
  const id = parse(CardIdParam, await routeParam(ctx, 'key'));
  if (isReservedId(id)) throw new ApiFailure('not_found', 'No such card.');
  const db = getAdminDb();
  await spend(db, user.id, 'restore');
  const { stale, notificationId, ...result } = await restoreCard(db, user.id, id);
  ringAfter(db, notificationId);
  if (stale.length) after(() => void revalidateLocalized(stale));
  return NextResponse.json(result);
});
