import { withUser } from '@/lib/api/v1/http';
import { OWN, cachedJson } from '@/lib/api/v1/cache';
import { serverCtx } from '@/server/ctx';
import { shadowRead } from '@/server/app/shadow';
import { shadowFromEnv } from '@/server/infra/shadow';
import { listConnectionsIn } from '@/server/app/social';

export const dynamic = 'force-dynamic';

/** GET /api/v1/me/connections — the people you are connected with, the latest first. */
export const GET = withUser(async (user, req) => {
  const ctx = serverCtx();
  const body = await listConnectionsIn(ctx, user.id);
  // Shadow-read when READ_BACKEND=shadow (app/shadow.ts).
  shadowRead(ctx, shadowFromEnv(), 'GET /api/v1/me/connections', user.id, body, (s) => listConnectionsIn(s, user.id));
  return cachedJson(req, body, OWN);
});
