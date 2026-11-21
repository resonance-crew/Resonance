import { withUser } from '@/lib/api/v1/http';
import { OWN, cachedJson } from '@/lib/api/v1/cache';
import { serverCtx } from '@/server/ctx';
import { listConnectionsIn } from '@/server/app/social';

export const dynamic = 'force-dynamic';

/** GET /api/v1/me/connections — the people you are connected with, the latest first. */
export const GET = withUser(async (user, req) => cachedJson(req, await listConnectionsIn(serverCtx(), user.id), OWN));
