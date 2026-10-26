import { beforeEach, describe, expect, it, vi } from 'vitest';

// Saving changes to a published card: a revision that moves its visibility
// moves the recommendation vectors before the answer (they keep a private
// card out of everyone else's picks), and the re-index after the response —
// an LLM call — spends the author's reindex budget, skipped past it while the
// save itself always goes through.

const getCurrentUser = vi.fn();
vi.mock('@/lib/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
vi.mock('@/lib/db/firestore/admin', () => ({ getAdminDb: () => ({}) }));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
let afterWork: Promise<unknown>[] = [];
vi.mock('next/server', async (orig) => ({
  ...(await orig<typeof import('next/server')>()),
  after: (fn: () => unknown) => void afterWork.push(Promise.resolve().then(fn)),
}));
const applyCardEdit = vi.fn();
vi.mock('@/lib/api/v1/edits', () => ({ applyCardEdit: (...a: unknown[]) => applyCardEdit(...a) }));
vi.mock('@/lib/api/v1/resonate', () => ({ tryReachResonance: vi.fn() }));
vi.mock('@/lib/push/ring', () => ({ ringAfter: vi.fn() }));
vi.mock('@/lib/links/cardLinks', () => ({ unfurlCardLinks: async () => {} }));
const indexCard = vi.fn(async (..._a: unknown[]) => ({}));
vi.mock('@/lib/recommend/indexCard', () => ({ indexCard: (...a: unknown[]) => indexCard(...a) }));
const setVisibility = vi.fn(async (..._a: unknown[]) => {});
vi.mock('@/lib/recommend/vectorStore', () => ({ getVectorStore: () => ({ setVisibility: (...a: unknown[]) => setVisibility(...a) }) }));
const spend = vi.fn(async (..._a: unknown[]) => {});
vi.mock('@/lib/api/rateLimit', () => ({ spend: (...a: unknown[]) => spend(...a) }));

const { POST } = await import('./route');
const { ApiFailure } = await import('@/lib/api/v1/http');

const apply = () => POST(new Request('http://localhost/api/v1/cards/c1/edits/apply', { method: 'POST' }), { params: Promise.resolve({ key: 'c1' }) });
const RESULT = { id: 'c1', slug: 'a-walk', applied: true, stale: ['/card/c1'], reaches: false, movedTo: null };

beforeEach(() => {
  vi.clearAllMocks();
  afterWork = [];
  getCurrentUser.mockResolvedValue({ id: 'alice' });
});

describe('POST /api/v1/cards/{id}/edits/apply', () => {
  it('moves the vectors before answering when the revision moved the visibility, and keeps that to itself', async () => {
    let answered = false;
    setVisibility.mockImplementation(async () => {
      expect(answered).toBe(false);
    });
    applyCardEdit.mockResolvedValue({ ...RESULT, movedTo: 'private' });
    const res = await apply();
    answered = true;
    expect(res.status).toBe(200);
    expect(setVisibility).toHaveBeenCalledWith('c1', 'private');
    expect(await res.json()).toEqual({ id: 'c1', slug: 'a-walk', applied: true });
  });

  it('leaves the vectors alone when the visibility stayed', async () => {
    applyCardEdit.mockResolvedValue(RESULT);
    await apply();
    expect(setVisibility).not.toHaveBeenCalled();
  });

  it('re-indexes after the response within the reindex budget, and skips it past the budget — never the save', async () => {
    applyCardEdit.mockResolvedValue(RESULT);
    expect((await apply()).status).toBe(200);
    await Promise.all(afterWork);
    // The budget is asked just before the LLM call (indexCard's mayCall): a save that changed no text spends nothing.
    expect(indexCard).toHaveBeenCalledWith('c1', { mayCall: expect.any(Function) });
    expect(spend).not.toHaveBeenCalled();
    const { mayCall } = indexCard.mock.calls[0][1] as { mayCall: () => Promise<boolean> };
    await expect(mayCall()).resolves.toBe(true);
    expect(spend).toHaveBeenCalledWith({}, 'alice', 'reindex');

    spend.mockRejectedValueOnce(new ApiFailure('rate_limited', 'Too many requests. Please try again later.'));
    await expect(mayCall()).resolves.toBe(false);
  });

  it('spends nothing and re-indexes nothing when there was no pending edit', async () => {
    applyCardEdit.mockResolvedValue({ ...RESULT, applied: false, stale: [] });
    await apply();
    await Promise.all(afterWork);
    expect(spend).not.toHaveBeenCalled();
    expect(indexCard).not.toHaveBeenCalled();
  });
});
