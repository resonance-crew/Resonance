import { createHmac, hkdfSync } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { keyedImageVersion, shareVersionKey } from '@/lib/linkImage/version';
import { signingKey, verifyImageSignature } from './imageSigning';
import { derivedKeys, encodeDerivedSecret, linkPreviewKeys } from './previewSecret';

// Where the link-preview keys come from. Every picture signature already
// stored was made with the key derived from FIREBASE_PRIVATE_KEY; production
// and preview hold it pinned as LINK_PREVIEW_SECRET=derived-v1:…, so that
// value must keep signing exactly as the derivation did — else every stored
// preview picture 404s — while the site itself never derives a key again.

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

  it('are never derived from the Firebase key at runtime: none without LINK_PREVIEW_SECRET, whatever else is set', () => {
    expect(linkPreviewKeys({ FIREBASE_PRIVATE_KEY: PEM.replace(/\n/g, '\\n'), NODE_ENV: 'test' })).toBeNull();
    // Outside production the fixed development key signs (next dev, the emulator stacks, tests) — not the derived one.
    const dev = signingKey({ FIREBASE_PRIVATE_KEY: PEM, NODE_ENV: 'development' });
    expect(dev.toString('hex')).not.toBe(LINK_HEX);
    expect(signingKey({ NODE_ENV: 'development' }).equals(dev)).toBe(true);
    expect(signingKey({ NODE_ENV: 'production', FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080' }).equals(dev)).toBe(true);
    expect(shareVersionKey({ FIREBASE_PRIVATE_KEY: PEM, NODE_ENV: 'test' })!.toString('hex')).not.toBe(SHARE_HEX);
    // The ops script's derivation is byte-for-byte what was signed before.
    const keys = derivedKeys({ FIREBASE_PRIVATE_KEY: PEM.replace(/\n/g, '\\n') })!;
    expect(keys.link.toString('hex')).toBe(LINK_HEX);
    expect(keys.share.toString('hex')).toBe(SHARE_HEX);
  });

  it('pinned as the derived-v1 value, still verify a picture signed before by the derived key', () => {
    const before = createHmac('sha256', Buffer.from(LINK_HEX, 'hex')).update(URL).digest('base64url');
    const env = { LINK_PREVIEW_SECRET: encodeDerivedSecret(derivedKeys({ FIREBASE_PRIVATE_KEY: PEM })!), NODE_ENV: 'production', VERCEL_ENV: 'production' };
    expect(verifyImageSignature(URL, before, signingKey(env))).toBe(true);
    expect(verifyImageSignature(URL, before.replace(/.$/, (c) => (c === 'A' ? 'B' : 'A')), signingKey(env))).toBe(false);
  });

  it('set to the printed derived-v1 value, sign pictures and version drawn cards exactly as the derived ones', () => {
    const value = encodeDerivedSecret(derivedKeys({ FIREBASE_PRIVATE_KEY: PEM })!);
    expect(value).toMatch(/^derived-v1:[A-Za-z0-9_-]{43}\.[A-Za-z0-9_-]{43}$/);
    const env = { LINK_PREVIEW_SECRET: value, NODE_ENV: 'production' };
    expect(linkPreviewKeys(env)!.source).toBe('env');
    expect(signingKey(env).toString('hex')).toBe(LINK_HEX);
    expect(shareVersionKey(env)!.toString('hex')).toBe(SHARE_HEX);
    const derivedShare = createHmac('sha256', Buffer.from(SHARE_HEX, 'hex')).update('card').digest('hex').slice(0, 20);
    expect(keyedImageVersion('card', shareVersionKey(env))).toBe(derivedShare);
  });

  it('refuse a derived-v1 value that is not two 32-byte keys, loudly for pictures, unkeyed for versions', () => {
    const env = { LINK_PREVIEW_SECRET: 'derived-v1:abc.def', NODE_ENV: 'production' };
    expect(() => linkPreviewKeys(env)).toThrow(/two 32-byte keys/);
    expect(() => signingKey(env)).toThrow(/32-byte/);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(shareVersionKey(env)).toBeNull();
  });

  it('are none without the secret; production then refuses to sign, even with the Firebase key there', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    for (const env of [{ NODE_ENV: 'production' }, { NODE_ENV: 'production', FIREBASE_PRIVATE_KEY: PEM }, { VERCEL_ENV: 'production', FIREBASE_PRIVATE_KEY: PEM }]) {
      expect(linkPreviewKeys(env)).toBeNull();
      expect(() => signingKey(env)).toThrow(/LINK_PREVIEW_SECRET.*link-preview-secret\.ts/);
    }
  });
});

describe('production without LINK_PREVIEW_SECRET', () => {
  it('is said once per process, only in production, and never holds a key', async () => {
    vi.resetModules();
    const fresh = await import('./previewSecret');
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    fresh.linkPreviewKeys({ FIREBASE_PRIVATE_KEY: PEM, NODE_ENV: 'test' });
    fresh.linkPreviewKeys({ FIREBASE_PRIVATE_KEY: PEM, NODE_ENV: 'production', FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080' });
    fresh.linkPreviewKeys({ LINK_PREVIEW_SECRET: 'shh', NODE_ENV: 'production' });
    expect(error).not.toHaveBeenCalled();
    for (let i = 0; i < 20; i++) expect(fresh.linkPreviewKeys({ FIREBASE_PRIVATE_KEY: PEM, NODE_ENV: 'production' })).toBeNull();
    expect(error).toHaveBeenCalledTimes(1);
    const line = String(error.mock.calls[0][0]);
    expect(line).toMatch(/LINK_PREVIEW_SECRET is not set/);
    expect(line).not.toContain(LINK_HEX);
    expect(line).not.toContain('PRIVATE KEY');
  });
});
