import { Timestamp, type Firestore, type QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { isReservedId } from './reservedId';

/**
 * Which of several cards sharing a slug the slug names: the published one
 * that took it first. Slugs are unique by construction (assignSlug), but
 * older clients could write one themselves — so a later copy, a draft
 * included, can never take over someone's URL or its share preview.
 */
export function slugHolder<T extends Pick<QueryDocumentSnapshot, 'id' | 'get'>>(docs: T[]): T | null {
  const rank = (d: T) => {
    const at = d.get('publishedAt');
    return at instanceof Timestamp ? at.toMillis() : Number.POSITIVE_INFINITY;
  };
  return [...docs].sort((a, b) => rank(a) - rank(b) || (a.id < b.id ? -1 : 1))[0] ?? null;
}

/**
 * Whether a key could be a slug the server made: slugify writes only
 * lowercase ASCII letters, digits and hyphens. A key that can't be one — an
 * auto-id nearly always has a capital — is still asked of the slugs first
 * (an older client could write a slug itself), but its document is read in
 * the same breath rather than after the miss.
 */
export const slugShaped = (key: string) => /^[a-z0-9-]+$/.test(key);

/**
 * The card a URL segment names — by its slug, else by its document id — as
 * a snapshot, or null. Shared by every server-side resolver (the card page's
 * metadata, /api/cards/resolve, the v1 card reads) so they always agree.
 *
 * A key shaped like a slug is resolved before its document is read (reading
 * both at once would double the reads of the usual case, a slug that hits);
 * any other key is read both ways at once, the slug's holder still first.
 */
export async function cardByKey(db: Firestore, key: string) {
  if (!key || key.includes('/')) return null;
  const slugQuery = () => db.collection('cards').where('slug', '==', key).limit(10).get();
  // An id Firestore keeps for itself names no card (reading it would throw).
  if (isReservedId(key)) return slugHolder((await slugQuery()).docs);
  const idRead = () => db.collection('cards').doc(key).get();
  if (!slugShaped(key)) {
    const [bySlug, byId] = await Promise.all([slugQuery(), idRead()]);
    return slugHolder(bySlug.docs) ?? (byId.exists ? byId : null);
  }
  const holder = slugHolder((await slugQuery()).docs);
  if (holder) return holder;
  const byId = await idRead();
  return byId.exists ? byId : null;
}

/**
 * {@link cardByKey} for an answer that goes to anyone — a page's server
 * render (cached HTML), /api/cards/view, /api/cards/resolve — where no viewer
 * is known: a card in its author's trash names nothing there, exactly as a
 * deleted one. "Private" would say the document is still there, and it stays
 * there until the trash's 30 days run out or its author's account is purged
 * — whichever comes first, so an anonymous card that turned from "there" to
 * "gone" in the purge's minute would tell whose it was. Its author reads it
 * through the rules or GET /api/v1/cards/{key} (cardByKey, then canView).
 */
export async function cardByKeyForAnyone(db: Firestore, key: string) {
  const snap = await cardByKey(db, key);
  return snap && snap.get('trashedAt') == null ? snap : null;
}
