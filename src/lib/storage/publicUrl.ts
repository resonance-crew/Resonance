/**
 * Where the storage's public bases are read from (process.env unless given).
 * MEDIA_PUBLIC_BASE / MEDIA_FORMER_BASES are the names the middle layer reads
 * (src/server/infra/env/media.ts); the R2_ names are their aliases, read when
 * the MEDIA_ one is unset or empty — so a deployment that sets only the R2_
 * names (every one so far) behaves as before.
 */
export interface PublicBaseEnv {
  MEDIA_PUBLIC_BASE?: string;
  MEDIA_FORMER_BASES?: string;
  R2_PUBLIC_BASE?: string;
  R2_FORMER_PUBLIC_BASES?: string;
}

const trimBase = (base: string) => base.trim().replace(/\/+$/, '');

/** Where new pictures go, as set: MEDIA_PUBLIC_BASE, else R2_PUBLIC_BASE; undefined when neither is. */
export function currentPublicBaseSetting(env: PublicBaseEnv = process.env as PublicBaseEnv): string | undefined {
  return env.MEDIA_PUBLIC_BASE || env.R2_PUBLIC_BASE || undefined;
}

/**
 * Earlier public bases of the same bucket (MEDIA_FORMER_BASES, else
 * R2_FORMER_PUBLIC_BASES, comma-separated): while the storage moves to a new
 * host, the old one still serves every key, and pictures stored before the
 * move still name it. Never the current base; without trailing slashes.
 */
export function formerPublicBases(env: PublicBaseEnv = process.env as PublicBaseEnv): string[] {
  const setting = currentPublicBaseSetting(env);
  const current = setting ? trimBase(setting) : '';
  const former = (env.MEDIA_FORMER_BASES || env.R2_FORMER_PUBLIC_BASES || '').split(',').map(trimBase);
  return [...new Set(former.filter((base) => base && base !== current))];
}

/**
 * Every base our stored pictures are served from: the current one
 * (MEDIA_PUBLIC_BASE, else R2_PUBLIC_BASE: where new ones go) first, then the
 * former ones. Empty when the server knows none.
 */
export function publicBases(env: PublicBaseEnv = process.env as PublicBaseEnv): string[] {
  const setting = currentPublicBaseSetting(env);
  const current = setting ? trimBase(setting) : '';
  return [...(current ? [current] : []), ...formerPublicBases(env)];
}

/**
 * The bucket key behind one of our own public image URLs (`<base>/<key>`,
 * on the current base or a former one — the same key either way), or null for
 * any other URL — a picture hosted elsewhere, or something that only looks
 * like ours (`..`, an empty segment, odd characters). The keys we write are
 * `{kind}/{yyyy-mm}/{uuid}.{ext}` (older ones `{kind}/{ownerId}/{yyyy-mm}/…`).
 * Pure: no storage client, so metadata code may ask it too.
 */
export function storageKeyOf(
  url: string | null | undefined,
  bases: string | readonly string[] | undefined = publicBases(),
): string | null {
  if (!url || !bases) return null;
  for (const publicBase of typeof bases === 'string' ? [bases] : bases) {
    const key = keyUnder(url, publicBase);
    if (key) return key;
  }
  return null;
}

function keyUnder(url: string, publicBase: string): string | null {
  if (!publicBase) return null;
  const base = `${publicBase.replace(/\/+$/, '')}/`;
  if (!url.startsWith(base)) return null;
  const key = url.slice(base.length);
  if (!/^[A-Za-z0-9_.\-/]{1,512}$/.test(key)) return null;
  if (key.split('/').some((segment) => segment === '' || segment === '.' || segment === '..')) return null;
  return key;
}
