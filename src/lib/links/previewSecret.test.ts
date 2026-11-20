import { createHmac, hkdfSync } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { keyedImageVersion, shareVersionKey } from '@/lib/linkImage/version';
import { signImageUrl, signingKey } from './imageSigning';
import { derivedKeys, encodeDerivedSecret, linkPreviewKeys } from './previewSecret';

// Where the link-preview keys come from. Every picture signature already
// stored was made with the key derived from FIREBASE_PRIVATE_KEY, so the
// derivation must not move by a byte, and the value the ops script prints for
// Vercel must sign exactly as it does — else every stored preview picture 404s.

const PEM = '-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASC\n-----END PRIVATE KEY-----\n';
// HKDF-SHA256(PEM, salt "resonance", info …, 32), computed outside this code.
const LINK_HEX = 'f293e564efaf84e5d2e5f795b8c0333741b24b56ef955c925a40247c98bca939';
const SHARE_HEX = '45c5b244a5db8b60c206bfcc20660dc3d0509665a920d2fcc8dd0d27c4af3438';
const URL = 'https://example.com/a.png';

afterEach(() => vi.restoreAllMocks());

describe('the link-preview keys', () => {
  it('are the explicit LINK_PREVIEW_SECRET when it is set, ahead of the Firebase key', () => {
    const keys = linkPreviewKeys({ LINK_PREVIEW_SECRET: ' shh ', FIREBASE_PRIVATE_KEY: PEM, NODE_ENV: 'test' })!;
    expect(keys.source).toBe('env');
    expect(keys.link.toString()).toBe('shh');
    expect(keys.share.equals(Buffer.from(hkdfSync('sha256', 'shh', 'resonance', 'resonance share-image v1', 32)))).toBe(true);
  });

  it('are derived from the Firebase key byte-for-byte as before, so signatures already issued stay valid', () => {
    const keys = linkPreviewKeys({ FIREBASE_PRIVATE_KEY: PEM.replace(/\n/g, '\\n'), NODE_ENV: 'test' })!;
    expect(keys.source).toBe('derived');
    expect(keys.link.toString('hex')).toBe(LINK_HEX);
    expect(keys.share.toString('hex')).toBe(SHARE_HEX);
    // A signature made the old way (the key computed inline) still verifies.
    const old = createHmac('sha256', Buffer.from(LINK_HEX, 'hex')).update(URL).digest('base64url');
    expect(signImageUrl(URL, signingKey({ FIREBASE_PRIVATE_KEY: PEM }))).toBe(old);
  });

  it('set to the printed derived-v1 value, sign pictures and version drawn cards exactly as the derived ones', () => {
    const value = encodeDerivedSecret(derivedKeys({ FIREBASE_PRIVATE_KEY: PEM })!);
    expect(value).toMatch(/^derived-v1:[A-Za-z0-9_-]{43}\.[A-Za-z0-9_-]{43}$/);
    const env = { LINK_PREVIEW_SECRET: value, NODE_ENV: 'production' };
    expect(linkPreviewKeys(env)!.source).toBe('env');
    expect(signingKey(env).toString('hex')).toBe(LINK_HEX);
    expect(shareVersionKey(env)!.toString('hex')).toBe(SHARE_HEX);
    expect(keyedImageVersion('card', shareVersionKey(env))).toBe(keyedImageVersion('card', shareVersionKey({ FIREBASE_PRIVATE_KEY: PEM })));
  });

  it('refuse a derived-v1 value that is not two 32-byte keys, loudly for pictures, unkeyed for versions', () => {
    const env = { LINK_PREVIEW_SECRET: 'derived-v1:abc.def', NODE_ENV: 'production' };
    expect(() => linkPreviewKeys(env)).toThrow(/two 32-byte keys/);
    expect(() => signingKey(env)).toThrow(/32-byte/);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(shareVersionKey(env)).toBeNull();
  });

  it('are none without either; in production pictures then fail with an error that says what to set', () => {
    expect(linkPreviewKeys({ NODE_ENV: 'production' })).toBeNull();
    expect(() => signingKey({ NODE_ENV: 'production' })).toThrow(/LINK_PREVIEW_SECRET.*link-preview-secret\.ts.*FIREBASE_PRIVATE_KEY/);
  });
});

describe('the warning when the keys are derived', () => {
  it('is logged once per process, only in production, and never holds a key', async () => {
    vi.resetModules();
    const fresh = await import('./previewSecret');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    fresh.linkPreviewKeys({ FIREBASE_PRIVATE_KEY: PEM, NODE_ENV: 'test' });
    fresh.linkPreviewKeys({ FIREBASE_PRIVATE_KEY: PEM, NODE_ENV: 'production', FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080' });
    fresh.linkPreviewKeys({ LINK_PREVIEW_SECRET: 'shh', NODE_ENV: 'production' });
    expect(warn).not.toHaveBeenCalled();
    fresh.linkPreviewKeys({ FIREBASE_PRIVATE_KEY: PEM, NODE_ENV: 'production' });
    fresh.linkPreviewKeys({ FIREBASE_PRIVATE_KEY: PEM, NODE_ENV: 'production' });
    expect(warn).toHaveBeenCalledTimes(1);
    const line = String(warn.mock.calls[0][0]);
    expect(line).toMatch(/LINK_PREVIEW_SECRET is not set/);
    expect(line).not.toContain(LINK_HEX);
    expect(line).not.toContain(Buffer.from(LINK_HEX, 'hex').toString('base64url'));
    expect(line).not.toContain('PRIVATE KEY');
  });
});
