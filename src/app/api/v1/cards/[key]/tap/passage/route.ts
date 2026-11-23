import { NextResponse } from 'next/server';
import { ApiFailure, parse, routeParam, withUser, type RouteContext } from '@/lib/api/v1/http';
import { CardIdParam, TapPassageRequest } from '@/lib/api/v1/schemas';
import { isReservedId } from '@/lib/db/firestore/reservedId';
import { serverCtx } from '@/server/ctx';
import { budgetFirst } from '@/server/app/conversations';
import { setTapPassageIn } from '@/server/app/taps';

export const dynamic = 'force-dynamic';

/**
 * PUT /api/v1/cards/{id}/tap/passage — which part of the story stayed with
 * you, after you resonated (round 27; lib/api/v1/taps setTapPassage, server/app/taps setTapPassageIn): one of
 * `CardDetail.tap.passages`' ids, or null to clear it. Only the card's author
 * learns it (their list of who resonated). Nothing rings; the tap's own
 * budget. In hkg1 beside Firestore: nothing here reaches a model.
 */
export const PUT = withUser(async (user, req, ctx: RouteContext<'key'>) => {
  const id = parse(CardIdParam, await routeParam(ctx, 'key'));
  const body = await req.json().catch(() => {
    throw new ApiFailure('invalid_request', 'The body must be JSON.');
  });
  const { passage } = parse(TapPassageRequest, body);
  // An id Firestore keeps for itself names no card: answered as one, before it costs any of the budget.
  if (isReservedId(id)) throw new ApiFailure('not_found', 'No such card.');
  const server = serverCtx();
  // The budget answers before anything is written (budgetFirst), spent beside the pick's reads (round 32 §P6).
  const spent = server.limits.spend(user.id, 'tap');
  const result = await budgetFirst(spent, () => setTapPassageIn(server, user.id, id, passage, spent));
  return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
});
