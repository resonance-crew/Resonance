import { beforeEach, describe, expect, it, vi } from 'vitest';

// POST /api/v1/chat-images: a resend is answered before anything is spent;
// otherwise the picture's count and bytes are spent in one transaction,
// started beside the service's check of whom the sender may message — which
// answers the budget's refusal first (apiV1ChatImages covers it against the
// emulator).

const getCurrentUser = vi.fn();
vi.mock('@/lib/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
vi.mock('@/lib/db/firestore/admin', () => ({ getAdminDb: () => ({}) }));
vi.mock('@/lib/storage/chatImages', () => ({ getChatImageStore: () => ({}) }));
const keptChatImage = vi.fn();
const uploadChatImage = vi.fn();
vi.mock('@/lib/api/v1/chatImageUpload', () => ({
  keptChatImage: (...a: unknown[]) => keptChatImage(...a),
  uploadChatImage: (...a: unknown[]) => uploadChatImage(...a),
}));
const spendAll = vi.fn();
vi.mock('@/lib/api/rateLimit', () => ({ spendAll: (...a: unknown[]) => spendAll(...a) }));

const { POST } = await import('./route');

const post = (clientId?: string) => {
  const body = new FormData();
  body.append('file', new Blob([new Uint8Array(1234)], { type: 'image/jpeg' }));
  body.append('to', 'bob');
  if (clientId) body.append('clientId', clientId);
  return POST(new Request('http://localhost/api/v1/chat-images', { method: 'POST', body }));
};

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUser.mockResolvedValue({ id: 'alice' });
  keptChatImage.mockResolvedValue(null);
  spendAll.mockResolvedValue(undefined);
  uploadChatImage.mockImplementation(async (_db, _store, _uid, _input, opts: { spent: Promise<void> }) => {
    await opts.spent;
    return { id: 'p1', width: 10, height: 10 };
  });
});

describe('POST /api/v1/chat-images', () => {
  it('spends the count and the bytes in one go, beside the upload, which is told the resend was asked', async () => {
    let settle!: () => void;
    spendAll.mockReturnValue(new Promise<void>((resolve) => (settle = resolve)));
    const res = post('client-0123456789abcdef');
    await vi.waitFor(() => expect(uploadChatImage).toHaveBeenCalledTimes(1));
    expect(spendAll).toHaveBeenCalledWith({}, 'alice', [['chatImage'], ['chatImageBytes', 1234]]);
    expect(uploadChatImage.mock.calls[0][4]).toEqual({ spent: spendAll.mock.results[0].value, resendAsked: true });
    settle();
    expect((await res).status).toBe(201);
  });

  it('answers a picture already kept without spending anything', async () => {
    keptChatImage.mockResolvedValue({ id: 'client-0123456789abcdef', width: 10, height: 10 });
    expect((await post('client-0123456789abcdef')).status).toBe(201);
    expect(spendAll).not.toHaveBeenCalled();
    expect(uploadChatImage).not.toHaveBeenCalled();
  });
});
