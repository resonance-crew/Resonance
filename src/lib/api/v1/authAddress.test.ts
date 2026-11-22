import { describe, expect, it } from 'vitest';
import { clientAddress } from './auth';

// The address the auth routes' per-address budget is spent by (ADDRESS_LIMITS):
// Vercel's edge sets x-real-ip and x-forwarded-for; a local server neither.

describe('clientAddress', () => {
  const req = (headers: Record<string, string>) => new Request('https://resonance.channel/api/v1/auth/refresh', { method: 'POST', headers });

  it("is x-real-ip, else the first of x-forwarded-for, else none", () => {
    expect(clientAddress(req({ 'x-real-ip': ' 203.0.113.9 ', 'x-forwarded-for': '198.51.100.1' }))).toBe('203.0.113.9');
    expect(clientAddress(req({ 'x-forwarded-for': '198.51.100.1, 10.0.0.1' }))).toBe('198.51.100.1');
    expect(clientAddress(req({ 'x-real-ip': '  ' }))).toBeNull();
    expect(clientAddress(req({}))).toBeNull();
  });
});
