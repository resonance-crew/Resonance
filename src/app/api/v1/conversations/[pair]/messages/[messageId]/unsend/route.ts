import { NextResponse } from 'next/server';
import { parse, routeParam, withUser, type RouteContext } from '@/lib/api/v1/http';
import { ConversationIdParam, MessageIdParam } from '@/lib/api/v1/schemas';
import { serverCtx } from '@/server/ctx';
import { unsendMessageIn } from '@/server/app/messages';
import { afterMessageUnsentIn } from '@/server/app/pushAfter';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/conversations/{pair}/messages/{messageId}/unsend — unsend a
 * message you sent, within 24 hours (see unsendMessage): 204, also for one
 * already unsent. After the response the recipient's phone is told
 * (pushUnsend), so a lock screen stops showing what it said.
 */
export const POST = withUser(async (user, _req, ctx: RouteContext<'pair' | 'messageId'>) => {
  const pair = parse(ConversationIdParam, await routeParam(ctx, 'pair'));
  const messageId = parse(MessageIdParam, await routeParam(ctx, 'messageId'));
  const server = serverCtx();
  await server.limits.spend(user.id, 'unsend');
  const { push } = await unsendMessageIn(server, user.id, pair, messageId);
  afterMessageUnsentIn(server, push);
  return new NextResponse(null, { status: 204 });
});
