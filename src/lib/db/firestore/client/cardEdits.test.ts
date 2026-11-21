import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// --- The boundary: the network ------------------------------------------------
// These functions are the whole reason a published card's autosave is safe:
// edits must land in the card's working copy (`…/edits/current`) and never on
// the card itself, and only the server applies them. Since phase 2b they are
// server calls (GET / PUT / DELETE /api/v1/cards/{id}/edits/current) — the
// browser never touches Firestore for them (a call to it throws).
vi.mock('./init', () => ({
  getClientDb: vi.fn(() => {
    throw new Error('Firestore is not written by the writer');
  }),
}));

type MockUser = { uid: string; getIdToken: () => Promise<string> };
const signedIn = (): MockUser => ({ uid: 'me', getIdToken: async () => 'id-token' });
const mockAuth = { currentUser: signedIn() as MockUser | null };
vi.mock('@/lib/auth/firebase/client', () => ({
  getFirebaseClientAuth: vi.fn(() => mockAuth),
  ensureAppCheck: vi.fn(),
}));
vi.mock('@/lib/auth/firebase/appCheck', () => ({ appCheckHeaders: vi.fn(async () => ({})) }));

import { applyPendingCardEdit, discardPendingCardEdit, getPendingCardEdit, savePendingCardEdit, type CardEditValues } from './cardEdits';
import { resetOutboxForTests } from './draftOutbox';
import { getClientDb } from './init';

const EDIT_PATH = '/api/v1/cards/card-1/edits/current';

const values: CardEditValues = {
  thoughtCore: 'A revised title',
  story: 'A revision still being written.',
  tags: ['memory'],
  visibility: 'public',
  media: { type: 'image', url: 'https://cdn/x.avif' },
  accentHue: 55,
  anonymous: false,
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
let fetchMock: ReturnType<typeof vi.fn>;
const calls = () => fetchMock.mock.calls.map(([url, init]) => ({ url: url as string, method: (init as RequestInit).method, body: (init as RequestInit).body ? JSON.parse(String((init as RequestInit).body)) : null, headers: (init as RequestInit).headers as Record<string, string> }));

beforeEach(() => {
  vi.clearAllMocks();
  resetOutboxForTests();
  mockAuth.currentUser = signedIn();
  fetchMock = vi.fn(async () => json({ applied: true, rev: 1, updatedAt: '2026-11-21T08:00:00.000Z' }));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('pending card edits', () => {
  it('autosaves into the card’s working copy, never the card itself', async () => {
    await savePendingCardEdit('card-1', values);

    expect(calls()).toHaveLength(1);
    const [put] = calls();
    expect(put).toMatchObject({ url: EDIT_PATH, method: 'PUT' });
    expect(put.headers.Authorization).toBe('Bearer id-token');
    // The whole copy, counted (rev) so a late save never puts older words back.
    expect(put.body).toEqual({ ...values, rev: 1 });
    // The live card is what readers are looking at — untouched until the author explicitly saves.
    expect(calls().some((c) => c.url === '/api/v1/cards/card-1' || c.url.endsWith('/draft'))).toBe(false);
    expect(getClientDb).not.toHaveBeenCalled();
  });

  it('refuses to autosave when nobody is signed in', async () => {
    mockAuth.currentUser = null;
    await expect(savePendingCardEdit('card-1', values)).rejects.toThrow('Not signed in');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reads a buffered working copy back', async () => {
    fetchMock.mockResolvedValueOnce(json({ edit: { ...values, media: { type: 'image', url: 'https://cdn/x.avif', thumbUrl: null, label: null, frame: null }, updatedAt: '2026-11-20T08:00:00.000Z', rev: 3 } }));

    const pending = await getPendingCardEdit('card-1');
    expect(calls()[0]).toMatchObject({ url: EDIT_PATH, method: 'GET' });
    expect(pending).toEqual({ ...values, updatedAt: new Date('2026-11-20T08:00:00.000Z') });
  });

  it('reports no pending edit when there is none (or the card is not yours)', async () => {
    fetchMock.mockResolvedValueOnce(json({ edit: null }));
    await expect(getPendingCardEdit('card-1')).resolves.toBeNull();

    fetchMock.mockResolvedValueOnce(json({ error: { code: 'not_found', message: 'No such card.' } }, 404));
    await expect(getPendingCardEdit('card-1')).resolves.toBeNull();
  });

  // Opened on "no pending edit", the editor would autosave the live fields
  // over the working copy the read failed to fetch.
  it('lets a read that failed (offline) fail instead of reporting no pending edit', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch: offline'));
    await expect(getPendingCardEdit('card-1')).rejects.toThrow('offline');
    fetchMock.mockResolvedValueOnce(json({ error: { code: 'internal', message: 'Something went wrong.' } }, 500));
    await expect(getPendingCardEdit('card-1')).rejects.toMatchObject({ status: 500 });
  });

  // The live card is what readers see: the server applies the revision (one
  // transaction, its date and slug kept, held to a card's limits — pinned in
  // test/emulator/apiV1Edits), never this browser.
  it('applies the revision through the API with the ID token, writing nothing itself', async () => {
    fetchMock.mockResolvedValueOnce(json({ id: 'card-1', slug: 'a-revised-title', applied: true }));

    await expect(applyPendingCardEdit('card-1')).resolves.toEqual({ id: 'card-1', slug: 'a-revised-title', applied: true });

    expect(calls()).toHaveLength(1);
    expect(calls()[0]).toMatchObject({ url: '/api/v1/cards/card-1/edits/apply', method: 'POST' });
    expect(calls()[0].headers.Authorization).toBe('Bearer id-token');
  });

  it("surfaces the server's refusal", async () => {
    fetchMock.mockResolvedValueOnce(json({ error: { code: 'invalid_request', message: 'The edit does not fit a card.' } }, 400));
    await expect(applyPendingCardEdit('card-1')).rejects.toMatchObject({ status: 400, code: 'invalid_request', message: 'The edit does not fit a card.' });
  });

  it('refuses to apply when nobody is signed in', async () => {
    mockAuth.currentUser = null;
    await expect(applyPendingCardEdit('card-1')).rejects.toThrow('Not signed in');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('discards a working copy without touching the card', async () => {
    fetchMock.mockResolvedValueOnce(json({ deleted: true }));
    await discardPendingCardEdit('card-1');
    expect(calls()).toEqual([expect.objectContaining({ url: EDIT_PATH, method: 'DELETE' })]);
  });
});
