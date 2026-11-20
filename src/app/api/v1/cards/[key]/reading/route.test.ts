import { beforeEach, describe, expect, it, vi } from 'vitest';

// POST /api/v1/cards/{id}/reading: one answer, 204, whatever the card — the
// keeping (lib/api/v1/reading) runs after the response, on the cached word on
// revocation; a body that isn't a report is 400. A beacon's body comes as
// text: it is read as JSON all the same.

const getCurrentUser = vi.fn();
vi.mock('@/lib/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
const DB = {};
vi.mock('@/lib/db/firestore/admin', () => ({ getAdminDb: () => DB }));
let afterWork: Promise<unknown>[] = [];
vi.mock('next/server', async (orig) => ({
  ...(await orig<typeof import('next/server')>()),
  after: (fn: () => unknown) => void afterWork.push(Promise.resolve().then(fn)),
}));
const reportReading = vi.fn();
vi.mock('@/server/app/reading', () => ({ reportReadingIn: (...a: unknown[]) => reportReading(...a) }));

const { POST } = await import('./route');
const { serverCtx } = await import('@/server/ctx');
// The route's context: serverCtx() on the mocked database, built once per instance.
const CTX = serverCtx();
const REPORT = { session: 'view-0001-abcd', activeSeconds: 42.5, progress: 0.8, reachedEnd: true };
const post = (key: string, body: unknown, headers: Record<string, string> = { 'content-type': 'application/json' }) =>
  POST(new Request(`http://localhost/api/v1/cards/${key}/reading`, { method: 'POST', headers, body: typeof body === 'string' ? body : JSON.stringify(body) }), {
    params: Promise.resolve({ key }),
  });

beforeEach(() => {
  vi.clearAllMocks();
  afterWork = [];
  getCurrentUser.mockResolvedValue({ id: 'bob' });
  reportReading.mockResolvedValue(true);
});

describe('POST /api/v1/cards/{id}/reading', () => {
  it('answers 204 at once and keeps the report after the response, on the cached word on revocation', async () => {
    const res = await post('c1', REPORT);
    expect(res.status).toBe(204);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    await Promise.all(afterWork);
    expect(reportReading).toHaveBeenCalledWith(CTX, 'bob', 'c1', REPORT);
    expect(getCurrentUser).toHaveBeenCalledWith({ revocation: 'cached' });
  });

  it("reads a beacon's text body, takes null for an absent share, and answers the same 204 when nothing was kept or keeping failed", async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect((await post('c1', { ...REPORT, shared: null }, { 'content-type': 'text/plain;charset=UTF-8' })).status).toBe(204);
    reportReading.mockResolvedValueOnce(false).mockRejectedValueOnce(new Error('down'));
    expect((await post('mine', REPORT)).status).toBe(204);
    expect((await post('broken', REPORT)).status).toBe(204);
    await Promise.all(afterWork);
    expect(reportReading.mock.calls[0][3]).toEqual({ ...REPORT, shared: null });
    expect(errors).toHaveBeenCalledTimes(1);
    errors.mockRestore();
  });

  it("refuses what isn't a report — no JSON, a bad session, a missing number — before keeping anything", async () => {
    for (const body of ['not json', { ...REPORT, session: 'short' }, { ...REPORT, session: 'has spaces in it' }, { session: REPORT.session, progress: 1, reachedEnd: false }]) {
      expect((await post('c1', body)).status, JSON.stringify(body)).toBe(400);
    }
    expect((await post('a.b', REPORT)).status).toBe(400);
    await Promise.all(afterWork);
    expect(reportReading).not.toHaveBeenCalled();
  });

  it('needs a reader', async () => {
    getCurrentUser.mockResolvedValue(null);
    expect((await post('c1', REPORT)).status).toBe(401);
  });
});
