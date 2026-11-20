import { beforeEach, describe, expect, it, vi } from 'vitest';

// GET /api/v1/feed/recommended around the daily recommendations: what it runs
// after its response (the cards themselves: test/emulator/apiV1Recommended).

vi.mock('@/lib/auth', () => ({ getCurrentUser: async () => ({ id: 'alice' }) }));
const DB = {};
vi.mock('@/lib/db/firestore/admin', () => ({ getAdminDb: () => DB }));
const dailyRecommendations = vi.fn();
vi.mock('@/server/app/recommendDaily', async (orig) => ({ ...(await orig<object>()), dailyRecommendationsIn: (...a: unknown[]) => dailyRecommendations(...a) }));
vi.mock('@/server/app/cardsRead', async (orig) => ({
  ...(await orig<object>()),
  getRecommendedFeed: async (_ctx: unknown, _uid: string, load: () => Promise<{ status: string }>) => {
    const { status } = await load();
    return { cards: [], status };
  },
}));
const after = vi.fn();
vi.mock('next/server', async (orig) => ({ ...(await orig<typeof import('next/server')>()), after: (fn: unknown) => after(fn) }));

const { GET } = await import('./route');
const { serverCtx } = await import('@/server/ctx');
// The route's context: serverCtx() on the mocked database, built once per instance.
const CTX = serverCtx();

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/v1/feed/recommended', () => {
  // The evening's pick push leaves a reader who opened their picks today be.
  it("puts the reader's ask on record after the response, beside today's build when one is due", async () => {
    const refresh = vi.fn();
    const asked = vi.fn();
    dailyRecommendations.mockResolvedValue({ items: [], cached: true, status: 'stale', refresh, asked });
    const res = await GET(new Request('http://localhost/api/v1/feed/recommended'));
    expect(res.status).toBe(200);
    // Both handed to after() (through ctx.later), neither run before the response.
    expect(refresh).not.toHaveBeenCalled();
    expect(asked).not.toHaveBeenCalled();
    await Promise.allSettled(after.mock.calls.map(async ([fn]) => (fn as () => unknown)()));
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(asked).toHaveBeenCalledTimes(1);
    expect(dailyRecommendations).toHaveBeenCalledWith(expect.objectContaining({ uow: CTX.uow, data: CTX.data }), 'alice', { build: expect.any(Function) });

    after.mockClear();
    dailyRecommendations.mockResolvedValue({ items: [], cached: true, status: 'fresh', refresh: null, asked: null });
    await GET(new Request('http://localhost/api/v1/feed/recommended'));
    await Promise.allSettled(after.mock.calls.map(async ([fn]) => (fn as () => unknown)()));
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(asked).toHaveBeenCalledTimes(1);
  });
});
