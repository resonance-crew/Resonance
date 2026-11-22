import type { SessionDeps } from '@/server/app/auth';
import type { ServerCtx } from '@/server/ctx';
import type { IdentityAdmin } from '@/server/ports/identity';
import type { SessionStore } from '@/server/ports/sessions';
import { getAdminDb } from '@/lib/db/firestore/admin';
import { firestoreSessionStore } from '../firestore/sessions';
import { instanceAddressLimiter } from '../memory/addressBudget';
import { firebaseAccountStanding, firebaseIdentityVerifier } from '../firebase-auth/identity';
import { jwtSessionSigner } from './signer';

/**
 * What the /api/v1/auth routes need, on the server's Firestore (through
 * '@/lib/db/firestore/admin', which the emulator suites mock, as serverCtx's): the session store,
 * the signer over RESONANCE_JWT_KEYS, Firebase Auth as the identity provider
 * (its tokens, and whether an account still stands), the context's
 * budgets, clock, log and signing out everywhere, and this instance's per-address budgets.
 */
export function sessionDeps(ctx: Pick<ServerCtx, 'limits' | 'clock' | 'identity' | 'log'>, overrides: Partial<SessionDeps> = {}): SessionDeps {
  return {
    store: firestoreSessionStore(getAdminDb()),
    signer: jwtSessionSigner(),
    idp: firebaseIdentityVerifier(),
    standing: firebaseAccountStanding(),
    limits: ctx.limits,
    addresses: instanceAddressLimiter(),
    // The context's identity admin is withOwnSessions' (infra/firestore/ctx.ts): Firebase's tokens and every family here.
    revokeSessions: (uid) => ctx.identity.revokeSessions(uid),
    log: ctx.log,
    now: () => ctx.clock.date(),
    ...overrides,
  };
}

/**
 * The identity admin with Resonance's own sessions in it: signing an account
 * out everywhere (account deletion, a reported compromise) revokes its
 * refresh families too, so no device can refresh past its current access
 * token (≤ 15 minutes) — and that token itself fails once the account is
 * revoked at Firebase Auth (infra/session/verifier.ts, `auth_time`).
 */
export function withOwnSessions(admin: IdentityAdmin, store: SessionStore): IdentityAdmin {
  return {
    async revokeSessions(uid) {
      await admin.revokeSessions(uid);
      await store.revokeUser(uid);
    },
    deleteUser: (uid) => admin.deleteUser(uid),
    isDisabled: (uid) => admin.isDisabled(uid),
  };
}
