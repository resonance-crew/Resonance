/**
 * A run against the baseline: each capture is unchanged, changed (with a diff
 * image and the areas that changed), new (no baseline yet) or missing (a
 * baseline the run didn't take, on a platform it captured). What counts as a
 * change is ./diff.ts's: an area of pixels that moved further than a couple of
 * pixels, however small beside the page — a page drawn a pixel off, or small
 * text spaced a little wider, never counts.
 *
 * Done once per capture, not once per command: two pictures with the very same bytes are the same
 * page without decoding either (about half of a run's captures, run 20261122-011120), and each
 * result is kept in `<run>/_compare.json` with the stamp of what it was judged from — the capture,
 * its baseline, both ignore lists (size and mtime), the screen's allowance and this file's and
 * diff.ts's own source. `compare`, the verdict after a capture, a review and an `accept` reuse what
 * still matches and judge only the rest again (an accept: just the captures it copied).
 *
 * What is left to judge is judged on worker threads (judge.ts, through compareWorker.ts; `VISUAL_COMPARE_WORKERS`,
 * default the cores less two, at most 4; 0 judges on this thread), each capture decoded by libvips.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { judgeCapture, type Job, type Result } from './judge';
import { compareWorkers, inWorkers } from './pool';
import { runBaseline } from './baselines';
import { ignorePath, listPngs, readJson, writeJson } from './util';
import { SCREENS, type Platform } from './screens';
import { inSet, type VariantSet } from './variants';

export type { Result, Status } from './judge';

export type RunInfo = {
  id: string;
  commit: string;
  dirty: boolean;
  startedAt: string;
  platforms: Platform[];
  /** The run's --only screens and --device devices (empty: all): a baseline outside them isn't missing. */
  only: string[];
  devices: string[];
  /** Captures that never held still, even after a second look: they fail the run (gate.ts). */
  unsettled: string[];
  /** Captures whose first look was early and were taken again (secondLook.ts); absent in older runs. */
  retaken?: string[];
  /** The Maestro flows that failed (`--flows`); absent when none ran. */
  flowsFailed?: string[];
  /** The variant set the run took (variants.ts); absent in older runs, which took the release set. */
  variants?: VariantSet;
  /** Others' simulators and emulators running when the run began and gone by its end (devices.ts); a warning. */
  devicesLost?: string[];
  /** Why the run was ended before its end (watchdog.ts, or its lock taken over): it fails. */
  aborted?: string;
  /** The baseline it was taken against (baselines.ts): `main`, a round's (`r30/base`), a branch's; absent before names: main's. */
  baseline?: string;
  /**
   * A platform's own screens and devices, where the run named them (`--ios-only card --android-device phone,tablet`):
   * one run takes each platform's slice, and `only` / `devices` are the rest's.
   */
  slices?: Partial<Record<Platform, Slice>>;
};

export type Slice = { only: string[]; devices: string[] };

const PLATFORM_IDS: Platform[] = ['web', 'android', 'ios', 'mac'];

/**
 * The platforms' own slices a command line names (`--ios-only card`, `--android-device phone,tablet`); one naming a
 * platform the run doesn't take is an error (a slice that would silently be skipped).
 */
export function slicesOf(args: readonly string[], platforms: readonly Platform[]): Partial<Record<Platform, Slice>> {
  const value = (name: string) => {
    const i = args.indexOf(`--${name}`);
    const v = i >= 0 ? args[i + 1] : undefined;
    return v && !v.startsWith('--') ? v.split(',').map((s) => s.trim()).filter(Boolean) : [];
  };
  const out: Partial<Record<Platform, Slice>> = {};
  for (const p of PLATFORM_IDS) {
    const only = value(`${p}-only`);
    const devices = value(`${p}-device`);
    if (!only.length && !devices.length) continue;
    if (!platforms.includes(p)) throw new Error(`--${p}-only / --${p}-device name a platform this run doesn't take (${platforms.join(', ')})`);
    out[p] = { only, devices };
  }
  return out;
}

/** The screens and devices a run took on `platform`: its own slice where it had one, else the run's. */
export function sliceOf(info: Pick<RunInfo, 'only' | 'devices' | 'slices'> | null | undefined, platform: Platform): Slice {
  const own = info?.slices?.[platform];
  return { only: own?.only?.length ? own.only : (info?.only ?? []), devices: own?.devices?.length ? own.devices : (info?.devices ?? []) };
}

/** The comparison's own code: a change to how pictures are judged judges every kept result again. */
let codeStamp: string | null = null;
function judgedBy(): string {
  codeStamp ??= createHash('sha1')
    .update(['compare.ts', 'diff.ts', 'judge.ts'].map((f) => readFileSync(join(__dirname, f), 'utf8')).join('\0'))
    .digest('hex')
    .slice(0, 12);
  return codeStamp;
}

/** A file as it is now: its size and when it was last written (`-` when there is none). */
function fileStamp(file: string): string {
  try {
    const s = statSync(file);
    return `${s.size}:${s.mtimeMs}`;
  } catch {
    return '-';
  }
}

/** Where a run keeps its results with what each was judged from. */
export const compareCachePath = (runDir: string) => join(runDir, '_compare.json');
type Cache = { judgedBy: string; entries: Record<string, { stamp: string; result: Result }> };

const WORKER = join(__dirname, 'compareWorker.ts');

export type CompareOptions = { baselineDir?: string; workers?: number; log?: (line: string) => void };

export async function compareRun(runDir: string, { baselineDir = runBaseline(runDir), workers = compareWorkers(), log }: CompareOptions = {}): Promise<Result[]> {
  const info = readJson<RunInfo>(join(runDir, 'run.json'));
  const captured = listPngs(runDir);
  const baseline = new Set(listPngs(baselineDir));
  const allowed = new Map(SCREENS.filter((s) => s.maxDiff != null).map((s) => [s.id, s.maxDiff!]));
  const cacheFile = compareCachePath(runDir);
  const kept = readJson<Cache>(cacheFile);
  const old = kept?.judgedBy === judgedBy() ? kept.entries : {};
  const cache: Cache = { judgedBy: judgedBy(), entries: {} };
  const results: Result[] = new Array(captured.length);
  const stamps: string[] = new Array(captured.length);
  const todo: { index: number; job: Job }[] = [];
  captured.forEach((key, index) => {
    if (!baseline.has(key)) return void (results[index] = { key, status: 'new', ratio: null });
    const allowance = allowed.get(key.split('/').pop()!.split('@')[0]);
    const current = join(runDir, key);
    const base = join(baselineDir, key);
    stamps[index] = [fileStamp(current), fileStamp(base), fileStamp(ignorePath(current)), fileStamp(ignorePath(base)), allowance ?? '-'].join('|');
    const reuse = old[key];
    if (reuse?.stamp === stamps[index] && (reuse.result.status !== 'changed' || reuse.result.sizes || existsSync(join(runDir, '_diff', key)))) {
      results[index] = reuse.result;
    } else todo.push({ index, job: { key, runDir, baselineDir, allowance } });
  });
  const judged = await inWorkers(
    todo.map((t) => t.job),
    { size: workers, file: WORKER, local: judgeCapture, log },
  );
  todo.forEach((t, i) => (results[t.index] = judged[i]));
  captured.forEach((key, index) => {
    const result = results[index];
    if (result.status === 'new') return;
    // A diff image left from when it was changed would show a change that is no longer there.
    if (result.status === 'unchanged') rmSync(join(runDir, '_diff', key), { force: true });
    cache.entries[key] = { stamp: stamps[index], result };
  });
  const platforms = new Set(info?.platforms ?? []);
  const taken = new Set(captured);
  const inScope = (key: string) => {
    const [platform, device, name] = key.split('/');
    const { only, devices } = sliceOf(info, platform as Platform);
    return (
      platforms.has(platform as Platform) &&
      (!devices.length || devices.includes(device)) &&
      (!only.length || only.includes(name.split('@')[0])) &&
      // An extended run's captures in the baseline aren't missing from a release run (variants.ts), and a device
      // named on its own (--device phone-large) is in scope whatever the set.
      (inSet(key, info?.variants ?? 'release') || devices.includes(device))
    );
  };
  for (const key of baseline) {
    if (inScope(key) && !taken.has(key)) results.push({ key, status: 'missing', ratio: null });
  }
  writeJson(join(runDir, 'results.json'), results);
  writeJson(cacheFile, cache);
  return results;
}
