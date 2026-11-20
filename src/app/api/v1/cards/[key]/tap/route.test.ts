import { beforeEach, describe, expect, it, vi } from 'vitest';

// PUT / DELETE /api/v1/cards/{id}/tap (共振): the budget spent beside the tap, answering first, the
// answer `{ on, changed }` alone, and everything that reaches the author —
// the ring, the bell row, the push — after the response, only for a tap that
// turned on and never rang; taking back after the response leaves the bell.
// Writes ask Firebase Auth whether the session was revoked (it reaches someone).

const getCurrentUser = vi.fn();
vi.mock('@/lib/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
const DB = { fake: 'db' };
vi.mock('@/lib/db/firestore/admin', () => ({ getAdminDb: () => DB }));
let afterWork: Promise<unknown>[] = [];
vi.mock('next/server', async (orig) => ({
  ...(await orig<typeof import('next/server')>()),
  after: (fn: () => unknown) => void afterWork.push(Promise.resolve().then(fn)),
}));
const spend = vi.fn();
const spendAll = vi.fn();
vi.mock('@/server/infra/firestore/rateLimit', () => ({
  firestoreRateLimiter: () => ({ spend: (...a: unknown[]) => spend(...a), spendAll: (...a: unknown[]) => spendAll(...a), limited: async () => null }),
}));
const setTap = vi.fn();
vi.mock('@/server/app/taps', () => ({ setTapIn: (...a: unknown[]) => setTap(...a) }));
const ringTap = vi.fn();
const pushTap = vi.fn();
const untapBell = vi.fn();
vi.mock('@/server/app/pushTap', () => ({
  ringTapIn: (...a: unknown[]) => ringTap(...a),
  pushTapIn: (...a: unknown[]) => pushTap(...a),
  untapBellIn: (...a: unknown[]) => untapBell(...a),
}));

const { PUT, DELETE } = await import('./route');
const { ApiFailure } = await import('@/lib/api/v1/http');
const { serverCtx } = await import('@/server/ctx');
// The route's context: serverCtx() on the mocked database, built once per instance.
const CTX = serverCtx();
const call = (method: 'PUT' | 'DELETE', key: string) =>
  (method === 'PUT' ? PUT : DELETE)(new Request(`http://localhost/api/v1/cards/${key}/tap`, { method }), { params: Promise.resolve({ key }) });

beforeEach(() => {
  vi.clearAllMocks();
  afterWork = [];
  getCurrentUser.mockResolvedValue({ id: 'alice' });
  spend.mockResolvedValue(undefined);
  ringTap.mockResolvedValue({ to: 'bob', handle: 'alice', notificationId: 'rtap_walk_20261119', others: 0 });
  pushTap.mockResolvedValue({ sent: 1, pruned: 0 });
  untapBell.mockResolvedValue(undefined);
});

describe('PUT /api/v1/cards/{id}/tap', () => {
  it('answers { on, changed } alone, and rings the author after the response — the first time only', async () => {
    setTap.mockResolvedValue({ on: true, changed: true, ring: true });
    const res = await call('PUT', 'walk');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ on: true, changed: true });
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(spend).toHaveBeenCalledWith('alice', 'tap');
    expect(setTap).toHaveBeenCalledWith(CTX, 'alice', 'walk', true, expect.any(Number), expect.any(Promise));
    expect(getCurrentUser).toHaveBeenCalledWith({ revocation: 'live' });
    await Promise.all(afterWork);
    expect(ringTap).toHaveBeenCalledWith(CTX, 'alice', 'walk');
    expect(pushTap).toHaveBeenCalledWith(CTX, { to: 'bob', handle: 'alice', notificationId: 'rtap_walk_20261119', others: 0, from: 'alice', cardId: 'walk' });
  });

  it('rings no one for a tap already on, or one that rang before; and pushes nothing when the ring found nothing to ring', async () => {
    setTap.mockResolvedValueOnce({ on: true, changed: false, ring: false }).mockResolvedValueOnce({ on: true, changed: true, ring: false });
    await call('PUT', 'walk');
    await call('PUT', 'walk');
    await Promise.all(afterWork);
    expect(ringTap).not.toHaveBeenCalled();
    setTap.mockResolvedValue({ on: true, changed: true, ring: true });
    ringTap.mockResolvedValue(null);
    await call('PUT', 'walk');
    await Promise.all(afterWork);
    expect(ringTap).toHaveBeenCalledTimes(1);
    expect(pushTap).not.toHaveBeenCalled();
  });

  it("logs a failed ring after the answer, never failing the reader's tap", async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    setTap.mockResolvedValue({ on: true, changed: true, ring: true });
    ringTap.mockRejectedValue(new Error('down'));
    expect((await call('PUT', 'walk')).status).toBe(200);
    await Promise.all(afterWork);
    expect(errors).toHaveBeenCalledTimes(1);
    errors.mockRestore();
  });

  it("answers the service's refusals with their codes, and 429 past the budget whatever else the tap would answer", async () => {
    setTap.mockRejectedValueOnce(new ApiFailure('blocked', 'You cannot resonate with this card.'));
    const blocked = await call('PUT', 'walk');
    expect(blocked.status).toBe(403);
    expect((await blocked.json()).error.code).toBe('blocked');
    setTap.mockRejectedValueOnce(new ApiFailure('not_found', 'No such card.'));
    expect((await call('PUT', 'walk')).status).toBe(404);
    spend.mockRejectedValue(new ApiFailure('rate_limited', 'Too many requests. Please try again later.'));
    setTap.mockClear();
    expect((await call('PUT', 'walk')).status).toBe(429);
    // Spent beside the tap's reads (B7): the 429 still wins, and setTap awaits the budget before it writes.
    expect(setTap.mock.calls[0][5]).toBeInstanceOf(Promise);
  });

  it('refuses a malformed id, and an id Firestore keeps for itself, before spending anything; needs someone signed in', async () => {
    expect((await call('PUT', 'a.b')).status).toBe(400);
    expect((await call('PUT', '__name__')).status).toBe(404);
    expect(spend).not.toHaveBeenCalled();
    getCurrentUser.mockResolvedValue(null);
    expect((await call('PUT', 'walk')).status).toBe(401);
  });
});

describe('DELETE /api/v1/cards/{id}/tap', () => {
  it('takes it back, spending the same budget, and takes the reader out of the bell row after the response — ringing no one', async () => {
    setTap.mockResolvedValue({ on: false, changed: true, ring: false });
    const res = await call('DELETE', 'walk');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ on: false, changed: true });
    expect(spend).toHaveBeenCalledWith('alice', 'tap');
    expect(setTap).toHaveBeenCalledWith(CTX, 'alice', 'walk', false, expect.any(Number), expect.any(Promise));
    await Promise.all(afterWork);
    expect(untapBell).toHaveBeenCalledWith(CTX, 'alice', 'walk');
    expect(ringTap).not.toHaveBeenCalled();
    expect(pushTap).not.toHaveBeenCalled();
  });

  it('touches no bell when there was nothing to take back', async () => {
    setTap.mockResolvedValue({ on: false, changed: false, ring: false });
    await call('DELETE', 'walk');
    await Promise.all(afterWork);
    expect(untapBell).not.toHaveBeenCalled();
  });
});
