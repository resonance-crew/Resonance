import { NextResponse } from 'next/server';
import { crossOriginCookieWrite } from '@/lib/api/sameOrigin';
import { getCurrentUser } from '@/lib/auth';
import { suggestStoryTags } from '@/lib/ai/tasks';
import { cardSizedTags, topTags } from '@/lib/ai/tags';
import { serverCtx } from '@/server/ctx';
import { CARD_LIMITS } from '@/lib/db/firestore/cardContent';

export const runtime = 'nodejs';

// How many of the author's cards to sample for tag history, and how many
// top-frequency tags from them reach the model. The store has no server-side
// aggregation over array fields, so we pull the (projected) tags arrays and
// rank them here (data.cards.authorTagHistory).
const HISTORY_CARDS_LIMIT = 200;
const HISTORY_TAGS_LIMIT = 20;
/** More of the story than the model is shown (suggestStoryTags cuts it again). */
const STORY_READ_CHARS = 4_000;

/**
 * Suggest 2–3 tags for the card being written. The draft may be unsaved, so the
 * editor sends title/story/tags in the body (same shape of reasoning as
 * /api/generate-image). The author's past tags are read server-side and fed to
 * the LLM so suggestions match their existing vocabulary.
 */
export async function POST(req: Request) {
  // A write with the session cookie from another origin (a same-site subdomain too) is never the caller's own page.
  if (crossOriginCookieWrite(req)) return NextResponse.json({ error: 'This request did not come from the site' }, { status: 403 });
  // Signed out (or a revoked session) is a 401 — what makes a client renew its token — not a crash.
  // Nothing is written for anyone else: the instance's short-lived revocation answer is enough (B15, as /read).
  const user = await getCurrentUser({ revocation: 'cached' });
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

  const body = (await req.json().catch(() => null)) as {
    thoughtCore?: unknown;
    story?: unknown;
    tags?: unknown;
  } | null;
  // Held to what a card may carry: one unit of the budget buys one card-sized
  // prompt, whatever a caller sends (the tags go into the prompt whole).
  const title = typeof body?.thoughtCore === 'string' ? body.thoughtCore.slice(0, CARD_LIMITS.title) : '';
  const story = typeof body?.story === 'string' ? body.story.slice(0, STORY_READ_CHARS) : '';
  const existingTags = cardSizedTags(body?.tags, CARD_LIMITS);
  if (!title.trim() && !story.trim()) {
    return NextResponse.json({ error: 'Nothing to tag' }, { status: 400 });
  }
  const ctx = serverCtx();
  const refused = await ctx.limits.limited(user.id, 'tags');
  if (refused) return refused;

  // Frequency ranking replaces recency ordering.
  const historyTags = topTags(await ctx.data.cards.authorTagHistory(user.id, HISTORY_CARDS_LIMIT), HISTORY_TAGS_LIMIT);

  const tags = await suggestStoryTags({ title, story, existingTags, historyTags });
  return NextResponse.json({ tags });
}
