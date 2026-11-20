import { describe, expect, it, vi } from 'vitest';
import { AuthUnavailableError } from '@/server/domain/identity';
import type { AuthUser, IdentityVerifier } from '@/server/ports/identity';
import { verifierChain } from './identityChain';
import { memoryIdentity } from './memory/identity';

// getCurrentUser() asks a chain of verifiers (today only Firebase Auth's), so
// a second identity can join without any caller changing.

const user = (id: string): AuthUser => ({ id, email: null, phoneNumber: null, emailVerified: false });

function only(prefix: string, id: string): IdentityVerifier {
  return {
    verifyBearer: vi.fn(async (authorization) => (authorization === `Bearer ${prefix}` ? user(id) : null)),
    verifySessionCookie: vi.fn(async (cookie) => (cookie === prefix ? { user: user(id), expiresAt: null } : null)),
  };
}

describe('verifierChain', () => {
  it('answers the first verifier that knows the credential, asking the rest no further', async () => {
    const ours = only('ours', 'ann');
    const firebase = only('firebase', 'ben');
    const chain = verifierChain([ours, firebase]);
    expect(await chain.verifyBearer('Bearer ours', { revocation: 'cached' })).toMatchObject({ id: 'ann' });
    expect(firebase.verifyBearer).not.toHaveBeenCalled();
    expect(await chain.verifyBearer('Bearer firebase', { revocation: 'live' })).toMatchObject({ id: 'ben' });
    expect(firebase.verifyBearer).toHaveBeenCalledWith('Bearer firebase', { revocation: 'live' });
    expect(await chain.verifySessionCookie('firebase')).toMatchObject({ user: { id: 'ben' } });
  });

  it('is no good when no verifier knows it, and with no verifier at all', async () => {
    expect(await verifierChain([only('a', 'ann')]).verifyBearer('Bearer forged')).toBeNull();
    expect(await verifierChain([only('a', 'ann')]).verifySessionCookie('forged')).toBeNull();
    expect(await verifierChain([]).verifyBearer('Bearer a')).toBeNull();
  });

  it('stops at an outage — a 500, never a sign-out', async () => {
    const down: IdentityVerifier = {
      verifyBearer: async () => {
        throw new AuthUnavailableError(new Error('socket hang up'));
      },
      verifySessionCookie: async () => null,
    };
    const after = only('x', 'ann');
    await expect(verifierChain([down, after]).verifyBearer('Bearer x')).rejects.toBeInstanceOf(AuthUnavailableError);
    expect(after.verifyBearer).not.toHaveBeenCalled();
  });

  it('chains the memory identity as it would Firebase Auth: revoked and deleted accounts are signed out at once', async () => {
    const identity = memoryIdentity();
    identity.addUser({ id: 'ann' });
    const chain = verifierChain([identity]);
    expect(await chain.verifyBearer('Bearer token-of-ann')).toMatchObject({ id: 'ann' });
    expect(await chain.verifySessionCookie(await identity.mintSessionCookie('token-of-ann'))).toMatchObject({ user: { id: 'ann' } });
    await identity.revokeSessions('ann');
    expect(await chain.verifyBearer('Bearer token-of-ann')).toBeNull();
    await identity.deleteUser('ann');
    await expect(identity.isDisabled('ann')).rejects.toMatchObject({ code: 'auth/user-not-found' });
    expect(identity.actions).toEqual(['revoke ann', 'delete ann']);
  });
});
