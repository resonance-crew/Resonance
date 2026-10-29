/**
 * Shared plumbing for the release screenshots: where runs and baselines live,
 * waiting for a screen to stop changing, and small process helpers.
 */
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, openSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createConnection } from 'node:net';
import { dirname, join, relative, resolve } from 'node:path';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { BASE_VARIANT, PHONE_VARIANTS, type Platform, type Variant } from './screens';

export const ROOT = resolve(__dirname, '../..');
/** Git-ignored: baselines are this machine's (fonts and antialiasing differ between machines and OS versions). */
export const VISUAL_DIR = join(ROOT, 'visual');
export const BASELINE_DIR = join(VISUAL_DIR, 'baseline');
export const RUNS_DIR = join(VISUAL_DIR, 'runs');

/** The private stack the captures run against, beside any shared emulators (see stack.ts). */
export const PORTS = {
  auth: Number(process.env.VISUAL_AUTH_PORT || 9299),
  firestore: Number(process.env.VISUAL_FIRESTORE_PORT || 8280),
  dev: Number(process.env.VISUAL_DEV_PORT || 3150),
};

export type CaptureContext = {
  /** This run's folder; a platform writes `<platform>/<device>/<shot>` under it. */
  runDir: string;
  /** The dev server the web captures load, e.g. http://localhost:3150. */
  devUrl: string;
  ports: typeof PORTS;
  /** Screen ids to capture (empty: all). */
  only: string[];
  /** Device ids to capture (empty: all of the platform's). */
  devices: string[];
  log: (line: string) => void;
};

/** Captures one platform; answers the keys of captures that never stopped changing (taken anyway). */
export type Capture = (ctx: CaptureContext) => Promise<string[]>;

/** The seeded accounts' password, read from the seed script (importing it would run it). */
export const SEED_PASSWORD = /SEED_PASSWORD = '([^']+)'/.exec(readFileSync(join(ROOT, 'scripts/seed-emulator.ts'), 'utf8'))![1];

export const variantsFor = (phone: boolean): Variant[] => (phone ? PHONE_VARIANTS : [BASE_VARIANT]);

export function shotPath(runDir: string, platform: Platform, device: string, name: string): string {
  const file = join(runDir, platform, device, name);
  mkdirSync(dirname(file), { recursive: true });
  return file;
}

export function writeJson(file: string, value: unknown) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
}

export function readJson<T>(file: string): T | null {
  return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as T) : null;
}

/** Every PNG under `dir`, as paths relative to it (`ios/iphone/home@light-zh-TW.png`). */
export function listPngs(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  const walk = (d: string) => {
    for (const name of readdirSync(d)) {
      if (name.startsWith('_') || name.startsWith('.')) continue;
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (name.endsWith('.png')) out.push(relative(dir, p));
    }
  };
  walk(dir);
  return out.sort();
}

export function git(...args: string[]): string {
  try {
    return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** How many pixels two same-sized PNGs differ by (pixelmatch's default threshold, antialiasing ignored). */
export function pixelsApart(a: Buffer, b: Buffer): number {
  const pa = PNG.sync.read(a);
  const pb = PNG.sync.read(b);
  if (pa.width !== pb.width || pa.height !== pb.height) return Infinity;
  return pixelmatch(pa.data, pb.data, null, pa.width, pa.height, { threshold: 0.1 });
}

/**
 * Takes a screenshot again and again until two in a row match: a screen still
 * loading (skeletons, a fade, a font swapping in) never makes it into a capture.
 * `tolerance` pixels may differ (a blinking caret the platform can't hide).
 * Gives back the last one, and whether it settled, once `timeoutMs` runs out.
 */
export async function settle(
  take: () => Promise<Buffer>,
  { intervalMs = 400, timeoutMs = 20_000, tolerance = 0 } = {},
): Promise<{ png: Buffer; settled: boolean }> {
  const end = Date.now() + timeoutMs;
  let last = await take();
  while (Date.now() < end) {
    await sleep(intervalMs);
    const next = await take();
    if (next.equals(last) || pixelsApart(last, next) <= tolerance) return { png: next, settled: true };
    last = next;
  }
  return { png: last, settled: false };
}

export async function waitForPort(port: number, timeoutMs: number, host = '127.0.0.1') {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const open = await new Promise<boolean>((done) => {
      const socket = createConnection({ port, host });
      socket.once('connect', () => (socket.destroy(), done(true)));
      socket.once('error', () => done(false));
    });
    if (open) return;
    await sleep(500);
  }
  throw new Error(`Nothing listened on ${host}:${port} within ${Math.round(timeoutMs / 1000)} s`);
}

/** A child in its own process group, so stopping it stops what it started (the emulators' Java, Next's workers). */
export function startGroup(command: string, args: string[], env: Record<string, string>, logFile: string): ChildProcess {
  mkdirSync(dirname(logFile), { recursive: true });
  const out = openSync(logFile, 'a');
  return spawn(command, args, { cwd: ROOT, env: { ...process.env, ...env }, detached: true, stdio: ['ignore', out, out] });
}

export function stopGroup(child: ChildProcess | undefined) {
  if (!child?.pid) return;
  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch {
    // already gone
  }
}

export function run(command: string, args: string[], env: Record<string, string> = {}): string {
  return execFileSync(command, args, { cwd: ROOT, env: { ...process.env, ...env }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}
