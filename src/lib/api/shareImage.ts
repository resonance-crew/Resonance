import sharp from 'sharp';
import { getStorageProvider } from '@/lib/storage';
import { storageKeyOf } from '@/lib/storage/publicUrl';
import { MAX_INPUT_PIXELS } from '@/lib/storage/image';
import { OG_COVER_PATH } from '@/lib/og';
import { imageVersion } from '@/lib/linkImage/version';
import { createMemo } from '@/lib/links/memo';
import { Busy, createLimiter } from '@/lib/links/imageProxy';

/**
 * Share images (og:image): one of our stored pictures — AVIF or WebP, which
 * some platforms can't show — served as a JPEG (/api/og/user/{id}: at most
 * 1200 px a side; /api/og/card/{id}: a cover cropped to 1200 × 630, or the
 * card drawn at that size, lib/linkImage). The same for everyone, so the CDN
 * keeps it; the URL carries what it shows' version (`v`, see imageVersion),
 * so a new cover is a new URL. A day, not longer: a card made private or an
 * account deleted stops being shared by the CDN within one — and a drawn card
 * that names its author five minutes, the card page's own bound, so one made
 * anonymous stops showing its pen name within them.
 *
 * Each image has one URL, `{path}?v={version}`, and only that URL is made:
 * any other version, parameter or spelling the route can see is redirected to
 * it. Not all of them: the CDN keys its copy on the URL as it was asked for,
 * while Next hands a route one it has normalised (a percent-encoded name
 * decoded, its own `nxtP…`/`nxtI…` parameters dropped), so spellings no
 * redirect sees still reach the route. What an instance made is remembered by
 * its one URL for a while, and at most two are made at once (a few more wait,
 * the rest are told to come back), so no spelling makes the server draw or
 * decode over and over.
 */
export const SHARE_IMAGE_EDGE = 1200;
/** The most a stored picture may weigh to be turned into a share image (uploads are far smaller). */
const MAX_SOURCE_BYTES = 20 * 1024 * 1024;

const CACHE_VERSIONED = 'public, max-age=86400, s-maxage=86400';
/** A drawn card naming its author: as long as the card page's ISR may lag its card (revalidate = 300). */
const CACHE_NAMED = 'public, max-age=300, s-maxage=300';
/**
 * A URL that isn't the image's one URL (the page was rendered before the
 * picture changed, or the URL was made up) is sent on to it, kept by no
 * cache: a drawing's version can come back (an edit undone), and two kept
 * redirects, vA → vB and vB → vA, would send a platform round in a loop. Made
 * up, it costs a read of the card (and its author) and nothing more.
 */
const CACHE_REDIRECT = 'no-store';
/** Nothing to share (not public, no picture, unreadable): the platform cover, for a minute. */
const CACHE_FALLBACK = 'public, max-age=60, s-maxage=60';

/** Share images made at once by an instance, and how many more may wait their turn. */
const MAKING_AT_ONCE = 2;
const MAKING_WAITING = 8;
/** How long an instance remembers an image it made (its URL names exactly what it shows), and one it had nothing for. */
const KEEP_MADE_MS = 10 * 60_000;
const KEEP_NOTHING_MS = 60_000;
const KEEP_MAX = 32;

function newMemory() {
  return {
    making: createLimiter(MAKING_AT_ONCE, MAKING_WAITING),
    made: createMemo<Buffer | null>({
      max: KEEP_MAX,
      // Busy says nothing about the image: forgotten at once.
      keep: (outcome) => (outcome.ok ? (outcome.value ? KEEP_MADE_MS : KEEP_NOTHING_MS) : outcome.error instanceof Busy ? 0 : KEEP_NOTHING_MS),
    }),
  };
}
let memory = newMemory();

/** Forget every image made and free every slot (tests; an instance never needs to). */
export function forgetShareImages(): void {
  memory = newMemory();
}

/** A share image's one URL, path and query: the only one it is made for. */
export function shareImageUrl(path: string, version: string): string {
  return `${path}?v=${version}`;
}

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

/** A share image ready to send: kept by the CDN for a day under its version — five minutes when it names its author (`named`). */
export function shareJpegResponse(jpeg: Uint8Array, opts: { named?: boolean } = {}): Response {
  return new Response(new Uint8Array(jpeg), {
    headers: {
      'Content-Type': 'image/jpeg',
      'Content-Length': String(jpeg.byteLength),
      'Cache-Control': opts.named ? CACHE_NAMED : CACHE_VERSIONED,
    },
  });
}

/**
 * Where to send a request for `path` that isn't exactly its one URL
 * (`shareImageUrl`): there — whatever it differs in, the version, another
 * parameter, or the path or query spelled otherwise. Null for the URL itself.
 */
export function shareImageRedirect(req: Request, path: string, version: string): Response | null {
  const url = new URL(req.url);
  const canonical = shareImageUrl(path, version);
  if (url.pathname + url.search === canonical) return null;
  return new Response(null, { status: 302, headers: { Location: canonical, 'Cache-Control': CACHE_REDIRECT } });
}

/** Where to send a share-image request with nothing to share: the platform cover. */
export function shareImageFallback(): Response {
  return new Response(null, { status: 302, headers: { Location: OG_COVER_PATH, 'Cache-Control': CACHE_FALLBACK } });
}

/** Too many share images are being made at once: come back in a moment — not for a CDN or a platform to keep. */
function shareImageBusy(): Response {
  return new Response(null, { status: 503, headers: { 'Retry-After': '5', 'Cache-Control': 'no-store' } });
}

/**
 * The share image at its one URL `canonical`, made by `make` (null: nothing
 * to share) — or, when this instance made it lately, as it made it; an ask
 * that arrives while it is being made waits for that. `label` names it in the
 * log when making fails.
 */
export async function serveShareImage(
  canonical: string,
  make: () => Promise<Buffer | null>,
  opts: { named?: boolean; label: string },
): Promise<Response> {
  const { making, made } = memory;
  let jpeg: Buffer | null;
  try {
    jpeg = await made.get(canonical, () => making.run(make));
  } catch (e) {
    if (e instanceof Busy) return shareImageBusy();
    console.error(opts.label, e);
    return shareImageFallback();
  }
  return jpeg ? shareJpegResponse(jpeg, { named: opts.named }) : shareImageFallback();
}

/**
 * The share image at `path` for `sourceUrl` — only ever one of our stored
 * pictures (read through the storage API by its key, never fetched from an
 * arbitrary URL) — or the platform cover. Only its one URL is made; any other
 * is redirected to it.
 */
export async function shareImageResponse(
  req: Request,
  path: string,
  sourceUrl: string | null | undefined,
  opts: { version?: (url: string) => string; crop?: ShareCrop } = {},
): Promise<Response> {
  const key = storageKeyOf(sourceUrl);
  if (!sourceUrl || !key) return shareImageFallback();
  const version = (opts.version ?? imageVersion)(sourceUrl);
  const redirect = shareImageRedirect(req, path, version);
  if (redirect) return redirect;
  return serveShareImage(
    shareImageUrl(path, version),
    async () => {
      const bytes = await readStoredPicture(key);
      return bytes ? toShareJpeg(bytes, opts.crop) : null;
    },
    { label: `[og] share image ${key}` },
  );
}

/** One of our stored pictures, by its key (never fetched from a URL), or null when it is gone. */
export function readStoredPicture(key: string): Promise<Uint8Array | null> {
  return getStorageProvider().getObject(key, MAX_SOURCE_BYTES);
}
