import { generateKeyPairSync } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiFailure } from '@/lib/api/v1/http';
import { ADDRESS_LIMITS } from '@/server/domain/rateLimit';
import { ACCESS_TTL_S, REFRESH_GRACE_MS, REFRESH_TTL_MS } from '@/server/domain/session';
import { memoryAddressLimiter } from '@/server/infra/memory/addressBudget';
import { memoryIdentity, type MemoryIdentity } from '@/server/infra/memory/identity';
import { memoryRateLimiter } from '@/server/infra/memory/rateLimit';
import { memorySessionStore, type MemorySessionStore } from '@/server/infra/memory/sessions';
import { MemoryState } from '@/server/infra/memory/state';
import { parseJwtKeys, verifyAccessToken, type SigningKey } from '@/server/infra/session/jwt';
import { jwtSessionSigner } from '@/server/infra/session/signer';
import { exchangeIn, logoutIn, refreshIn, type SessionDeps } from './auth';

// Phase 3's sessions (ADR 0004) on memory: exchange a sign-in at the identity
// provider for our tokens (the subject the same uid, for good), rotate the
// refresh token once per use, take a second use for theft (the family goes),
// log out, and end every session of an account gone, disabled or revoked.

const jwk = () => generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey.export({ format: 'jwk' });
const KEYS: SigningKey[] = parseJwtKeys(JSON.stringify([{ kid: 'k1', jwk: jwk() }]));

let idp: MemoryIdentity;
let store: MemorySessionStore;
let now: Date;
let standing: Map<string, { disabled: boolean; validSince: number }>;
let deps: SessionDeps;
let revoked: string[];
let warnings: unknown[][];

beforeEach(() => {
  idp = memoryIdentity();
  idp.addUser({ id: 'ann' });
  store = memorySessionStore();
  now = new Date('2026-11-21T10:00:00Z');
  standing = new Map([['ann', { disabled: false, validSince: 0 }]]);
  revoked = [];
  warnings = [];
  deps = {
    store,
    signer: jwtSessionSigner(() => KEYS),
    idp,
    standing: { standing: async (uid) => standing.get(uid) ?? null },
    limits: memoryRateLimiter(new MemoryState()),
    addresses: memoryAddressLimiter(),
    // withOwnSessions' revokeSessions: Firebase's tokens (recorded here) and every family of the account.
    revokeSessions: async (uid) => {
      revoked.push(uid);
      await store.revokeUser(uid);
    },
    log: { info: () => {}, warn: (...a: unknown[]) => void warnings.push(a), error: () => {} },
    now: () => now,
  };
});

async function failure(p: Promise<unknown>): Promise<ApiFailure> {
  const e = await p.then(() => null, (err: unknown) => err);
  expect(e).toBeInstanceOf(ApiFailure);
  return e as ApiFailure;
}

const nowS = () => Math.floor(now.getTime() / 1000);

describe('exchangeIn', () => {
  it('answers our tokens for a good provider token: the subject is the uid, mapped once, the refresh token stored only as its hash', async () => {
    const session = await exchangeIn(deps, { provider: 'firebase', token: 'token-of-ann' });
    expect(session).toMatchObject({ tokenType: 'Bearer', expiresIn: ACCESS_TTL_S, userId: 'ann', refreshExpiresAt: new Date(now.getTime() + REFRESH_TTL_MS).toISOString() });
    expect(verifyAccessToken(session.accessToken, KEYS, nowS())).toMatchObject({ sub: 'ann', auth_time: nowS() });
    expect(session.refreshToken).toMatch(/^rt1\.[A-Za-z0-9_-]{43}$/);
    expect([...store.identities.values()]).toEqual([{ userId: 'ann', provider: 'firebase', subject: 'ann', createdAt: now }]);
    expect([...store.refresh.keys()]).toEqual([deps.signer.hash(session.refreshToken)]);
    expect(JSON.stringify([...store.refresh.entries()])).not.toContain(session.refreshToken);
    // Again: the same account, a second session (family) beside the first.
    const again = await exchangeIn(deps, { provider: 'firebase', token: 'token-of-ann' });
    expect(again.userId).toBe('ann');
    expect(store.identities.size).toBe(1);
    expect(new Set([...store.refresh.values()].map((r) => r.family)).size).toBe(2);
  });

  it('is 401 for a token that is no good (and stores nothing), 503 while sessions are off here', async () => {
    expect((await failure(exchangeIn(deps, { provider: 'firebase', token: 'forged' }))).code).toBe('unauthenticated');
    expect(store.refresh.size).toBe(0);
    const off = await failure(exchangeIn({ ...deps, signer: jwtSessionSigner(() => []) }, { provider: 'firebase', token: 'token-of-ann' }));
    expect([off.code, off.status]).toEqual(['internal', 503]);
  });

  it('is 429 past its budget', async () => {
    for (let i = 0; i < 60; i++) await exchangeIn(deps, { provider: 'firebase', token: 'token-of-ann' });
    expect((await failure(exchangeIn(deps, { provider: 'firebase', token: 'token-of-ann' }))).code).toBe('rate_limited');
  });
});

describe('refreshIn', () => {
  it('rotates: the next pair in the same family, the sign-in time carried, the old token good no more', async () => {
    const first = await exchangeIn(deps, { provider: 'firebase', token: 'token-of-ann' });
    now = new Date(now.getTime() + 14 * 60_000);
    const second = await refreshIn(deps, { refreshToken: first.refreshToken });
    expect(second.refreshToken).not.toBe(first.refreshToken);
    const claims = verifyAccessToken(second.accessToken, KEYS, nowS())!;
    expect(claims).toMatchObject({ sub: 'ann', iat: nowS(), auth_time: nowS() - 14 * 60 });
    expect(claims.sid).toBe(verifyAccessToken(first.accessToken, KEYS, nowS() - 14 * 60)!.sid);
    const third = await refreshIn(deps, { refreshToken: second.refreshToken });
    expect(third.userId).toBe('ann');
  });

  it('takes a second use past the grace for theft: 401, the account signed out everywhere (once), every family gone, logged', async () => {
    const first = await exchangeIn(deps, { provider: 'firebase', token: 'token-of-ann' });
    const other = await exchangeIn(deps, { provider: 'firebase', token: 'token-of-ann' });
    const second = await refreshIn(deps, { refreshToken: first.refreshToken });
    now = new Date(now.getTime() + REFRESH_GRACE_MS + 1);
    expect((await failure(refreshIn(deps, { refreshToken: first.refreshToken }))).code).toBe('unauthenticated');
    expect(revoked).toEqual(['ann']);
    expect(warnings).toHaveLength(1);
    expect(store.refresh.size).toBe(0);
    // The thief's next token, and another device's session too: revokeSessions ends them all.
    expect((await failure(refreshIn(deps, { refreshToken: second.refreshToken }))).code).toBe('unauthenticated');
    expect((await failure(refreshIn(deps, { refreshToken: other.refreshToken }))).code).toBe('unauthenticated');
    expect(revoked).toEqual(['ann']);
  });

  it('two refreshes racing within the grace: one wins, the other is a quiet 409 that hands out nothing and revokes nothing', async () => {
    const first = await exchangeIn(deps, { provider: 'firebase', token: 'token-of-ann' });
    const answers = await Promise.allSettled([refreshIn(deps, { refreshToken: first.refreshToken }), refreshIn(deps, { refreshToken: first.refreshToken })]);
    const won = answers.filter((a) => a.status === 'fulfilled');
    const lost = answers.filter((a): a is PromiseRejectedResult => a.status === 'rejected');
    expect(won).toHaveLength(1);
    expect(lost).toHaveLength(1);
    expect(lost[0].reason).toBeInstanceOf(ApiFailure);
    expect((lost[0].reason as ApiFailure).code).toBe('conflict');
    expect(revoked).toEqual([]);
    expect(warnings).toEqual([]);
    // The winner's pair goes on.
    const winner = (won[0] as PromiseFulfilledResult<Awaited<ReturnType<typeof refreshIn>>>).value;
    await expect(refreshIn(deps, { refreshToken: winner.refreshToken })).resolves.toMatchObject({ userId: 'ann' });
  });

  it('a retry after a lost answer, within the grace: 409, nothing revoked; the client can log it out (the family goes) and exchange again', async () => {
    const first = await exchangeIn(deps, { provider: 'firebase', token: 'token-of-ann' });
    const lostAnswer = await refreshIn(deps, { refreshToken: first.refreshToken });
    now = new Date(now.getTime() + REFRESH_GRACE_MS);
    expect((await failure(refreshIn(deps, { refreshToken: first.refreshToken }))).code).toBe('conflict');
    expect((await failure(refreshIn(deps, { refreshToken: first.refreshToken }))).code).toBe('conflict');
    expect(revoked).toEqual([]);
    expect(store.refresh.size).toBe(2);
    // Holding no newer pair, the client logs the token it has out: whoever won the race loses it too.
    await logoutIn(deps, { refreshToken: first.refreshToken });
    expect((await failure(refreshIn(deps, { refreshToken: lostAnswer.refreshToken }))).code).toBe('unauthenticated');
    expect(revoked).toEqual([]);
  });

  it('a token two generations old is theft even within the grace: its successor was used already', async () => {
    const first = await exchangeIn(deps, { provider: 'firebase', token: 'token-of-ann' });
    const second = await refreshIn(deps, { refreshToken: first.refreshToken });
    await refreshIn(deps, { refreshToken: second.refreshToken });
    expect((await failure(refreshIn(deps, { refreshToken: first.refreshToken }))).code).toBe('unauthenticated');
    expect(revoked).toEqual(['ann']);
    expect(store.refresh.size).toBe(0);
  });

  it('is 401 for an expired, unknown or ill-formed token', async () => {
    const first = await exchangeIn(deps, { provider: 'firebase', token: 'token-of-ann' });
    now = new Date(now.getTime() + REFRESH_TTL_MS + 1);
    expect((await failure(refreshIn(deps, { refreshToken: first.refreshToken }))).code).toBe('unauthenticated');
    expect(store.refresh.size).toBe(0);
    expect((await failure(refreshIn(deps, { refreshToken: `rt1.${'A'.repeat(43)}` }))).code).toBe('unauthenticated');
    expect((await failure(refreshIn(deps, { refreshToken: 'nope' }))).code).toBe('unauthenticated');
  });

  it('ends the session of an account gone, disabled or signed out everywhere since the sign-in', async () => {
    for (const change of [
      () => standing.delete('ann'),
      () => standing.set('ann', { disabled: true, validSince: 0 }),
      () => standing.set('ann', { disabled: false, validSince: now.getTime() + 2000 }),
    ]) {
      standing.set('ann', { disabled: false, validSince: 0 });
      const s = await exchangeIn(deps, { provider: 'firebase', token: 'token-of-ann' });
      change();
      expect((await failure(refreshIn(deps, { refreshToken: s.refreshToken }))).code).toBe('unauthenticated');
      // Its family went with it: back in good standing, the token is still no good.
      standing.set('ann', { disabled: false, validSince: 0 });
      expect((await failure(refreshIn(deps, { refreshToken: s.refreshToken }))).code).toBe('unauthenticated');
    }
  });
});

describe('logoutIn', () => {
  it('revokes the family; an unknown token is nothing to do', async () => {
    const first = await exchangeIn(deps, { provider: 'firebase', token: 'token-of-ann' });
    const second = await refreshIn(deps, { refreshToken: first.refreshToken });
    await logoutIn(deps, { refreshToken: second.refreshToken });
    expect(store.refresh.size).toBe(0);
    expect((await failure(refreshIn(deps, { refreshToken: second.refreshToken }))).code).toBe('unauthenticated');
    await expect(logoutIn(deps, { refreshToken: second.refreshToken })).resolves.toBeUndefined();
    await expect(logoutIn(deps, { refreshToken: 'nope' })).resolves.toBeUndefined();
  });
});

describe('the per-address budget of refresh and logout', () => {
  const garbage = (i: number) => `rt1.${String(i).padStart(43, 'A')}`;

  it('refuses an address past its budget BEFORE the token is read: made-up tokens cost no store read past it', async () => {
    const reads = vi.spyOn(store, 'getRefresh');
    const { max } = ADDRESS_LIMITS.authRefresh;
    for (let i = 0; i < max; i++) expect((await failure(refreshIn(deps, { refreshToken: garbage(i), address: '203.0.113.9' }))).code).toBe('unauthenticated');
    expect(reads).toHaveBeenCalledTimes(max);
    expect((await failure(refreshIn(deps, { refreshToken: garbage(max), address: '203.0.113.9' }))).code).toBe('rate_limited');
    expect(reads).toHaveBeenCalledTimes(max);
    // Another address still has its own; the window lapses.
    const s = await exchangeIn(deps, { provider: 'firebase', token: 'token-of-ann' });
    await expect(refreshIn(deps, { refreshToken: s.refreshToken, address: '198.51.100.1' })).resolves.toMatchObject({ userId: 'ann' });
    const later = Date.now() + ADDRESS_LIMITS.authRefresh.windowMs;
    await expect(deps.addresses.spend('203.0.113.9', 'authRefresh', later)).resolves.toBeUndefined();
  });

  it('logout is charged too, before its read, on a budget of its own', async () => {
    const reads = vi.spyOn(store, 'getRefresh');
    const { max } = ADDRESS_LIMITS.authLogout;
    for (let i = 0; i < max; i++) await logoutIn(deps, { refreshToken: garbage(i), address: '203.0.113.9' });
    expect((await failure(logoutIn(deps, { refreshToken: garbage(max), address: '203.0.113.9' }))).code).toBe('rate_limited');
    expect(reads).toHaveBeenCalledTimes(max);
    // Refresh's budget at that address is untouched by logout's.
    expect((await failure(refreshIn(deps, { refreshToken: garbage(0), address: '203.0.113.9' }))).code).toBe('unauthenticated');
  });
});
