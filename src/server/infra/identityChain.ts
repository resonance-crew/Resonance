import type { IdentityVerifier } from '@/server/ports/identity';
import { firebaseIdentityVerifier } from './firebase-auth/identity';

/**
 * Several IdentityVerifiers as one: a credential is asked of each in order,
 * the first that knows it (a non-null answer) wins, and it is no good (null)
 * when none does. An outage (AuthUnavailableError) stops the chain there — a
 * 500, never a sign-out — so a verifier that decides locally (a signed token
 * of our own) goes before one that asks a service.
 */
export function verifierChain(verifiers: readonly IdentityVerifier[]): IdentityVerifier {
  return {
    async verifyBearer(authorization, opts) {
      for (const verifier of verifiers) {
        const user = await verifier.verifyBearer(authorization, opts);
        if (user) return user;
      }
      return null;
    },
    async verifySessionCookie(cookie, opts) {
      for (const verifier of verifiers) {
        const session = await verifier.verifySessionCookie(cookie, opts);
        if (session) return session;
      }
      return null;
    },
  };
}

let chain: IdentityVerifier | null = null;

/**
 * Who a request is, for getCurrentUser() (src/lib/auth): the chain of every
 * identity the server accepts. Today only Firebase Auth; a second identity
 * (Phase 3's own tokens) joins this list, and no caller changes.
 */
export function requestVerifier(): IdentityVerifier {
  return (chain ??= verifierChain([firebaseIdentityVerifier()]));
}
