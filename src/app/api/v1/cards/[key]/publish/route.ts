import { NextResponse } from 'next/server';
import { parse, routeParam, withUser, type RouteContext } from '@/lib/api/v1/http';
import { titleToSlugBase } from '@/lib/ai/tasks';
import { CardIdParam } from '@/lib/api/v1/schemas';
import { indexCard } from '@/lib/recommend/indexCard';
import { makeSummaryTranslationsIn } from '@/lib/api/v1/summaryTranslationsMake';
import { cardPagePaths } from '@/lib/api/revalidate';
import { serverCtx } from '@/server/ctx';
import { budgetFirst } from '@/server/app/conversations';
import { unfurlCardLinksIn } from '@/server/app/links';
import { refusalForPreLetterBuildIn } from '@/server/app/preLetter';
import { publishCardIn } from '@/server/app/publish';
import { announceNewCardIn, ringAfterIn } from '@/server/app/pushAfter';

export const dynamic = 'force-dynamic';
// The slug's LLM call is waited for 8 s at most (SLUG_WAIT_MS), then finished
// after the response beside the story's link previews (15 s at most,
// STORY_UNFURL_DEADLINE_MS), followed by the page cache; the card's reading
// and its vectors (one deadline, INDEX_DEADLINE_MS: 100 s — a reasoning model
// reading the whole story) and the title's and excerpt's translations run
// alongside, and so — on a first publish, once the slug is in — does the push
// to the author's connections who asked (a few seconds).
export const maxDuration = 120;

/** POST /api/v1/cards/{id}/publish — publish your card (see publishCard). */
export const POST = withUser(async (user, req, ctx: RouteContext<'key'>) => {
  const id = parse(CardIdParam, await routeParam(ctx, 'key'));
  const server = serverCtx();
  // The budget is spent beside the publish's reads, not before them (B7), and still answers first (budgetFirst).
  const spent = server.limits.spend(user.id, 'publish');
  // The slug is the model's translation of the title (lib/ai/tasks), which is why this route is pinned to hnd1.
  const { notificationId, pendingSlug, ...result } = await budgetFirst(spent, () => publishCardIn(server, user.id, id, titleToSlugBase, { spent })).catch(
    async (e: unknown) => {
      // A build before letters shows the refusal's words as they are: in its own language (lib/api/v1/preLetter).
      throw await refusalForPreLetterBuildIn(server, user.id, req, e);
    },
  );
  ringAfterIn(server, notificationId);
  // Same grace notes as the web editor: never awaited by the writer, never failing the publish.
  server.later.later(
    () =>
    Promise.all([
      (async () => {
        const [slug] = await Promise.all([
          // A slug that came late (the answer said null) is written once this resolves.
          result.slug ?? (pendingSlug ? pendingSlug : null),
          unfurlCardLinksIn(server, id).catch((e) => console.error('[api/v1] unfurl', e)),
        ]);
        // After both, so the cached page is rendered with its slug and its link previews.
        server.pages.revalidate(cardPagePaths({ id, slug }));
      })(),
      indexCard(id).catch((e) => console.error('[api/v1] index', e)),
      // Its title and excerpt in the other interface language, for readers who turned auto-translate on (one small call).
      makeSummaryTranslationsIn(server, id).catch((e) => console.error('[api/v1] summary translations', e)),
      // The first time only: the author's connections who asked hear of it, once its slug is settled.
      result.firstPublish ? announceNewCardIn(server, id, result.slug ?? pendingSlug) : null,
    ]),
    'publish',
  );
  return NextResponse.json(result);
});
