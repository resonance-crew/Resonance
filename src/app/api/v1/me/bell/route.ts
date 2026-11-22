import { parse, withUser } from '@/lib/api/v1/http';
import { signalledJson } from '@/lib/api/v1/signalTag';
import { BellQuery } from '@/lib/api/v1/schemas';
import { serverCtx } from '@/server/ctx';
import { listBellIn } from '@/server/app/inbox';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/me/bell — the viewer's bell rows, newest first, 20 a page (what
 * the clients' `notifications` listener read), with the profiles of the
 * people they name. An unchanged page answers 304 to its ETag — before the
 * page is read, while the viewer's `bell` counter stands and the ETag is
 * under ten minutes old (lib/api/v1/signalTag).
 */
export const GET = withUser(async (user, req) => {
  const q = parse(BellQuery, Object.fromEntries(new URL(req.url).searchParams));
  const ctx = serverCtx();
  return signalledJson(req, { uid: user.id, topic: 'bell', realtime: ctx.realtime, now: ctx.clock.now() }, () =>
    listBellIn(ctx, user.id, q.limit, q.pageToken),
  );
});
