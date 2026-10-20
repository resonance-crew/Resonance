import sharp from 'sharp';
import { getStorageProvider } from '@/lib/storage';
import { storageKeyOf } from '@/lib/storage/publicUrl';
import { MAX_INPUT_PIXELS } from '@/lib/storage/image';
import { OG_COVER_PATH } from '@/lib/og';
import { imageVersion } from '@/lib/linkImage/version';

/**
 * Share images (og:image): one of our stored pictures — AVIF or WebP, which
 * some platforms can't show — served as a JPEG (/api/og/user/{id}: at most
 * 1200 px a side; /api/og/card/{id}: a cover cropped to 1200 × 630, or the
 * card drawn at that size, lib/linkImage). The same for everyone, so the CDN
 * keeps it; the URL carries what it shows' version (`v`, see imageVersion),
 * so a new cover is a new URL. A day, not longer: a card made private or an
 * account deleted stops being shared by the CDN within one.
 */
export const SHARE_IMAGE_EDGE = 1200;
/** The most a stored picture may weigh to be turned into a share image (uploads are far smaller). */
const MAX_SOURCE_BYTES = 20 * 1024 * 1024;

const CACHE_VERSIONED = 'public, max-age=86400, s-maxage=86400';
/** A URL naming another version (the page was rendered before the picture changed) is sent on to the current one: briefly. */
const CACHE_REDIRECT = 'public, max-age=300, s-maxage=300';
/** Nothing to share (not public, no picture, unreadable): the platform cover, for a minute. */
const CACHE_FALLBACK = 'public, max-age=60, s-maxage=60';

/** A picture's size as a share image: cropped to exactly this (a card's cover: og:image:width / height say it). */
export interface ShareCrop {
  width: number;
  height: number;
}

/**
 * A picture as a share image: upright, on the paper colour where it was
 * transparent, JPEG — at most 1200 px a side, or cropped to `crop` from its
 * centre (scaled up when it is smaller, so the size is always the one named).
 */
export async function toShareJpeg(bytes: Uint8Array, crop?: ShareCrop): Promise<Buffer> {
  return sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS })
    .rotate()
    .resize(
      crop?.width ?? SHARE_IMAGE_EDGE,
      crop?.height ?? SHARE_IMAGE_EDGE,
      crop ? { fit: 'cover' } : { fit: 'inside', withoutEnlargement: true },
    )
    .flatten({ background: '#faf2e9' })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();
}

/** A share image ready to send: kept by the CDN for a day under its version. */
export function shareJpegResponse(jpeg: Uint8Array): Response {
  return new Response(new Uint8Array(jpeg), {
    headers: {
      'Content-Type': 'image/jpeg',
      'Content-Length': String(jpeg.byteLength),
      'Cache-Control': CACHE_VERSIONED,
    },
  });
}

/** Where to send a request naming another version than `version`: the current one, briefly cached. */
export function shareImageRedirect(req: Request, version: string): Response | null {
  const url = new URL(req.url);
  if (url.searchParams.get('v') === version) return null;
  return new Response(null, {
    status: 302,
    headers: { Location: `${url.pathname}?v=${version}`, 'Cache-Control': CACHE_REDIRECT },
  });
}

/** Where to send a share-image request with nothing to share: the platform cover. */
export function shareImageFallback(): Response {
  return new Response(null, { status: 302, headers: { Location: OG_COVER_PATH, 'Cache-Control': CACHE_FALLBACK } });
}

/**
 * The share image for `sourceUrl` — only ever one of our stored pictures
 * (read through the storage API by its key, never fetched from an arbitrary
 * URL) — or the platform cover. Only the current version's URL is drawn
 * (and then kept by the CDN); any other `v` is redirected to it, so made-up
 * URLs can't make the server decode and encode pictures over and over.
 */
export async function shareImageResponse(
  req: Request,
  sourceUrl: string | null | undefined,
  opts: { version?: (url: string) => string; crop?: ShareCrop } = {},
): Promise<Response> {
  const key = storageKeyOf(sourceUrl);
  if (!sourceUrl || !key) return shareImageFallback();
  const redirect = shareImageRedirect(req, (opts.version ?? imageVersion)(sourceUrl));
  if (redirect) return redirect;
  let jpeg: Buffer;
  try {
    const bytes = await readStoredPicture(key);
    if (!bytes) return shareImageFallback();
    jpeg = await toShareJpeg(bytes, opts.crop);
  } catch (e) {
    console.error('[og] share image', key, e);
    return shareImageFallback();
  }
  return shareJpegResponse(jpeg);
}

/** One of our stored pictures, by its key (never fetched from a URL), or null when it is gone. */
export function readStoredPicture(key: string): Promise<Uint8Array | null> {
  return getStorageProvider().getObject(key, MAX_SOURCE_BYTES);
}
