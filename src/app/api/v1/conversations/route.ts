import { cachedJson, OWN } from '@/lib/api/v1/cache';
import { parse, withUser } from '@/lib/api/v1/http';
import { signalledJson } from '@/lib/api/v1/signalTag';
import { ConversationsQuery } from '@/lib/api/v1/schemas';
import { serverCtx } from '@/server/ctx';
import { listConversationsByIdIn, listConversationsIn } from '@/server/app/inbox';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/conversations — the viewer's conversations, the most recently
 * active first, 50 a page (what the clients' `conversations` listener read):
 * each with the viewer's unread count, the last message's preview, the
 * letter it holds and the other person as their profile is now. An
 * unchanged list answers 304 to its ETag — before the list is read, while the
 * viewer's `inbox` counter stands and the ETag is under ten minutes old
 * (lib/api/v1/signalTag).
 *
 * `?pairs=` (the web's delta): only those conversations, read by id — what
 * moved, by the viewer's `threads` counters, for a client holding the rest
 * (listConversationsByIdIn). No early 304 for it: it is asked only when its
 * conversations moved.
 */
export const GET = withUser(async (user, req) => {
  const q = parse(ConversationsQuery, Object.fromEntries(new URL(req.url).searchParams));
  const ctx = serverCtx();
  if (q.pairs) return cachedJson(req, await listConversationsByIdIn(ctx, user.id, q.pairs), OWN);
  return signalledJson(req, { uid: user.id, topic: 'inbox', realtime: ctx.realtime, now: ctx.clock.now() }, () =>
    listConversationsIn(ctx, user.id, q.pageToken),
  );
});
