// The Admin SDK half of App Check (minting, verifying) moved to
// src/server/infra/appcheck/appCheck.ts; its exports stay here as facades.
// What is left is no SDK's: Cloudflare's siteverify, the exchange's brake,
// and the monitoring tally.
import { checkAppCheck } from '@/server/infra/appcheck/appCheck';
import type { AttestationVerdict } from '@/server/ports/attestation';
import { TURNSTILE_ACTION } from './config';

export { checkAppCheck, mintWebToken, platformOf } from '@/server/infra/appcheck/appCheck';

const SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
/** Cloudflare usually answers in well under a second. */
const SITEVERIFY_TIMEOUT_MS = 5000;

export type TurnstileVerdict =
  | { ok: true }
  | { ok: false; reason: 'unconfigured' | 'unavailable' | 'rejected' | 'wrong-host' | 'wrong-action'; codes?: string[] };

/**
 * Ask Cloudflare whether a Turnstile token is good: solved for our site key
 * (the secret says which), on our own host, for the App Check action, and not
 * used before (siteverify refuses a token's second use). `TURNSTILE_SECRET_KEY`
 * is set in Vercel only.
 */
export async function verifyTurnstile(
  token: string,
  opts: { host: string; remoteIp?: string | null; fetch?: typeof fetch; secret?: string },
): Promise<TurnstileVerdict> {
  const secret = opts.secret ?? process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return { ok: false, reason: 'unconfigured' };
  const body = new URLSearchParams({ secret, response: token });
  if (opts.remoteIp) body.set('remoteip', opts.remoteIp);
  let answer: { success?: boolean; hostname?: string; action?: string; 'error-codes'?: string[] };
  try {
    const res = await (opts.fetch ?? fetch)(SITEVERIFY, { method: 'POST', body, signal: AbortSignal.timeout(SITEVERIFY_TIMEOUT_MS) });
    if (!res.ok) return { ok: false, reason: 'unavailable' };
    answer = await res.json();
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
  if (answer.success !== true) return { ok: false, reason: 'rejected', codes: answer['error-codes'] };
  if (answer.hostname !== opts.host) return { ok: false, reason: 'wrong-host' };
  if (answer.action !== TURNSTILE_ACTION) return { ok: false, reason: 'wrong-action' };
  return { ok: true };
}

// --- the exchange's budget ----------------------------------------------------
//
// A browser needs one exchange per APP_CHECK_TTL_MS, and every exchange
// spends a Turnstile token, which only a real page can get. This only keeps
// one address from making an instance mint without end (per instance, so it
// is a brake, not an exact count).

const EXCHANGE_WINDOW_MS = 10 * 60 * 1000;
const EXCHANGES_PER_WINDOW = 10;
const exchanges = new Map<string, { since: number; count: number }>();

/** Spend one of `address`'s exchanges in this window; false when none are left. */
export function spendExchange(address: string, now = Date.now()): boolean {
  if (exchanges.size > 10_000) {
    for (const [key, entry] of exchanges) if (now - entry.since >= EXCHANGE_WINDOW_MS) exchanges.delete(key);
  }
  const entry = exchanges.get(address);
  if (!entry || now - entry.since >= EXCHANGE_WINDOW_MS) {
    exchanges.set(address, { since: now, count: 1 });
    return true;
  }
  if (entry.count >= EXCHANGES_PER_WINDOW) return false;
  entry.count++;
  return true;
}

/** Forget every address's exchanges (tests). */
export function resetExchanges(): void {
  exchanges.clear();
}

// --- monitoring ---------------------------------------------------------------
//
// Nothing is refused yet: each API request's token is checked after the
// response, and what was seen is logged — sparingly, one line per kind per
// window per instance, with how many it stands for. Vercel → Logs,
// `[appcheck]`: once `missing` and `invalid` are only old app builds and
// scripts, the console's enforcement can go on.

/** One line per (verdict, platform, route) per this long, per instance. */
const LOG_WINDOW_MS = 10 * 60 * 1000;
const seen = new Map<string, { since: number; count: number }>();

export type AppCheckVerdict = AttestationVerdict;

/** v1 path segments that name a route, not a card, person or id. */
const ROUTE_WORDS = new Set([
  'api', 'v1', 'me', 'feed', 'recommended', 'cards', 'cardbox', 'users', 'handles', 'notes', 'messages', 'devices',
  'invites', 'accept', 'publish', 'edits', 'apply', 'resonances', 'related', 'links', 'report', 'reports', 'openapi.json',
]);

/** A request path as its route's pattern: `/api/v1/cards/some-slug/related` → `/api/v1/cards/:/related`. */
export function routePattern(pathname: string): string {
  return pathname
    .split('/')
    .map((segment, i) => (i === 0 || ROUTE_WORDS.has(segment) ? segment : ':'))
    .join('/');
}

/** Count one request's verdict; answers the log line when this kind's window is up (else null). */
export function tally(verdict: AppCheckVerdict, platform: string, route: string, now = Date.now()): string | null {
  const key = `${verdict} ${platform} ${route}`;
  const entry = seen.get(key);
  if (!entry) {
    seen.set(key, { since: now, count: 0 });
    return `[appcheck] ${key} ×1`;
  }
  entry.count++;
  if (now - entry.since < LOG_WINDOW_MS) return null;
  seen.set(key, { since: now, count: 0 });
  return `[appcheck] ${key} ×${entry.count}`;
}

/** Forget the tally (tests). */
export function resetTally(): void {
  seen.clear();
}

/**
 * Log what App Check says of an API request — meant for after() the
 * response, so it costs the caller nothing. `route` is the route's pattern
 * (never a path with a pen name or card id in it).
 */
export async function noteAppCheck(req: Request, route: string): Promise<void> {
  try {
    const { verdict, platform } = await checkAppCheck(req);
    const line = tally(verdict, platform, route);
    if (line) console.info(line);
  } catch (e) {
    console.error('[appcheck] check failed', e);
  }
}
