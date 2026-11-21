import { withUser } from '@/lib/api/v1/http';
import { OWN, cachedJson } from '@/lib/api/v1/cache';
import { serverCtx } from '@/server/ctx';
import { listBlocksIn } from '@/server/app/social';

export const dynamic = 'force-dynamic';

/** GET /api/v1/me/blocks — everyone you blocked, the latest first. */
export const GET = withUser(async (user, req) => cachedJson(req, await listBlocksIn(serverCtx(), user.id), OWN));
