import type { IdentityAdmin, IdentityVerifier, SessionIssuer } from '@/server/ports/identity';

const auth = () => import('@/lib/auth/firebase/server');

/**
 * Firebase Auth, by delegating to src/lib/auth/firebase/server (loaded on
 * first use). The identity lane moves the code here, sharing one admin app
 * with Firestore's (infra/firestore/db.ts).
 */
export function firebaseIdentityAdmin(): IdentityAdmin {
  return {
    revokeSessions: async (uid) => (await auth()).revokeSessions(uid),
    deleteUser: async (uid) => (await auth()).getAdminAuth().deleteUser(uid),
    isDisabled: async (uid) => (await (await auth()).getAdminAuth().getUser(uid)).disabled,
  };
}

/** Verifies a request's bearer token or session cookie (src/lib/auth/firebase/server). */
export function firebaseIdentityVerifier(): IdentityVerifier {
  return {
    verifyBearer: async (authorization, opts) => (await auth()).verifyBearerToken(authorization, opts),
    verifySessionCookie: async (cookie, opts) => (await auth()).verifySessionCookie(cookie, opts),
  };
}

/** Mints the web's session cookie from a Firebase ID token. */
export function firebaseSessionIssuer(): SessionIssuer {
  return {
    mintSessionCookie: async (idToken) => (await auth()).createSessionCookie(idToken),
  };
}
