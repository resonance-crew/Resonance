import { parse, routeParam, withUser, type RouteContext } from '@/lib/api/v1/http';
import { HandleParam } from '@/lib/api/v1/schemas';
import { serverCtx } from '@/server/ctx';
import { handleAvailableIn } from '@/server/app/profile';
import { OWN, cachedJson } from '@/lib/api/v1/cache';

export const dynamic = 'force-dynamic';

/** GET /api/v1/handles/{handle} — whether a pen name is free (onboarding and rename, as you type). */
export const GET = withUser(async (user, req, ctx: RouteContext<'handle'>) => {
  const handle = parse(HandleParam, await routeParam(ctx, 'handle'));
  // As-you-type: whether a name is free can change any moment.
  return cachedJson(req, { handle, available: await handleAvailableIn(serverCtx(), user.id, handle) }, OWN);
});
