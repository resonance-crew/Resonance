import type { IdentityVerifier } from '@/server/ports/identity';
import { firebaseAccountStanding, firebaseIdentityVerifier } from './firebase-auth/identity';
import { resonanceJwtVerifier } from './session/verifier';

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
        // One of its own kind (a token of ours) is its answer alone: no one after it is asked.
        if (user || owns(verifier, authorization)) return user;
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

/**
 * Whether a verifier claims the credential as its own kind. Only a verifier's
 * own `owns` counts: a lazily loaded one (lazyAsync's proxy) answers every
 * method name with a promise, which must never pass for a yes.
 */
function owns(verifier: IdentityVerifier, authorization: string | null): boolean {
  return Object.prototype.hasOwnProperty.call(verifier, 'owns') && verifier.owns?.(authorization) === true;
}

let chain: IdentityVerifier | null = null;

/**
 * Who a request is, for getCurrentUser() (src/lib/auth): the chain of every
 * identity the server accepts — Resonance's own access tokens first (ADR
 * 0004: checked locally, then the account's standing at Firebase Auth), then
 * Firebase Auth's ID tokens and the web's session cookie, as before (dual
 * accept: installed builds keep sending Firebase tokens). Without
 * RESONANCE_JWT_KEYS the first verifier owns nothing, and the chain is
 * exactly Firebase Auth.
 */
export function requestVerifier(): IdentityVerifier {
  return (chain ??= verifierChain([resonanceJwtVerifier({ standing: firebaseAccountStanding() }), firebaseIdentityVerifier()]));
}
