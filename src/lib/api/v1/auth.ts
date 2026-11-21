import { NextResponse } from 'next/server';
import { exchangeIn, logoutIn, refreshIn, type SessionDeps } from '@/server/app/auth';
import { serverCtx } from '@/server/ctx';
import { sessionDeps } from '@/server/infra/session/deps';
import { jsonBody, parse, withoutUser } from './http';
import { AuthExchangeRequest, AuthRefreshRequest } from './schemas';

/**
 * The /api/v1/auth routes (Phase 3, ADR 0004), each over the services of
 * src/server/app/auth.ts. `deps` defaults to this deployment's (Firestore,
 * RESONANCE_JWT_KEYS, Firebase Auth); a test hands its own.
 */
const production = (): SessionDeps => sessionDeps(serverCtx());

/** POST /api/v1/auth/exchange — a Firebase ID token traded for Resonance's tokens. */
export const exchangeRoute = (deps: () => SessionDeps = production) =>
  withoutUser(async (req) => {
    const input = parse(AuthExchangeRequest, await jsonBody(req));
    return NextResponse.json(await exchangeIn(deps(), { provider: input.provider ?? 'firebase', token: input.token }));
  });

/** POST /api/v1/auth/refresh — a refresh token traded, once, for the next pair. */
export const refreshRoute = (deps: () => SessionDeps = production) =>
  withoutUser(async (req) => {
    const input = parse(AuthRefreshRequest, await jsonBody(req));
    return NextResponse.json(await refreshIn(deps(), input));
  });

/** POST /api/v1/auth/logout — the refresh token's session revoked. */
export const logoutRoute = (deps: () => SessionDeps = production) =>
  withoutUser(async (req) => {
    const input = parse(AuthRefreshRequest, await jsonBody(req));
    await logoutIn(deps(), input);
    return new Response(null, { status: 204 });
  });
