import { NextResponse } from 'next/server';
import { ApiFailure, parse, withUser } from '@/lib/api/v1/http';
import { MarkNotificationsReadRequest } from '@/lib/api/v1/schemas';
import { serverCtx } from '@/server/ctx';
import { markBellReadIn } from '@/server/app/inbox';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/notifications/read — `{ ids }`: these bell rows of the
 * viewer's, read now; `{ before }`: theirs made up to that time. Anyone
 * else's rows, and ids that name none, are ignored. 204.
 */
export const POST = withUser(async (user, req) => {
  const body = await req.json().catch(() => {
    throw new ApiFailure('invalid_request', 'The body must be JSON.');
  });
  const input = parse(MarkNotificationsReadRequest, body);
  const server = serverCtx();
  await server.limits.spend(user.id, 'markRead');
  await markBellReadIn(server, user.id, input);
  return new NextResponse(null, { status: 204 });
});
