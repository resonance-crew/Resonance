import { NextResponse } from 'next/server';
import { ApiFailure, parse, routeParam, withUser, type RouteContext } from '@/lib/api/v1/http';
import { ConversationIdParam, MessageIdParam, SetReactionRequest } from '@/lib/api/v1/schemas';
import { serverCtx } from '@/server/ctx';
import { removeReactionIn, setReactionIn } from '@/server/app/messages';

export const dynamic = 'force-dynamic';

type Ctx = RouteContext<'pair' | 'messageId'>;

/**
 * PUT /api/v1/conversations/{pair}/messages/{messageId}/reaction — answer a
 * message with a reaction (see setReaction): 204. Quiet — no bell, no push,
 * no unread; the other person's open thread shows it through its listener.
 */
export const PUT = withUser(async (user, req, ctx: Ctx) => {
  const pair = parse(ConversationIdParam, await routeParam(ctx, 'pair'));
  const messageId = parse(MessageIdParam, await routeParam(ctx, 'messageId'));
  const body = await req.json().catch(() => {
    throw new ApiFailure('invalid_request', 'The body must be JSON.');
  });
  const input = parse(SetReactionRequest, body);
  const server = serverCtx();
  await server.limits.spend(user.id, 'react');
  await setReactionIn(server, user.id, pair, messageId, input);
  return new NextResponse(null, { status: 204 });
});

/** DELETE …/reaction — take your reaction back (see removeReaction): 204, also when there was none. */
export const DELETE = withUser(async (user, _req, ctx: Ctx) => {
  const pair = parse(ConversationIdParam, await routeParam(ctx, 'pair'));
  const messageId = parse(MessageIdParam, await routeParam(ctx, 'messageId'));
  await removeReactionIn(serverCtx(), user.id, pair, messageId);
  return new NextResponse(null, { status: 204 });
});
