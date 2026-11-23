import { beforeEach, describe, expect, it, vi } from 'vitest';

// The resonance routes around their service (apiV1Resonate covers the
// transaction): what they read from the request, the caller's budget, the
// original author's bell rung after the response, and the chosen card's
// pages — whose seed names the card it answers — revalidated in every
// locale after the response, only when something changed. Neither the bell
// row nor the page list leaves the server.

const getCurrentUser = vi.fn();
vi.mock('@/lib/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
const DB = {};
vi.mock('@/lib/db/firestore/admin', () => ({ getAdminDb: () => DB }));
const revalidatePath = vi.fn();
vi.mock('next/cache', () => ({ revalidatePath: (p: string) => revalidatePath(p) }));
let afterWork: Promise<unknown>[] = [];
vi.mock('next/server', async (orig) => ({
  ...(await orig<typeof import('next/server')>()),
  after: (fn: () => unknown) => void afterWork.push(Promise.resolve().then(fn)),
}));
const resonateWith = vi.fn();
const unresonate = vi.fn();
vi.mock('@/server/app/resonate', async (orig) => ({
  ...(await orig<object>()),
  resonateWithIn: (...a: unknown[]) => resonateWith(...a),
  unresonateIn: (...a: unknown[]) => unresonate(...a),
}));
const ringAfter = vi.fn();
vi.mock('@/server/app/pushAfter', () => ({ ringAfterIn: (...a: unknown[]) => ringAfter(...a) }));
const spend = vi.fn();
const spendAll = vi.fn();
vi.mock('@/server/infra/firestore/rateLimit', () => ({
  firestoreRateLimiter: () => ({ spend: (...a: unknown[]) => spend(...a), spendAll: (...a: unknown[]) => spendAll(...a), limited: async () => null }),
}));

const { POST } = await import('./route');
const { DELETE } = await import('./[cardId]/route');
const { ApiFailure } = await import('@/lib/api/v1/http');
const { serverCtx } = await import('@/server/ctx');
// The route's context: serverCtx() on the mocked database, built once per instance.
const CTX = serverCtx();

const settled = async () => {
  await Promise.all(afterWork);
  return revalidatePath.mock.calls.map(([p]) => p);
};
const post = (body: unknown, key = 'orig') =>
  POST(
    new Request(`http://localhost/api/v1/cards/${key}/resonances`, { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) }),
    { params: Promise.resolve({ key }) },
  );
const del = (key: string, cardId: string) =>
  DELETE(new Request(`http://localhost/api/v1/cards/${key}/resonances/${cardId}`, { method: 'DELETE' }), {
    params: Promise.resolve({ key, cardId }),
  });

const CARD = { id: 'mine', referenceCardId: 'orig' };
const STALE = ['/card/mine', '/card/slug-mine'];
const LOCALIZED = ['/en/card/mine', '/zh-TW/card/mine', '/en/card/slug-mine', '/zh-TW/card/slug-mine'];

beforeEach(() => {
  vi.clearAllMocks();
  afterWork = [];
  getCurrentUser.mockResolvedValue({ id: 'alice' });
  spend.mockResolvedValue(undefined);
  resonateWith.mockResolvedValue({ card: CARD, changed: true, notificationId: 'resonance_alice_orig', stale: STALE });
  unresonate.mockResolvedValue({ changed: true, stale: STALE });
});

describe('POST /api/v1/cards/{id}/resonances', () => {
  it("answers the card and whether it changed, rings the original's author and revalidates the card's pages in every locale", async () => {
    const res = await post({ cardId: 'mine' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ card: CARD, changed: true });
    expect(spend).toHaveBeenCalledWith('alice', 'resonate');
    // The budget goes beside the service's reads, which await it before writing (round 32 §P6).
    expect(resonateWith).toHaveBeenCalledWith(CTX, 'alice', 'orig', 'mine', expect.any(Promise));
    expect(ringAfter).toHaveBeenCalledWith(CTX, 'resonance_alice_orig');
    expect(await settled()).toEqual(LOCALIZED);
    // A write: Firebase Auth is asked whether the session still stands.
    expect(getCurrentUser).toHaveBeenCalledWith({ revocation: 'live' });
  });

  it('revalidates nothing when the card already answered it', async () => {
    resonateWith.mockResolvedValue({ card: CARD, changed: false, notificationId: null, stale: [] });
    const res = await post({ cardId: 'mine' });
    expect(await res.json()).toEqual({ card: CARD, changed: false });
    expect(ringAfter).toHaveBeenCalledWith(CTX, null);
    expect(await settled()).toEqual([]);
  });

  it('is 429 over budget, changing nothing: the service is handed the refused budget, and its own refusal never wins over it', async () => {
    spend.mockRejectedValue(new ApiFailure('rate_limited', 'Too many requests. Please try again later.'));
    // The service writes only once its budget answered (graph.test.ts pins that on the memory context).
    resonateWith.mockImplementation(async (...a: unknown[]) => {
      await a[4];
      throw new Error('never reached');
    });
    let res = await post({ cardId: 'mine' });
    expect(res.status).toBe(429);
    expect((await res.json()).error.code).toBe('rate_limited');
    resonateWith.mockRejectedValueOnce(new ApiFailure('not_found', 'No such card.'));
    res = await post({ cardId: 'mine' });
    expect(res.status).toBe(429);
    expect(ringAfter).not.toHaveBeenCalled();
    expect(await settled()).toEqual([]);
  });

  it('reads beside the budget: the service begins before the budget answers (round 32 §P6)', async () => {
    let answer!: () => void;
    spend.mockReturnValue(new Promise<void>((r) => (answer = r)));
    const posting = post({ cardId: 'mine' });
    await new Promise((r) => setTimeout(r, 0));
    expect(resonateWith).toHaveBeenCalledTimes(1);
    answer();
    expect((await posting).status).toBe(200);
  });

  it("passes the service's refusals on with their status, ringing and revalidating nothing", async () => {
    for (const [code, status] of [['conflict', 409], ['blocked', 403], ['not_found', 404], ['invalid_request', 400]] as const) {
      resonateWith.mockRejectedValueOnce(new ApiFailure(code, 'no'));
      const res = await post({ cardId: 'mine' });
      expect(res.status).toBe(status);
      expect((await res.json()).error.code).toBe(code);
    }
    expect(ringAfter).not.toHaveBeenCalled();
    expect(await settled()).toEqual([]);
  });

  it('refuses a body off the contract, and ids that could address another document', async () => {
    expect((await post({})).status).toBe(400);
    expect((await post('not json')).status).toBe(400);
    expect((await post({ cardId: 'cards/mine' })).status).toBe(400);
    expect((await post({ cardId: 'mine' }, 'a/b')).status).toBe(400);
    expect(spend).not.toHaveBeenCalled();
    expect(resonateWith).not.toHaveBeenCalled();
  });

  // Firestore keeps `__name__` ids for itself: they name no card, and cost none of the budget.
  it('answers an id Firestore keeps for itself as no such card, before the budget', async () => {
    for (const [body, key] of [[{ cardId: 'mine' }, '__x__'], [{ cardId: '__x__' }, 'orig']] as const) {
      const res = await post(body, key);
      expect(res.status).toBe(404);
      expect((await res.json()).error).toEqual({ code: 'not_found', message: 'No such card.' });
    }
    expect(spend).not.toHaveBeenCalled();
    expect(resonateWith).not.toHaveBeenCalled();
  });

  it('is 401 for nobody signed in', async () => {
    getCurrentUser.mockResolvedValue(null);
    expect((await post({ cardId: 'mine' })).status).toBe(401);
    expect(resonateWith).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/v1/cards/{id}/resonances/{cardId}', () => {
  it("answers 204 and revalidates the card's pages", async () => {
    const res = await del('orig', 'mine');
    expect(res.status).toBe(204);
    expect(unresonate).toHaveBeenCalledWith(CTX, 'alice', 'orig', 'mine');
    expect(await settled()).toEqual(LOCALIZED);
    expect(spend).not.toHaveBeenCalled();
  });

  it('answers 204 again when it no longer answered it, revalidating nothing', async () => {
    unresonate.mockResolvedValue({ changed: false, stale: [] });
    expect((await del('orig', 'mine')).status).toBe(204);
    expect(await settled()).toEqual([]);
  });

  it("is 404 for a card that isn't yours, and 400 for an id off the contract", async () => {
    unresonate.mockRejectedValueOnce(new ApiFailure('not_found', 'No such card.'));
    expect((await del('orig', 'bobs')).status).toBe(404);
    expect((await del('orig', '__x__.')).status).toBe(400);
    expect(await settled()).toEqual([]);
  });
});
