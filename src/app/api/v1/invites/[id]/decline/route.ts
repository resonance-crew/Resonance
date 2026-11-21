import { parse, routeParam, withUser, type RouteContext } from '@/lib/api/v1/http';
import { InviteIdParam } from '@/lib/api/v1/schemas';
import { serverCtx } from '@/server/ctx';
import { declineInviteIn } from '@/server/app/social';

export const dynamic = 'force-dynamic';

/** POST /api/v1/invites/{id}/decline — say no to a legacy invite sent to you: it closes, no one is told (204). */
export const POST = withUser(async (user, _req, ctx: RouteContext<'id'>) => {
  const id = parse(InviteIdParam, await routeParam(ctx, 'id'));
  const server = serverCtx();
  await server.limits.spend(user.id, 'invite');
  await declineInviteIn(server, user.id, id);
  return new Response(null, { status: 204 });
});
