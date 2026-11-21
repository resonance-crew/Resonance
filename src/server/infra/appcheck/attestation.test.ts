import { afterEach, describe, expect, it, vi } from 'vitest';

// The AttestationVerifier over App Check: the Admin SDK's App Check on the
// one admin app, the same answers as lib/appCheck/server's facades.

const appCheck = vi.hoisted(() => ({ verifyToken: vi.fn(), createToken: vi.fn() }));
vi.mock('firebase-admin/app-check', () => ({ getAppCheck: () => appCheck }));
const ensureAdminApp = vi.hoisted(() => vi.fn());
vi.mock('@/server/infra/firebase/app', () => ({ ensureAdminApp }));

const { appCheckVerifier } = await import('./attestation');
const facade = await import('@/lib/appCheck/server');

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe('appCheckVerifier', () => {
  const req = (token?: string) => new Request('https://x/api/v1/feed', { headers: token ? { 'X-Firebase-AppCheck': token } : {} });

  it('reads a request as missing (asking no one), valid with its app, or invalid', async () => {
    const verifier = appCheckVerifier();
    expect(await verifier.verify(req())).toEqual({ verdict: 'missing', platform: 'unknown' });
    expect(ensureAdminApp).not.toHaveBeenCalled();
    appCheck.verifyToken.mockResolvedValueOnce({ appId: '1:123:ios:abc' });
    expect(await verifier.verify(req('good'))).toEqual({ verdict: 'valid', platform: 'ios' });
    expect(ensureAdminApp).toHaveBeenCalled();
    appCheck.verifyToken.mockRejectedValueOnce(new Error('expired'));
    expect(await verifier.verify(req('old'))).toEqual({ verdict: 'invalid', platform: 'unknown' });
  });

  it("mints the web app's token for twelve hours, and refuses without its app id", async () => {
    vi.stubEnv('NEXT_PUBLIC_FIREBASE_APP_ID', '1:123:web:abc');
    appCheck.createToken.mockResolvedValueOnce({ token: 't', ttlMillis: 43_200_000 });
    expect(await appCheckVerifier().mintWebToken()).toEqual({ token: 't', ttlMillis: 43_200_000 });
    expect(appCheck.createToken).toHaveBeenCalledWith('1:123:web:abc', { ttlMillis: 12 * 60 * 60 * 1000 });
    vi.stubEnv('NEXT_PUBLIC_FIREBASE_APP_ID', '');
    await expect(appCheckVerifier().mintWebToken()).rejects.toThrow(/NEXT_PUBLIC_FIREBASE_APP_ID/);
  });

  it('is what the legacy exports answer', () => {
    expect(facade.checkAppCheck).toBe(appCheckVerifier().verify);
    expect(facade.mintWebToken).toBe(appCheckVerifier().mintWebToken);
  });
});
