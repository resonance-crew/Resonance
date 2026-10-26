import { afterEach, describe, expect, it, vi } from 'vitest';
import { cronAuthorized } from './cronAuth';

const req = (authorization?: string) => new Request('http://localhost/api/cron/x', { headers: authorization ? { authorization } : {} });

afterEach(() => vi.unstubAllEnvs());

// Vercel Cron's own requests only, compared in constant time; nobody while the secret is unset.
describe('cronAuthorized', () => {
  it('takes exactly Bearer $CRON_SECRET', () => {
    vi.stubEnv('CRON_SECRET', 'a-long-dummy-secret');
    expect(cronAuthorized(req('Bearer a-long-dummy-secret'))).toBe(true);
    for (const h of [undefined, 'Bearer a-long-dummy-secre', 'bearer a-long-dummy-secret', 'Bearer a-long-dummy-secretX', 'a-long-dummy-secret']) {
      expect(cronAuthorized(req(h)), String(h)).toBe(false);
    }
  });

  it('refuses everyone while the secret is unset', () => {
    vi.stubEnv('CRON_SECRET', '');
    for (const h of [undefined, 'Bearer ', 'Bearer undefined']) expect(cronAuthorized(req(h)), String(h)).toBe(false);
  });
});
