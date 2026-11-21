import { NextResponse } from 'next/server';
import { ApiFailure, parse, routeParam, withUser, type RouteContext } from '@/lib/api/v1/http';
import { OWN, cachedJson } from '@/lib/api/v1/cache';
import { CardIdParam, PendingEditRequest } from '@/lib/api/v1/schemas';
import { isReservedId } from '@/lib/db/firestore/reservedId';
import { serverCtx } from '@/server/ctx';
import { deletePendingEditIn, getPendingEditIn, putPendingEditIn } from '@/server/app/writer';

export const dynamic = 'force-dynamic';

async function cardId(ctx: RouteContext<'key'>): Promise<string> {
  const id = parse(CardIdParam, await routeParam(ctx, 'key'));
  // An id Firestore keeps for itself names no card.
  if (isReservedId(id)) throw new ApiFailure('not_found', 'No such card.');
  return id;
}

/** GET /api/v1/cards/{id}/edits/current — your working copy of your card, or `{ edit: null }` (ETag → 304). */
export const GET = withUser(async (user, req, ctx: RouteContext<'key'>) =>
  cachedJson(req, await getPendingEditIn(serverCtx(), user.id, await cardId(ctx)), OWN),
);

/** PUT /api/v1/cards/{id}/edits/current — replace your working copy whole, ordered by `rev` (see putPendingEdit). */
export const PUT = withUser(async (user, req, ctx: RouteContext<'key'>) => {
  const id = await cardId(ctx);
  const body = await req.json().catch(() => {
    throw new ApiFailure('invalid_request', 'The body must be JSON.');
  });
  return NextResponse.json(await putPendingEditIn(serverCtx(), user.id, id, parse(PendingEditRequest, body)));
});

/** DELETE /api/v1/cards/{id}/edits/current — throw your working copy away; the live card stays as it is. */
export const DELETE = withUser(async (user, _req, ctx: RouteContext<'key'>) =>
  NextResponse.json(await deletePendingEditIn(serverCtx(), user.id, await cardId(ctx))),
);
