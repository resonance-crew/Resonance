import { storageKeyOf } from '@/lib/storage/publicUrl';

/**
 * A cover's smaller copy (B2, `FeedCard.imageThumbUrl`): the same picture at
 * most 960 px on its longer edge, WebP, stored beside the cover under a key
 * made from the cover's own — `image/2026-11/<uuid>.webp` →
 * `image/2026-11/<uuid>-w960.webp` — so whoever knows a cover's URL knows its
 * copy's, and nothing has to be written on the card for a list to find it.
 *
 * Every `image` upload since round 27 stores its copy beside it (the upload
 * route, the illustration route), and `npx tsx scripts/backfill.ts
 * cover-thumbs` made them for the covers before; a copy that is missing
 * anyway reads as a broken picture, which every list falls back from to
 * `imageUrl`. Pure — no storage client — so a client may ask it too.
 */
export const COVER_THUMB_SUFFIX = '-w960';

const IMAGE_KEY = /^(image\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+)\.(?:webp|avif|jpe?g|png|gif)$/;

/** The key a cover's copy is kept under, or null for a key that has none (not an `image/…` picture, or a copy itself). */
export function coverThumbKey(key: string | null | undefined): string | null {
  const m = key ? IMAGE_KEY.exec(key) : null;
  if (!m || m[1].endsWith(COVER_THUMB_SUFFIX)) return null;
  return `${m[1]}${COVER_THUMB_SUFFIX}.webp`;
}

/**
 * The public URL of a cover's copy: on the same base as the cover (a former
 * base serves the same keys), or null for a picture that isn't one of ours.
 */
export function coverThumbUrl(url: string | null | undefined, bases?: string | readonly string[]): string | null {
  const key = storageKeyOf(url, bases);
  const thumb = coverThumbKey(key);
  if (!url || !key || !thumb) return null;
  return `${url.slice(0, url.length - key.length)}${thumb}`;
}
