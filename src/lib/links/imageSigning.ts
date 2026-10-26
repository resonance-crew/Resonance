import { createHmac, hkdfSync, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import { isInternalHostName, isPublicAddress } from './ip';
import { normalizeLink } from './url';

/**
 * The signature on a link preview's picture address (see ./imageProxy for
 * why the route that serves it is signed). Only node:crypto here: whatever
 * makes a preview — a message's unfurl, a story's link cards — signs its
 * picture's address through this module and never loads the image decoder
 * (sharp), which only the route that serves the picture needs.
 */

export const LINK_IMAGE_PATH = '/api/link-image';

/** Used only where there is no secret at all: tests, the emulators, `next dev`. */
const DEV_KEY = Buffer.from('resonance link-image development key (not a secret)');

/**
 * The HMAC key. `LINK_PREVIEW_SECRET` if it is set; otherwise one derived
 * (HKDF-SHA256, info "resonance link-image v1") from the Firebase service
 * account's private key, which every deployment has and which is never sent
 * anywhere — so a deployment needs no extra setting, and the key it signs
 * with is not the one that signs anything else. Without either, only a
 * non-production process (emulators, dev, tests) gets a fixed key; production
 * fails closed, which means no pictures, not pictures anyone can sign.
 * Changing the secret orphans the pictures of previews already written (they
 * 404 and the card shows none) — the text of a preview keeps working.
 */
export function signingKey(env: Record<string, string | undefined> = process.env): Buffer {
  const explicit = env.LINK_PREVIEW_SECRET?.trim();
  if (explicit) return Buffer.from(explicit);
  const pem = env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n').trim();
  if (pem) return Buffer.from(hkdfSync('sha256', pem, 'resonance', 'resonance link-image v1', 32));
  if (env.FIRESTORE_EMULATOR_HOST || env.NODE_ENV !== 'production') return DEV_KEY;
  throw new Error('Set LINK_PREVIEW_SECRET (or FIREBASE_PRIVATE_KEY) to sign link-preview pictures.');
}

/** base64url(HMAC-SHA256(key, url)). */
export function signImageUrl(url: string, key: Buffer = signingKey()): string {
  return createHmac('sha256', key).update(url).digest('base64url');
}

/** Whether `signature` is the signature of `url` — compared in constant time, any malformed value is a no. */
export function verifyImageSignature(url: string, signature: string, key: Buffer = signingKey()): boolean {
  if (!/^[A-Za-z0-9_-]{43}$/.test(signature)) return false;
  const expected = Buffer.from(signImageUrl(url, key));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/**
 * The site-relative path a preview stores for its picture; clients resolve it
 * against their API/site origin. Null when `image` is not a URL the link
 * rules take (the card then shows no picture).
 */
export function imageProxyPath(image: string): string | null {
  const url = normalizeLink(image);
  if (!url) return null;
  // An address that can only be on our own network is not worth a signature (the fetch would refuse it anyway).
  const host = new URL(url).hostname;
  if (isIP(host) ? !isPublicAddress(host) : isInternalHostName(host)) return null;
  return `${LINK_IMAGE_PATH}?u=${encodeURIComponent(url)}&s=${signImageUrl(url)}`;
}
