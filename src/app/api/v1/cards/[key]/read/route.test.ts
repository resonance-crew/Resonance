import { beforeEach, describe, expect, it, vi } from 'vitest';

// POST /api/v1/cards/{id}/read: one answer, 204, whatever the card — the
// counting (lib/api/v1/cardReads) runs after the response, and its failure
// is logged, never the reader's.

const getCurrentUser = vi.fn();
vi.mock('@/lib/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
vi.mock('@/lib/db/firestore/admin', () => ({ getAdminDb: () => ({}) }));
let afterWork: Promise<unknown>[] = [];
vi.mock('next/server', async (orig) => ({
  ...(await orig<typeof import('next/server')>()),
  after: (fn: () => unknown) => void afterWork.push(Promise.resolve().then(fn)),
}));
const countCardRead = vi.fn();
vi.mock('@/lib/api/v1/cardReads', () => ({ countCardRead: (...a: unknown[]) => countCardRead(...a) }));

const { POST } = await import('./route');
const post = (key: string) => POST(new Request(`http://localhost/api/v1/cards/${key}/read`, { method: 'POST' }), { params: Promise.resolve({ key }) });

beforeEach(() => {
  vi.clearAllMocks();
  afterWork = [];
  getCurrentUser.mockResolvedValue({ id: 'bob' });
});

describe('POST /api/v1/cards/{id}/read', () => {
  it('answers 204 at once and counts the read after the response, on the cached word on revocation', async () => {
    countCardRead.mockResolvedValue(true);
    const res = await post('c1');
    expect(res.status).toBe(204);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    await Promise.all(afterWork);
    expect(countCardRead).toHaveBeenCalledWith({}, 'bob', 'c1');
    expect(getCurrentUser).toHaveBeenCalledWith({ revocation: 'cached' });
  });

  it('answers the same 204 when nothing was counted or the counting failed', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    countCardRead.mockResolvedValueOnce(false).mockRejectedValueOnce(new Error('down'));
    expect((await post('mine')).status).toBe(204);
    expect((await post('broken')).status).toBe(204);
    await Promise.all(afterWork);
    expect(errors).toHaveBeenCalledTimes(1);
    errors.mockRestore();
  });

  it('needs a reader', async () => {
    getCurrentUser.mockResolvedValue(null);
    expect((await post('c1')).status).toBe(401);
    expect(countCardRead).not.toHaveBeenCalled();
  });
});
