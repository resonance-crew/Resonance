import { hkdfSync } from 'node:crypto';

/**
 * Where the link-preview keys come from — the one place both of them are made,
 * so the picture signatures (`imageSigning.signingKey`) and the drawn cards'
 * versions (`linkImage/version.shareVersionKey`) can't drift apart.
 *
 * Two keys, two sources:
 *
 * - `env`: `LINK_PREVIEW_SECRET` is set. Either the value
 *   `scripts/ops/link-preview-secret.ts` prints — `derived-v1:<link>.<share>`,
 *   the two keys exactly as they are derived today, base64url — or any other
 *   text, which is (as it always was) the picture key as it is, and the share
 *   key's HKDF input.
 * - `derived`: it isn't, and both keys are HKDF-SHA256 of the Firebase service
 *   account's private key (salt "resonance", infos below). Kept on purpose:
 *   every link-preview picture stored so far is signed with that key, and
 *   without it they would all 404. But rotating or moving the service account
 *   would orphan them just the same, so a production process says so once
 *   (docs/release/owed.md: set the derived value in Vercel, then drop this).
 *
 * Neither: null — the callers decide (a fixed key outside production; in
 * production the pictures fail closed and the versions go unkeyed).
 */

export type LinkPreviewSecretSource = 'env' | 'derived';

export interface LinkPreviewKeys {
  source: LinkPreviewSecretSource;
  /** HMAC key for `/api/link-image` signatures. */
  link: Buffer;
  /** HMAC key for a drawn card's `?v=`. */
  share: Buffer;
}

type Env = Record<string, string | undefined>;

const SALT = 'resonance';
export const LINK_INFO = 'resonance link-image v1';
export const SHARE_INFO = 'resonance share-image v1';
/** The prefix of a `LINK_PREVIEW_SECRET` that carries both keys as derived. */
export const DERIVED_PREFIX = 'derived-v1:';

const hkdf = (input: string, info: string) => Buffer.from(hkdfSync('sha256', input, SALT, info, 32));

/** A production process that holds real data (not the emulators). */
export const isProductionProcess = (env: Env) => env.NODE_ENV === 'production' && !env.FIRESTORE_EMULATOR_HOST;

/** The Firebase private key as PEM (an environment variable writes its new lines as `\n`). */
const pemOf = (env: Env) => env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n').trim() || '';

/** Both keys as `FIREBASE_PRIVATE_KEY` derives them; null without one. Byte-for-byte what was signed before. */
export function derivedKeys(env: Env): { link: Buffer; share: Buffer } | null {
  const pem = pemOf(env);
  return pem ? { link: hkdf(pem, LINK_INFO), share: hkdf(pem, SHARE_INFO) } : null;
}

/** The `LINK_PREVIEW_SECRET` value that makes an explicit setting sign exactly as the derived keys do. */
export function encodeDerivedSecret(keys: { link: Buffer; share: Buffer }): string {
  return `${DERIVED_PREFIX}${keys.link.toString('base64url')}.${keys.share.toString('base64url')}`;
}

function decodeDerivedSecret(value: string): { link: Buffer; share: Buffer } {
  const [link, share, ...rest] = value.slice(DERIVED_PREFIX.length).split('.');
  const a = Buffer.from(link ?? '', 'base64url');
  const b = Buffer.from(share ?? '', 'base64url');
  if (rest.length || a.length !== 32 || b.length !== 32) {
    throw new Error(`LINK_PREVIEW_SECRET starts with ${DERIVED_PREFIX} but is not two 32-byte keys: copy it again from scripts/ops/link-preview-secret.ts.`);
  }
  return { link: a, share: b };
}

let cached: { from: string; keys: LinkPreviewKeys } | null = null;
let warnedDerived = false;

export function linkPreviewKeys(env: Env = process.env): LinkPreviewKeys | null {
  const explicit = env.LINK_PREVIEW_SECRET?.trim() || '';
  const pem = explicit ? '' : pemOf(env);
  if (!explicit && !pem) return null;
  const from = explicit ? `env\n${explicit}` : `pem\n${pem}`;
  if (cached?.from !== from) {
    let keys: LinkPreviewKeys;
    if (explicit.startsWith(DERIVED_PREFIX)) keys = { source: 'env', ...decodeDerivedSecret(explicit) };
    else if (explicit) keys = { source: 'env', link: Buffer.from(explicit), share: hkdf(explicit, SHARE_INFO) };
    else keys = { source: 'derived', ...derivedKeys(env)! };
    cached = { from, keys };
  }
  if (cached.keys.source === 'derived' && isProductionProcess(env) && !warnedDerived) {
    warnedDerived = true;
    console.warn(
      '[link-preview] LINK_PREVIEW_SECRET is not set: link-preview keys are derived from FIREBASE_PRIVATE_KEY, ' +
        'so rotating the service account would orphan every stored preview picture. Set it to what ' +
        '`npx tsx scripts/ops/link-preview-secret.ts` prints (docs/release/owed.md).',
    );
  }
  return cached.keys;
}
