import { revokedBy } from '@/server/domain/session';
import type { AuthUser, IdentityVerifier } from '@/server/ports/identity';
import type { AccountStanding } from '@/server/ports/sessions';
import { envJwtKeys, ourHeader, verifyAccessToken, type SigningKey } from './jwt';

/**
 * Resonance's own access tokens (POST /api/v1/auth/exchange) as an
 * IdentityVerifier. It goes first in the request chain
 * (infra/identityChain.ts): a token that isn't ours (a Firebase ID token)
 * gets null at once, with no signature check, and Firebase Auth's verifier
 * takes it; one of ours is checked here, locally, and then its account's
 * standing — gone (deleted, purged), disabled, or its sessions revoked after
 * this sign-in — exactly as Firebase tokens are: writes ask live, reads may
 * take what this instance saw lately (`revocation: 'cached'`). No keys
 * (RESONANCE_JWT_KEYS unset): nothing is ours. The web's cookie is never ours.
 */
export function resonanceJwtVerifier(deps: {
  standing: AccountStanding;
  keys?: () => readonly SigningKey[];
  nowS?: () => number;
}): IdentityVerifier {
  const keys = deps.keys ?? (() => envJwtKeys());
  const nowS = deps.nowS ?? (() => Math.floor(Date.now() / 1000));
  const ourKeys = (): readonly SigningKey[] => {
    try {
      return keys();
    } catch (e) {
      // A key set that can't be read verifies nothing (and says so); Firebase tokens go on working.
      console.error('[auth] RESONANCE_JWT_KEYS', e instanceof Error ? e.message : e);
      return [];
    }
  };
  const tokenOf = (authorization: string | null) => (authorization?.startsWith('Bearer ') ? authorization.slice(7).trim() : null);
  return {
    owns(authorization) {
      const token = tokenOf(authorization);
      const ours = token ? ourKeys() : [];
      return !!token && ours.length > 0 && ourHeader(token, ours) !== null;
    },
    async verifyBearer(authorization, opts) {
      const token = tokenOf(authorization);
      if (!token) return null;
      const ours = ourKeys();
      if (!ours.length || !ourHeader(token, ours)) return null;
      const claims = verifyAccessToken(token, ours, nowS());
      if (!claims) return null;
      const standing = await deps.standing.standing(claims.sub, opts?.revocation ?? 'live');
      if (!standing || standing.disabled || revokedBy(claims.auth_time, standing.validSince)) return null;
      const user: AuthUser = { id: claims.sub, email: null, phoneNumber: null, emailVerified: false };
      return user;
    },
    async verifySessionCookie() {
      return null;
    },
  };
}
