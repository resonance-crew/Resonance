import { FieldValue, type Firestore } from 'firebase-admin/firestore';

/**
 * A card deleted for good leaves its id behind as a tombstone, so no new card
 * takes it (firestore.rules refuse one): resonances, bookmarks, a thread's
 * cards and old links still name that id, and would follow whoever took it.
 * Written by every server path that deletes a card (deleteCard — the trash's
 * too — and the account purge). It holds no uid: it must not say whose card
 * it was.
 */
export function tombstoneRef(db: Firestore, id: string) {
  return db.doc(`cardTombstones/${id}`);
}

/** A tombstone's whole content: when, never who. */
export const TOMBSTONE = { deletedAt: FieldValue.serverTimestamp() };

/**
 * A deleted card's slug, retired with it: old links, story embeds and push
 * routes name a card by its slug, and a slug handed to a new card would take
 * them to another author's card (assignSlug skips a retired one; the old
 * address answers as a deleted card's). Written beside the tombstone by the
 * same paths. It holds neither uid nor card id.
 */
export function retiredSlugRef(db: Firestore, slug: string) {
  return db.doc(`retiredSlugs/${slug}`);
}

/** A retired slug's whole content. */
export const RETIRED_SLUG = { retiredAt: FieldValue.serverTimestamp() };

/** A slug as slugify makes one — and so a document id it can be. */
export function retirable(slug: unknown): slug is string {
  return typeof slug === 'string' && /^[a-z0-9][a-z0-9-]{0,199}$/.test(slug);
}
