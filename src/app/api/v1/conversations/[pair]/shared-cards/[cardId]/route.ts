import { NextResponse } from 'next/server';
import { parse, routeParam, withUser, type RouteContext } from '@/lib/api/v1/http';
import { CardIdParam, ConversationIdParam } from '@/lib/api/v1/schemas';
import { serverCtx } from '@/server/ctx';
import { stopSharingIn } from '@/server/app/sharedCards';

export const dynamic = 'force-dynamic';

/**
 * DELETE /api/v1/conversations/{pair}/shared-cards/{cardId} — 停止分享: your
 * messages in this conversation stop sharing your 私人卡 (see stopSharing),
 * any time after they were sent. 204, also when nothing shared it.
 */
export const DELETE = withUser(async (user, _req, ctx: RouteContext<'pair' | 'cardId'>) => {
  const pair = parse(ConversationIdParam, await routeParam(ctx, 'pair'));
  const cardId = parse(CardIdParam, await routeParam(ctx, 'cardId'));
  const server = serverCtx();
  await server.limits.spend(user.id, 'stopShare');
  await stopSharingIn(server, user.id, pair, cardId);
  return new NextResponse(null, { status: 204 });
});
