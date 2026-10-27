import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/db/firestore/admin', () => ({ getAdminDb: () => ({}) }));
vi.mock('@/lib/api/v1/trash', () => ({ purgeExpiredTrash: vi.fn() }));
vi.mock('@/lib/api/v1/chatImages', () => ({ purgeUnsentChatImages: vi.fn() }));
vi.mock('@/lib/api/v1/messageActions', () => ({ purgeUnsentCopies: vi.fn() }));
vi.mock('@/lib/storage/chatImages', () => ({ getChatImageStore: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { revalidatePath } from 'next/cache';
import { purgeExpiredTrash } from '@/lib/api/v1/trash';
import { purgeUnsentChatImages } from '@/lib/api/v1/chatImages';
import { purgeUnsentCopies } from '@/lib/api/v1/messageActions';
import { getChatImageStore } from '@/lib/storage/chatImages';
import { GET } from './route';

// The trash's daily purge, as Vercel Cron calls it: only with the secret,
// within the function's time, each purged card's cached pages dropped — and,
// beside it, the chat pictures uploaded a day ago and never sent, and the
// copies of messages unsent 30 days ago (kept for moderation till then).

function call(authorization?: string) {
  return GET(new Request('http://localhost/api/cron/purge-trash', { headers: authorization ? { authorization } : {} }));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(purgeExpiredTrash).mockResolvedValue({ purged: 3, skipped: 1, failed: 0, deferred: 2, stale: ['/card/a'] });
  vi.mocked(getChatImageStore).mockReturnValue({ put: vi.fn(), get: vi.fn(), delete: vi.fn(), deleteMany: vi.fn() });
  vi.mocked(purgeUnsentChatImages).mockResolvedValue({ deleted: 4, failed: 0 });
  vi.mocked(purgeUnsentCopies).mockResolvedValue({ deleted: 2, failed: 0 });
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe('/api/cron/purge-trash', () => {
  it('purges for Vercel Cron (Bearer CRON_SECRET) and answers the counts, never the pages', async () => {
    vi.stubEnv('CRON_SECRET', 's3cret');
    const res = await call('Bearer s3cret');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      purged: 3,
      skipped: 1,
      failed: 0,
      deferred: 2,
      unsentPictures: { deleted: 4, failed: 0 },
      unsentMessages: { deleted: 2, failed: 0 },
    });
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

  it("purges the unsent messages' copies within the same time, with the picture store (or none) for their pictures", async () => {
    vi.stubEnv('CRON_SECRET', 's3cret');
    const before = Date.now();
    await call('Bearer s3cret');
    const [, store, { deadline } = {}] = vi.mocked(purgeUnsentCopies).mock.calls[0];
    expect(store).toBe(vi.mocked(getChatImageStore).mock.results[0].value);
    expect(deadline).toBeGreaterThanOrEqual(before + 270_000);
    expect(deadline).toBeLessThanOrEqual(Date.now() + 270_000);

    // Without the picture store the copies still go (no picture was ever stored).
    vi.mocked(getChatImageStore).mockReturnValue(null);
    await call('Bearer s3cret');
    expect(vi.mocked(purgeUnsentCopies).mock.calls[1][1]).toBeNull();
  });

  it('purges the pictures beside the trash, not after it: a long trash purge never starves them', async () => {
    vi.stubEnv('CRON_SECRET', 's3cret');
    let finish!: () => void;
    vi.mocked(purgeExpiredTrash).mockReturnValue(
      new Promise((resolve) => (finish = () => resolve({ purged: 0, skipped: 0, failed: 0, deferred: 0, stale: [] }))),
    );
    const res = call('Bearer s3cret');
    await vi.waitFor(() => expect(purgeUnsentChatImages).toHaveBeenCalledTimes(1));
    expect(purgeUnsentCopies).toHaveBeenCalledTimes(1);
    finish();
    expect((await res).status).toBe(200);
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
