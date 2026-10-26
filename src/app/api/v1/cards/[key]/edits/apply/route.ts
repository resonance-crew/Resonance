import { NextResponse, after } from 'next/server';
import { parse, routeParam, withUser, type RouteContext } from '@/lib/api/v1/http';
import { applyCardEdit } from '@/lib/api/v1/edits';
import { tryReachResonance } from '@/lib/api/v1/resonate';
import { CardIdParam } from '@/lib/api/v1/schemas';
import { revalidateLocalized } from '@/lib/api/revalidate';
import { getAdminDb } from '@/lib/db/firestore/admin';
import { indexCard } from '@/lib/recommend/indexCard';
import { unfurlCardLinks } from '@/lib/links/cardLinks';
import { ringAfter } from '@/lib/push/ring';
import { ApiFailure } from '@/lib/api/v1/http';
import { spend } from '@/lib/api/rateLimit';
import { getVectorStore } from '@/lib/recommend/vectorStore';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * POST /api/v1/cards/{id}/edits/apply — apply your pending edit to a
 * published card (see applyCardEdit). A resonance it made public under your
 * name reaches the original's author after the response — connects you two
 * and rings them, once (tryReachResonance) — so the answer never waits on it.
 */
export const POST = withUser(async (user, _req, ctx: RouteContext<'key'>) => {
  const id = parse(CardIdParam, await routeParam(ctx, 'key'));
  const db = getAdminDb();
  const { stale, reaches, movedTo, ...result } = await applyCardEdit(db, user.id, id);
  if (reaches) ringAfter(db, () => tryReachResonance(db, user.id, id));
  if (movedTo) {
    // Its vectors' visibility is what keeps a private card out of everyone
    // else's recommendations (their prompts and picks): moved before the
    // answer, as PATCH does, never left to the re-index after it.
    await Promise.resolve()
      .then(() => getVectorStore().setVisibility(id, movedTo))
      .catch((e) => console.error('[api/v1] vectors', id, e));
  }
  if (result.applied) {
    after(async () => {
      // After "save changes": the story's link previews (new links fetched,
      // removed ones dropped), the cached pages, then the recommendation index
      // — an LLM call, so it spends the author's reindex budget (over it the
      // card keeps its last index).
      await unfurlCardLinks(getAdminDb(), id).catch((e) => console.error('[api/v1] unfurl', e));
      revalidateLocalized(stale);
      if (await reindexAllowed(user.id)) await indexCard(id).catch((e) => console.error('[api/v1] index', e));
    });
  }
  return NextResponse.json(result);
});

/** Whether the author's reindex budget allows one more re-index (a refusal skips it, any other failure is logged and skips it too). */
async function reindexAllowed(uid: string): Promise<boolean> {
  return spend(getAdminDb(), uid, 'reindex').then(
    () => true,
    (e: unknown) => {
      if (!(e instanceof ApiFailure && e.code === 'rate_limited')) console.error('[api/v1] reindex budget', e);
      return false;
    },
  );
}
