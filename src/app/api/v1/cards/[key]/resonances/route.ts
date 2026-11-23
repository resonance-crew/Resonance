import { NextResponse } from 'next/server';
import { ApiFailure, parse, routeParam, withUser, type RouteContext } from '@/lib/api/v1/http';
import { CardIdParam, ResonateRequest } from '@/lib/api/v1/schemas';
import { isReservedId } from '@/lib/db/firestore/reservedId';
import { BRIEF, cachedJson } from '@/lib/api/v1/cache';
import { serverCtx } from '@/server/ctx';
import { getResonances } from '@/server/app/cardsRead';
import { budgetFirst } from '@/server/app/budget';
import { ringAfterIn } from '@/server/app/pushAfter';
import { resonateWithIn } from '@/server/app/resonate';

export const dynamic = 'force-dynamic';

/** GET /api/v1/cards/{id}/resonances — public cards written in response to this one. */
export const GET = withUser(async (user, req, ctx: RouteContext<'key'>) => {
  const id = parse(CardIdParam, await routeParam(ctx, 'key'));
  return cachedJson(req, await getResonances(serverCtx(), user.id, id), BRIEF);
});

/**
 * POST /api/v1/cards/{id}/resonances — make one of your published public
 * cards a resonance of this one (see resonateWith). After the response the
 * original author's bell rings (the first time only), and your card's pages
 * are revalidated: their seed names the card it answers.
 */
export const POST = withUser(async (user, req, ctx: RouteContext<'key'>) => {
  const target = parse(CardIdParam, await routeParam(ctx, 'key'));
  const body = await req.json().catch(() => {
    throw new ApiFailure('invalid_request', 'The body must be JSON.');
  });
  const { cardId } = parse(ResonateRequest, body);
  // An id Firestore keeps for itself names no card: answered as one, before it costs any of the budget.
  if (isReservedId(target) || isReservedId(cardId)) throw new ApiFailure('not_found', 'No such card.');
  const server = serverCtx();
  // Spent beside the reads, not before them (round 32 §P6), and still answering first (budgetFirst).
  const spent = server.limits.spend(user.id, 'resonate');
  const { notificationId, stale, ...result } = await budgetFirst(spent, () => resonateWithIn(server, user.id, target, cardId, spent));
  ringAfterIn(server, notificationId);
  if (stale.length) server.later.later(() => void server.pages.revalidate(stale), 'revalidate');
  return NextResponse.json(result);
});
