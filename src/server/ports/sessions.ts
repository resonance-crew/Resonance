import type { AccessClaims } from '@/server/domain/session';
import type { RevocationCheck } from './identity';

/**
 * Resonance's own sessions (ADR 0004, plan decision 4): which identity at
 * which provider is which account (`identities`), and the refresh tokens
 * handed out by POST /api/v1/auth/exchange — kept only as their hashes
 * (`refreshTokens/{sha256}`), never the token itself. Server-only: no client
 * reads or writes either (firestore.rules).
 */

/** One stored refresh token. */
export interface RefreshRow {
  /** The account (an existing Firebase uid: never renumbered). */
  uid: string;
  /** Every token one exchange started, rotated from one to the next: revoked together. */
  family: string;
  /** When the session's sign-in at the identity provider was made good (ms): a revocation after it ends the session. */
  authTime: number;
  createdAt: Date;
  /** Past this the token is no good; the store's TTL removes the row some time after. */
  expiresAt: Date;
  /** When it was traded for the next one; a second use is a stolen token's (the family is revoked). */
  usedAt: Date | null;
}

/** What trading a refresh token for the next one came to. */
export type RotateOutcome =
  /** Traded: `row` is the token presented (now used); the next one is stored. */
  | { kind: 'rotated'; row: RefreshRow }
  /** Already traded once: its whole family is revoked now. */
  | { kind: 'reused'; uid: string }
  /** Past its `expiresAt` (its row is removed). */
  | { kind: 'expired' }
  /** No such token (never issued, logged out, revoked). */
  | { kind: 'unknown' };

export interface SessionStore {
  /**
   * The account behind `provider`'s `subject`: the one stored, or — the
   * first time — `userId`, stored then (`identities/{provider}_{subject}`).
   */
  linkIdentity(provider: string, subject: string, userId: string, at: Date): Promise<string>;
  /** Store a new refresh token by its hash. */
  putRefresh(hash: string, row: RefreshRow): Promise<void>;
  /** The stored token by its hash, or null. */
  getRefresh(hash: string): Promise<RefreshRow | null>;
  /**
   * In one transaction: the token `hash` marked used and `next` stored in its
   * family — unless it was used before (its family is revoked), has expired,
   * or is unknown. `at` decides expiry.
   */
  rotateRefresh(hash: string, nextHash: string, next: (row: RefreshRow) => RefreshRow, at: Date): Promise<RotateOutcome>;
  /** Delete every token of a family (logout, reuse). */
  revokeFamily(family: string): Promise<void>;
  /** Delete every token of an account (revokeSessions, the account purge). */
  revokeUser(uid: string): Promise<void>;
}

/**
 * Whether an account still stands at the identity provider: null when it is
 * gone (deleted, purged); `disabled`, and `validSince` (ms) — a session from a
 * sign-in before it was revoked. `'cached'` may answer what this instance saw
 * lately, as Firebase tokens' own check does. Throws AuthUnavailableError
 * when the provider can't be asked.
 */
export interface AccountStanding {
  standing(uid: string, revocation: RevocationCheck): Promise<{ disabled: boolean; validSince: number } | null>;
}

/** What signs Resonance's tokens and makes refresh tokens (infra/session/signer.ts). */
export interface SessionSigner {
  /** Whether sessions are on here (RESONANCE_JWT_KEYS set): off, the exchange answers 503. */
  enabled(): boolean;
  /** A signed access token for these claims (domain/session.ts accessClaims). */
  sign(claims: AccessClaims): string;
  /** A new opaque refresh token. */
  newRefreshToken(): string;
  /** A new refresh family id. */
  newFamily(): string;
  /** What is stored of a refresh token (its hash). */
  hash(token: string): string;
}
