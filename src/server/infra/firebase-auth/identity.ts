import type { IdentityAdmin, IdentityVerifier, SessionIssuer } from '@/server/ports/identity';
import type { AccountStanding } from '@/server/ports/sessions';
import { lazyAsync } from '../wiring';

/**
 * The identity ports over Firebase Auth (./auth.ts, the Admin SDK), loaded on
 * first use — so building a context (infra/firestore/ctx) loads no Auth SDK.
 */
const auth = () => import('./auth');

/** What the server does to accounts at Firebase Auth. */
export function firebaseIdentityAdmin(): IdentityAdmin {
  return lazyAsync<IdentityAdmin>(async () => {
    const { getAdminAuth, revokeSessions } = await auth();
    return {
      revokeSessions,
      deleteUser: async (uid) => getAdminAuth().deleteUser(uid),
      isDisabled: async (uid) => (await getAdminAuth().getUser(uid)).disabled,
    };
  });
}

/** Verifies a request's Firebase ID token (bearer) or the web's session cookie. */
export function firebaseIdentityVerifier(): IdentityVerifier {
  return lazyAsync<IdentityVerifier>(async () => {
    const { verifyBearerToken, verifySessionCookie } = await auth();
    return { verifyBearer: verifyBearerToken, verifySessionCookie };
  });
}

/** Mints the web's session cookie from a Firebase ID token. */
export function firebaseSessionIssuer(): SessionIssuer {
  return lazyAsync<SessionIssuer>(async () => ({ mintSessionCookie: (await auth()).createSessionCookie }));
}

/** Whether an account still stands at Firebase Auth (gone, disabled, revoked since), for Resonance's own tokens. */
export function firebaseAccountStanding(): AccountStanding {
  return lazyAsync<AccountStanding>(async () => ({ standing: (await auth()).accountStanding }));
}
