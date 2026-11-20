import { ensureUniqueSlug, slugify } from '@/lib/ai/slugify';
import type { ServerCtx } from '@/server/ctx';
import type { SlugCardRow } from '@/server/ports/repos/infra';

/**
 * Give a published card its English URL slug and persist it: the LLM's
 * translation of the title (`slugBase`, which the caller passes: the model is
 * the route's, src/lib/ai/assignSlug's facade defaults it), made
 * collision-free with the author's handle and then a numeric suffix.
 * Idempotent — an existing slug is returned as-is so the public URL stays
 * stable across re-publishes.
 *
 * `known` is the card as the caller just read it (the publish transaction:
 * its title, byline, author and slug, none of which publishing changes), so
 * it isn't read again; the author's pen name is read while the title is
 * being translated.
 */
export async function assignSlugIn(
  ctx: ServerCtx,
  cardId: string,
  slugBase: (title: string) => Promise<string>,
  known?: SlugCardRow,
): Promise<string> {
  const infra = ctx.data.infra;
  const data: SlugCardRow = known ?? (await infra.getCardForSlug(cardId)) ?? {};
  if (typeof data.slug === 'string' && data.slug) {
    // Kept only while it still leads here: if an older card holds the same
    // slug (slugHolder), this one gets a fresh one instead of a dead URL.
    const holder = await infra.slugHolderId(data.slug);
    if (holder === cardId || holder === null) return data.slug;
  }

  // Leak checklist (ux §6): an anonymous card's public URL must not embed the
  // author's handle — collisions fall straight through to the numeric suffix.
  const [base, penName] = await Promise.all([
    slugBase(String(data.thoughtCore ?? '')),
    data.anonymous !== true ? Promise.resolve().then(() => infra.getUserHandle(String(data.authorId ?? ''))) : null,
  ]);
  const handle = penName !== null ? slugify(penName) : '';

  // Taken by another card, or retired with a card deleted for good (old links still name it).
  const slug = await ensureUniqueSlug(base, handle, (candidate) => infra.slugTaken(candidate, cardId));

  // Not `updatedAt`: publishing stamped it (with the card's list summary,
  // lib/api/v1/summary), and naming the card changes nothing it shows. An
  // update, never a merge: a card deleted for good while its slug was being
  // made (publish, then 永久刪除 a moment later) stays deleted — a merge
  // would bring back a stub of it, holding the slug for good. Nothing left
  // to name is done.
  await infra.setCardSlug(cardId, slug);
  return slug;
}
