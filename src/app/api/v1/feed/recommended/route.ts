import { withUser } from '@/lib/api/v1/http';
import { recommendFeed } from '@/lib/recommend/funnel';
import { getVectorStore } from '@/lib/recommend/vectorStore';
import { serverCtx } from '@/server/ctx';
import { getRecommendedFeed } from '@/server/app/cardsRead';
import { dailyRecommendationsIn } from '@/server/app/recommendDaily';
import { NEVER, cachedJson, secondsUntilUtcMidnight } from '@/lib/api/v1/cache';

export const dynamic = 'force-dynamic';
// A new day's build runs after the response (its LLM steps time out well inside this).
export const maxDuration = 60;

/**
 * GET /api/v1/feed/recommended — today's picks for the reader, each with its
 * reason (see dailyRecommendations). Today's picks stay the same until the
 * UTC day turns, so a client that opted in may keep them until then; picks
 * still being prepared (`stale`) are never kept — the client asks again.
 */
export const GET = withUser(async (user, req) => {
  const server = serverCtx();
  const feed = await getRecommendedFeed(server, user.id, async () => {
    // On the configured vector store, built by the funnel (lib/recommend/daily, as its legacy facade does).
    const daily = await dailyRecommendationsIn(serverCtx({ vectors: getVectorStore() }), user.id, { build: recommendFeed });
    if (daily.refresh) server.later.later(daily.refresh, 'recommend: refresh');
    // The reader opened their picks today: the evening's pick push leaves them be.
    if (daily.asked) server.later.later(daily.asked, 'recommend: asked');
    return daily;
  });
  return cachedJson(req, feed, feed.status === 'stale' ? NEVER : { kind: 'fresh', maxAge: secondsUntilUtcMidnight() });
});
