import { NextResponse } from 'next/server';
import { ApiFailure, parse, routeParam, withUser, type RouteContext } from '@/lib/api/v1/http';
import { legacyVectors } from '@/lib/api/v1/cards';
import { CardIdParam } from '@/lib/api/v1/schemas';
import { isReservedId } from '@/lib/db/firestore/reservedId';
import { serverCtx } from '@/server/ctx';
import { trashCardIn } from '@/server/app/trash';

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
  const server = serverCtx();
  await server.limits.spend(user.id, 'trash');
  // The vectors as the legacy trashCard reached them (lib/api/v1/cards legacyVectors: the configured store).
  const { stale, ...result } = await trashCardIn(serverCtx({ vectors: legacyVectors() }), user.id, id);
  if (stale.length) server.later.later(() => void server.pages.revalidate(stale), 'revalidate');
  return NextResponse.json(result);
});
