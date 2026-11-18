import { beforeEach, describe, expect, it, vi } from 'vitest';

// Saving changes to a published card: a revision that moves its visibility
// moves the recommendation vectors before the answer (they keep a private
// card out of everyone else's picks), and the card's reading is marked owed
// after the response (round 26 §A1.8: the daily cron reads it again — reading
// the whole story on every save would be a reasoning model's call each time),
// while the save itself always goes through.

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
const markIndexOwed = vi.fn(async (..._a: unknown[]) => {});
vi.mock('@/lib/recommend/indexOwed', () => ({ markIndexOwed: (...a: unknown[]) => markIndexOwed(...a) }));
const makeSummaryTranslations = vi.fn(async (..._a: unknown[]) => 'made');
vi.mock('@/lib/api/v1/summaryTranslationsMake', () => ({ makeSummaryTranslations: (...a: unknown[]) => makeSummaryTranslations(...a) }));
const setVisibility = vi.fn(async (..._a: unknown[]) => {});
vi.mock('@/lib/recommend/vectorStore', () => ({ getVectorStore: () => ({ setVisibility: (...a: unknown[]) => setVisibility(...a) }) }));
const spend = vi.fn(async (..._a: unknown[]) => {});
vi.mock('@/lib/api/rateLimit', () => ({ spend: (...a: unknown[]) => spend(...a) }));

const { POST } = await import('./route');

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

  it('marks the reading owed after the response, spending no budget for it — the daily cron reads it again', async () => {
    applyCardEdit.mockResolvedValue(RESULT);
    expect((await apply()).status).toBe(200);
    await Promise.all(afterWork);
    expect(markIndexOwed).toHaveBeenCalledWith({}, 'c1');
    expect(spend).not.toHaveBeenCalled();
  });

  it("makes the title's and excerpt's translations after the response, asking the same budget just before its model call (round 25)", async () => {
    applyCardEdit.mockResolvedValue(RESULT);
    await apply();
    await Promise.all(afterWork);
    expect(makeSummaryTranslations).toHaveBeenCalledWith({}, 'c1', { mayCall: expect.any(Function) });
    expect(spend).not.toHaveBeenCalled();
    const { mayCall } = makeSummaryTranslations.mock.calls[0][2] as { mayCall: () => Promise<boolean> };
    await expect(mayCall()).resolves.toBe(true);
    expect(spend).toHaveBeenCalledWith({}, 'alice', 'reindex');
  });

  it('spends nothing and re-indexes nothing when there was no pending edit', async () => {
    applyCardEdit.mockResolvedValue({ ...RESULT, applied: false, stale: [] });
    await apply();
    await Promise.all(afterWork);
    expect(spend).not.toHaveBeenCalled();
    expect(markIndexOwed).not.toHaveBeenCalled();
    expect(makeSummaryTranslations).not.toHaveBeenCalled();
  });
});
