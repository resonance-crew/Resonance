import { parse, withUser } from '@/lib/api/v1/http';
import { signalledJson } from '@/lib/api/v1/signalTag';
import { PageTokenQuery } from '@/lib/api/v1/schemas';
import { serverCtx } from '@/server/ctx';
import { listConversationsIn } from '@/server/app/inbox';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/conversations — the viewer's conversations, the most recently
 * active first, 50 a page (what the clients' `conversations` listener read):
 * each with the viewer's unread count, the last message's preview, the
 * letter it holds and the other person as their profile is now. An
 * unchanged list answers 304 to its ETag — before the list is read, while the
 * viewer's `inbox` counter stands and the ETag is under ten minutes old
 * (lib/api/v1/signalTag).
 */
export const GET = withUser(async (user, req) => {
  const q = parse(PageTokenQuery, Object.fromEntries(new URL(req.url).searchParams));
  const ctx = serverCtx();
  return signalledJson(req, { uid: user.id, topic: 'inbox', realtime: ctx.realtime, now: ctx.clock.now() }, () =>
    listConversationsIn(ctx, user.id, q.pageToken),
  );
});
