// Legacy facades: Firebase Auth's Admin SDK code moved to
// src/server/infra/firebase-auth/auth.ts (one admin app with Firestore's);
// the routes (auth/session, account/deletion, cron/purge-accounts) and their
// tests import it here. What stays is the request side — reading the
// request's credentials (next/headers) and asking the identity chain.
import { cookies, headers } from 'next/headers';
import { requestVerifier } from '@/server/infra/identityChain';
import type { AuthOptions } from '@/server/infra/firebase-auth/auth';
import type { AuthSession, AuthUser } from '../types';

export {
  REVOCATION_CACHE_MS,
  createSessionCookie,
  forgetAccountState,
  getAdminAuth,
  isAuthOutage,
  revokeSessions,
  verifyBearerToken,
  verifySessionCookie,
  type AuthOptions,
} from '@/server/infra/firebase-auth/auth';
export { AuthUnavailableError } from '@/server/domain/identity';
export type { RevocationCheck } from '@/server/ports/identity';

export const SESSION_COOKIE_NAME = process.env.FIREBASE_SESSION_COOKIE_NAME ?? '__session';

/** The web's session, from its cookie, or null. */
export async function getServerSession(opts: AuthOptions = {}): Promise<AuthSession | null> {
  const store = await cookies();
  const sessionCookie = store.get(SESSION_COOKIE_NAME)?.value;
  if (!sessionCookie) return null;
  return requestVerifier().verifySessionCookie(sessionCookie, opts);
}

/**
 * The signed-in user, or null: the bearer token if the request has one (the
 * apps), else the session cookie (the web), each asked of the identity chain
 * (src/server/infra/identityChain.ts — Firebase Auth today). Throws
 * AuthUnavailableError when the identity service couldn't be asked (a 500, not a 401).
 */
export async function getCurrentUser(opts: AuthOptions = {}): Promise<AuthUser | null> {
  const authorization = (await headers()).get('authorization');
  if (authorization) return requestVerifier().verifyBearer(authorization, opts);
  return (await getServerSession(opts))?.user ?? null;
}

export async function requireUser(opts: AuthOptions = {}): Promise<AuthUser> {
  const user = await getCurrentUser(opts);
  if (!user) throw new Error('Authentication required');
  return user;
}
