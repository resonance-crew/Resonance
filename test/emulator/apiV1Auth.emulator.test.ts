import { generateKeyPairSync } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// Phase 3's own sessions (ADR 0004) on the Auth and Firestore emulators, end
// to end through the routes: a real emulator Firebase ID token exchanged for
// Resonance's tokens, the access token used on /api/v1/me (a read and a
// write), the refresh token rotated once per use — a second use revoking its
// whole family — logout, signing out everywhere, a disabled account and a
// purged one, whose tokens all fail. And the Firebase token on its own,
// exactly as installed builds send it, still works beside them (dual accept).

const PROJECT = 'demo-resonance';
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '127.0.0.1:9099';
process.env.FIREBASE_AUTH_EMULATOR_HOST = authHost;
process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
process.env.FIREBASE_PROJECT_ID = PROJECT;
process.env.GCLOUD_PROJECT = PROJECT;

const jwk = generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey.export({ format: 'jwk' });
const KEYS = JSON.stringify([{ kid: 'emulator-1', jwk }]);

// getCurrentUser() reads the request's headers through next/headers: the request a test sends.
let authorization: string | null = null;
vi.mock('next/headers', () => ({
  headers: async () => new Headers(authorization ? { authorization } : {}),
  cookies: async () => ({ get: () => undefined }),
}));
// Outside Next's request store, renaming a profile's pages to refresh is nothing to do.
vi.mock('next/cache', () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));

const { getAdminDb } = await import('@/lib/db/firestore/admin');
const { getAdminAuth } = await import('@/server/infra/firebase-auth/auth');
const { forgetAccountState } = await import('@/server/infra/firebase-auth/auth');
const { serverCtx } = await import('@/server/ctx');
const { purgeAccountIn } = await import('@/server/app/account');
const exchange = (await import('@/app/api/v1/auth/exchange/route')).POST;
const refresh = (await import('@/app/api/v1/auth/refresh/route')).POST;
const logout = (await import('@/app/api/v1/auth/logout/route')).POST;
const me = await import('@/app/api/v1/me/route');

const db = getAdminDb();

async function signUp(): Promise<{ uid: string; idToken: string }> {
  const res = await fetch(`http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: `auth-${Date.now()}-${Math.random().toString(36).slice(2)}@sessions.test`, password: 'sessions-test-pw', returnSecureToken: true }),
  });
  expect(res.ok).toBe(true);
  const body = (await res.json()) as { localId: string; idToken: string };
  await db.doc(`users/${body.localId}`).set({ handle: `p${body.localId.slice(0, 6)}`, initials: 'PP', accentColor: 'x', bio: 'before' });
  return { uid: body.localId, idToken: body.idToken };
}

const post = (route: (req: Request) => Promise<Response>, body: unknown) =>
  route(new Request('http://localhost/api/v1/auth', { method: 'POST', body: JSON.stringify(body) }));

interface Session {
  accessToken: string;
  refreshToken: string;
  userId: string;
  expiresIn: number;
  tokenType: string;
}

async function exchanged(idToken: string): Promise<Session> {
  const res = await post(exchange, { token: idToken });
  expect(res.status).toBe(200);
  return (await res.json()) as Session;
}

/** GET /api/v1/me (a read: the cached revocation answer) and PATCH /api/v1/me (a write: asked live) as this bearer. */
async function asBearer(token: string) {
  authorization = `Bearer ${token}`;
  try {
    const read = await me.GET(new Request('http://localhost/api/v1/me', { headers: { authorization } }));
    const write = await me.PATCH(
      new Request('http://localhost/api/v1/me', { method: 'PATCH', headers: { authorization, 'content-type': 'application/json' }, body: JSON.stringify({ bio: 'after' }) }),
    );
    return { read: read.status, write: write.status, id: read.status === 200 ? ((await read.json()) as { id: string }).id : null };
  } finally {
    authorization = null;
  }
}

const refreshRows = async (uid: string) => (await db.collection('refreshTokens').where('uid', '==', uid).get()).docs;

beforeAll(() => {
  vi.stubEnv('RESONANCE_JWT_KEYS', KEYS);
});

beforeEach(() => {
  vi.stubEnv('RESONANCE_JWT_KEYS', KEYS);
});

afterAll(() => {
  vi.unstubAllEnvs();
});

describe('POST /api/v1/auth/exchange', () => {
  it("trades a real Firebase ID token for our tokens: the account is the Firebase uid, mapped in identities, the refresh token kept only as its hash", async () => {
    const { uid, idToken } = await signUp();
    const session = await exchanged(idToken);
    expect(session).toMatchObject({ userId: uid, tokenType: 'Bearer', expiresIn: 900 });
    expect(session.accessToken.split('.')).toHaveLength(3);
    expect((await db.doc(`identities/firebase_${uid}`).get()).data()).toMatchObject({ userId: uid, provider: 'firebase', subject: uid });
    const rows = await refreshRows(uid);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(rows[0].data())).not.toContain(session.refreshToken.slice(4));
    expect(rows[0].data()).toMatchObject({ uid, usedAt: null });
  });

  it('works on a v1 route as the bearer token — a read and a write — and the Firebase token beside it, unchanged', async () => {
    const { uid, idToken } = await signUp();
    expect(await asBearer(idToken)).toEqual({ read: 200, write: 200, id: uid });
    const session = await exchanged(idToken);
    expect(await asBearer(session.accessToken)).toEqual({ read: 200, write: 200, id: uid });
    expect(await asBearer(idToken)).toEqual({ read: 200, write: 200, id: uid });
    // A forged one of ours (another key under our kid) is refused, and never handed on to Firebase as something else.
    const [head, body] = session.accessToken.split('.');
    expect(await asBearer(`${head}.${body}.${Buffer.alloc(64, 1).toString('base64url')}`)).toMatchObject({ read: 401, write: 401 });
  });

  it('is 401 for a token that is no good, 400 without one, 503 while RESONANCE_JWT_KEYS is unset (Firebase tokens unaffected)', async () => {
    const { uid, idToken } = await signUp();
    expect((await post(exchange, { token: 'not-a-token' })).status).toBe(401);
    expect((await post(exchange, {})).status).toBe(400);
    vi.stubEnv('RESONANCE_JWT_KEYS', '');
    const off = await post(exchange, { token: idToken });
    expect(off.status).toBe(503);
    expect(((await off.json()) as { error: { code: string } }).error.code).toBe('internal');
    expect(await asBearer(idToken)).toEqual({ read: 200, write: 200, id: uid });
  });
});

describe('POST /api/v1/auth/refresh and /logout', () => {
  it('rotates once per use; a second use of a refresh token revokes its family — the token rotated from it too', async () => {
    const { uid, idToken } = await signUp();
    const first = await exchanged(idToken);
    const res = await post(refresh, { refreshToken: first.refreshToken });
    expect(res.status).toBe(200);
    const second = (await res.json()) as Session;
    expect(second.refreshToken).not.toBe(first.refreshToken);
    expect(await asBearer(second.accessToken)).toMatchObject({ read: 200, id: uid });
    expect((await post(refresh, { refreshToken: first.refreshToken })).status).toBe(401);
    expect((await post(refresh, { refreshToken: second.refreshToken })).status).toBe(401);
    expect(await refreshRows(uid)).toHaveLength(0);
  });

  it("logs out: the family goes, the same answer again, and another device's session stands", async () => {
    const { idToken } = await signUp();
    const phone = await exchanged(idToken);
    const tablet = await exchanged(idToken);
    expect((await post(logout, { refreshToken: phone.refreshToken })).status).toBe(204);
    expect((await post(logout, { refreshToken: phone.refreshToken })).status).toBe(204);
    expect((await post(refresh, { refreshToken: phone.refreshToken })).status).toBe(401);
    expect((await post(refresh, { refreshToken: tablet.refreshToken })).status).toBe(200);
  });

  it('signing out everywhere (revokeSessions) revokes every refresh family, and the access tokens from before it fail', async () => {
    const { uid, idToken } = await signUp();
    const session = await exchanged(idToken);
    // Firebase keeps revocation to the second: a session from the second before is revoked, not one from the same second.
    await new Promise((r) => setTimeout(r, 1100));
    await serverCtx().identity.revokeSessions(uid);
    expect(await refreshRows(uid)).toHaveLength(0);
    expect((await post(refresh, { refreshToken: session.refreshToken })).status).toBe(401);
    expect(await asBearer(session.accessToken)).toMatchObject({ read: 401, write: 401 });
  });
});

describe("an account's standing", () => {
  it("a disabled account's access token fails at once on a write, and its refresh ends the family", async () => {
    const { uid, idToken } = await signUp();
    const session = await exchanged(idToken);
    await getAdminAuth().updateUser(uid, { disabled: true });
    try {
      expect((await asBearer(session.accessToken)).write).toBe(401);
      expect((await post(refresh, { refreshToken: session.refreshToken })).status).toBe(401);
      expect(await refreshRows(uid)).toHaveLength(0);
    } finally {
      await getAdminAuth().updateUser(uid, { disabled: false });
    }
  });

  it("a purged account's tokens fail: the purge takes its identity and refresh tokens, and the sign-in itself", async () => {
    const { uid, idToken } = await signUp();
    const session = await exchanged(idToken);
    expect(await asBearer(session.accessToken)).toMatchObject({ read: 200, write: 200 });
    const ctx = serverCtx();
    await purgeAccountIn(ctx, { deleteAuthUser: (id) => ctx.identity.deleteUser(id) }, uid);
    expect((await db.doc(`identities/firebase_${uid}`).get()).exists).toBe(false);
    expect(await refreshRows(uid)).toHaveLength(0);
    // Writes ask live; a read on another instance may trust what it saw for REVOCATION_CACHE_MS (as Firebase tokens).
    forgetAccountState(uid);
    expect(await asBearer(session.accessToken)).toMatchObject({ read: 401, write: 401 });
    expect((await post(refresh, { refreshToken: session.refreshToken })).status).toBe(401);
    expect((await post(exchange, { token: idToken })).status).toBe(401);
  });
});
