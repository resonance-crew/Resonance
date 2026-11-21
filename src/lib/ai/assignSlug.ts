import { assignSlugIn } from '@/server/app/slugs';
import type { AdminDb } from '@/server/infra/firestore/db';
import { ctxFor } from '@/server/infra/firestore/ctx';
import type { SlugCardRow } from '@/server/ports/repos/infra';
import { titleToSlugBase } from './tasks';

/**
 * Give a published card its English URL slug and persist it — now
 * src/server/app/slugs.ts `assignSlugIn` (which says how), on a context
 * bound to `db`. Called by the v1 publish endpoint (web and apps alike);
 * `slugBase` is injectable so tests need no LLM, and defaults to the model's
 * translation of the title (./tasks), which is why the route that names a
 * card is pinned away from Hong Kong (regions.test.ts follows this import).
 *
 * `known` is the card as the caller just read it (the publish transaction).
 */
export function assignSlug(
  db: AdminDb,
  cardId: string,
  slugBase: (title: string) => Promise<string> = titleToSlugBase,
  known?: SlugCardRow,
): Promise<string> {
  return assignSlugIn(ctxFor(db), cardId, slugBase, known);
}
