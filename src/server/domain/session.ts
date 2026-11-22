/**
 * Resonance's own session tokens (ADR 0004): pure policy — lifetimes, the
 * claims an access token carries and what makes one good. The signing is
 * infra/session/jwt.ts (node:crypto), the store infra/{firestore,memory}/sessions.ts.
 */

/** An access token's life: short, so a revocation or a deletion holds within it. */
export const ACCESS_TTL_S = 15 * 60;
/** A refresh token's life from when it was issued; each refresh issues the next one. */
export const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/**
 * How long after a refresh token was traded the same token, presented again,
 * is taken for the client's own second try (two refreshes racing, a retry
 * after the answer was lost) rather than a thief's (L3, owner's call (b):
 * 30–60 s). Only while the token it was traded for is still unused: that
 * one is the newest of the family, so nothing has moved on since. The answer
 * is a quiet 409 that hands out nothing (`superseded`); past this, or once
 * the next token has been used too, it is theft.
 */
export const REFRESH_GRACE_MS = 30_000;

/**
 * What a used refresh token presented again at `atMs` is: the client's own
 * replay (`superseded`: within REFRESH_GRACE_MS of its use and the token it
 * was traded for still the newest, unused) or a stolen copy (`reused`).
 */
export function replayOf(input: { usedAtMs: number; atMs: number; successorUnused: boolean }): 'superseded' | 'reused' {
  const since = input.atMs - input.usedAtMs;
  return input.successorUnused && since >= 0 && since <= REFRESH_GRACE_MS ? 'superseded' : 'reused';
}

/** Clock skew tolerated between instances (a token "issued" slightly in the future). */
export const CLOCK_SKEW_S = 30;

/** Who signs (the `iss` claim) and for whom (`aud`). */
export const ISSUER = 'https://resonance.channel';
export const AUDIENCE = 'resonance-api';

/** The only algorithm signed or accepted: ECDSA P-256 with SHA-256. Never `none`, never an HMAC. */
export const JWT_ALG = 'ES256';

/** The identity providers an exchange takes. Today only Firebase Auth (its uid is the account's id, for good). */
export const PROVIDERS = ['firebase'] as const;
export type Provider = (typeof PROVIDERS)[number];

/** A refresh token as handed out: `rt1.` and 43 base64url characters (32 random bytes). */
export const REFRESH_TOKEN = /^rt1\.[A-Za-z0-9_-]{43}$/;

/** What an access token says. */
export interface AccessClaims {
  iss: string;
  aud: string;
  /** The account: the existing Firebase uid, never renumbered. */
  sub: string;
  iat: number;
  exp: number;
  /** When the sign-in this session came from was made good (s): a revocation after it ends the session. */
  auth_time: number;
  /** The refresh family (one exchange's sessions). */
  sid: string;
}

/**
 * The claims for `sub`'s new access token at `nowS`. Nothing personal rides
 * in a token (no e-mail, no phone): the server reads none of it from a
 * request, and a token is readable by whoever holds it.
 */
export function accessClaims(input: { sub: string; sid: string; authTimeS: number; nowS: number }): AccessClaims {
  return {
    iss: ISSUER,
    aud: AUDIENCE,
    sub: input.sub,
    iat: input.nowS,
    exp: input.nowS + ACCESS_TTL_S,
    auth_time: input.authTimeS,
    sid: input.sid,
  };
}

/**
 * Why decoded claims are no good at `nowS`, or null when they are: the
 * issuer and audience ours, a subject, not expired, not issued in the
 * future, never living longer than ACCESS_TTL_S.
 */
export function claimsProblem(c: unknown, nowS: number): string | null {
  if (!c || typeof c !== 'object') return 'claims';
  const k = c as Record<string, unknown>;
  if (k.iss !== ISSUER) return 'iss';
  if (k.aud !== AUDIENCE) return 'aud';
  if (typeof k.sub !== 'string' || !k.sub || k.sub.length > 128) return 'sub';
  if (typeof k.sid !== 'string' || !k.sid) return 'sid';
  for (const f of ['iat', 'exp', 'auth_time'] as const) if (typeof k[f] !== 'number' || !Number.isFinite(k[f])) return f;
  const iat = k.iat as number;
  const exp = k.exp as number;
  if (exp <= nowS - CLOCK_SKEW_S) return 'expired';
  if (iat > nowS + CLOCK_SKEW_S) return 'iat';
  if (exp - iat > ACCESS_TTL_S) return 'lifetime';
  if ((k.auth_time as number) > iat + CLOCK_SKEW_S) return 'auth_time';
  return null;
}

/**
 * Whether a session of a sign-in at `authTimeS` was revoked by a revocation
 * at `validSinceMs` — Firebase Auth's own rule for its tokens (seconds:
 * a revocation in the same second as the sign-in leaves it standing).
 */
export function revokedBy(authTimeS: number, validSinceMs: number): boolean {
  return authTimeS * 1000 < validSinceMs;
}
