import { NextResponse, after } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { recommendFeed } from '@/lib/recommend/funnel';
import { dailyRecommendationsIn } from '@/server/app/recommendDaily';
import { serverCtx } from '@/server/ctx';

export const runtime = 'nodejs';
// A new day's build runs after the response (its LLM steps time out well inside this).
export const maxDuration = 60;

/**
 * The reader's recommended feed: the stored result at once (`status: 'stale'`
 * while today's is built after the response), or — for a reader with nothing
 * yet — a quick build within a few seconds. Returns only card ids + reasons;
 * the client resolves the cards through the visibility-enforced read path.
 * Never the ranking's scores: what lifted a card is the server's to know
 * (a score past the model's range would say the author was one the reader
 * answered).
 */
export async function GET() {
  const user = await getCurrentUser({ revocation: 'cached' });
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  const ctx = serverCtx();
  const { items, cached, status, refresh, asked } = await dailyRecommendationsIn(ctx, user.id, { build: recommendFeed });
  if (refresh) after(refresh);
  // The reader opened their picks today: the evening's pick push leaves them be.
  if (asked) after(asked);
  // Picks were stored when built: a card made private, trashed or deleted
  // since then — its reason derived from its words — is left out now, as the
  // v1 recommended feed leaves it out (present()).
  const open = await ctx.data.cards.stillPublic(items.map((i) => i.cardId));
  return NextResponse.json({ items: items.filter((i) => open.has(i.cardId)).map(({ cardId, reason }) => ({ cardId, reason })), cached, status });
}
