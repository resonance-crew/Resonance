import type { AdminDb } from '@/server/infra/firestore/db';
import { ctxFor } from '@/server/infra/firestore/ctx';
import { unfurlCardLinksIn, type UnfurlCardDeps, type UnfurlCardResult } from '@/server/app/links';

// A card's link previews — now src/server/app/links.ts `unfurlCardLinksIn`;
// this is its legacy facade for the routes, the backfill and the suites that
// hand it a Firestore.
export { STORY_UNFURL_CONCURRENCY, STORY_UNFURL_DEADLINE_MS, type UnfurlCardDeps, type UnfurlCardResult } from '@/server/app/links';

/**
 * Give a published card the previews of the links standing alone in its
 * story (`linkPreviews`, `linkPreviewsFor`): src/server/app/links.ts
 * `unfurlCardLinksIn`, which says how, on a context bound to `db`.
 */
export function unfurlCardLinks(db: AdminDb, cardId: string, deps: UnfurlCardDeps = {}): Promise<UnfurlCardResult> {
  return unfurlCardLinksIn(ctxFor(db), cardId, deps);
}
