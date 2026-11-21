import { NextResponse } from 'next/server';
import { parse, routeParam, withUser, type RouteContext } from '@/lib/api/v1/http';
import { InviteIdParam } from '@/lib/api/v1/schemas';
import { serverCtx } from '@/server/ctx';
import { acceptInviteIn } from '@/server/app/invites';
import { ringAfterIn } from '@/server/app/pushAfter';

export const dynamic = 'force-dynamic';

/** POST /api/v1/invites/{id}/accept — accept a legacy invite sent to you (see acceptInvite). */
export const POST = withUser(async (user, _req, ctx: RouteContext<'id'>) => {
  const id = parse(InviteIdParam, await routeParam(ctx, 'id'));
  const server = serverCtx();
  await server.limits.spend(user.id, 'invite');
  const { notificationId, ...accepted } = await acceptInviteIn(server, user.id, id);
  ringAfterIn(server, notificationId);
  return NextResponse.json(accepted);
});
