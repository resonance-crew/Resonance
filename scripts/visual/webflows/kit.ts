/**
 * What a web flow is given (webFlows.ts makes one per flow and width): the page in a fresh browser context, the
 * stack's addresses, a record of every request the page made — each /api/v1 call with its answer, and every request
 * to the Firestore emulator sorted into writes, reads and listens — and a way to act as another person from outside
 * the browser (`asUser`: the Auth emulator's sign-in, then /api/v1 with the ID token as a Bearer token, the two calls
 * maestro/flows/common/send-as.js makes).
 */
import type { BrowserContext, Page, Request } from 'playwright';
import { expect } from 'playwright/test';
import type { Account } from '../screens';
import type { WebDevice } from '../web';

export type ApiCall = {
  method: string;
  /** The path and query after the origin, e.g. `/api/v1/me/blocks/bob`. */
  path: string;
  status: number | null;
  /** The request's JSON body, when it had one. */
  body: unknown;
  at: number;
};

export type FirestoreRequest = {
  kind: 'write' | 'read' | 'listen';
  method: string;
  /** The URL less the host, shortened (no session ids). */
  what: string;
  /** What it named: the documents (a listen's `addTarget`, a read's or a write's) and the collections a query reads (`collection:<id>`). */
  targets: string[];
  at: number;
};

export type NetLog = {
  api: ApiCall[];
  firestore: FirestoreRequest[];
  /** Requests that failed outright or were answered ≥ 400 (the page's, not `asUser`'s). */
  failed: string[];
  /** The console's errors and uncaught exceptions. */
  consoleErrors: string[];
  pageErrors: string[];
};

const FIRESTORE_WRITE = /\/Write\/channel|:commit\b|:batchWrite\b/;
const FIRESTORE_READ = /:runQuery\b|:runAggregationQuery\b|:batchGet\b|\/documents\//;

/** What a request to the Firestore emulator is: a write, a read or a listen (pure; webFlows.test.ts). */
export function firestoreKind(method: string, url: string): FirestoreRequest['kind'] | null {
  if (/\/Listen\/channel/.test(url)) return 'listen';
  if (FIRESTORE_WRITE.test(url)) return 'write';
  if (/\/documents\//.test(url) && (method === 'PATCH' || method === 'DELETE')) return 'write';
  if (FIRESTORE_READ.test(url)) return 'read';
  return null;
}

/**
 * The documents a Listen channel's POST asks to follow, or a REST read names (its form or JSON body, URL-encoded or
 * not), and the collections a query reads (`collection:<id>`).
 */
export function listenTargets(postData: string | null): string[] {
  if (!postData) return [];
  let text = postData;
  try {
    text = decodeURIComponent(postData.replace(/\+/g, ' '));
  } catch {
    // keep the raw body
  }
  const out = new Set<string>();
  for (const m of text.matchAll(/databases\/\(default\)\/documents\/([^"\]\s,}]+)/g)) out.add(m[1]);
  for (const m of text.matchAll(/"collectionId"\s*:\s*"([^"]+)"/g)) out.add(`collection:${m[1]}`);
  return [...out];
}

/** Starts recording `page`'s requests into a fresh NetLog. */
export function recordNet(page: Page, devUrl: string, firestorePort: number): NetLog {
  const log: NetLog = { api: [], firestore: [], failed: [], consoleErrors: [], pageErrors: [] };
  const calls = new Map<Request, ApiCall>();
  const isFirestore = (url: string) => new RegExp(`^https?://(127\\.0\\.0\\.1|localhost):${firestorePort}/`).test(url);
  page.on('request', (r) => {
    const url = r.url();
    if (url.startsWith(`${devUrl}/api/v1/`)) {
      let body: unknown = null;
      try {
        body = r.postDataJSON();
      } catch {
        body = r.postData();
      }
      const call: ApiCall = { method: r.method(), path: url.slice(devUrl.length), status: null, body, at: Date.now() };
      calls.set(r, call);
      log.api.push(call);
    } else if (isFirestore(url)) {
      const kind = firestoreKind(r.method(), url);
      if (!kind) return;
      const what = url
        .replace(/^https?:\/\/[^/]+/, '')
        .replace(/[?&](RID|SID|AID|zx|t|CVER|CI|TYPE|X-HTTP-Session-Id|VER|gsessionid)=[^&]*/g, '')
        .slice(0, 200);
      log.firestore.push({ kind, method: r.method(), what, targets: listenTargets(r.postData()), at: Date.now() });
    }
  });
  page.on('response', (res) => {
    const call = calls.get(res.request());
    if (call) call.status = res.status();
    if (res.status() >= 400 && (res.url().startsWith(devUrl) || isFirestore(res.url()))) {
      log.failed.push(`${res.request().method()} ${res.url().replace(devUrl, '')} → ${res.status()}`);
    }
  });
  page.on('requestfailed', (r) => {
    const call = calls.get(r);
    if (call) call.status = 0;
    // A long-poll the page closes itself (a listen torn down, a navigation) is not a failure worth keeping.
    if (/\/Listen\/channel/.test(r.url()) && /ERR_ABORTED/.test(r.failure()?.errorText ?? '')) return;
    log.failed.push(`${r.method()} ${r.url().replace(devUrl, '')} ✕ ${r.failure()?.errorText ?? 'failed'}`);
  });
  page.on('console', (m) => {
    if (m.type() === 'error') log.consoleErrors.push(`${m.text()}${m.location().url ? ` — ${m.location().url}` : ''}`.slice(0, 500));
  });
  page.on('pageerror', (e) => log.pageErrors.push(`${e.name}: ${e.message}`.slice(0, 500)));
  return log;
}

export type Person = {
  uid: string;
  /** An /api/v1 call as this person (Bearer ID token); throws on an answer other than `expect` (default: any 2xx). */
  call: <T = unknown>(method: string, path: string, body?: unknown, expect?: number) => Promise<T>;
};

export type FlowKit = {
  page: Page;
  context: BrowserContext;
  device: WebDevice;
  /** True at the phone width. */
  phone: boolean;
  devUrl: string;
  net: NetLog;
  /** Says what the flow does next (kept in the flow's log). */
  step: (what: string) => void;
  /** Opens a page of the site in zh-TW (`/messages/bob`), waiting for its load. */
  goto: (route: string) => Promise<void>;
  /** Reloads the page, waiting for its load as long as `goto` does. */
  reload: () => Promise<void>;
  /** Signs a seeded account in, in this browser. */
  signIn: (account: Account) => Promise<void>;
  /** A seeded person acting from outside this browser (their own phone). */
  asUser: (account: Account) => Promise<Person>;
  /** Waits (60 s unless `timeout` says) until the page has made an /api/v1 call matching, answered (`status`: one of these, default any 2xx/304); answers it. */
  waitForApi: (method: string, path: RegExp, opts?: { since?: number; timeout?: number; status?: number[] }) => Promise<ApiCall>;
  /** The /api/v1 calls matching, since `since` (a time from `Date.now()`). */
  apiCalls: (method: string, path: RegExp, since?: number) => ApiCall[];
  /**
   * An assertion whose failure fails the flow but lets the journey go on (what comes after it is still worth
   * checking): the flow fails at its end with every such failure.
   */
  soft: (what: string, check: () => Promise<unknown>) => Promise<void>;
  /** How long a first look at something may take: `next dev` compiles a route on its first request. */
  slow: number;
};

/** Every flow: a name, what it proves (one line, for the README and the log), and its journey. */
export type WebFlow = {
  name: string;
  proves: string;
  /** The account the browser is signed in as before the flow begins (none: the flow signs in itself). */
  account?: Account;
  /**
   * The pages (`/messages/bob`) and API routes (`/api/v1/me/blocks/bob`) it uses, asked for once before any flow runs
   * so `next dev` has compiled them (webFlows.ts `warmUp`): one route of each pattern is enough.
   */
  warm?: string[];
  run: (kit: FlowKit) => Promise<void>;
};

export { expect };
