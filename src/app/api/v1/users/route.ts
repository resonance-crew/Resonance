import { parse, withUser } from '@/lib/api/v1/http';
import { BRIEF, cachedJson } from '@/lib/api/v1/cache';
import { UsersQuery } from '@/lib/api/v1/schemas';
import { serverCtx } from '@/server/ctx';
import { lookupUsersIn } from '@/server/app/social';

export const dynamic = 'force-dynamic';

/** GET /api/v1/users?ids=a,b,c — profiles by id (at most 30), in the order asked; an account that is gone says so. */
export const GET = withUser(async (user, req) => {
  const { ids } = parse(UsersQuery, Object.fromEntries(new URL(req.url).searchParams));
  const server = serverCtx();
  // The budget beside the read, not before it: a reader's lists never wait on it.
  const [, body] = await Promise.all([server.limits.spend(user.id, 'lookup'), lookupUsersIn(server, ids)]);
  return cachedJson(req, body, BRIEF);
});
