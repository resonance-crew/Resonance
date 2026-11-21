import { withUser } from '@/lib/api/v1/http';
import { OWN, cachedJson } from '@/lib/api/v1/cache';
import { serverCtx } from '@/server/ctx';
import { shadowRead } from '@/server/app/shadow';
import { shadowFromEnv } from '@/server/infra/shadow';
import { listBlocksIn } from '@/server/app/social';

export const dynamic = 'force-dynamic';

/** GET /api/v1/me/blocks — everyone you blocked, the latest first. Shadow-read when READ_BACKEND=shadow (app/shadow.ts). */
export const GET = withUser(async (user, req) => {
  const ctx = serverCtx();
  const body = await listBlocksIn(ctx, user.id);
  shadowRead(ctx, shadowFromEnv(), 'GET /api/v1/me/blocks', user.id, body, (s) => listBlocksIn(s, user.id));
  return cachedJson(req, body, OWN);
});
