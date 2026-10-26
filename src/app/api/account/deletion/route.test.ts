import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetCurrentUser = vi.fn();
vi.mock('@/lib/auth', () => ({ getCurrentUser: () => mockGetCurrentUser() }));
const mockRevoke = vi.fn();
vi.mock('@/lib/auth/firebase/server', () => ({ revokeSessions: (uid: string) => mockRevoke(uid) }));
vi.mock('@/lib/db/firestore/admin', () => ({ getAdminDb: () => ({}) }));
vi.mock('@/lib/account/deletion', () => ({
  scheduleAccountDeletion: vi.fn(),
  cancelAccountDeletion: vi.fn(),
  getAccountDeletion: vi.fn(),
}));

import { cancelAccountDeletion, getAccountDeletion, scheduleAccountDeletion } from '@/lib/account/deletion';
import { DELETE, GET, POST } from './route';

const requested = new Date('2026-09-27T00:00:00Z');
const purgeAfter = new Date('2026-10-04T00:00:00Z');

beforeEach(() => {
  vi.clearAllMocks();
  mockGetCurrentUser.mockResolvedValue({ id: 'alice' });
});

describe('/api/account/deletion', () => {
  it('refuses every method without a signed-in user', async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    for (const handler of [GET, POST, DELETE]) {
      expect((await handler(new Request('http://localhost/api/account/deletion', { method: 'POST' }))).status).toBe(401);
    }
    expect(scheduleAccountDeletion).not.toHaveBeenCalled();
  });

  // SameSite=Lax lets a page on a sibling subdomain send the cookie: a write must come from the site itself.
  it('refuses a cookie-authenticated write from another origin, a same-site subdomain included', async () => {
    const variants: Record<string, string>[] = [{ 'sec-fetch-site': 'same-site' }, { 'sec-fetch-site': 'cross-site' }, { origin: 'https://hi.resonance.channel', host: 'resonance.channel' }];
    for (const headers of variants) {
      const res = await POST(new Request('http://localhost/api/account/deletion', { method: 'POST', headers }));
      expect(res.status, JSON.stringify(headers)).toBe(403);
    }
    expect(scheduleAccountDeletion).not.toHaveBeenCalled();
    expect(cancelAccountDeletion).not.toHaveBeenCalled();
  });

  it('schedules deletion for the caller and signs out their other devices', async () => {
    vi.mocked(scheduleAccountDeletion).mockResolvedValue({ uid: 'alice', requestedAt: requested, purgeAfter });

    const res = await POST(new Request('http://localhost/api/account/deletion', { method: 'POST' }));

    expect(scheduleAccountDeletion).toHaveBeenCalledWith(expect.anything(), 'alice');
    expect(mockRevoke).toHaveBeenCalledWith('alice');
    expect(await res.json()).toEqual({
      deletion: { requestedAt: requested.toISOString(), purgeAfter: purgeAfter.toISOString() },
    });
  });

  it('reports the pending request, and cancels it', async () => {
    vi.mocked(getAccountDeletion).mockResolvedValue({ uid: 'alice', requestedAt: requested, purgeAfter });
    expect((await (await GET()).json()).deletion.purgeAfter).toBe(purgeAfter.toISOString());

    const res = await DELETE(new Request('http://localhost/api/account/deletion', { method: 'DELETE' }));
    expect(cancelAccountDeletion).toHaveBeenCalledWith(expect.anything(), 'alice');
    expect(await res.json()).toEqual({ deletion: null });
  });
});
