import { NextResponse } from 'next/server';
import { parse, routeParam, withUser, type RouteContext } from '@/lib/api/v1/http';
import { ConversationIdParam } from '@/lib/api/v1/schemas';
import { serverCtx } from '@/server/ctx';
import { markConversationReadIn } from '@/server/app/inbox';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/conversations/{pair}/read — the viewer has read the thread:
 * their unread count goes to 0 (the one write the rules let a participant
 * make, `unread.{uid}: 0`). 204; 404 for anyone but its participants.
 */
export const POST = withUser(async (user, _req, ctx: RouteContext<'pair'>) => {
  const pair = parse(ConversationIdParam, await routeParam(ctx, 'pair'));
  const server = serverCtx();
  await server.limits.spend(user.id, 'markRead');
  await markConversationReadIn(server, user.id, pair);
  return new NextResponse(null, { status: 204 });
});
