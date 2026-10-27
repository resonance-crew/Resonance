import { beforeEach, describe, expect, it, vi } from 'vitest';

// POST /api/v1/conversations/{pair}/messages/{messageId}/unsend, as the contract
// describes it: the path checked first (400), the `unsend` budget next (429),
// then the service (404 / 400 for a note / 409 past 24 hours —
// apiV1MessageActions.emulator.test.ts) — and, after the response, the
// recipient's phone told (pushUnsend), unless the message was unsent already.

const getCurrentUser = vi.fn();
vi.mock('@/lib/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
vi.mock('@/lib/db/firestore/admin', () => ({ getAdminDb: () => ({}) }));
const unsendMessage = vi.fn();
vi.mock('@/lib/api/v1/messageActions', () => ({ unsendMessage: (...a: unknown[]) => unsendMessage(...a) }));
const afterMessageUnsent = vi.fn();
vi.mock('@/lib/api/v1/afterMessage', () => ({ afterMessageUnsent: (...a: unknown[]) => afterMessageUnsent(...a) }));
const spend = vi.fn();
vi.mock('@/lib/api/rateLimit', () => ({ spend: (...a: unknown[]) => spend(...a) }));

const { POST } = await import('./route');
const { ApiFailure } = await import('@/lib/api/v1/http');

const ctx = (pair = 'alice_bob', messageId = 'm1') => ({ params: Promise.resolve({ pair, messageId }) });
const post = (c = ctx()) => POST(new Request('http://localhost/api/v1/conversations/alice_bob/messages/m1/unsend', { method: 'POST' }), c);
const push = { conversationId: 'alice_bob', messageId: 'm1', from: 'alice', to: 'bob' };

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUser.mockResolvedValue({ id: 'alice' });
  spend.mockResolvedValue(undefined);
  unsendMessage.mockResolvedValue({ push });
});

describe('POST …/unsend', () => {
  it('unsends, answering 204, and tells the recipient\'s phone after the response', async () => {
    const res = await post();
    expect(res.status).toBe(204);
    expect(spend).toHaveBeenCalledWith({}, 'alice', 'unsend');
    expect(unsendMessage).toHaveBeenCalledWith({}, 'alice', 'alice_bob', 'm1');
    expect(afterMessageUnsent).toHaveBeenCalledWith({}, push);
  });

  it('answers one already unsent 204 too, telling no one again', async () => {
    unsendMessage.mockResolvedValue({ push: null });
    expect((await post()).status).toBe(204);
    expect(afterMessageUnsent).toHaveBeenCalledWith({}, null);
  });

  it('refuses a path that names nothing before spending, and is 429 over budget', async () => {
    for (const c of [ctx('alicebob'), ctx('alice_bob', '../m1'), ctx('alice_bob', '')]) expect((await post(c)).status).toBe(400);
    expect(spend).not.toHaveBeenCalled();
    spend.mockRejectedValue(new ApiFailure('rate_limited', 'Too many requests. Please try again later.'));
    expect((await post()).status).toBe(429);
    expect(unsendMessage).not.toHaveBeenCalled();
    expect(afterMessageUnsent).not.toHaveBeenCalled();
  });

  it("answers the service's refusals in the contract's shape, telling no phone", async () => {
    const refusals = [
      [new ApiFailure('not_found', 'No such message.'), 404],
      [new ApiFailure('invalid_request', "A note can't be unsent."), 400],
      [new ApiFailure('conflict', 'This message can no longer be unsent.'), 409],
    ] as const;
    for (const [failure, status] of refusals) {
      unsendMessage.mockRejectedValueOnce(failure);
      const res = await post();
      expect([res.status, await res.json()]).toEqual([status, { error: { code: failure.code, message: failure.message } }]);
    }
    expect(afterMessageUnsent).not.toHaveBeenCalled();
  });
});
