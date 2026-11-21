import { NextResponse, after } from 'next/server';
import type { z } from 'zod';
import { getCurrentUser } from '@/lib/auth';
import type { AuthUser } from '@/lib/auth/types';
import { noteAppCheck, routePattern } from '@/lib/appCheck/server';
import { crossOriginCookieWrite } from '@/lib/api/sameOrigin';
import type { ApiErrorBody } from './schemas';

type Code = ApiErrorBody['error']['code'];

const STATUS: Record<Code, number> = {
  unauthenticated: 401,
  invalid_request: 400,
  forbidden: 403,
  blocked: 403,
  not_found: 404,
  conflict: 409,
  rate_limited: 429,
  internal: 500,
};

/**
 * A failure a v1 handler can throw; rendered as the ApiError body. `status`
 * answers another HTTP status than its code's (a translation: 413 for a
 * story too long, 503 when the model failed) — ErrorCode is an enum the
 * apps decode, closed within v1, so a new status never needs a new code.
 */
export class ApiFailure extends Error {
  constructor(
    readonly code: Code,
    message: string,
    readonly issues?: { path: string; message: string }[],
    readonly status?: number,
  ) {
    super(message);
  }
}

/** A failure is never kept: the next ask may well succeed (see ./cache). */
export function apiError(code: Code, message: string, issues?: { path: string; message: string }[], status?: number) {
  const body: ApiErrorBody = { error: { code, message, ...(issues ? { issues } : {}) } };
  return NextResponse.json(body, { status: status ?? STATUS[code], headers: { 'Cache-Control': 'no-store' } });
}

export function parse<T extends z.ZodType>(schema: T, value: unknown): z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new ApiFailure(
      'invalid_request',
      'The request does not match the contract.',
      result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    );
  }
  return result.data;
}

/**
 * Requests served by this copy of the module: the first one paid for its
 * cold start. (Each route bundle may hold its own copy — `next dev` does — so
 * it is "the first request this route served on this instance".)
 */
let served = 0;

/**
 * Where an answer's time went, for measuring from the outside (region,
 * transport, cold starts): `auth` (verifying the caller), `app` (the
 * handler: mostly Firestore round trips) and `cold` on the first request
 * (see `served`). Durations only — nothing the caller couldn't time itself.
 */
function timed(res: Response, auth: number, app: number | null, cold: boolean): Response {
  const parts = [`auth;dur=${auth.toFixed(1)}`, ...(app === null ? [] : [`app;dur=${app.toFixed(1)}`]), ...(cold ? ['cold'] : [])];
  try {
    res.headers.append('Server-Timing', parts.join(', '));
  } catch {
    // A response with immutable headers just goes without.
  }
  return res;
}

/**
 * Wrap a v1 handler: require a user (session cookie or `Authorization:
 * Bearer <Firebase ID token>`), map ApiFailure to its status, and never leak
 * internals on unexpected errors. Reads (GET) accept this instance's recent
 * answer on whether the session was revoked; every write asks Firebase Auth
 * (see "Revocation" in lib/auth/firebase/server). When Firebase Auth can't
 * be asked the answer is 500, not 401: the app must not sign its user out.
 * Every answer says where its time went (`Server-Timing`, see timed()).
 * A quiet write that reaches no one (counting a card's read) may take a
 * read's cached answer instead (`opts.revocation`).
 */
export function withUser<A extends unknown[]>(
  handler: (user: AuthUser, req: Request, ...rest: A) => Promise<Response>,
  opts: { revocation?: 'cached' } = {},
) {
  return async (req: Request, ...rest: A): Promise<Response> => {
    const cold = served++ === 0;
    const start = performance.now();
    watchAppCheck(req);
    // A write with the session cookie from another origin (a same-site subdomain too): never the caller's own page.
    if (crossOriginCookieWrite(req)) return timed(apiError('forbidden', 'This request did not come from the site.'), 0, null, cold);
    const read = req.method === 'GET' || req.method === 'HEAD';
    let user: AuthUser | null;
    try {
      user = await getCurrentUser({ revocation: read || opts.revocation === 'cached' ? 'cached' : 'live' });
    } catch (e) {
      console.error('[api/v1] auth', e);
      return timed(apiError('internal', 'Something went wrong.'), performance.now() - start, null, cold);
    }
    const authed = performance.now();
    if (!user) return timed(apiError('unauthenticated', 'Sign in, or send a Firebase ID token as a Bearer token.'), authed - start, null, cold);
    let res: Response;
    try {
      res = await handler(user, req, ...rest);
    } catch (e) {
      if (e instanceof ApiFailure) res = apiError(e.code, e.message, e.issues, e.status);
      else {
        console.error('[api/v1]', e);
        res = apiError('internal', 'Something went wrong.');
      }
    }
    return timed(res, authed - start, performance.now() - authed, cold);
  };
}

/**
 * Wrap a v1 handler that signs no one in itself — the session routes
 * (/auth/exchange, /refresh, /logout), whose credential is in the body:
 * ApiFailure to its status, never internals on an unexpected error, an
 * identity-service outage a 500 (never a 401: the app must not sign out),
 * and nothing kept by any cache.
 */
export function withoutUser<A extends unknown[]>(handler: (req: Request, ...rest: A) => Promise<Response>) {
  return async (req: Request, ...rest: A): Promise<Response> => {
    watchAppCheck(req);
    let res: Response;
    try {
      res = await handler(req, ...rest);
    } catch (e) {
      if (e instanceof ApiFailure) return apiError(e.code, e.message, e.issues, e.status);
      console.error('[api/v1]', e);
      return apiError('internal', 'Something went wrong.');
    }
    try {
      res.headers.set('Cache-Control', 'no-store');
    } catch {
      // Immutable headers: the answer goes as it is.
    }
    return res;
  };
}

/** A request's JSON body, or the 400 when it has none. */
export async function jsonBody(req: Request): Promise<unknown> {
  return req.json().catch(() => {
    throw new ApiFailure('invalid_request', 'The body must be JSON.');
  });
}

/**
 * App Check is watched, not enforced: what each request's token says is
 * logged after the response (lib/appCheck/server), costing the caller nothing.
 */
function watchAppCheck(req: Request): void {
  try {
    after(() => noteAppCheck(req, routePattern(new URL(req.url).pathname)));
  } catch {
    // Outside a request (a handler called from a test): nothing to watch.
  }
}

/** Next.js passes a dynamic route's params as a promise. */
export interface RouteContext<K extends string> {
  params: Promise<Record<K, string>>;
}

/** A dynamic route segment, percent-decoded (a pen name may be written in any script). */
export async function routeParam<K extends string>(ctx: RouteContext<K>, name: K): Promise<string> {
  const raw = (await ctx.params)[name] ?? '';
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}
