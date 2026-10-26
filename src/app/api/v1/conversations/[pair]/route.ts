import { NextResponse } from 'next/server';
import { parse, routeParam, withUser, type RouteContext } from '@/lib/api/v1/http';
import { deleteConversation } from '@/lib/api/v1/conversations';
import { ConversationIdParam } from '@/lib/api/v1/schemas';
import { getAdminDb } from '@/lib/db/firestore/admin';

export const dynamic = 'force-dynamic';

/**
 * DELETE /api/v1/conversations/{pair} — the whole conversation, for both of
 * its people (see deleteConversation). Clients delete through here; the rules
 * still take a participant's deletes of the messages, then the conversation,
 * from the builds that deleted it from the client.
 */
export const DELETE = withUser(async (user, _req, ctx: RouteContext<'pair'>) => {
  const pair = parse(ConversationIdParam, await routeParam(ctx, 'pair'));
  await deleteConversation(getAdminDb(), user.id, pair);
  return new NextResponse(null, { status: 204 });
});
