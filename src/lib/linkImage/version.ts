import { createHmac, hkdfSync } from 'node:crypto';

/**
 * A short tag for what a share image shows (FNV-1a, twice): the image's URL
 * carries it (`?v=`), so a new cover, photo or drawing is a new URL no cache
 * answers from the old one. For a stored picture, whose address is public
 * anyway; a drawn card's is keyed (`keyedImageVersion`).
 */
export function imageVersion(text: string): string {
  let a = 0x811c9dc5;
  let b = 0x01000193 ^ text.length;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b ^ c, 0x0100019d) >>> 0;
  }
  return a.toString(36) + b.toString(36);
}

/** Used only where there is no secret at all: tests, the emulators, `next dev`. */
const DEV_KEY = Buffer.from('resonance share-image development key (not a secret)');
const INFO = 'resonance share-image v1';

let derived: { from: string; key: Buffer } | null = null;
let warned = false;

/**
 * The key a drawn card's version is made with: HKDF-SHA256 (info "resonance
 * share-image v1") of `LINK_PREVIEW_SECRET` when it is set, else of the
 * Firebase service account's private key, which every deployment has and
 * never sends — so it is neither the key that signs link-preview pictures nor
 * anything else's. Without either, outside production, a fixed key. In
 * production without either it is null: the version is then left unkeyed (and
 * that is logged once) rather than failing the card page that names it.
 * Changing the secret changes every drawn card's URL: the old ones are sent on
 * to the new.
 */
export function shareVersionKey(env: Record<string, string | undefined> = process.env): Buffer | null {
  const secret = env.LINK_PREVIEW_SECRET?.trim() || env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n').trim();
  if (secret) {
    if (derived?.from !== secret) derived = { from: secret, key: Buffer.from(hkdfSync('sha256', secret, 'resonance', INFO, 32)) };
    return derived.key;
  }
  if (env.FIRESTORE_EMULATOR_HOST || env.NODE_ENV !== 'production') return DEV_KEY;
  if (!warned) {
    warned = true;
    console.warn('[og] no LINK_PREVIEW_SECRET or FIREBASE_PRIVATE_KEY: drawn cards are versioned unkeyed');
  }
  return null;
}

/**
 * A drawn card's version: an HMAC of what it shows, so a version can't be
 * made from what anyone can read — a pen name guessed for a card since made
 * anonymous, its text and date — and asked for to see whether the CDN still
 * holds the drawing under that name. Hex, so the URL needs no escaping.
 */
export function keyedImageVersion(text: string, key: Buffer | null = shareVersionKey()): string {
  if (!key) return imageVersion(text);
  return createHmac('sha256', key).update(text).digest('hex').slice(0, 20);
}
