import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Answering a legacy invite: accepting goes through the server
// (POST /api/v1/invites/{id}/accept), which connects the two and rings the
// sender — the browser writes neither (the rules refuse both) — and
// declining is the recipient's own act, not the sender's withdrawal.
vi.mock('./init', () => ({
  getClientDb: () => {
    throw new Error('Firestore is not read for invites');
  },
}));
const mockAuth = {
  currentUser: { uid: 'alice', getIdToken: async () => 'id-token' } as { uid: string; getIdToken: () => Promise<string> } | null,
};
vi.mock('@/lib/auth/firebase/client', () => ({ getFirebaseClientAuth: vi.fn(() => mockAuth), ensureAppCheck: vi.fn() }));
vi.mock('./reads', () => ({ rememberPeople: vi.fn() }));
vi.mock('./signals', () => ({ pokeSignal: vi.fn() }));

import { acceptInvite, declineInvite, listIncomingPendingInvites } from './invites';
import { rememberPeople } from './reads';

const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify({ connectionId: 'alice_bob' }), { status: 200 }));

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.currentUser = { uid: 'alice', getIdToken: async () => 'id-token' };
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('acceptInvite', () => {
  it('asks the server to accept it, signed in with the ID token, and answers the connection', async () => {
    expect(await acceptInvite('i/1')).toBe('alice_bob');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/v1/invites/i%2F1/accept');
    expect(init?.method).toBe('POST');
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer id-token');
    // No connection, bell or invite write from the browser.
  });

  it("surfaces the server's refusal (a block, an invite no longer open)", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { code: 'conflict', message: 'This invite is no longer open.' } }), { status: 409 }),
    );
    await expect(acceptInvite('i1')).rejects.toMatchObject({ status: 409, code: 'conflict', message: 'This invite is no longer open.' });
  });

  it('never calls out when signed out', async () => {
    mockAuth.currentUser = null;
    await expect(acceptInvite('i1')).rejects.toThrow('Not signed in');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('declineInvite', () => {
  it("asks the server to close the recipient's invite as declined (no connection, no bell)", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await declineInvite('i1');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/v1/invites/i1/decline');
    expect(init?.method).toBe('POST');
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer id-token');
  });

  it("surfaces the server's refusal (someone else's invite, one no longer pending)", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { code: 'conflict', message: 'This invite is no longer pending.' } }), { status: 409 }),
    );
    await expect(declineInvite('i1')).rejects.toMatchObject({ status: 409, code: 'conflict' });
  });
});

describe('listIncomingPendingInvites', () => {
  const from = { id: 'bob', gone: false, author: null, bio: null, joinedAt: null };
  const row = (id: string, expiresAt: string) => ({
    id,
    fromUserId: 'bob',
    message: id,
    referenceCardId: null,
    createdAt: '2026-09-29T10:00:00.000Z',
    expiresAt,
    from,
  });

  // An invite past its "respond by" date is still `pending` until someone
  // taps Accept (the server then refuses it and closes it as expired): the
  // inbox must not offer a button that can only fail.
  it('lists the server\'s incoming invites, only those still before their "respond by" date', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          invites: [row('open', '2026-10-07T00:00:00.000Z'), row('expired', '2026-10-03T00:00:00.000Z'), row('this-moment', '2026-10-04T12:00:00.000Z')],
        }),
        { status: 200 },
      ),
    );
    const listed = await listIncomingPendingInvites(new Date('2026-10-04T12:00:00Z'));
    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/invites?box=incoming');
    expect(listed.map((i) => i.id)).toEqual(['open']);
    expect(listed[0]).toMatchObject({ fromUserId: 'bob', toUserId: 'alice', status: 'pending', expiresAt: new Date('2026-10-07T00:00:00Z') });
    expect(rememberPeople).toHaveBeenCalledWith([from, from, from]);
  });

  it('asks for nothing signed out', async () => {
    mockAuth.currentUser = null;
    expect(await listIncomingPendingInvites()).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
