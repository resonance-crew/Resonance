/**
 * One run at a time on what two runs can't share. A capture (or the flows) boots the harness's own
 * AVDs and simulators, shuts down the ones it booted, reseeds its stack's database and serves a dev
 * server on fixed ports: a second run beside it finds the first one's devices up (so leaves them
 * running, while the first shuts them down under it) and empties the database under it. So each run
 * holds a lock on what it uses — `android`, `ios`, `mac` for the devices, `port-<n>` for each of the
 * stack's ports — and a run that finds one held refuses, saying who holds it, or with `--wait`
 * queues behind it.
 *
 * The locks are files in one folder for the whole machine (`VISUAL_LOCK_DIR`, else the temp dir):
 * the devices belong to the Mac, not to a checkout, and every worktree's run must see every other's.
 * A lock is made with `wx` (only one maker can win), names its holder's pid, and is taken over when
 * that process is gone (a run killed outright leaves its files behind).
 */
import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Platform } from './screens';

export const LOCK_DIR = process.env.VISUAL_LOCK_DIR || join(tmpdir(), 'resonance-visual-locks');

export type LockHolder = { pid: number; startedAt: string; cwd: string; command: string };

/** What a run uses: the device platforms it captures, and its stack's ports unless it runs on someone else's. */
export function resourcesFor(platforms: readonly Platform[], ports: { auth: number; firestore: number; dev: number } | null): string[] {
  const devices = platforms.filter((p) => p !== 'web');
  const stack = ports ? [ports.auth, ports.firestore, ports.dev].map((p) => `port-${p}`) : [];
  return [...new Set([...devices, ...stack])].sort();
}

export type LockDeps = {
  dir?: string;
  pid?: number;
  /** Whether a process still runs (a lock whose holder is gone is taken over). */
  alive?: (pid: number) => boolean;
  now?: () => Date;
  sleep?: (ms: number) => Promise<void>;
  log?: (line: string) => void;
  cwd?: string;
  command?: string;
};

const processAlive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM: it runs, as someone else.
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
};

export class LockBusy extends Error {
  constructor(readonly resource: string, readonly holder: LockHolder, message: string) {
    super(message);
  }
}

const fileOf = (dir: string, resource: string) => join(dir, `${resource}.lock`);

function readHolder(file: string): LockHolder | null {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as LockHolder;
  } catch {
    return null;
  }
}

function ago(from: string, now: Date): string {
  const minutes = Math.max(0, Math.round((now.getTime() - new Date(from).getTime()) / 60_000));
  return minutes < 1 ? 'under a minute' : minutes === 1 ? '1 min' : `${minutes} min`;
}

/** The refusal: who holds what, since when, and what to do instead. */
export function busyMessage(resource: string, holder: LockHolder, now: Date): string {
  const what = resource.startsWith('port-') ? `port ${resource.slice(5)} (a visual stack)` : `the ${resource} devices`;
  return [
    `Visual: ${what} in use by another run — pid ${holder.pid}, \`${holder.command}\` in ${holder.cwd}, since ${holder.startedAt} (${ago(holder.startedAt, now)}).`,
    'Two runs on the same devices shut down each other\'s simulators and reseed each other\'s stack, so this one does not start.',
    'Wait for it and run again, or add --wait to queue behind it; a web-only slice can move its stack instead (VISUAL_AUTH_PORT, VISUAL_FIRESTORE_PORT, VISUAL_DEV_PORT).',
  ].join('\n');
}

/** Tries to take one resource: true when this process holds it now. A holder that is gone loses it. */
function tryTake(dir: string, resource: string, me: LockHolder, alive: (pid: number) => boolean): { taken: true } | { taken: false; holder: LockHolder } {
  const file = fileOf(dir, resource);
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      writeFileSync(file, JSON.stringify(me, null, 2) + '\n', { flag: 'wx' });
      return { taken: true };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
    const holder = readHolder(file);
    if (holder?.pid === me.pid) return { taken: true };
    if (holder && alive(holder.pid)) return { taken: false, holder };
    // Gone (or a file half written by a run killed while making it): take it over.
    try {
      unlinkSync(file);
    } catch {
      // another run took it over first; the next attempt says who
    }
  }
  const holder = readHolder(file);
  return holder ? { taken: false, holder } : { taken: false, holder: { pid: -1, startedAt: '?', cwd: '?', command: '?' } };
}

export type Lock = { resources: string[]; release: () => void };

/**
 * Takes every resource or none. Without `wait`, a held one throws [LockBusy] (with [busyMessage]);
 * with it, the run says once what it waits for, then every few minutes, and goes on when it is free.
 * Released by `release()` and, failing that, when the process exits.
 */
export async function acquire(resources: string[], { wait = false, ...deps }: LockDeps & { wait?: boolean } = {}): Promise<Lock> {
  const dir = deps.dir ?? LOCK_DIR;
  const pid = deps.pid ?? process.pid;
  const alive = deps.alive ?? processAlive;
  const now = deps.now ?? (() => new Date());
  const sleep = deps.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const log = deps.log ?? ((line: string) => console.log(line));
  const me: LockHolder = {
    pid,
    startedAt: now().toISOString(),
    cwd: deps.cwd ?? process.cwd(),
    command: deps.command ?? `visual ${process.argv.slice(2).join(' ')}`.trim(),
  };
  mkdirSync(dir, { recursive: true });
  const held: string[] = [];
  const release = () => {
    for (const resource of held.splice(0)) {
      const file = fileOf(dir, resource);
      if (readHolder(file)?.pid === pid) {
        try {
          unlinkSync(file);
        } catch {
          // already gone
        }
      }
    }
  };
  let waitingSince: number | null = null;
  let lastSaid = 0;
  for (;;) {
    let busy: { resource: string; holder: LockHolder } | null = null;
    for (const resource of [...resources].sort()) {
      if (held.includes(resource)) continue;
      const got = tryTake(dir, resource, me, alive);
      if (got.taken) held.push(resource);
      else {
        busy = { resource, holder: got.holder };
        break;
      }
    }
    if (!busy) {
      if (pid === process.pid) process.once('exit', release);
      return { resources: [...held], release };
    }
    // All or none: what was taken goes back while waiting, so two waiting runs never hold half each.
    release();
    if (!wait) throw new LockBusy(busy.resource, busy.holder, busyMessage(busy.resource, busy.holder, now()));
    const t = now().getTime();
    if (waitingSince == null) {
      waitingSince = t;
      log(`Visual: waiting for ${busy.resource}, held by pid ${busy.holder.pid} (\`${busy.holder.command}\` in ${busy.holder.cwd}, since ${busy.holder.startedAt}); queued behind it…`);
      lastSaid = t;
    } else if (t - lastSaid >= 5 * 60_000) {
      log(`Visual: still waiting for ${busy.resource} (pid ${busy.holder.pid}), ${Math.round((t - waitingSince) / 60_000)} min so far`);
      lastSaid = t;
    }
    await sleep(10_000);
  }
}
