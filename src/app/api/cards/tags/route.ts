import { NextResponse } from 'next/server';
import { crossOriginCookieWrite } from '@/lib/api/sameOrigin';
import { getCurrentUser } from '@/lib/auth';
import { getAdminDb } from '@/lib/db/firestore/admin';
import { suggestStoryTags } from '@/lib/ai/tasks';
import { topTags } from '@/lib/ai/tags';
import { limited } from '@/lib/api/rateLimit';
import { CARD_LIMITS } from '@/lib/db/firestore/cardContent';

export const runtime = 'nodejs';

// How many of the author's cards to sample for tag history, and how many
// top-frequency tags from them reach the model. Firestore has no server-side
// aggregation over array fields, so we pull the (projected) tags arrays and
// rank them here — `select('tags')` keeps the payload to a few bytes per card.
const HISTORY_CARDS_LIMIT = 200;
const HISTORY_TAGS_LIMIT = 20;
/** More of the story than the model is shown (suggestStoryTags cuts it again). */
const STORY_READ_CHARS = 4_000;

/** The tags a request names, no more than a card may carry (CARD_LIMITS). */
export function cardSizedTags(raw: unknown): string[] {
  const kept: string[] = [];
  let joined = -1;
  for (const t of Array.isArray(raw) ? raw : []) {
    if (typeof t !== 'string' || !t.trim()) continue;
    if (kept.length >= CARD_LIMITS.tags || joined + 1 + t.length > CARD_LIMITS.tagsJoined) break;
    kept.push(t);
    joined += 1 + t.length;
  }
  return kept;
}

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
  const user = await getCurrentUser();
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
  const existingTags = cardSizedTags(body?.tags);
  if (!title.trim() && !story.trim()) {
    return NextResponse.json({ error: 'Nothing to tag' }, { status: 400 });
  }
  const refused = await limited(getAdminDb(), user.id, 'tags');
  if (refused) return refused;

  // Single-field index on authorId suffices — no orderBy, so no composite
  // index to deploy. Frequency ranking replaces recency ordering.
  const snap = await getAdminDb()
    .collection('cards')
    .where('authorId', '==', user.id)
    .select('tags')
    .limit(HISTORY_CARDS_LIMIT)
    .get();
  const historyTags = topTags(
    snap.docs.map((d) => {
      const tags = d.data().tags as unknown;
      return Array.isArray(tags) ? tags.filter((t): t is string => typeof t === 'string') : [];
    }),
    HISTORY_TAGS_LIMIT,
  );

  const tags = await suggestStoryTags({ title, story, existingTags, historyTags });
  return NextResponse.json({ tags });
}
