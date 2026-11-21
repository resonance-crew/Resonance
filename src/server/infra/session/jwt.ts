import { createHash, createPrivateKey, createPublicKey, randomBytes, sign, verify, type JsonWebKey, type KeyObject } from 'node:crypto';
import { claimsProblem, JWT_ALG, type AccessClaims } from '@/server/domain/session';

/**
 * Resonance's access tokens as JWTs (RFC 7519), signed ES256 with node:crypto —
 * no JWT library. The keys come from RESONANCE_JWT_KEYS, a JSON list, the
 * current key first (it signs), then the previous ones (they still verify,
 * for one access-token lifetime after a rotation):
 *
 *   [{ "kid": "2026-11", "jwk": { "kty": "EC", "crv": "P-256", "x": "…", "y": "…", "d": "…" } },
 *    { "kid": "2026-08", "jwk": { "kty": "EC", "crv": "P-256", "x": "…", "y": "…" } }]
 *
 * (`pem` instead of `jwk` takes a PEM key.) `npx tsx scripts/auth/jwtKey.ts`
 * makes one. Unset or empty, the feature is off: nothing signs, nothing verifies.
 */

export interface SigningKey {
  kid: string;
  /** Absent for a previous key kept only to verify. */
  privateKey: KeyObject | null;
  publicKey: KeyObject;
}

export class JwtKeysError extends Error {
  constructor(message: string) {
    super(`RESONANCE_JWT_KEYS: ${message}`);
    this.name = 'JwtKeysError';
  }
}

const KID = /^[A-Za-z0-9_.-]{1,64}$/;

/** The keys a RESONANCE_JWT_KEYS value names; [] when unset. Throws JwtKeysError on one it can't use. */
export function parseJwtKeys(raw: string | undefined): SigningKey[] {
  if (!raw || !raw.trim()) return [];
  let list: unknown;
  try {
    list = JSON.parse(raw);
  } catch {
    throw new JwtKeysError('not JSON');
  }
  if (!Array.isArray(list) || !list.length) throw new JwtKeysError('not a non-empty list');
  const keys = list.map((entry, i): SigningKey => {
    const e = entry as { kid?: unknown; jwk?: unknown; pem?: unknown };
    if (typeof e?.kid !== 'string' || !KID.test(e.kid)) throw new JwtKeysError(`entry ${i}: a kid of 1–64 of A–Z a–z 0–9 _ . -`);
    let privateKey: KeyObject | null = null;
    let publicKey: KeyObject;
    try {
      if (e.jwk && typeof e.jwk === 'object') {
        const jwk = e.jwk as JsonWebKey;
        privateKey = jwk.d ? createPrivateKey({ key: jwk, format: 'jwk' }) : null;
        publicKey = privateKey ? createPublicKey(privateKey) : createPublicKey({ key: jwk, format: 'jwk' });
      } else if (typeof e.pem === 'string') {
        privateKey = e.pem.includes('PRIVATE KEY') ? createPrivateKey(e.pem) : null;
        publicKey = privateKey ? createPublicKey(privateKey) : createPublicKey(e.pem);
      } else {
        throw new Error('no key');
      }
    } catch {
      throw new JwtKeysError(`entry ${i} (${e.kid}): not a key (jwk or pem)`);
    }
    const curve = publicKey.asymmetricKeyDetails?.namedCurve;
    if (publicKey.asymmetricKeyType !== 'ec' || (curve !== 'prime256v1' && curve !== 'P-256')) {
      throw new JwtKeysError(`entry ${i} (${e.kid}): an EC P-256 key is required (ES256)`);
    }
    return { kid: e.kid, privateKey, publicKey };
  });
  if (!keys[0].privateKey) throw new JwtKeysError('the first (current) key must be a private key: it signs');
  if (new Set(keys.map((k) => k.kid)).size !== keys.length) throw new JwtKeysError('two keys share a kid');
  return keys;
}

let cache: { raw: string | undefined; keys: SigningKey[] } | null = null;

/** The environment's keys, parsed once per value (a test may stub it). */
export function envJwtKeys(env: Record<string, string | undefined> = process.env): SigningKey[] {
  const raw = env.RESONANCE_JWT_KEYS;
  if (cache && cache.raw === raw) return cache.keys;
  const keys = parseJwtKeys(raw);
  cache = { raw, keys };
  return keys;
}

const b64url = (b: Buffer | string) => Buffer.from(b).toString('base64url');
const fromB64url = (s: string) => Buffer.from(s, 'base64url');

/** A signed access token for these claims, by the current key. */
export function signAccessToken(claims: AccessClaims, keys: readonly SigningKey[]): string {
  const key = keys[0];
  if (!key?.privateKey) throw new JwtKeysError('no signing key');
  const head = b64url(JSON.stringify({ alg: JWT_ALG, typ: 'JWT', kid: key.kid }));
  const body = b64url(JSON.stringify(claims));
  const signature = sign('sha256', Buffer.from(`${head}.${body}`), { key: key.privateKey, dsaEncoding: 'ieee-p1363' });
  return `${head}.${body}.${b64url(signature)}`;
}

const SEGMENT = /^[A-Za-z0-9_-]+$/;

/**
 * The header of a token that looks like one of ours (three base64url parts,
 * a JSON header naming one of our key ids), or null — so a Firebase ID token
 * passes on to the next verifier without a signature check here.
 */
export function ourHeader(token: string, keys: readonly SigningKey[]): { alg: unknown; kid: string } | null {
  const parts = token.split('.');
  if (parts.length !== 3 || !parts.every((p) => SEGMENT.test(p))) return null;
  try {
    const header = JSON.parse(fromB64url(parts[0]).toString('utf8')) as { alg?: unknown; kid?: unknown };
    if (typeof header?.kid !== 'string' || !keys.some((k) => k.kid === header.kid)) return null;
    return { alg: header.alg, kid: header.kid };
  } catch {
    return null;
  }
}

/**
 * The claims of a good token at `nowS`, or null: exactly ES256 (never `none`,
 * never an HMAC keyed with our public key), one of our key ids, the signature
 * that key made over these bytes, and claims domain/session.ts accepts.
 */
export function verifyAccessToken(token: string, keys: readonly SigningKey[], nowS: number): AccessClaims | null {
  const header = ourHeader(token, keys);
  if (!header || header.alg !== JWT_ALG) return null;
  const [head, body, sig] = token.split('.');
  const key = keys.find((k) => k.kid === header.kid)!;
  const signature = fromB64url(sig);
  if (signature.length !== 64) return null;
  let good = false;
  try {
    good = verify('sha256', Buffer.from(`${head}.${body}`), { key: key.publicKey, dsaEncoding: 'ieee-p1363' }, signature);
  } catch {
    return null;
  }
  if (!good) return null;
  let claims: unknown;
  try {
    claims = JSON.parse(fromB64url(body).toString('utf8'));
  } catch {
    return null;
  }
  return claimsProblem(claims, nowS) ? null : (claims as AccessClaims);
}

/** A new opaque refresh token (`rt1.` + 32 random bytes), and a new family id. */
export function newRefreshToken(): string {
  return `rt1.${randomBytes(32).toString('base64url')}`;
}
export function newFamilyId(): string {
  return randomBytes(16).toString('base64url');
}

/** What is stored of a refresh token: its SHA-256, hex (the token is 256 random bits: no salt needed). */
export function refreshHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
