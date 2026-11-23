/**
 * Pure slug helpers — no network, no Firebase. Kept dependency-free so the
 * uniqueness algorithm can be unit-tested with an injected `isTaken` checker.
 */

/** Normalize an arbitrary string into a URL-safe slug (ASCII, hyphenated). */
export function slugify(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // strip combining diacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-') // non-alphanumerics → hyphen
    .replace(/^-+|-+$/g, '') // trim edge hyphens
    .replace(/-{2,}/g, '-') // collapse runs
    .split('-')
    .slice(0, 8) // cap word count
    .join('-')
    .slice(0, 60);
}

/** Letters, digits, spaces and the punctuation a Latin-script title is written with (accents too: slugify strips them). */
const LATIN_TITLE = /^[\p{Script=Latin}\p{N}\s\p{P}\p{S}\u0300-\u036f]+$/u;

/**
 * A Latin-script title's slug base made here, with no model (B10): the
 * title's own words (slugify; its first six). Null for a title in any other
 * script — or with no letter at all —, which the model still turns into
 * English words.
 */
export function latinSlugBase(title: string): string | null {
  const clean = title.trim();
  if (!clean || !LATIN_TITLE.test(clean) || !/\p{Script=Latin}/u.test(clean)) return null;
  const base = slugify(clean).split('-').filter(Boolean).slice(0, 6).join('-');
  return /[a-z]/.test(base) ? base : null;
}

/** How many of the numbered candidates are asked at once once the base and the handle's are taken. */
export const SLUG_PROBE_BATCH = 8;

/**
 * Resolve a collision-free slug from a base.
 *
 * Strategy (per product spec):
 *   1. the base slug itself
 *   2. base + author handle           (on collision)
 *   3. base + author handle + number  (on further collision)
 *
 * `isTaken` reports whether a candidate is already used by *another* card.
 * The answer is always the first free candidate in that order; only how many
 * are asked at a time changed (round 32 §P6): the base alone first — nearly
 * every card's answer, and no handle needed — then, on a collision, the
 * handle's and the first numbered ones together (`SLUG_PROBE_BATCH`), so a
 * common title costs one more round trip, not one per card already holding
 * it. `handle` may still be on its way (the pen name read beside the base's
 * check): it is awaited only on a collision.
 */
export async function ensureUniqueSlug(
  base: string,
  handle: string | PromiseLike<string>,
  isTaken: (slug: string) => Promise<boolean>,
): Promise<string> {
  const root = base || 'story';
  if (!(await isTaken(root))) return root;

  const handleSlug = slugify(await handle);
  const withHandle = handleSlug ? `${root}-${handleSlug}` : root;
  // Numbered from 2 up to 999, as many as `count`.
  const numbered = (from: number, count: number) =>
    Array.from({ length: Math.max(0, Math.min(count, 1000 - from)) }, (_, i) => `${withHandle}-${from + i}`);
  // The handle's (when it differs from the base) leads the first batch.
  let batch = [...(withHandle !== root ? [withHandle] : []), ...numbered(2, SLUG_PROBE_BATCH)];
  let next = 2 + SLUG_PROBE_BATCH;
  while (batch.length) {
    const taken = await Promise.all(batch.map((c) => isTaken(c)));
    const free = taken.indexOf(false);
    if (free >= 0) return batch[free];
    batch = numbered(next, SLUG_PROBE_BATCH);
    next += SLUG_PROBE_BATCH;
  }
  // Pathological fallback — effectively never reached.
  return `${withHandle}-${Date.now()}`;
}
