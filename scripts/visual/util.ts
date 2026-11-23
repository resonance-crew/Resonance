/**
 * Shared plumbing for the release screenshots: where runs and baselines live,
 * waiting for a screen to stop changing, and small process helpers.
 */
import { execFile, execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, openSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createConnection } from 'node:net';
import { dirname, join, relative, resolve } from 'node:path';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import type { Platform } from './screens';
import type { VariantSet } from './variants';

export const ROOT = resolve(__dirname, '../..');
/** Git-ignored: baselines are this machine's (fonts and antialiasing differ between machines and OS versions). */
export const VISUAL_DIR = join(ROOT, 'visual');
/** main's baseline. Which one a checkout compares with and accepts into is baselines.ts's (`baselineDir`). */
export const BASELINE_DIR = join(VISUAL_DIR, 'baseline');
export const RUNS_DIR = join(VISUAL_DIR, 'runs');
/**
 * Inside a run: the captures only looked at, never compared (the landing film's pinned stills — `film` in
 * screens.ts). The leading `_` keeps them out of `listPngs`, so neither the comparison nor `accept` sees them.
 */
export const GLANCE_DIR = '_glance';

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
  /** Keys of captures whose first look was too early, kept from a later look (secondLook.ts); the capturers add to it. */
  retaken: string[];
  /** Which variants and device states the run takes (variants.ts; `--variants`, default release). */
  set?: VariantSet;
};

/** Captures one platform; answers the keys of captures that never stopped changing (taken anyway). */
export type Capture = (ctx: CaptureContext) => Promise<string[]>;

/** The seeded accounts' password, read from the seed script (importing it would run it). */
export const SEED_PASSWORD = /SEED_PASSWORD = '([^']+)'/.exec(readFileSync(join(ROOT, 'scripts/seed-emulator.ts'), 'utf8'))![1];

export function shotPath(runDir: string, platform: Platform, device: string, name: string): string {
  const file = join(runDir, platform, device, name);
  mkdirSync(dirname(file), { recursive: true });
  return file;
}

/** A capture's regions the comparison skips (`<capture>.ignore.json`: `Rect[]`, capture pixels), when it has any. */
export type Rect = { x: number; y: number; width: number; height: number };
export const ignorePath = (png: string) => png.replace(/\.png$/, '.ignore.json');

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
    // git's own complaint (a commit this checkout lacks) stays off the run's console: '' says it.
    return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
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
 * `tolerance` pixels may differ (a blinking caret the platform can't hide), or
 * `same` says what matches (Android's: apart only by a caret's blink).
 * Gives back the last one, and whether it settled, once `timeoutMs` runs out.
 */
export async function settle(
  take: () => Promise<Buffer>,
  {
    intervalMs = 400,
    timeoutMs = 20_000,
    tolerance = 0,
    same,
  }: { intervalMs?: number; timeoutMs?: number; tolerance?: number; same?: (a: Buffer, b: Buffer) => boolean | Promise<boolean> } = {},
): Promise<{ png: Buffer; settled: boolean }> {
  const match = same ?? ((a: Buffer, b: Buffer) => a.equals(b) || pixelsApart(a, b) <= tolerance);
  const end = Date.now() + timeoutMs;
  let last = await take();
  while (Date.now() < end) {
    await sleep(intervalMs);
    const next = await take();
    if (await match(last, next)) return { png: next, settled: true };
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

/**
 * Waits, at most `timeoutMs`, until nothing listens on any of `ports`: the last stack on them going down (its stop sends
 * SIGTERM and goes on; the Firestore emulator's JVM takes a moment to let its ports go). The run's port locks keep
 * every other run off them, so what still listens is that stack. Answers whether they came free.
 */
export async function portsFree(ports: number[], timeoutMs: number, wait = sleep): Promise<boolean> {
  const end = Date.now() + timeoutMs;
  const open = (port: number) =>
    new Promise<boolean>((done) => {
      const socket = createConnection({ port, host: '127.0.0.1' });
      socket.once('connect', () => (socket.destroy(), done(true)));
      socket.once('error', () => done(false));
    });
  for (;;) {
    if (!(await Promise.all(ports.map(open))).some(Boolean)) return true;
    if (Date.now() >= end) return false;
    await wait(500);
  }
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

/**
 * How long a blocking command may take before it is stopped (`VISUAL_CMD_TIMEOUT_S`, default 10 min). A command that
 * never answers held a run for hours (2026-11-22: `simctl bootstatus` 2 h 16 min, every lock with it), and a blocking
 * one stops the lock's heartbeat too (lock.ts), so none waits for ever.
 */
export const CMD_TIMEOUT_MS = Number(process.env.VISUAL_CMD_TIMEOUT_S || 600) * 1000;

/** A command that gave no answer within its time: stopped, and said as such (a device to restart, a retry). */
export class CommandTimeout extends Error {
  constructor(readonly command: string, readonly timeoutMs: number) {
    super(`${command} gave no answer within ${Math.round(timeoutMs / 1000)} s and was stopped`);
  }
}

const timedOut = (error: unknown) => {
  const e = error as { killed?: boolean; signal?: string; code?: string };
  return e?.code === 'ETIMEDOUT' || (e?.killed === true && e?.signal === 'SIGKILL');
};

export function run(command: string, args: string[], env: Record<string, string> = {}, timeoutMs = CMD_TIMEOUT_MS): string {
  try {
    return execFileSync(command, args, { cwd: ROOT, env: { ...process.env, ...env }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: timeoutMs, killSignal: 'SIGKILL' });
  } catch (error) {
    if (timedOut(error)) throw new CommandTimeout(`${command} ${args.slice(0, 3).join(' ')}`.trim(), timeoutMs);
    throw error;
  }
}

/**
 * `execFile` without blocking, stopped (SIGKILL) once `timeoutMs` passes and then rejected with [CommandTimeout]:
 * for the device commands that can hang (simctl bootstatus, adb).
 */
export function execTimed(
  command: string,
  args: string[],
  { timeoutMs, cwd = ROOT, buffer = false, maxBuffer = 64 << 20 }: { timeoutMs: number; cwd?: string; buffer?: boolean; maxBuffer?: number },
): Promise<{ stdout: string | Buffer }> {
  return new Promise((resolve, reject) => {
    execFile(command, args, { cwd, timeout: timeoutMs, killSignal: 'SIGKILL', maxBuffer, encoding: buffer ? 'buffer' : 'utf8' }, (error, stdout) => {
      if (!error) return resolve({ stdout });
      reject(timedOut(error) ? new CommandTimeout(`${command} ${args.slice(0, 3).join(' ')}`.trim(), timeoutMs) : error);
    });
  });
}
