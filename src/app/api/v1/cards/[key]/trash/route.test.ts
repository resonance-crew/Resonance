import { beforeEach, describe, expect, it, vi } from 'vitest';

// The trash's routes around their services: the budgets they spend (a trash
// never spends what its undo needs), what they answer and keep to
// themselves, the original author's bell a restore may ring, and the pages
// they drop after the response.

const getCurrentUser = vi.fn();
vi.mock('@/lib/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
vi.mock('@/lib/db/firestore/admin', () => ({ getAdminDb: () => ({}) }));
const revalidatePath = vi.fn();
vi.mock('next/cache', () => ({ revalidatePath: (p: string) => revalidatePath(p) }));
let afterWork: Promise<unknown>[] = [];
vi.mock('next/server', async (orig) => ({
  ...(await orig<typeof import('next/server')>()),
  after: (fn: () => unknown) => void afterWork.push(Promise.resolve().then(fn)),
}));
const trashCard = vi.fn();
const restoreCard = vi.fn();
const emptyTrash = vi.fn();
vi.mock('@/lib/api/v1/trash', () => ({
  trashCard: (...a: unknown[]) => trashCard(...a),
  restoreCard: (...a: unknown[]) => restoreCard(...a),
  emptyTrash: (...a: unknown[]) => emptyTrash(...a),
}));
const spend = vi.fn(async (..._a: unknown[]) => {});
vi.mock('@/lib/api/rateLimit', () => ({ spend: (...a: unknown[]) => spend(...a) }));
const ringAfter = vi.fn();
vi.mock('@/lib/push/ring', () => ({ ringAfter: (...a: unknown[]) => ringAfter(...a) }));

const { POST: trash } = await import('./route');
const { POST: restore } = await import('../restore/route');
const { DELETE: empty } = await import('../../../me/trash/route');
const { ApiFailure } = await import('@/lib/api/v1/http');

const ctx = (key: string) => ({ params: Promise.resolve({ key }) });
const post = (route: typeof trash, key = 'c1') => route(new Request(`http://localhost/api/v1/cards/${key}/x`, { method: 'POST' }), ctx(key));
const settled = async () => {
  await Promise.all(afterWork);
  return revalidatePath.mock.calls.map(([p]) => p);
};
const CARD = { id: 'c1', visibility: 'private', trashedAt: '2026-10-20T08:00:00.000Z' };

beforeEach(() => {
  vi.clearAllMocks();
  afterWork = [];
  getCurrentUser.mockResolvedValue({ id: 'alice' });
});

describe('POST /api/v1/cards/{id}/trash', () => {
  it('spends the trash budget, answers the card and whether it changed, and drops its pages after the response', async () => {
    trashCard.mockResolvedValue({ card: CARD, changed: true, stale: ['/card/c1', '/'] });
    const res = await post(trash);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ card: CARD, changed: true });
    expect(spend).toHaveBeenCalledWith({}, 'alice', 'trash');
    expect(trashCard).toHaveBeenCalledWith({}, 'alice', 'c1');
    expect(await settled()).toEqual(['/en/card/c1', '/zh-TW/card/c1', '/en', '/zh-TW', '/sitemap.xml']);
    // A write: Firebase Auth is asked whether the session still stands.
    expect(getCurrentUser).toHaveBeenCalledWith({ revocation: 'live' });
  });

  it('answers 404 for an id Firestore keeps for itself before it costs any budget, and 429 past the budget', async () => {
    const res = await post(trash, '__x__');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: { code: 'not_found', message: 'No such card.' } });
    expect(spend).not.toHaveBeenCalled();
    spend.mockRejectedValueOnce(new ApiFailure('rate_limited', 'Too many requests. Please try again later.'));
    expect((await post(trash)).status).toBe(429);
    expect(trashCard).not.toHaveBeenCalled();
  });

  it("is a missing card's 404 for someone else's, revalidating nothing", async () => {
    trashCard.mockRejectedValue(new ApiFailure('not_found', 'No such card.'));
    const res = await post(trash);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: { code: 'not_found', message: 'No such card.' } });
    expect(await settled()).toEqual([]);
  });
});

describe('POST /api/v1/cards/{id}/restore', () => {
  it('spends a budget of its own, keeps the bell to itself and rings it after the response', async () => {
    restoreCard.mockResolvedValue({
      card: { id: 'c1', visibility: 'public' }, changed: true, droppedResonance: false, notificationId: 'resonance_alice_orig', stale: ['/card/c1'],
    });
    const res = await post(restore);
    expect(await res.json()).toEqual({ card: { id: 'c1', visibility: 'public' }, changed: true, droppedResonance: false });
    expect(spend).toHaveBeenCalledWith({}, 'alice', 'restore');
    expect(spend).not.toHaveBeenCalledWith({}, 'alice', 'trash');
    expect(ringAfter).toHaveBeenCalledWith({}, 'resonance_alice_orig');
    expect(await settled()).toEqual(['/en/card/c1', '/zh-TW/card/c1']);
  });

  it('rings no one and drops nothing when nothing changed', async () => {
    restoreCard.mockResolvedValue({ card: { id: 'c1' }, changed: false, droppedResonance: false, notificationId: null, stale: [] });
    await post(restore);
    expect(ringAfter).toHaveBeenCalledWith({}, null);
    expect(await settled()).toEqual([]);
  });
});

describe('DELETE /api/v1/me/trash', () => {
  const call = (query = '') => empty(new Request(`http://localhost/api/v1/me/trash${query}`, { method: 'DELETE' }));

  it('empties from now on the first call, and from the first answer\'s cut-off after', async () => {
    emptyTrash.mockResolvedValue({ deleted: 50, remaining: 3, before: '2026-10-20T08:00:00.000Z', stale: ['/card/c1'] });
    const res = await call();
    expect(await res.json()).toEqual({ deleted: 50, remaining: 3, before: '2026-10-20T08:00:00.000Z' });
    expect(emptyTrash).toHaveBeenLastCalledWith({}, 'alice', { before: null });
    expect(spend).toHaveBeenCalledWith({}, 'alice', 'trash');
    await call('?before=2026-10-20T08:00:00.000Z');
    expect(emptyTrash).toHaveBeenLastCalledWith({}, 'alice', { before: new Date('2026-10-20T08:00:00.000Z') });
    expect(await settled()).toEqual(['/en/card/c1', '/zh-TW/card/c1', '/en/card/c1', '/zh-TW/card/c1']);
  });

  it('refuses a cut-off that is not a date', async () => {
    expect((await call('?before=yesterday')).status).toBe(400);
    expect(emptyTrash).not.toHaveBeenCalled();
  });
});
