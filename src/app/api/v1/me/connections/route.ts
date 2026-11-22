import { withUser } from '@/lib/api/v1/http';
import { signalledJson } from '@/lib/api/v1/signalTag';
import { serverCtx } from '@/server/ctx';
import { shadowRead } from '@/server/app/shadow';
import { shadowFromEnv } from '@/server/infra/shadow';
import { listConnectionsIn } from '@/server/app/social';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/me/connections — the people you are connected with, the latest
 * first. An unchanged list answers 304 to its ETag — before the list is read,
 * while the viewer's `graph` counter stands and the ETag is under ten minutes
 * old (lib/api/v1/signalTag): every write that makes or ends a connection
 * touches both people's `graph` (app/connectionSignals.test.ts).
 */
export const GET = withUser(async (user, req) => {
  const ctx = serverCtx();
  return signalledJson(req, { uid: user.id, topic: 'graph', realtime: ctx.realtime, now: ctx.clock.now() }, async () => {
    const body = await listConnectionsIn(ctx, user.id);
    // Shadow-read when READ_BACKEND=shadow (app/shadow.ts).
    shadowRead(ctx, shadowFromEnv(), 'GET /api/v1/me/connections', user.id, body, (s) => listConnectionsIn(s, user.id));
    return body;
  });
});
