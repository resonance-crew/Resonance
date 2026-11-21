/**
 * The web's interaction flows: journeys through the running web app in a real browser (Playwright's Chromium, as the
 * web captures use: web.ts), against the private stack, the world reseeded before every flow. Each flow is one file
 * in `scripts/visual/webflows/` (its README says what each proves) and runs at the desktop and the phone width of the
 * captures (WEB_DEVICES), each in a fresh browser context.
 *
 *   npx tsx scripts/visual/webFlows.ts [--only live-message,bell] [--width desktop|phone|both] [--run <id>] [--wait] [--headed] [--no-stack]
 *
 * --no-stack: against a stack already up on PORTS (VISUAL_*_PORT; the dev server at VISUAL_DEV_URL, else localhost on
 * the dev port) — for drafting a flow; it still reseeds that stack's database before every flow, and takes no lock.
 *
 * Besides what each flow asserts, every flow fails on: a Firestore write from the page (what the web writes goes
 * through /api/v1 since the middleware decouple), a Firestore listen on anything but the viewer's `signals/{uid}`, an
 * /api/v1 answer of 5xx, and an uncaught exception in the page.
 *
 * Reports land in `visual/webflows/<run>/<flow>@<width>/`: `net.json` (every /api/v1 call and Firestore request),
 * `log.txt`, and for a failure `failure.png`, the console's errors and the failed requests (`failure.json`).
 * The last line is `Web flows <run>: N passed · M failed`; the exit code is 1 when a flow failed.
 * Holds the same locks a web capture holds (lock.ts: the stack's ports), so it never meets another run on them.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { createConnection } from 'node:net';
import { join } from 'node:path';
import { chromium, type Browser } from 'playwright';
import { LockBusy, acquire, resourcesFor } from './lock';
import { BASE_VARIANT, type Account } from './screens';
import { seed, startStack, type Stack } from './stack';
import { PORTS, SEED_PASSWORD, VISUAL_DIR, sleep } from './util';
import { WEB_DEVICES, newContext, signIn, type WebDevice } from './web';
import { recordNet, type ApiCall, type FlowKit, type NetLog, type Person, type WebFlow } from './webflows/kit';
// The folder's index by name: on a case-insensitive disk './webflows' is this very file.
import { WEB_FLOWS } from './webflows/index';

export type Width = 'desktop' | 'phone';
export type WebFlowResult = { flow: string; width: Width; passed: boolean; seconds: number; error?: string };

/** The flows a run takes, in the registry's order; `only` narrows them, and a name no flow has is refused. */
export function webFlowsToRun(only: string[], flows: readonly Pick<WebFlow, 'name'>[] = WEB_FLOWS): string[] {
  const names = flows.map((f) => f.name);
  const unknown = only.filter((o) => !names.includes(o));
  if (unknown.length) throw new Error(`No such web flow: ${unknown.join(', ')} (have ${names.join(', ')})`);
  return only.length ? names.filter((n) => only.includes(n)) : names;
}

/** `--width`: the captures' desktop and phone sizes (web.ts), one or both — desktop first. */
export function widthsFor(arg: string | undefined): WebDevice[] {
  const pick = arg ?? 'both';
  const ids: Width[] = pick === 'both' ? ['desktop', 'phone'] : pick === 'desktop' || pick === 'phone' ? [pick] : [];
  if (!ids.length) throw new Error(`--width takes desktop, phone or both, not "${pick}"`);
  return ids.map((id) => WEB_DEVICES.find((d) => d.id === id)!);
}

/** What fails a flow whatever it asserted (see the top comment); empty when nothing did. */
export function netFaults(net: Pick<NetLog, 'api' | 'firestore' | 'pageErrors'>, uid: string | null): string[] {
  const out: string[] = [];
  for (const w of net.firestore.filter((f) => f.kind === 'write')) out.push(`a Firestore write from the page: ${w.method} ${w.what}${w.targets.length ? ` (${w.targets.join(', ')})` : ''}`);
  for (const l of net.firestore.filter((f) => f.kind === 'listen')) {
    const other = l.targets.filter((t) => !(uid && t === `signals/${uid}`));
    if (other.length) out.push(`a Firestore listen on ${other.join(', ')} (only signals/${uid ?? '{uid}'} is listened to)`);
  }
  for (const c of net.api.filter((a) => a.status != null && a.status >= 500)) out.push(`${c.method} ${c.path} answered ${c.status}`);
  for (const e of net.pageErrors) out.push(`uncaught in the page: ${e}`);
  return out;
}

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
}

async function tokenFor(account: Account): Promise<{ uid: string; idToken: string }> {
  const res = await fetch(`http://localhost:${PORTS.auth}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=emulator`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: `${account}@resonance.test`, password: SEED_PASSWORD, returnSecureToken: true }),
  });
  if (res.status !== 200) throw new Error(`Auth emulator sign-in as ${account}: ${res.status} ${await res.text()}`);
  const body = (await res.json()) as { localId: string; idToken: string };
  return { uid: body.localId, idToken: body.idToken };
}

async function personFor(devUrl: string, account: Account): Promise<Person> {
  const { uid, idToken } = await tokenFor(account);
  return {
    uid,
    call: async <T,>(method: string, path: string, body?: unknown, want?: number) => {
      const res = await fetch(`${devUrl}${path}`, {
        method,
        headers: { Authorization: `Bearer ${idToken}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const text = await res.text();
      const ok = want != null ? res.status === want : res.status >= 200 && res.status < 300;
      if (!ok) throw new Error(`${method} ${path} as ${account}: ${res.status} ${text.slice(0, 300)}`);
      return (text ? JSON.parse(text) : null) as T;
    },
  };
}

const matching = (calls: ApiCall[], method: string, path: RegExp, since = 0) =>
  calls.filter((c) => c.method === method && path.test(c.path) && c.at >= since);

/** Runs one flow at one width in a fresh context; never throws (the result says how it went). */
async function runOne(browser: Browser, flow: WebFlow, device: WebDevice, devUrl: string, outDir: string, say: (line: string) => void): Promise<WebFlowResult> {
  const width = device.id as Width;
  const dir = join(outDir, `${flow.name}@${width}`);
  mkdirSync(dir, { recursive: true });
  const lines: string[] = [];
  const note = (line: string) => lines.push(`${new Date().toISOString().slice(11, 23)}  ${line}`);
  const started = Date.now();
  const context = await newContext(browser, device, BASE_VARIANT);
  const page = await context.newPage();
  const net = recordNet(page, devUrl, PORTS.firestore);
  let uid: string | null = null;
  let error: string | undefined;
  const softFaults: string[] = [];
  const kit: FlowKit = {
    page,
    context,
    device,
    phone: device.phone,
    devUrl,
    net,
    slow: 60_000,
    step: (what) => note(what),
    goto: async (route) => {
      note(`open ${route}`);
      const url = `${devUrl}/zh-TW${route === '/' ? '' : route}`;
      try {
        await page.goto(url, { waitUntil: 'load', timeout: 120_000 });
      } catch (e) {
        // A machine busy with other builds now and then keeps `next dev` past two minutes on a page: once more.
        if (!/Timeout/.test(String(e))) throw e;
        note(`  ${route} took over 2 min to load: asking again`);
        await page.goto(url, { waitUntil: 'load', timeout: 120_000 });
      }
    },
    reload: async () => {
      note('reload');
      await page.reload({ waitUntil: 'load', timeout: 120_000 });
    },
    signIn: async (account) => {
      note(`sign in as ${account}`);
      await signIn(page, { devUrl, log: note }, BASE_VARIANT, account);
      uid = account;
    },
    asUser: (account) => personFor(devUrl, account),
    soft: async (what, check) => {
      try {
        await check();
      } catch (e) {
        const said = `${what}: ${(e instanceof Error ? e.message : String(e)).split('\n').slice(0, 4).join(' ')}`;
        note(`FAULT (going on): ${said}`);
        softFaults.push(said);
        await page.screenshot({ path: join(dir, `fault-${softFaults.length}.png`) }).catch(() => {});
      }
    },
    apiCalls: (method, path, since) => matching(net.api, method, path, since),
    waitForApi: async (method, path, { since = 0, timeout = 60_000, status } = {}) => {
      const end = Date.now() + timeout;
      const good = (c: ApiCall) => c.status != null && (status ? status.includes(c.status) : (c.status >= 200 && c.status < 300) || c.status === 304);
      for (;;) {
        const hit = matching(net.api, method, path, since).find(good);
        if (hit) return hit;
        if (Date.now() > end) {
          const seen = matching(net.api, method, path, since).map((c) => `${c.path} → ${c.status ?? 'pending'}`);
          throw new Error(`No ${method} ${path} answered${status ? ` ${status.join('/')}` : ''} within ${Math.round(timeout / 1000)} s${seen.length ? ` (saw ${seen.join(', ')})` : ''}`);
        }
        await sleep(100);
      }
    },
  };
  try {
    if (flow.account) await kit.signIn(flow.account);
    await flow.run(kit);
    // What was still on its way when the flow ended (a write it just made) counts too.
    await page.waitForTimeout(500);
    const faults = [...softFaults, ...netFaults(net, uid)];
    if (faults.length) throw new Error(faults.join('\n'));
  } catch (e) {
    error = e instanceof Error ? (e.stack ?? e.message) : String(e);
    note(`FAILED: ${error}`);
    await page.screenshot({ path: join(dir, 'failure.png'), fullPage: false }).catch(() => {});
    writeFileSync(
      join(dir, 'failure.json'),
      JSON.stringify({ error, url: page.url(), consoleErrors: net.consoleErrors, pageErrors: net.pageErrors, failedRequests: net.failed }, null, 2) + '\n',
    );
  } finally {
    writeFileSync(join(dir, 'net.json'), JSON.stringify({ api: net.api, firestore: net.firestore }, null, 2) + '\n');
    writeFileSync(join(dir, 'log.txt'), lines.join('\n') + '\n');
    await context.close().catch(() => {});
  }
  const seconds = Math.round((Date.now() - started) / 1000);
  const first = error?.split('\n')[0];
  say(`  ${error ? 'FAIL' : 'pass'}  ${flow.name} @ ${width}  (${seconds} s)${error ? `  — ${first}\n        see ${dir}` : ''}`);
  return { flow: flow.name, width, passed: !error, seconds, error };
}

/**
 * Asks once for every page and API route the flows will use (each flow's `warm`), before any runs: `next dev`
 * compiles a route on its first request, which on a busy machine takes half a minute — inside a flow, past what it
 * waits for. An API route compiles on any request, so an unauthenticated one (answered 401) is enough.
 */
export async function warmUp(devUrl: string, paths: string[], log: (line: string) => void = () => {}) {
  const unique = [...new Set(paths)];
  if (!unique.length) return;
  log(`  compiling the ${unique.length} routes the flows use…`);
  for (const path of unique) {
    const url = path.startsWith('/api/') ? `${devUrl}${path}` : `${devUrl}/zh-TW${path === '/' ? '' : path}`;
    await fetch(url, { signal: AbortSignal.timeout(180_000) }).catch(() => {});
  }
}

/** Runs the chosen flows at the chosen widths against a stack that is up, reseeding before each. */
export async function runWebFlows(
  devUrl: string,
  outDir: string,
  { only = [], widths = widthsFor('both'), headed = false, log = console.log }: { only?: string[]; widths?: WebDevice[]; headed?: boolean; log?: (line: string) => void } = {},
): Promise<WebFlowResult[]> {
  const names = webFlowsToRun(only);
  await warmUp(devUrl, names.flatMap((n) => WEB_FLOWS.find((f) => f.name === n)!.warm ?? []), log);
  const browser = await chromium.launch({ headless: !headed });
  const results: WebFlowResult[] = [];
  try {
    for (const name of names) {
      const flow = WEB_FLOWS.find((f) => f.name === name)!;
      for (const device of widths) {
        await seed(() => {});
        results.push(await runOne(browser, flow, device, devUrl, outDir, log));
      }
    }
  } finally {
    await browser.close();
  }
  return results;
}

async function portsFree(ports: number[], timeoutMs: number) {
  const end = Date.now() + timeoutMs;
  const open = (port: number) =>
    new Promise<boolean>((done) => {
      const socket = createConnection({ port, host: '127.0.0.1' });
      socket.once('connect', () => (socket.destroy(), done(true)));
      socket.once('error', () => done(false));
    });
  while (Date.now() < end) {
    if (!(await Promise.all(ports.map(open))).some(Boolean)) return;
    await sleep(500);
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    console.log('Usage: npx tsx scripts/visual/webFlows.ts [--only live-message,bell] [--width desktop|phone|both] [--run <id>] [--wait] [--headed] [--no-stack]');
    return;
  }
  const only = (flag(args, 'only') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  // Refused before anything starts: a typo would otherwise start a stack to run nothing.
  webFlowsToRun(only);
  const widths = widthsFor(flag(args, 'width'));
  const id = flag(args, 'run') ?? new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-');
  const runDir = join(VISUAL_DIR, 'webflows', id);
  mkdirSync(join(runDir, '_logs'), { recursive: true });
  const log = (line: string) => console.log(line);
  const noStack = args.includes('--no-stack');
  let lock;
  try {
    lock = await acquire(resourcesFor(['web'], noStack ? null : PORTS), { wait: args.includes('--wait'), log });
  } catch (error) {
    if (!(error instanceof LockBusy)) throw error;
    console.error(error.message);
    process.exitCode = 1;
    return;
  }
  let stack: Stack | undefined;
  let failed = 0;
  let total = 0;
  try {
    stack = noStack
      ? { devUrl: process.env.VISUAL_DEV_URL || `http://localhost:${PORTS.dev}`, stop: () => {} }
      : await startStack(join(runDir, '_logs'), log);
    log(`Web flows ${id}: ${webFlowsToRun(only).join(', ')} at ${widths.map((w) => w.id).join(' and ')}`);
    const results = await runWebFlows(stack.devUrl, runDir, { only, widths, headed: args.includes('--headed'), log });
    total = results.length;
    failed = results.filter((r) => !r.passed).length;
    writeFileSync(join(runDir, 'summary.json'), JSON.stringify({ id, results }, null, 2) + '\n');
  } finally {
    if (stack) {
      stack.stop();
      if (!noStack) await portsFree([PORTS.auth, PORTS.firestore, PORTS.dev], 30_000);
    }
    lock.release();
  }
  log(`\nReports: ${runDir}`);
  log(`Web flows ${id}: ${total - failed} passed · ${failed} failed`);
  if (failed || !total) process.exitCode = 1;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
