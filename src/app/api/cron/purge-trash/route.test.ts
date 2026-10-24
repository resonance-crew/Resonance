import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/db/firestore/admin', () => ({ getAdminDb: () => ({}) }));
vi.mock('@/lib/api/v1/trash', () => ({ purgeExpiredTrash: vi.fn() }));
vi.mock('@/lib/api/v1/chatImages', () => ({ purgeUnsentChatImages: vi.fn() }));
vi.mock('@/lib/storage/chatImages', () => ({ getChatImageStore: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { revalidatePath } from 'next/cache';
import { purgeExpiredTrash } from '@/lib/api/v1/trash';
import { purgeUnsentChatImages } from '@/lib/api/v1/chatImages';
import { getChatImageStore } from '@/lib/storage/chatImages';
import { GET } from './route';

// The trash's daily purge, as Vercel Cron calls it: only with the secret,
// within the function's time, each purged card's cached pages dropped — then
// the chat pictures uploaded a day ago and never sent.

function call(authorization?: string) {
  return GET(new Request('http://localhost/api/cron/purge-trash', { headers: authorization ? { authorization } : {} }));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(purgeExpiredTrash).mockResolvedValue({ purged: 3, skipped: 1, failed: 0, deferred: 2, stale: ['/card/a'] });
  vi.mocked(getChatImageStore).mockReturnValue({ put: vi.fn(), get: vi.fn(), delete: vi.fn() });
  vi.mocked(purgeUnsentChatImages).mockResolvedValue({ deleted: 4, failed: 0 });
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe('/api/cron/purge-trash', () => {
  it('purges for Vercel Cron (Bearer CRON_SECRET) and answers the counts, never the pages', async () => {
    vi.stubEnv('CRON_SECRET', 's3cret');
    const res = await call('Bearer s3cret');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ purged: 3, skipped: 1, failed: 0, deferred: 2, unsentPictures: { deleted: 4, failed: 0 } });
    expect(purgeExpiredTrash).toHaveBeenCalledTimes(1);
  });

  it('purges the unsent chat pictures within the same time, and skips them when no picture store is set up', async () => {
    vi.stubEnv('CRON_SECRET', 's3cret');
    const before = Date.now();
    await call('Bearer s3cret');
    const { deadline } = vi.mocked(purgeUnsentChatImages).mock.calls[0][2]!;
    expect(deadline).toBeGreaterThanOrEqual(before + 270_000);
    expect(deadline).toBeLessThanOrEqual(Date.now() + 270_000);

    vi.mocked(getChatImageStore).mockReturnValue(null);
    expect(((await (await call('Bearer s3cret')).json()) as { unsentPictures: unknown }).unsentPictures).toBeNull();
    expect(purgeUnsentChatImages).toHaveBeenCalledTimes(1);
  });

  it('gives the run its time budget: the function may live 300 s, the run starts nothing past 270', async () => {
    vi.stubEnv('CRON_SECRET', 's3cret');
    await call('Bearer s3cret');
    expect(vi.mocked(purgeExpiredTrash).mock.calls[0][1]).toMatchObject({ budgetMs: 270_000 });
  });

  it("drops each purged card's cached pages in every locale (and the sitemap with the landing page)", async () => {
    vi.stubEnv('CRON_SECRET', 's3cret');
    await call('Bearer s3cret');
    const { revalidate } = vi.mocked(purgeExpiredTrash).mock.calls[0][1];
    revalidate?.(['/card/a', '/']);
    expect(vi.mocked(revalidatePath).mock.calls.map(([p]) => p)).toEqual(['/en/card/a', '/zh-TW/card/a', '/en', '/zh-TW', '/sitemap.xml']);
  });

  it('refuses a wrong or missing secret, and every caller when none is set', async () => {
    vi.stubEnv('CRON_SECRET', 's3cret');
    expect((await call('Bearer nope')).status).toBe(401);
    expect((await call()).status).toBe(401);
    vi.stubEnv('CRON_SECRET', '');
    expect((await call('Bearer ')).status).toBe(401);
    expect(purgeExpiredTrash).not.toHaveBeenCalled();
  });
});
