import { parse, routeParam, withUser, type RouteContext } from '@/lib/api/v1/http';
import { OWN, cachedJson } from '@/lib/api/v1/cache';
import { ConversationIdParam, MessagesQuery } from '@/lib/api/v1/schemas';
import { serverCtx } from '@/server/ctx';
import { listThreadIn } from '@/server/app/inbox';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/conversations/{pair}/messages — a thread's messages, newest
 * first: the newest 50 (the clients' listener's window), the page `before` a
 * cursor, or what came right `after` one. 404 for anyone but its two
 * participants, whether it exists or not. An unchanged page answers 304.
 */
export const GET = withUser(async (user, req, ctx: RouteContext<'pair'>) => {
  const pair = parse(ConversationIdParam, await routeParam(ctx, 'pair'));
  const q = parse(MessagesQuery, Object.fromEntries(new URL(req.url).searchParams));
  return cachedJson(req, await listThreadIn(serverCtx(), user.id, pair, q), OWN);
});
