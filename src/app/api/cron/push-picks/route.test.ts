import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const messaging = { sendEachForMulticast: vi.fn() };
vi.mock('@/lib/db/firestore/admin', () => ({ getAdminDb: () => ({}), getAdminMessaging: async () => messaging }));
vi.mock('@/server/app/pushPicks', () => ({ pushPicksIn: vi.fn() }));

import { pushPicksIn as pushPicks } from '@/server/app/pushPicks';
import { GET } from './route';

const call = (authorization?: string) =>
  GET(new Request('http://localhost/api/cron/push-picks', { headers: authorization ? { authorization } : {} }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.mocked(pushPicks).mockResolvedValue({ readers: 2, outcomes: { sent: 1, 'opened-today': 1 }, deferred: 0 });
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe('/api/cron/push-picks', () => {
  it("sends tonight's cards for Vercel Cron (Bearer CRON_SECRET), through FCM, starting nothing past 270 s", async () => {
    vi.stubEnv('CRON_SECRET', 's3cret');
    const before = Date.now();
    const res = await call('Bearer s3cret');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ readers: 2, outcomes: { sent: 1, 'opened-today': 1 }, deferred: 0 });
    const [ctx, opts] = vi.mocked(pushPicks).mock.calls[0];
    // Through FCM: the context's gateway hands the admin SDK's messaging each multicast.
    messaging.sendEachForMulticast.mockResolvedValueOnce({ successCount: 1, failureCount: 0, responses: [{ success: true }] });
    expect(await ctx.push.send(['t1'], { data: { kind: 'pick' } })).toEqual({ sent: 1, dead: [] });
    expect(messaging.sendEachForMulticast).toHaveBeenCalledWith(expect.objectContaining({ tokens: ['t1'] }));
    expect(opts!.deadline! - before).toBeGreaterThanOrEqual(270_000);
    expect(opts!.deadline! - Date.now()).toBeLessThanOrEqual(270_000);
  });

  it('refuses a wrong or missing secret, and everyone while none is configured', async () => {
    vi.stubEnv('CRON_SECRET', 's3cret');
    expect((await call('Bearer nope')).status).toBe(401);
    expect((await call()).status).toBe(401);
    vi.stubEnv('CRON_SECRET', '');
    expect((await call('Bearer ')).status).toBe(401);
    expect(pushPicks).not.toHaveBeenCalled();
  });
});
