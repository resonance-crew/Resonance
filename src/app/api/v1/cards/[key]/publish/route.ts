import { NextResponse, after } from 'next/server';
import { parse, routeParam, withUser, type RouteContext } from '@/lib/api/v1/http';
import { refusalForPreLetterBuild } from '@/lib/api/v1/preLetter';
import { publishCard } from '@/lib/api/v1/publish';
import { CardIdParam } from '@/lib/api/v1/schemas';
import { getAdminDb } from '@/lib/db/firestore/admin';
import { ringAfter } from '@/lib/push/ring';
import { announceNewCard } from '@/lib/push/connectionCards';
import { spend } from '@/lib/api/rateLimit';
import { budgetFirst } from '@/lib/api/v1/conversations';
import { indexCard } from '@/lib/recommend/indexCard';
import { makeTapPassages } from '@/lib/api/v1/tapPassagesMake';
import { makeSummaryTranslations } from '@/lib/api/v1/summaryTranslationsMake';
import { cardPagePaths, revalidateLocalized } from '@/lib/api/revalidate';
import { unfurlCardLinks } from '@/lib/links/cardLinks';

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
  const db = getAdminDb();
  // The budget is spent beside the publish's reads, not before them (B7), and still answers first (budgetFirst).
  const spent = spend(db, user.id, 'publish');
  const { notificationId, pendingSlug, ...result } = await budgetFirst(spent, () => publishCard(db, user.id, id, undefined, { spent })).catch(async (e: unknown) => {
    // A build before letters shows the refusal's words as they are: in its own language (lib/api/v1/preLetter).
    throw await refusalForPreLetterBuild(db, user.id, req, e);
  });
  ringAfter(db, notificationId);
  // Same grace notes as the web editor: never awaited by the writer, never failing the publish.
  after(() => {
    const indexed = indexCard(id).catch((e) => console.error('[api/v1] index', e));
    return Promise.all([
      (async () => {
        const [slug] = await Promise.all([
          // A slug that came late (the answer said null) is written once this resolves.
          result.slug ?? (pendingSlug ? pendingSlug : null),
          unfurlCardLinks(db, id).catch((e) => console.error('[api/v1] unfurl', e)),
        ]);
        // After both, so the cached page is rendered with its slug and its link previews.
        revalidateLocalized(cardPagePaths({ id, slug }));
      })(),
      indexed,
      // Its tap passages (round 27): a reader's 選一段 after 共振 — a failure is marked owed once the reading settled.
      makeTapPassages(db, id, { markAfter: indexed }).catch((e) => console.error('[api/v1] tap passages', e)),
      // Its title and excerpt in the other interface language, for readers who turned auto-translate on (one small call).
      makeSummaryTranslations(db, id).catch((e) => console.error('[api/v1] summary translations', e)),
      // The first time only: the author's connections who asked hear of it, once its slug is settled.
      result.firstPublish ? announceNewCard(db, id, result.slug ?? pendingSlug) : null,
    ]);
  });
  return NextResponse.json(result);
});
