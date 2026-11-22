import { createHmac, generateKeyPairSync } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { accessClaims, ACCESS_TTL_S, AUDIENCE, ISSUER } from '@/server/domain/session';
import { AuthUnavailableError } from '@/server/domain/identity';
import type { IdentityVerifier } from '@/server/ports/identity';
import type { AccountStanding } from '@/server/ports/sessions';
import { verifierChain } from '../identityChain';
import { envJwtKeys, JwtKeysError, ourHeader, parseJwtKeys, signAccessToken, verifyAccessToken, type SigningKey } from './jwt';
import { jwtSessionSigner } from './signer';
import { resonanceJwtVerifier } from './verifier';

// Resonance's own access tokens (ADR 0004): ES256 by node:crypto, a `kid`
// per key, the current key signing and the previous ones still verifying —
// and nothing else ever accepted: no `none`, no HMAC keyed with our public
// key, no other curve, no tampered byte.

function ecJwk(kid: string, opts: { publicOnly?: boolean } = {}) {
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const jwk = privateKey.export({ format: 'jwk' }) as Record<string, string>;
  if (opts.publicOnly) delete jwk.d;
  return { kid, jwk };
}

const NOW = 1_800_000_000;
const claims = (over: Partial<ReturnType<typeof accessClaims>> = {}) => ({
  ...accessClaims({ sub: 'ann', sid: 'fam1', authTimeS: NOW - 60, nowS: NOW }),
  ...over,
});
const b64 = (v: unknown) => Buffer.from(typeof v === 'string' ? v : JSON.stringify(v)).toString('base64url');

describe('parseJwtKeys (RESONANCE_JWT_KEYS)', () => {
  it('is off when unset or blank, and reads the current key first then the previous ones', () => {
    expect(parseJwtKeys(undefined)).toEqual([]);
    expect(parseJwtKeys('  ')).toEqual([]);
    const keys = parseJwtKeys(JSON.stringify([ecJwk('new'), ecJwk('old', { publicOnly: true })]));
    expect(keys.map((k) => [k.kid, !!k.privateKey])).toEqual([
      ['new', true],
      ['old', false],
    ]);
  });

  it('refuses what it cannot use, loudly: not JSON, no list, a public-only current key, another key type, a twice-used kid', () => {
    const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ format: 'pem', type: 'pkcs8' }).toString();
    const p384 = generateKeyPairSync('ec', { namedCurve: 'P-384' }).privateKey.export({ format: 'jwk' });
    for (const raw of [
      '{',
      '[]',
      JSON.stringify({ kid: 'a' }),
      JSON.stringify([ecJwk('pub', { publicOnly: true })]),
      JSON.stringify([{ kid: 'rsa', pem: rsa }]),
      JSON.stringify([{ kid: 'p384', jwk: p384 }]),
      JSON.stringify([ecJwk('same'), ecJwk('same')]),
      JSON.stringify([{ kid: 'bad kid!', jwk: ecJwk('x').jwk }]),
    ]) {
      expect(() => parseJwtKeys(raw), raw.slice(0, 30)).toThrow(JwtKeysError);
    }
  });

  it('takes a PEM key as well as a JWK', () => {
    const pem = generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey.export({ format: 'pem', type: 'pkcs8' }).toString();
    const [key] = parseJwtKeys(JSON.stringify([{ kid: 'pem', pem }]));
    expect(verifyAccessToken(signAccessToken(claims(), [key]), [key], NOW)).toMatchObject({ sub: 'ann' });
  });
});

describe('signAccessToken / verifyAccessToken', () => {
  const keys = parseJwtKeys(JSON.stringify([ecJwk('k1')]));

  it('round-trips: ES256, a kid, our issuer and audience, 15 minutes at most', () => {
    const token = signAccessToken(claims(), keys);
    const [head] = token.split('.');
    expect(JSON.parse(Buffer.from(head, 'base64url').toString())).toEqual({ alg: 'ES256', typ: 'JWT', kid: 'k1' });
    expect(verifyAccessToken(token, keys, NOW)).toEqual({ iss: ISSUER, aud: AUDIENCE, sub: 'ann', iat: NOW, exp: NOW + ACCESS_TTL_S, auth_time: NOW - 60, sid: 'fam1' });
  });

  it('expires: good to its last second (with 30 s of skew), never after', () => {
    const token = signAccessToken(claims(), keys);
    expect(verifyAccessToken(token, keys, NOW + ACCESS_TTL_S + 29)).not.toBeNull();
    expect(verifyAccessToken(token, keys, NOW + ACCESS_TTL_S + 30)).toBeNull();
    // Issued well in the future, or for longer than an access token lives: not ours to have made.
    expect(verifyAccessToken(signAccessToken(claims({ iat: NOW + 120, exp: NOW + 600 }), keys), keys, NOW)).toBeNull();
    expect(verifyAccessToken(signAccessToken(claims({ exp: NOW + ACCESS_TTL_S + 1 }), keys), keys, NOW)).toBeNull();
  });

  it('refuses another issuer or audience, even signed by our key', () => {
    expect(verifyAccessToken(signAccessToken(claims({ iss: 'https://evil.example' }), keys), keys, NOW)).toBeNull();
    expect(verifyAccessToken(signAccessToken(claims({ aud: 'other' }), keys), keys, NOW)).toBeNull();
    expect(verifyAccessToken(signAccessToken(claims({ sub: '' }), keys), keys, NOW)).toBeNull();
  });

  it('refuses a tampered byte: the claims, the header or the signature', () => {
    const [head, body, sig] = signAccessToken(claims(), keys).split('.');
    const forged = b64({ ...claims(), sub: 'mallory' });
    expect(verifyAccessToken(`${head}.${forged}.${sig}`, keys, NOW)).toBeNull();
    expect(verifyAccessToken(`${b64({ alg: 'ES256', typ: 'JWT', kid: 'k1', x: 1 })}.${body}.${sig}`, keys, NOW)).toBeNull();
    const bad = Buffer.from(sig, 'base64url');
    bad[10] ^= 1;
    expect(verifyAccessToken(`${head}.${body}.${bad.toString('base64url')}`, keys, NOW)).toBeNull();
    expect(verifyAccessToken(`${head}.${body}`, keys, NOW)).toBeNull();
    expect(verifyAccessToken(`${head}.${body}.`, keys, NOW)).toBeNull();
  });

  it('refuses algorithm confusion: none, an HMAC keyed with our public key, another ECDSA size', () => {
    const body = b64(claims());
    const none = `${b64({ alg: 'none', typ: 'JWT', kid: 'k1' })}.${body}.`;
    expect(verifyAccessToken(none, keys, NOW)).toBeNull();
    expect(verifyAccessToken(`${none}AAAA`, keys, NOW)).toBeNull();
    const pub = keys[0].publicKey.export({ format: 'pem', type: 'spki' }).toString();
    const hsHead = b64({ alg: 'HS256', typ: 'JWT', kid: 'k1' });
    const hs = createHmac('sha256', pub).update(`${hsHead}.${body}`).digest('base64url');
    expect(verifyAccessToken(`${hsHead}.${body}.${hs}`, keys, NOW)).toBeNull();
    const [, , sig] = signAccessToken(claims(), keys).split('.');
    expect(verifyAccessToken(`${b64({ alg: 'ES384', typ: 'JWT', kid: 'k1' })}.${body}.${sig}`, keys, NOW)).toBeNull();
  });

  it('rotates by kid: the previous key still verifies what it signed, the new one signs, a retired one verifies nothing', () => {
    const before = parseJwtKeys(JSON.stringify([ecJwk('2026-08')]));
    const old = signAccessToken(claims(), before);
    const fresh = ecJwk('2026-11');
    const oldPublic = { kid: '2026-08', jwk: { ...(before[0].publicKey.export({ format: 'jwk' }) as object) } };
    const during = parseJwtKeys(JSON.stringify([fresh, oldPublic]));
    expect(verifyAccessToken(old, during, NOW)).toMatchObject({ sub: 'ann' });
    const next = signAccessToken(claims(), during);
    expect(ourHeader(next, during)?.kid).toBe('2026-11');
    const after = parseJwtKeys(JSON.stringify([fresh]));
    expect(verifyAccessToken(old, after, NOW)).toBeNull();
    expect(ourHeader(old, after)).toBeNull();
    expect(verifyAccessToken(next, after, NOW)).not.toBeNull();
    // A key of the same name but another pair: the signature is checked, not the name.
    expect(verifyAccessToken(next, parseJwtKeys(JSON.stringify([ecJwk('2026-11')])), NOW)).toBeNull();
  });

  it("doesn't take a Firebase ID token for one of its own", () => {
    const firebaseLike = `${b64({ alg: 'RS256', kid: 'abc123', typ: 'JWT' })}.${b64({ sub: 'ann' })}.c2ln`;
    expect(ourHeader(firebaseLike, keys)).toBeNull();
    expect(ourHeader('not a token', keys)).toBeNull();
  });
});

describe('resonanceJwtVerifier, first in the request chain', () => {
  const keys: SigningKey[] = parseJwtKeys(JSON.stringify([ecJwk('k1')]));
  const standingOf = (s: Awaited<ReturnType<AccountStanding['standing']>>) => ({ standing: vi.fn(async () => s) });
  const make = (standing: AccountStanding, k: () => readonly SigningKey[] = () => keys) => resonanceJwtVerifier({ standing, keys: k, nowS: () => NOW });
  const bearer = (c = claims()) => `Bearer ${signAccessToken(c, keys)}`;

  it("signs in the token's account, asking its standing as the request asks (reads cached, writes live)", async () => {
    const standing = standingOf({ disabled: false, validSince: 0 });
    const v = make(standing);
    expect(await v.verifyBearer(bearer(), { revocation: 'cached' })).toEqual({ id: 'ann', email: null, phoneNumber: null, emailVerified: false });
    expect(standing.standing).toHaveBeenLastCalledWith('ann', 'cached');
    await v.verifyBearer(bearer());
    expect(standing.standing).toHaveBeenLastCalledWith('ann', 'live');
  });

  it('refuses an account gone, disabled, or signed out everywhere after this sign-in — not one signed out before it', async () => {
    expect(await make(standingOf(null)).verifyBearer(bearer())).toBeNull();
    expect(await make(standingOf({ disabled: true, validSince: 0 })).verifyBearer(bearer())).toBeNull();
    expect(await make(standingOf({ disabled: false, validSince: (NOW - 30) * 1000 })).verifyBearer(bearer())).toBeNull();
    expect(await make(standingOf({ disabled: false, validSince: (NOW - 600) * 1000 })).verifyBearer(bearer())).not.toBeNull();
  });

  it('owns only its own tokens; with no keys (the feature off) it owns and verifies nothing', async () => {
    const v = make(standingOf({ disabled: false, validSince: 0 }));
    expect(v.owns!(bearer())).toBe(true);
    expect(v.owns!('Bearer eyJhbGciOiJSUzI1NiJ9.e30.c2ln')).toBe(false);
    expect(v.owns!(null)).toBe(false);
    const off = make(standingOf({ disabled: false, validSince: 0 }), () => []);
    expect(off.owns!(bearer())).toBe(false);
    expect(await off.verifyBearer(bearer())).toBeNull();
    expect(await v.verifySessionCookie('cookie')).toBeNull();
  });

  it('in the chain: its token never reaches Firebase (even a bad one); a Firebase token passes through unchanged; an outage stops it', async () => {
    const firebase: IdentityVerifier = {
      verifyBearer: vi.fn(async (a) => (a === 'Bearer firebase-token' ? { id: 'ben', email: 'b@x', phoneNumber: null, emailVerified: true } : null)),
      verifySessionCookie: vi.fn(async () => null),
    };
    const chain = verifierChain([make(standingOf({ disabled: false, validSince: 0 })), firebase]);
    expect(await chain.verifyBearer(bearer())).toMatchObject({ id: 'ann' });
    expect(await chain.verifyBearer(bearer(claims({ exp: NOW - 100, iat: NOW - 200 })))).toBeNull();
    expect(firebase.verifyBearer).not.toHaveBeenCalled();
    expect(await chain.verifyBearer('Bearer firebase-token', { revocation: 'cached' })).toMatchObject({ id: 'ben', email: 'b@x' });
    expect(firebase.verifyBearer).toHaveBeenCalledWith('Bearer firebase-token', { revocation: 'cached' });
    const down = verifierChain([make({ standing: async () => { throw new AuthUnavailableError(new Error('down')); } }), firebase]);
    await expect(down.verifyBearer(bearer())).rejects.toBeInstanceOf(AuthUnavailableError);
  });
});

describe('envJwtKeys', () => {
  it('remembers an unusable value as no keys, says so once, and parses again only when the value changes', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const env = { RESONANCE_JWT_KEYS: '[{"kid":"k1","jwk":{"kty":"EC"' };
      const standing: AccountStanding = { standing: async () => ({ disabled: false, validSince: 0 }) };
      const verifier = resonanceJwtVerifier({ standing, keys: () => envJwtKeys(env) });
      const signer = jwtSessionSigner(() => envJwtKeys(env));
      const bearer = 'Bearer eyJhbGciOiJFUzI1NiIsImtpZCI6ImsxIn0.e30.c2ln';
      for (let i = 0; i < 50; i++) {
        expect(verifier.owns?.(bearer)).toBe(false);
        expect(await verifier.verifyBearer(bearer)).toBeNull();
        expect(signer.enabled()).toBe(false);
      }
      expect(errors).toHaveBeenCalledTimes(1);
      expect(String(errors.mock.calls[0])).toContain('not JSON');
      // A new value is parsed: a good one is used, a bad one said once more.
      const good = ecJwk('k2');
      env.RESONANCE_JWT_KEYS = JSON.stringify([good]);
      expect(envJwtKeys(env).map((k) => k.kid)).toEqual(['k2']);
      expect(signer.enabled()).toBe(true);
      env.RESONANCE_JWT_KEYS = '[]';
      for (let i = 0; i < 10; i++) expect(envJwtKeys(env)).toEqual([]);
      expect(errors).toHaveBeenCalledTimes(2);
    } finally {
      errors.mockRestore();
    }
  });
});
