import { createPublicKey, generateKeyPairSync, verify } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { ascToken, AscReviewSource, parseAscVersions, PlayReviewSource } from './stores';

const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const P8 = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const ENV = { ASC_READ_KEY_ID: 'KEY123', ASC_ISSUER_ID: 'issuer-uuid', ASC_READ_KEY_PATH: '/keys/x.p8', ASC_APP_ID: '42' };

const VERSIONS = {
  data: [
    { attributes: { platform: 'IOS', versionString: '2.5.0', appStoreState: 'READY_FOR_SALE', createdDate: '2026-11-10T00:00:00Z' } },
    { attributes: { platform: 'IOS', versionString: '2.5.1', appVersionState: 'WAITING_FOR_REVIEW', appStoreState: 'WAITING_FOR_REVIEW', createdDate: '2026-11-14T00:00:00Z' } },
    { attributes: { platform: 'MAC_OS', versionString: '2.5.1', appStoreState: 'IN_REVIEW', createdDate: '2026-11-14T00:01:00Z' } },
  ],
};

describe('App Store Connect', () => {
  it('signs an ES256 token App Store Connect accepts the shape of', () => {
    const token = ascToken('KEY123', 'issuer-uuid', P8, 1_800_000_000);
    const [h, p, s] = token.split('.');
    expect(JSON.parse(Buffer.from(h, 'base64url').toString())).toEqual({ alg: 'ES256', kid: 'KEY123', typ: 'JWT' });
    expect(JSON.parse(Buffer.from(p, 'base64url').toString())).toEqual({ iss: 'issuer-uuid', iat: 1_800_000_000, exp: 1_800_000_900, aud: 'appstoreconnect-v1' });
    const ok = verify('sha256', Buffer.from(`${h}.${p}`), { key: createPublicKey(privateKey), dsaEncoding: 'ieee-p1363' }, Buffer.from(s, 'base64url'));
    expect(ok).toBe(true);
  });

  it('keeps the newest version per platform', () => {
    expect(parseAscVersions(VERSIONS)).toEqual([
      { store: 'App Store', platform: 'MAC_OS', version: '2.5.1', state: 'IN_REVIEW', since: '2026-11-14T00:01:00Z' },
      { store: 'App Store', platform: 'IOS', version: '2.5.1', state: 'WAITING_FOR_REVIEW', since: '2026-11-14T00:00:00Z' },
    ]);
    expect(parseAscVersions({})).toEqual([]);
  });

  it('says how to look by hand until a key is configured', async () => {
    const fetcher = vi.fn();
    const r = await new AscReviewSource({}, fetcher as unknown as typeof fetch).read();
    expect(r).toMatchObject({ source: 'App Store Connect', unavailable: expect.stringContaining('ASC_READ_KEY_ID') });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('makes one GET with the token once configured, and survives an error answer', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify(VERSIONS), { status: 200 }));
    const source = new AscReviewSource(ENV, fetcher as unknown as typeof fetch, () => P8);
    const r = await source.read();
    expect(r).toMatchObject({ states: [{ platform: 'MAC_OS' }, { platform: 'IOS' }] });
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/^https:\/\/api\.appstoreconnect\.apple\.com\/v1\/apps\/42\/appStoreVersions\?/);
    expect((init.headers as Record<string, string>).Authorization).toMatch(/^Bearer [\w-]+\.[\w-]+\.[\w-]+$/);
    expect(init.method).toBeUndefined();

    const denied = new AscReviewSource(ENV, (async () => new Response('{}', { status: 401 })) as unknown as typeof fetch, () => P8);
    expect(await denied.read()).toMatchObject({ unavailable: expect.stringMatching(/^the API answered 401/) });
  });
});

describe('Google Play', () => {
  it('points at the console', async () => {
    expect(await new PlayReviewSource().read()).toMatchObject({ source: 'Google Play', unavailable: expect.stringContaining('發布總覽') });
  });
});
