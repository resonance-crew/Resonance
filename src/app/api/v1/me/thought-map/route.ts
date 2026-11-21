import { withUser } from '@/lib/api/v1/http';
import { OWN, cachedJson } from '@/lib/api/v1/cache';
import { serverCtx } from '@/server/ctx';
import { getThoughtMapIn } from '@/server/app/writer';

export const dynamic = 'force-dynamic';

/** GET /api/v1/me/thought-map — your whole thought map (nodes, arrows, groups); checked each time (ETag → 304). */
export const GET = withUser(async (user, req) => cachedJson(req, await getThoughtMapIn(serverCtx(), user.id), OWN));
