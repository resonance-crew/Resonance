import { NextResponse } from 'next/server';
import { ApiFailure, parse, routeParam, withUser, type RouteContext } from '@/lib/api/v1/http';
import { CardIdParam, UpdateDraftRequest } from '@/lib/api/v1/schemas';
import { isReservedId } from '@/lib/db/firestore/reservedId';
import { serverCtx } from '@/server/ctx';
import { saveDraftIn } from '@/server/app/writer';

export const dynamic = 'force-dynamic';

/** PATCH /api/v1/cards/{id}/draft — an autosave of your draft, ordered by `rev` (see saveDraft). */
export const PATCH = withUser(async (user, req, ctx: RouteContext<'key'>) => {
  const id = parse(CardIdParam, await routeParam(ctx, 'key'));
  // An id Firestore keeps for itself names no card.
  if (isReservedId(id)) throw new ApiFailure('not_found', 'No such card.');
  const body = await req.json().catch(() => {
    throw new ApiFailure('invalid_request', 'The body must be JSON.');
  });
  return NextResponse.json(await saveDraftIn(serverCtx(), user.id, id, parse(UpdateDraftRequest, body)));
});
