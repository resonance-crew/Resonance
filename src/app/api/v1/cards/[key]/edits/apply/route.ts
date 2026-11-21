import { NextResponse, after } from 'next/server';
import { parse, routeParam, withUser, type RouteContext } from '@/lib/api/v1/http';
import { applyCardEdit } from '@/lib/api/v1/edits';
import { tryReachResonance } from '@/lib/api/v1/resonate';
import { CardIdParam } from '@/lib/api/v1/schemas';
import { revalidateLocalized } from '@/lib/api/revalidate';
import { getAdminDb } from '@/lib/db/firestore/admin';
import { markIndexOwed } from '@/lib/recommend/indexOwed';
import { makeSummaryTranslations } from '@/lib/api/v1/summaryTranslationsMake';
import { makeTapPassages } from '@/lib/api/v1/tapPassagesMake';
import { unfurlCardLinks } from '@/lib/links/cardLinks';
import { ringAfter } from '@/lib/push/ring';
import { ApiFailure } from '@/lib/api/v1/http';
import { spend } from '@/lib/api/rateLimit';
import { getVectorStore } from '@/lib/recommend/vectorStore';

export const dynamic = 'force-dynamic';
// The title's and excerpt's translations after the response (one small call); the card's reading is the daily
// cron's (indexPendingAt), never asked here.
export const maxDuration = 120;

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
    // One spend of the reindex budget for whichever of the two asks a model first, shared by both.
    let allowed: Promise<boolean> | null = null;
    const mayCall = () => (allowed ??= reindexAllowed(user.id));
    after(() =>
      // After "save changes", side by side as publishing does: the story's link previews (new links fetched,
      // removed ones dropped) and then the cached pages; and the card's reading marked owed (round 26 §A1.8, D6:
      // reading the whole story again on every save would be a reasoning model's call each time) — the daily
      // cron reads it again, and asks no model when what the reading reads is unchanged.
      Promise.all([
        (async () => {
          await unfurlCardLinks(getAdminDb(), id).catch((e) => console.error('[api/v1] unfurl', e));
          revalidateLocalized(stale);
        })(),
        markIndexOwed(getAdminDb(), id).catch((e) => console.error('[api/v1] index owed', e)),
        // The title's and excerpt's translations, made again only when either changed (the same budget as the index).
        makeSummaryTranslations(getAdminDb(), id, { mayCall }).catch((e) => console.error('[api/v1] summary translations', e)),
        // Its tap passages (round 27), made again only when the story's words changed; out of budget, owed to the cron.
        makeTapPassages(getAdminDb(), id, { mayCall }).catch((e) => console.error('[api/v1] tap passages', e)),
      ]),
    );
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
