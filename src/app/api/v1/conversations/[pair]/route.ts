import { NextResponse } from 'next/server';
import { parse, routeParam, withUser, type RouteContext } from '@/lib/api/v1/http';
import { ConversationIdParam } from '@/lib/api/v1/schemas';
import { OWN, cachedJson } from '@/lib/api/v1/cache';
import { serverCtx } from '@/server/ctx';
import { deleteConversationIn } from '@/server/app/conversations';
import { getConversationIn } from '@/server/app/inbox';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/conversations/{pair} — one of the viewer's conversations, as the
 * list shows it (what the thread's `conversations/{pair}` listener read: the
 * letter, the viewer's unread count). 404 for anyone but its participants,
 * whether it exists or not.
 */
export const GET = withUser(async (user, req, ctx: RouteContext<'pair'>) => {
  const pair = parse(ConversationIdParam, await routeParam(ctx, 'pair'));
  return cachedJson(req, await getConversationIn(serverCtx(), user.id, pair), OWN);
});

/**
 * DELETE /api/v1/conversations/{pair} — the whole conversation, for both of
 * its people (see deleteConversation). Clients delete through here; the rules
 * still take a participant's deletes of the messages, then the conversation,
 * from the builds that deleted it from the client.
 */
export const DELETE = withUser(async (user, _req, ctx: RouteContext<'pair'>) => {
  const pair = parse(ConversationIdParam, await routeParam(ctx, 'pair'));
  await deleteConversationIn(serverCtx(), user.id, pair);
  return new NextResponse(null, { status: 204 });
});
