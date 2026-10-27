import { beforeEach, describe, expect, it, vi } from 'vitest';

// PUT/DELETE /api/v1/conversations/{pair}/messages/{messageId}/reaction, as the
// contract describes them: the body and the path checked first (400), the
// `react` budget next (429), then the service's own answers (404 / 403) —
// apiV1MessageActions.emulator.test.ts covers the service. Taking a reaction
// back spends nothing.

const getCurrentUser = vi.fn();
vi.mock('@/lib/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
vi.mock('@/lib/db/firestore/admin', () => ({ getAdminDb: () => ({}) }));
const setReaction = vi.fn();
const removeReaction = vi.fn();
vi.mock('@/lib/api/v1/messageActions', () => ({
  setReaction: (...a: unknown[]) => setReaction(...a),
  removeReaction: (...a: unknown[]) => removeReaction(...a),
}));
const spend = vi.fn();
vi.mock('@/lib/api/rateLimit', () => ({ spend: (...a: unknown[]) => spend(...a) }));

const { PUT, DELETE } = await import('./route');
const { ApiFailure } = await import('@/lib/api/v1/http');

const ctx = (pair = 'alice_bob', messageId = 'm1') => ({ params: Promise.resolve({ pair, messageId }) });
const url = 'http://localhost/api/v1/conversations/alice_bob/messages/m1/reaction';
const put = (body: unknown, c = ctx()) =>
  PUT(new Request(url, { method: 'PUT', body: typeof body === 'string' ? body : JSON.stringify(body), headers: { 'content-type': 'application/json' } }), c);
const del = (c = ctx()) => DELETE(new Request(url, { method: 'DELETE' }), c);

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUser.mockResolvedValue({ id: 'bob' });
  spend.mockResolvedValue(undefined);
  setReaction.mockResolvedValue(undefined);
  removeReaction.mockResolvedValue(undefined);
});

describe('PUT …/reaction', () => {
  it('reacts with each of the five, answering 204 with no body', async () => {
    for (const reaction of ['heart', 'moved', 'laugh', 'hug', 'thumbs']) {
      const res = await put({ reaction });
      expect(res.status).toBe(204);
      expect(await res.text()).toBe('');
    }
    expect(spend).toHaveBeenCalledWith({}, 'bob', 'react');
    expect(setReaction).toHaveBeenLastCalledWith({}, 'bob', 'alice_bob', 'm1', { reaction: 'thumbs' });
  });

  it('refuses a reaction the contract does not know, a body that is not JSON, and a path that names nothing — before any budget', async () => {
    for (const body of [{ reaction: 'angry' }, {}, { reaction: null }, 'not json']) expect((await put(body)).status).toBe(400);
    for (const c of [ctx('alice-bob'), ctx('alice_bob', 'has/slash'), ctx('alice_bob', 'x'.repeat(129)), ctx('', 'm1')]) {
      expect((await put({ reaction: 'heart' }, c)).status).toBe(400);
    }
    expect(spend).not.toHaveBeenCalled();
    expect(setReaction).not.toHaveBeenCalled();
  });

  it('is 429 over budget, reacting with nothing', async () => {
    spend.mockRejectedValue(new ApiFailure('rate_limited', 'Too many requests. Please try again later.'));
    const res = await put({ reaction: 'heart' });
    expect([res.status, (await res.json()).error.code]).toEqual([429, 'rate_limited']);
    expect(setReaction).not.toHaveBeenCalled();
  });

  it("answers the service's refusals in the contract's shape", async () => {
    for (const [code, status] of [['not_found', 404], ['forbidden', 403], ['blocked', 403]] as const) {
      setReaction.mockRejectedValueOnce(new ApiFailure(code, 'no'));
      const res = await put({ reaction: 'heart' });
      expect([res.status, await res.json()]).toEqual([status, { error: { code, message: 'no' } }]);
    }
  });

  it('is 401 signed out', async () => {
    getCurrentUser.mockResolvedValue(null);
    expect((await put({ reaction: 'heart' })).status).toBe(401);
    expect(setReaction).not.toHaveBeenCalled();
  });
});

describe('DELETE …/reaction', () => {
  it('takes the reaction back, 204, spending nothing', async () => {
    const res = await del();
    expect(res.status).toBe(204);
    expect(removeReaction).toHaveBeenCalledWith({}, 'bob', 'alice_bob', 'm1');
    expect(spend).not.toHaveBeenCalled();
  });

  it('is 404 for a conversation or message not yours, 400 for a path that names nothing', async () => {
    removeReaction.mockRejectedValueOnce(new ApiFailure('not_found', 'No such message.'));
    expect((await del()).status).toBe(404);
    expect((await del(ctx('nope'))).status).toBe(400);
  });
});
