import { ApiFailure } from '@/lib/api/v1/http';
import { accessClaims, ACCESS_TTL_S, REFRESH_TOKEN, REFRESH_TTL_MS, revokedBy, type Provider } from '@/server/domain/session';
import type { IdentityVerifier } from '@/server/ports/identity';
import type { Logger } from '@/server/ports/log';
import type { AddressLimiter, RateLimiter } from '@/server/ports/rateLimit';
import type { AccountStanding, RefreshRow, SessionSigner, SessionStore } from '@/server/ports/sessions';

/**
 * Resonance's own sessions (ADR 0004): POST /api/v1/auth/exchange trades a
 * sign-in at the identity provider (today a Firebase ID token) for a short
 * access token Resonance signs and an opaque refresh token; /auth/refresh
 * rotates the refresh token (each is good once — a second use, past the
 * client's own replay within REFRESH_GRACE_MS, signs the account out
 * everywhere); /auth/logout revokes it. The access token's subject is the
 * account's existing Firebase uid, for good (`identities` maps the provider's
 * subject to it, the same string today). getCurrentUser() accepts it beside
 * Firebase tokens (infra/identityChain.ts).
 */
export interface SessionDeps {
  store: SessionStore;
  signer: SessionSigner;
  /** The identity provider's tokens (Firebase Auth's verifier: its `verifyBearer`). */
  idp: IdentityVerifier;
  standing: AccountStanding;
  limits: RateLimiter;
  /** Per-address budgets for refresh and logout, spent before the token's row is read (ADDRESS_LIMITS). */
  addresses: AddressLimiter;
  /**
   * Sign the account out everywhere: Firebase's refresh tokens (the web's
   * cookie, every app) and every refresh family here — what a stolen
   * refresh token's reuse calls (IdentityAdmin.revokeSessions, withOwnSessions).
   */
  revokeSessions: (uid: string) => Promise<void>;
  log: Logger;
  now: () => Date;
}

/** A refresh token, and the address the request came from (null: none known). */
export interface RefreshInput {
  refreshToken: string;
  address?: string | null;
}

export interface SessionTokens {
  accessToken: string;
  tokenType: 'Bearer';
  /** Seconds the access token lives. */
  expiresIn: number;
  refreshToken: string;
  /** When the refresh token stops being good, whatever happens (ISO). */
  refreshExpiresAt: string;
  userId: string;
}

const OFF_MESSAGE = 'Sessions are not enabled here: keep using the identity provider\'s token.';
const off = () => new ApiFailure('internal', OFF_MESSAGE, undefined, 503);
const signedOut = (message: string) => new ApiFailure('unauthenticated', message);

function issue(deps: SessionDeps, session: Pick<RefreshRow, 'uid' | 'family' | 'authTime'>, at: Date) {
  const refreshToken = deps.signer.newRefreshToken();
  const stored: RefreshRow = {
    uid: session.uid,
    family: session.family,
    authTime: session.authTime,
    createdAt: at,
    expiresAt: new Date(at.getTime() + REFRESH_TTL_MS),
    usedAt: null,
  };
  return { refreshToken, hash: deps.signer.hash(refreshToken), stored };
}

function tokens(deps: SessionDeps, row: RefreshRow, refreshToken: string, at: Date): SessionTokens {
  const nowS = Math.floor(at.getTime() / 1000);
  const accessToken = deps.signer.sign(accessClaims({ sub: row.uid, sid: row.family, authTimeS: row.authTime, nowS }));
  return { accessToken, tokenType: 'Bearer', expiresIn: ACCESS_TTL_S, refreshToken, refreshExpiresAt: row.expiresAt.toISOString(), userId: row.uid };
}

/**
 * POST /api/v1/auth/exchange: the provider's token verified as a request's
 * would be on a write (live: a disabled or revoked account is refused), its
 * subject mapped to the account (the first time, to the same uid), a new
 * refresh family begun. 503 while sessions are off here, 401 for a token
 * that is no good, 429 past the budget.
 */
export async function exchangeIn(deps: SessionDeps, input: { provider: Provider; token: string }): Promise<SessionTokens> {
  if (!deps.signer.enabled()) throw off();
  const user = await deps.idp.verifyBearer(`Bearer ${input.token}`, { revocation: 'live' });
  if (!user) throw signedOut('That sign-in is no good: sign in again.');
  await deps.limits.spend(user.id, 'authExchange');
  const at = deps.now();
  // The account is the provider subject's, as first mapped; for Firebase, its uid itself (never renumbered).
  const uid = await deps.store.linkIdentity(input.provider, user.id, user.id, at);
  const { refreshToken, hash, stored } = issue(deps, { uid, family: deps.signer.newFamily(), authTime: Math.floor(at.getTime() / 1000) }, at);
  await deps.store.putRefresh(hash, stored);
  return tokens(deps, stored, refreshToken, at);
}

/**
 * POST /api/v1/auth/refresh: the refresh token traded for a new pair — once.
 * Presented again within REFRESH_GRACE_MS of that, while the token it was
 * traded for is still unused, it is the client's own second try (two
 * refreshes racing, a retry after a lost answer): 409 `conflict`, nothing
 * revoked and nothing handed out — never a second live pair, so a thief
 * racing the owner gains nothing either. The client uses the pair its other
 * request got or, holding none, logs this token out (which ends the family,
 * whoever won it) and exchanges again. Presented again otherwise — later, or
 * after the next token was used too — it is taken for stolen: the account
 * is signed out everywhere (revokeSessions: Firebase's tokens and every
 * family), logged, and the client signs in again. An account gone, disabled
 * or revoked since the sign-in ends its family too.
 */
export async function refreshIn(deps: SessionDeps, input: RefreshInput): Promise<SessionTokens> {
  if (!deps.signer.enabled()) throw off();
  // Before the row is read: whose token it is isn't known yet, so its address pays.
  await deps.addresses.spend(input.address ?? null, 'authRefresh');
  const expired = () => signedOut('This session has ended: sign in again.');
  if (!REFRESH_TOKEN.test(input.refreshToken)) throw expired();
  const hash = deps.signer.hash(input.refreshToken);
  const row = await deps.store.getRefresh(hash);
  if (!row) throw expired();
  await deps.limits.spend(row.uid, 'authRefresh');
  const standing = await deps.standing.standing(row.uid, 'live');
  if (!standing || standing.disabled || revokedBy(row.authTime, standing.validSince)) {
    await deps.store.revokeFamily(row.family);
    throw expired();
  }
  const at = deps.now();
  const { refreshToken, hash: nextHash, stored } = issue(deps, { uid: row.uid, family: row.family, authTime: row.authTime }, at);
  const outcome = await deps.store.rotateRefresh(hash, nextHash, () => stored, at);
  if (outcome.kind === 'superseded') {
    throw new ApiFailure('conflict', 'Another refresh of this session came first: use the tokens it answered, or log this one out and exchange again.');
  }
  if (outcome.kind === 'reused') {
    // Never the client's own replay (that is `superseded`): a stolen copy, its thief's or the owner's.
    deps.log.warn('[auth] a used refresh token presented again: the account is signed out everywhere', { uid: outcome.uid, family: outcome.family });
    try {
      await deps.revokeSessions(outcome.uid);
    } catch (e) {
      // The family is gone already (rotateRefresh); the rest is retried by the next reuse or done by hand.
      deps.log.error('[auth] signing out everywhere after a refresh token reuse failed', { uid: outcome.uid }, e);
    }
    throw expired();
  }
  if (outcome.kind !== 'rotated') throw expired();
  return tokens(deps, stored, refreshToken, at);
}

/**
 * POST /api/v1/auth/logout: the refresh token's family revoked (the access
 * token it came with stands until it expires, ≤ 15 minutes). Unknown or
 * already revoked: nothing to do, the same answer. Its address's budget is
 * spent before the row is read (429 past it).
 */
export async function logoutIn(deps: SessionDeps, input: RefreshInput): Promise<void> {
  await deps.addresses.spend(input.address ?? null, 'authLogout');
  if (!REFRESH_TOKEN.test(input.refreshToken)) return;
  const row = await deps.store.getRefresh(deps.signer.hash(input.refreshToken));
  if (row) await deps.store.revokeFamily(row.family);
}
