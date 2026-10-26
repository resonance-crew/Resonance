import type { DocumentData, Firestore } from 'firebase-admin/firestore';
import { slugHolder } from '@/lib/db/firestore/cardKey';
import { retirable, retiredSlugRef } from '@/lib/db/firestore/tombstones';
import { ensureUniqueSlug, slugify } from './slugify';
import { titleToSlugBase } from './tasks';

/**
 * Give a published card its English URL slug and persist it: the LLM's
 * translation of the title, made collision-free with the author's handle and
 * then a numeric suffix. Idempotent — an existing slug is returned as-is so
 * the public URL stays stable across re-publishes. Called by the v1 publish
 * endpoint (web and apps alike); `slugBase` is injectable so tests need no
 * LLM.
 *
 * `known` is the card as the caller just read it (the publish transaction:
 * its title, byline, author and slug, none of which publishing changes), so
 * it isn't read again; the author's pen name is read while the title is
 * being translated.
 */
export async function assignSlug(
  db: Firestore,
  cardId: string,
  slugBase: (title: string) => Promise<string> = titleToSlugBase,
  known?: DocumentData,
): Promise<string> {
  const ref = db.collection('cards').doc(cardId);
  const data = known ?? (await ref.get()).data() ?? {};
  if (typeof data.slug === 'string' && data.slug) {
    // Kept only while it still leads here: if an older card holds the same
    // slug (slugHolder), this one gets a fresh one instead of a dead URL.
    const holders = await db.collection('cards').where('slug', '==', data.slug).limit(10).get();
    if (slugHolder(holders.docs)?.id === cardId || holders.empty) return data.slug;
  }

  // Leak checklist (ux §6): an anonymous card's public URL must not embed the
  // author's handle — collisions fall straight through to the numeric suffix.
  const [base, author] = await Promise.all([
    slugBase(String(data.thoughtCore ?? '')),
    data.anonymous !== true ? Promise.resolve().then(() => db.collection('users').doc(String(data.authorId ?? '')).get()) : null,
  ]);
  const handle = author ? slugify(String(author.data()?.handle ?? '')) : '';

  // Taken by another card, or retired with a card deleted for good (old links still name it).
  const slug = await ensureUniqueSlug(base, handle, async (candidate) => {
    const [dupes, retired] = await Promise.all([
      db.collection('cards').where('slug', '==', candidate).limit(1).get(),
      retirable(candidate) ? retiredSlugRef(db, candidate).get() : null,
    ]);
    return !!retired?.exists || dupes.docs.some((d) => d.id !== cardId);
  });

  // Not `updatedAt`: publishing stamped it (with the card's list summary,
  // lib/api/v1/summary), and naming the card changes nothing it shows. An
  // update, never a merge: a card deleted for good while its slug was being
  // made (publish, then 永久刪除 a moment later) stays deleted — a merge
  // would bring back a stub of it, holding the slug for good.
  try {
    await ref.update({ slug });
  } catch (e) {
    // Firestore's NOT_FOUND: nothing left to name — done.
    if ((e as { code?: unknown } | null)?.code !== 5) throw e;
  }
  return slug;
}
