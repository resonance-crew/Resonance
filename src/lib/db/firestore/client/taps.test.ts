import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Who resonated with a card goes through the server (GET /api/v1/cards/{id}/taps): the next page's token and, for the
// author's list of one picked sentence (round 29 §S4.4), its passage id ride on the query string.
vi.mock('./init', () => ({ getClientDb: vi.fn(() => ({})) }));
type MockUser = { uid: string; getIdToken: () => Promise<string> };
const mockAuth = { currentUser: { uid: 'me', getIdToken: async () => 'id-token' } as MockUser | null };
vi.mock('@/lib/auth/firebase/client', () => ({ getFirebaseClientAuth: vi.fn(() => mockAuth), ensureAppCheck: vi.fn() }));

import { listTaps } from './taps';

const fetchMock = vi.fn();
const sizeDescriptor = Object.getOwnPropertyDescriptor(URLSearchParams.prototype, 'size');
beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(async () => new Response(JSON.stringify({ items: [], nextPageToken: null }), { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  if (sizeDescriptor) Object.defineProperty(URLSearchParams.prototype, 'size', sizeDescriptor);
});

describe('listTaps', () => {
  it('asks for the first page with no query string', async () => {
    await listTaps('c');
    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/cards/c/taps');
  });

  it('keeps the page token and the passage on a browser without URLSearchParams.size (Safari 16, Chrome 112)', async () => {
    Object.defineProperty(URLSearchParams.prototype, 'size', { configurable: true, get: () => undefined });
    await listTaps('c', 'tok', 'p1');
    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/cards/c/taps?pageToken=tok&passage=p1');
    await listTaps('c', null, 'p1');
    expect(fetchMock.mock.calls[1][0]).toBe('/api/v1/cards/c/taps?passage=p1');
  });
});
