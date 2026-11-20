import { NextResponse } from 'next/server';
import { parse, routeParam, withUser, type RouteContext } from '@/lib/api/v1/http';
import { CardIdParam } from '@/lib/api/v1/schemas';
import { serverCtx } from '@/server/ctx';
import { unresonateIn } from '@/server/app/resonate';

export const dynamic = 'force-dynamic';

/**
 * DELETE /api/v1/cards/{id}/resonances/{cardId} — your card stops answering
 * this one and stays, as a card of its own, taking back the connection it
 * made while the two of you have written each other nothing (see
 * unresonate); 204 whether or not it still did.
 */
export const DELETE = withUser(async (user, _req, ctx: RouteContext<'key' | 'cardId'>) => {
  const target = parse(CardIdParam, await routeParam(ctx, 'key'));
  const cardId = parse(CardIdParam, await routeParam(ctx, 'cardId'));
  const server = serverCtx();
  const { stale } = await unresonateIn(server, user.id, target, cardId);
  if (stale.length) server.later.later(() => void server.pages.revalidate(stale), 'revalidate');
  return new NextResponse(null, { status: 204 });
});
