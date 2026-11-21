import { titleToSlugBase } from '@/lib/ai/tasks';
import { publishCardIn, type PublishResult } from '@/server/app/publish';
import { ctxFor } from '@/server/infra/firestore/ctx';
import type { AdminDb } from '@/server/infra/firestore/db';

export { SLUG_WAIT_MS, type PublishResult } from '@/server/app/publish';

/**
 * Publish one of your own cards: what the web editor's submit() does from the
 * client, in one server call. Stamps publishedAt once (re-stamping would
 * re-date the card in every feed), gives it its slug, and — for a resonance,
 * the first time only — reaches the original's author (reachResonance: the
 * two connected, their bell rung once, in one transaction), re-checking what
 * firestore.rules would: the original must be visible to the resonator and no
 * block may stand between them. Only a resonance published public and under
 * its writer's name reaches anyone: a private or connections-only one is
 * never listed under the original, and an anonymous one would be named by
 * the connection. A resonator without a pen name reaches no one either; the
 * card is published all the same.
 *
 * A card others would read — public or for connections — needs words in its
 * story (blankForReaders): a blank one is refused (`invalid_request`), and
 * nothing is written.
 *
 * An anonymous card is public or private: one set to be anonymous and for
 * connections only is refused (`invalid_request`, see
 * anonymousForConnections), and nothing is written. A card in the trash is
 * refused too (409, ./inTrash) until it is restored.
 *
 * The slug and the resonance are made side by side. The slug is waited for
 * `slugWaitMs` at most: past that the answer says `slug: null` (the id is a
 * working URL) and the slug is written when it comes (`pendingSlug`).
 *
 * The recommendation index and the page cache are the route's (after the
 * response); `slugBase` is injectable so tests need no LLM, and defaults to
 * the model's translation of the title (lib/ai/tasks), which is why the route
 * is pinned away from Hong Kong (regions.test.ts follows this import).
 *
 * The service is src/server/app/publish.ts publishCardIn; this is its legacy
 * facade on a given Firestore.
 */
export function publishCard(
  db: AdminDb,
  uid: string,
  id: string,
  slugBase?: (title: string) => Promise<string>,
  /** `spent`: the author's budget, spent beside this (budgetFirst, B7) — awaited before anything is written. */
  opts: { slugWaitMs?: number; spent?: Promise<void> } = {},
): Promise<PublishResult> {
  return publishCardIn(ctxFor(db), uid, id, slugBase ?? titleToSlugBase, opts);
}
