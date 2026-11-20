import type { AuthSession, AuthUser } from '@/lib/auth/types';

export type { AuthSession, AuthUser };

/**
 * `'live'` asks the identity service whether the account was disabled or its
 * sessions revoked; `'cached'` trusts what this instance saw lately
 * (src/server/infra/firebase-auth/auth.ts, Revocation).
 */
export type RevocationCheck = 'live' | 'cached';

/**
 * Who a request is. Null for a credential that is no good (expired, forged,
 * revoked, disabled); throws AuthUnavailableError (src/server/domain/identity.ts) when the
 * service could not be asked (a 500, not a 401).
 */
export interface IdentityVerifier {
  /** `Authorization: Bearer <token>` (the apps). */
  verifyBearer(authorization: string | null, opts?: { revocation?: RevocationCheck }): Promise<AuthUser | null>;
  /** The web's session cookie. */
  verifySessionCookie(cookie: string, opts?: { revocation?: RevocationCheck }): Promise<AuthSession | null>;
}

/** What the server does to accounts at the identity service. */
export interface IdentityAdmin {
  /** Sign every device out (refresh tokens revoked; this instance forgets what it remembered). */
  revokeSessions(uid: string): Promise<void>;
  /** Delete the sign-in itself (the account purge's last step). */
  deleteUser(uid: string): Promise<void>;
  /** Whether the account is disabled at the identity service. */
  isDisabled(uid: string): Promise<boolean>;
}

/** Turns a sign-in at the identity provider into the web's session cookie. */
export interface SessionIssuer {
  mintSessionCookie(idToken: string): Promise<string>;
}
