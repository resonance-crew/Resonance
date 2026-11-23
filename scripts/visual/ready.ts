/**
 * The apps' ready signal (VisualReady in both apps, debug builds only): each capture's launch carries a token of
 * its own (`--es visualReadyToken` / `-visualReadyToken`), and the app says it back once its screen is quiet — no
 * request on its way, at least one answered, no skeleton or picture placeholder on screen, all of it for 0.8 s.
 * Android says it in logcat (`VisualReady: ready <token>`), iOS and the Mac in the unified log (subsystem
 * `com.resonance.visual`), which the harness reads as it comes (`logStream`).
 *
 * It only shortens the waits that were fixed: Android's 4 s (8 s on an account's first launch) before the settle
 * and its 3.5 s hold after it, iOS's and the Mac's 4 s after a launch and 10 s after a sign-in launch. Everything
 * that judges the frame stays: the settle (two frames alike), Android's skeleton names in the window's hierarchy,
 * the second look against the baseline. A launch that never says it within `VISUAL_READY_TIMEOUT_S` (12) — a screen
 * that asks nothing of the API, a build from before the signal — waits out the rest of the old fixed wait and goes
 * on exactly as before. `VISUAL_READY=0` turns the signal off.
 */
import { spawn } from 'node:child_process';
import { sleep as pause } from './util';

export const READY_TIMEOUT_MS = Number(process.env.VISUAL_READY_TIMEOUT_S || 12) * 1000;
export const readyOn = () => process.env.VISUAL_READY !== '0';

export type Ready = { ready: boolean; waitedMs: number };

let count = 0;
/** A token no other launch has: the process, the time, a count. */
export function readyToken(): string {
  return `${process.pid}-${Date.now().toString(36)}-${++count}`;
}

/** Waits for `said()` to be true, at most `timeoutMs`; answers whether it came and how long it took. */
export async function waitReady(
  said: () => boolean | Promise<boolean>,
  { timeoutMs = READY_TIMEOUT_MS, intervalMs = 250, now = Date.now, sleep = pause }: { timeoutMs?: number; intervalMs?: number; now?: () => number; sleep?: (ms: number) => Promise<unknown> } = {},
): Promise<Ready> {
  const start = now();
  for (;;) {
    if (await said()) return { ready: true, waitedMs: now() - start };
    if (now() - start >= timeoutMs) return { ready: false, waitedMs: now() - start };
    await sleep(intervalMs);
  }
}

/** The rest of the old fixed wait, when the signal didn't come: never shorter than before. */
export async function restOfWait(ready: Ready, fixedMs: number, sleep: (ms: number) => Promise<unknown> = pause): Promise<void> {
  if (!ready.ready && ready.waitedMs < fixedMs) await sleep(fixedMs - ready.waitedMs);
}

/** What a capture's log line adds: how long the signal took, or that it didn't come. */
export const readyNote = (ready: Ready | null) =>
  ready == null ? '' : ready.ready ? `  (ready in ${(ready.waitedMs / 1000).toFixed(1)} s)` : '  (no ready signal: waited as before)';

/**
 * Whether `text` (logcat's `VisualReady` lines, or the unified log's compact lines) says this launch's word: a line
 * ending `ready <token>` — never another launch's token, nor one that only begins with this one.
 */
export function logSays(text: string, token: string, word = 'ready'): boolean {
  const words = `${word} ${token}`;
  return text.split('\n').some((line) => {
    const l = line.trimEnd();
    return l === words || l.endsWith(` ${words}`) || l.endsWith(`\t${words}`);
  });
}

/** The unified log's lines the apps say their word in (VisualReady.subsystem, iOS and the Mac). */
export const LOG_STREAM_ARGS = ['stream', '--style', 'compact', '--predicate', 'subsystem == "com.resonance.visual"'];

export type LogStream = { says: (token: string, word?: string) => boolean; stop: () => void };

/**
 * iOS and the Mac: the unified log read as it comes (`log stream`, or `xcrun simctl spawn <udid> log stream`), from
 * before the first launch to the last; the Mac's sandbox keeps everyone else out of the app's container, and the log
 * needs nothing of it. Started by this run, stopped by it (`stop`, by its own child), never left behind.
 */
export async function logStream(command: string, args: string[], { startMs = 5000 } = {}): Promise<LogStream> {
  const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'ignore'] });
  let text = '';
  const started = new Promise<void>((done) => {
    child.stdout!.once('data', () => done());
    child.once('exit', () => done());
    setTimeout(done, startMs).unref();
  });
  child.stdout!.on('data', (chunk: Buffer) => {
    text += chunk.toString('utf8');
    // Only the last words matter: a stream left a whole capture keeps a few lines a launch.
    if (text.length > 1_000_000) text = text.slice(-200_000);
  });
  child.on('error', () => {});
  await started;
  return {
    says: (token, word) => logSays(text, token, word),
    stop: () => {
      if (child.exitCode == null) child.kill('SIGTERM');
    },
  };
}

/**
 * An account's sign-in launch (iOS, the Mac): each variant's account signs in on a launch of its own, which the run
 * waited out a fixed 10 s — the sign-in and what the app keeps after it, nothing on screen saying when that is done.
 * Now the launch carries a token and the app says `account <token>` once the account is settled (signed in and its
 * profile read and kept, or signed out: SessionStore, debug builds only), besides its `ready <token>` once the screen
 * is quiet; with both said, the run holds `holdMs` more and goes on. Neither said within `capMs` (10 s): the full 10 s,
 * as before. Answers how it went, for the timings.
 */
export async function waitSignedIn(
  said: (word: string) => boolean,
  { capMs = 10_000, holdMs = 1000, sleep = pause, now = Date.now }: { capMs?: number; holdMs?: number; sleep?: (ms: number) => Promise<unknown>; now?: () => number } = {},
): Promise<Ready> {
  const start = now();
  const both = await waitReady(() => said('account') && said('ready'), { timeoutMs: capMs, sleep, now });
  const left = capMs - (now() - start);
  if (left > 0) await sleep(both.ready ? Math.min(holdMs, left) : left);
  return { ready: both.ready, waitedMs: now() - start };
}
