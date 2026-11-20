import { beforeEach, describe, expect, it, vi } from 'vitest';

// The identity ports over Firebase Auth: loaded on first use, on the one admin
// app Firestore shares (infra/firebase/app), and answering what
// src/lib/auth/firebase/server always did.

const apps: object[] = [];
const initializeApp = vi.fn(() => {
  const app = { name: '[DEFAULT]' };
  apps.push(app);
  return app;
});
vi.mock('firebase-admin/app', () => ({
  getApps: () => apps,
  getApp: () => apps[0],
  initializeApp,
  cert: vi.fn(() => ({})),
  applicationDefault: vi.fn(() => ({})),
}));
vi.mock('firebase-admin/firestore', () => ({ getFirestore: () => ({ kind: 'firestore' }), initializeFirestore: vi.fn() }));
let authLoaded = false;
const auth = {
  getUser: vi.fn(),
  deleteUser: vi.fn(async () => {}),
  revokeRefreshTokens: vi.fn(async () => {}),
  createSessionCookie: vi.fn(async () => 'session-cookie'),
  verifyIdToken: vi.fn(),
  verifySessionCookie: vi.fn(),
};
vi.mock('firebase-admin/auth', () => {
  authLoaded = true;
  return { getAuth: () => auth };
});

const { firebaseIdentityAdmin, firebaseIdentityVerifier, firebaseSessionIssuer } = await import('./identity');
const { getAdminDb } = await import('../firestore/db');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('the Firebase identity ports', () => {
  it('load no Auth SDK until used, then share the admin app Firestore made', async () => {
    const admin = firebaseIdentityAdmin();
    expect(authLoaded).toBe(false);
    getAdminDb();
    auth.getUser.mockResolvedValueOnce({ disabled: true });
    expect(await admin.isDisabled('ann')).toBe(true);
    expect(authLoaded).toBe(true);
    expect(initializeApp).toHaveBeenCalledTimes(1); // by Firestore, the first to ask; Auth used the same app
    expect(apps).toHaveLength(1);
  });

  it('revoke, delete and mint through the Admin SDK', async () => {
    const admin = firebaseIdentityAdmin();
    await admin.revokeSessions('ben');
    expect(auth.revokeRefreshTokens).toHaveBeenCalledWith('ben');
    await admin.deleteUser('ben');
    expect(auth.deleteUser).toHaveBeenCalledWith('ben');
    expect(await firebaseSessionIssuer().mintSessionCookie('id-token')).toBe('session-cookie');
    expect(auth.createSessionCookie).toHaveBeenCalledWith('id-token', { expiresIn: 7 * 24 * 60 * 60 * 1000 });
  });

  it('verify a bearer token and a session cookie as the auth module did', async () => {
    const token = { uid: 'cat', auth_time: Date.now() / 1000, exp: 2_000_000_000, email: 'cat@example.com' };
    auth.verifyIdToken.mockResolvedValue(token);
    auth.verifySessionCookie.mockResolvedValue(token);
    auth.getUser.mockResolvedValue({ disabled: false });
    const verifier = firebaseIdentityVerifier();
    expect(await verifier.verifyBearer('Basic nope')).toBeNull();
    expect(auth.verifyIdToken).not.toHaveBeenCalled();
    expect(await verifier.verifyBearer('Bearer t')).toEqual({ id: 'cat', email: 'cat@example.com', phoneNumber: null, emailVerified: false });
    expect(await verifier.verifySessionCookie('c')).toEqual({
      user: { id: 'cat', email: 'cat@example.com', phoneNumber: null, emailVerified: false },
      expiresAt: new Date(2_000_000_000_000),
    });
  });
});
