import { hkdfSync } from 'node:crypto';

/**
 * Where the link-preview keys come from — the one place both of them are made,
 * so the picture signatures (`imageSigning.signingKey`) and the drawn cards'
 * versions (`linkImage/version.shareVersionKey`) can't drift apart.
 *
 * One source: `LINK_PREVIEW_SECRET`. Either the value
 * `scripts/ops/link-preview-secret.ts` prints — `derived-v1:<link>.<share>`,
 * the two keys exactly as they were once derived from the Firebase service
 * account's private key, base64url, which production and preview are pinned to
 * (docs/release/owed.md, 2026-11-22: every stored preview picture is signed
 * with that link key) — or any other text, which is (as it always was) the
 * picture key as it is, and the share key's HKDF input.
 *
 * Unset: null — never derived from FIREBASE_PRIVATE_KEY any more, so rotating
 * or moving the service account can't change, or leak through, these keys. The
 * callers decide: outside production a fixed development key (tests, the
 * emulator stacks, `next dev`); in production the pictures fail closed and the
 * versions go unkeyed, and the process says so once. `derivedKeys` stays only
 * for the ops script, which prints and checks the pinned value.
 */

export type LinkPreviewSecretSource = 'env';

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

/** A production process that holds real data (not the emulators): a production build off the emulators, or Vercel's production. */
export const isProductionProcess = (env: Env) =>
  (env.NODE_ENV === 'production' && !env.FIRESTORE_EMULATOR_HOST) || env.VERCEL_ENV === 'production';

/** The Firebase private key as PEM (an environment variable writes its new lines as `\n`). */
const pemOf = (env: Env) => env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n').trim() || '';

/**
 * Both keys as `FIREBASE_PRIVATE_KEY` derives them; null without one. Byte-for-byte what was signed before.
 * For scripts/ops/link-preview-secret.ts only: the running site never derives its keys.
 */
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
let warnedUnset = false;

/** The keys `LINK_PREVIEW_SECRET` names, or null when it is unset (see above). Throws on a malformed `derived-v1:` value. */
export function linkPreviewKeys(env: Env = process.env): LinkPreviewKeys | null {
  const explicit = env.LINK_PREVIEW_SECRET?.trim() || '';
  if (!explicit) {
    if (isProductionProcess(env) && !warnedUnset) {
      warnedUnset = true;
      console.error(
        '[link-preview] LINK_PREVIEW_SECRET is not set: preview pictures are neither signed nor served and drawn cards ' +
          'are versioned unkeyed. Set it to the deployment\'s pinned derived-v1 value (docs/release/owed.md).',
      );
    }
    return null;
  }
  if (cached?.from !== explicit) {
    const keys: LinkPreviewKeys = explicit.startsWith(DERIVED_PREFIX)
      ? { source: 'env', ...decodeDerivedSecret(explicit) }
      : { source: 'env', link: Buffer.from(explicit), share: hkdf(explicit, SHARE_INFO) };
    cached = { from: explicit, keys };
  }
  return cached.keys;
}
