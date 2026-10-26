// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import type { AuthUser } from '@/lib/auth/types';
import type { SessionState } from '@/lib/auth/firebase/client';

// Every hook gates on `loading`; only cookie-reading /api callers gate on
// `sessionReady`. So `loading` must end when the SDK knows the user — not
// when the session cookie request comes back.

let emit: (user: AuthUser | null, session: SessionState) => void = () => undefined;
vi.mock('@/lib/auth/firebase/client', () => ({
  USE_FIREBASE_EMULATOR: false,
  firebaseClientAuthProvider: {
    subscribe: (cb: typeof emit) => {
      emit = cb;
      return () => undefined;
    },
    refreshSession: vi.fn(),
  },
}));

import { AuthProvider, useAuth, useSessionReady } from './AuthProvider';

function Probe() {
  const { user, loading } = useAuth();
  const sessionReady = useSessionReady();
  return <p>{loading ? 'loading' : `${user?.id ?? 'nobody'} · cookie ${sessionReady ? 'ready' : 'pending'}`}</p>;
}

/** What a reader of the user alone (most of the app) sees, and how often it renders. */
const reader = { renders: 0, users: [] as (AuthUser | null)[] };
function UserReader() {
  const { user } = useAuth();
  reader.renders++;
  if (reader.users[reader.users.length - 1] !== user) reader.users.push(user);
  return null;
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}

const me: AuthUser = { id: 'u1', email: null, phoneNumber: null, emailVerified: true };

beforeEach(() => {
  reader.renders = 0;
  reader.users = [];
  render(
    <AuthProvider>
      <Probe />
      <UserReader />
    </AuthProvider>,
  );
});

describe('AuthProvider', () => {
  it('reports the signed-in user before the session cookie is back', async () => {
    expect(screen.getByText('loading')).toBeInTheDocument();
    const cookie = deferred();
    act(() => emit(me, { ready: false, settled: cookie.promise }));
    expect(screen.getByText('u1 · cookie pending')).toBeInTheDocument();

    await act(async () => cookie.resolve());
    expect(screen.getByText('u1 · cookie ready')).toBeInTheDocument();
  });

  it('is ready at once when the cookie is already in place', () => {
    act(() => emit(me, { ready: true, settled: new Promise(() => undefined) }));
    expect(screen.getByText('u1 · cookie ready')).toBeInTheDocument();
  });

  it("doesn't let an older refresh mark a newer one ready", async () => {
    const first = deferred();
    act(() => emit(me, { ready: false, settled: first.promise }));
    act(() => emit({ ...me, id: 'u2' }, { ready: false, settled: new Promise(() => undefined) }));
    await act(async () => first.resolve());
    expect(screen.getByText('u2 · cookie pending')).toBeInTheDocument();
  });

  it('settles signed out with nothing to wait for', () => {
    act(() => emit(null, { ready: true, settled: Promise.resolve() }));
    expect(screen.getByText('nobody · cookie ready')).toBeInTheDocument();
  });

  // The token refreshes about hourly and the cookie settles after sign-in:
  // neither changes who is signed in, so the app's many readers of the user
  // (lists, cards, the card page) don't render again for them.
  it('keeps the same user through token ticks, and the cookie settling touches only its own readers', async () => {
    const cookie = deferred();
    act(() => emit(me, { ready: false, settled: cookie.promise }));
    const renders = reader.renders;
    expect(reader.users).toEqual([null, me]);

    await act(async () => cookie.resolve());
    expect(screen.getByText('u1 · cookie ready')).toBeInTheDocument();
    act(() => emit({ ...me }, { ready: true, settled: Promise.resolve() }));
    act(() => emit({ ...me }, { ready: true, settled: Promise.resolve() }));
    expect(reader.renders).toBe(renders);
    expect(reader.users).toEqual([null, me]);

    // A change that matters reaches them.
    act(() => emit({ ...me, emailVerified: false }, { ready: true, settled: Promise.resolve() }));
    expect(reader.users[2]).toMatchObject({ id: 'u1', emailVerified: false });
  });
});
