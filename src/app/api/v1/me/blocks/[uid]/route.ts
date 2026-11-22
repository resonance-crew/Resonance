import { parse, routeParam, withUser, type RouteContext } from '@/lib/api/v1/http';
import { UserIdParam } from '@/lib/api/v1/schemas';
import { serverCtx } from '@/server/ctx';
import { OWN_SIGNALS_HEADER, type OwnSignals } from '@/server/app/inbox';
import { blockIn, unblockIn } from '@/server/app/social';

export const dynamic = 'force-dynamic';

/**
 * PUT /api/v1/me/blocks/{uid} — block someone: in one transaction the block,
 * the connection ended, every pending invite between you withdrawn (204).
 */
export const PUT = withUser(async (user, _req, ctx: RouteContext<'uid'>) => {
  const other = parse(UserIdParam, await routeParam(ctx, 'uid'));
  const server = serverCtx();
  await server.limits.spend(user.id, 'block');
  const own: { signals?: OwnSignals } = {};
  await blockIn(server, user.id, other, (signals) => (own.signals = signals));
  // The blocker's own counters after the block: their client takes them as heard (client/signals pokeOwn).
  return new Response(null, { status: 204, headers: own.signals ? { [OWN_SIGNALS_HEADER]: JSON.stringify(own.signals) } : {} });
});

/** DELETE /api/v1/me/blocks/{uid} — unblock: only the block goes (204). */
export const DELETE = withUser(async (user, _req, ctx: RouteContext<'uid'>) => {
  const other = parse(UserIdParam, await routeParam(ctx, 'uid'));
  const server = serverCtx();
  await server.limits.spend(user.id, 'block');
  const own: { signals?: OwnSignals } = {};
  await unblockIn(server, user.id, other, (signals) => (own.signals = signals));
  return new Response(null, { status: 204, headers: own.signals ? { [OWN_SIGNALS_HEADER]: JSON.stringify(own.signals) } : {} });
});
