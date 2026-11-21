/**
 * Pure policy on cards, shared by the services and the repositories (no I/O,
 * no vendor types).
 */

/** Epoch milliseconds of a stored time — a store's timestamp (anything with `toMillis()`) or a Date — else null. */
export function storedMillis(at: unknown): number | null {
  if (at instanceof Date) return Number.isNaN(at.getTime()) ? null : at.getTime();
  const toMillis = (at as { toMillis?: unknown } | null | undefined)?.toMillis;
  if (typeof toMillis === 'function') {
    const ms = toMillis.call(at) as unknown;
    return typeof ms === 'number' && Number.isFinite(ms) ? ms : null;
  }
  return null;
}

/**
 * Whether a card's publishedAt is a real server stamp. The rules only let the
 * server set it now, but a card written before that could carry any value —
 * a string (which Firestore sorts above every timestamp) or a far-future
 * date — to sit on top of the feed; such a card is skipped, never fatal.
 * A stored timestamp as Firestore answers it, or the Date a repository made
 * of one.
 */
export function properlyPublished(at: unknown, now = Date.now()): boolean {
  const ms = storedMillis(at);
  return ms !== null && ms <= now + 60 * 60 * 1000;
}

/**
 * Whether `key` reached an anonymous card by its slug for someone other than
 * its author. Such a card is reached by its id alone (cardShareKey): its slug
 * was made while it was named and, if the title's slug was taken, ends in its
 * author's pen name (lib/ai/slugify) — and slugs never change, so a slug that
 * leads to an anonymous card would confirm a guess at who wrote it.
 */
export function anonymousBySlugCard(card: { id: string; anonymous?: unknown; authorId?: unknown }, key: string, viewerId: string | null): boolean {
  return card.anonymous === true && card.id !== key && card.authorId !== viewerId;
}

/** A document id that can safely be put in a path (hand-edited data could hold anything). */
export const docIdOk = (id: unknown): id is string => typeof id === 'string' && id.length > 0 && !id.includes('/');
