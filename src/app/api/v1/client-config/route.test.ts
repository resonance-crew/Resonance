import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClientConfig } from '@/lib/api/v1/schemas';
import { GET } from './route';

// GET /api/v1/client-config: public (no sign-in), shared by the CDN for a
// minute, an ETag on the bytes and a 304 on a match — and from the CLIENT_*
// variables of the deployment.

afterEach(() => {
  vi.unstubAllEnvs();
});

const ask = (headers: Record<string, string> = {}) => GET(new Request('https://resonance.test/api/v1/client-config', { headers }));

describe('GET /api/v1/client-config', () => {
  it('answers without a sign-in, publicly cacheable for a minute, in the contract', async () => {
    const res = ask();
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('public, s-maxage=60');
    expect(res.headers.get('ETag')).toMatch(/^"[\w-]{16,}"$/);
    const body = await res.json();
    expect(ClientConfig.parse(body)).toEqual(body);
    expect(body.minBuild).toEqual({ ios: 0, android: 0 });
    expect(body.features.apiDrafts).toBe(false);
  });

  it('answers 304 with no body to the client that holds this answer', async () => {
    const etag = ask().headers.get('ETag')!;
    const again = ask({ 'If-None-Match': etag });
    expect(again.status).toBe(304);
    expect(await again.text()).toBe('');
    expect(again.headers.get('ETag')).toBe(etag);
  });

  it('takes the builds and flags from the environment, and a new answer has a new tag', async () => {
    const before = ask().headers.get('ETag');
    vi.stubEnv('CLIENT_MIN_BUILD_IOS', '17');
    vi.stubEnv('CLIENT_MIN_BUILD_ANDROID', '18');
    vi.stubEnv('CLIENT_FEATURES', '{"apiDrafts":true}');
    const res = ask({ 'If-None-Match': before! });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.minBuild).toEqual({ ios: 17, android: 18 });
    expect(body.recommendedBuild).toEqual({ ios: 17, android: 18 });
    expect(body.features.apiDrafts).toBe(true);
  });
});
