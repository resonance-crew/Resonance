import type { AuthSession, AuthUser, IdentityAdmin, IdentityVerifier, SessionIssuer } from '@/server/ports/identity';

/**
 * Accounts at a pretend identity service, for unit tests: `addUser` makes
 * one, and gives it a bearer token (`token-of-<uid>`) and a session cookie
 * (`cookie-of-<uid>`). Disabled, revoked or deleted accounts verify as null,
 * as Firebase Auth's do; nothing is cached, so a revocation holds at once.
 */
export interface MemoryIdentity extends IdentityAdmin, IdentityVerifier, SessionIssuer {
  addUser(user: Partial<AuthUser> & { id: string }, opts?: { disabled?: boolean }): void;
  /** What happened to the accounts, in order: `revoke ann`, `delete ann`. */
  readonly actions: string[];
}

export function memoryIdentity(): MemoryIdentity {
  const users = new Map<string, { user: AuthUser; disabled: boolean; revoked: boolean }>();
  const actions: string[] = [];
  const known = (uid: string | undefined) => {
    const account = uid ? users.get(uid) : undefined;
    return account && !account.disabled && !account.revoked ? account.user : null;
  };
  return {
    actions,
    addUser(user, opts = {}) {
      users.set(user.id, {
        user: { email: null, phoneNumber: null, emailVerified: false, ...user },
        disabled: opts.disabled ?? false,
        revoked: false,
      });
    },
    async verifyBearer(authorization) {
      if (!authorization?.startsWith('Bearer token-of-')) return null;
      return known(authorization.slice('Bearer token-of-'.length));
    },
    async verifySessionCookie(cookie): Promise<AuthSession | null> {
      const user = cookie.startsWith('cookie-of-') ? known(cookie.slice('cookie-of-'.length)) : null;
      return user ? { user, expiresAt: null } : null;
    },
    async mintSessionCookie(idToken) {
      const uid = idToken.startsWith('token-of-') ? idToken.slice('token-of-'.length) : undefined;
      if (!known(uid)) throw new Error('auth/invalid-id-token');
      return `cookie-of-${uid}`;
    },
    async revokeSessions(uid) {
      actions.push(`revoke ${uid}`);
      const account = users.get(uid);
      if (account) account.revoked = true;
    },
    async deleteUser(uid) {
      actions.push(`delete ${uid}`);
      if (!users.delete(uid)) throw Object.assign(new Error('There is no user record'), { code: 'auth/user-not-found' });
    },
    async isDisabled(uid) {
      const account = users.get(uid);
      if (!account) throw Object.assign(new Error('There is no user record'), { code: 'auth/user-not-found' });
      return account.disabled;
    },
  };
}
