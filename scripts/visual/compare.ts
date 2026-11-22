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
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { PNG } from 'pngjs';
import { compareImages, type Area } from './diff';
import { BASELINE_DIR, ignorePath, listPngs, readJson, writeJson, type Rect } from './util';
import { SCREENS, type Platform } from './screens';
import { inSet, type VariantSet } from './variants';

export type Status = 'unchanged' | 'changed' | 'new' | 'missing';
export type Result = {
  /** `<platform>/<device>/<screen>@<theme>-<locale>.png` */
  key: string;
  status: Status;
  /** Share of pixels apart beyond a shift of a couple of pixels, or null (new, missing). */
  ratio: number | null;
  /** The areas that changed, largest first (changed only; none when the sizes differ). */
  areas?: Area[];
  /** Set when the two images differ in size. */
  sizes?: { baseline: [number, number]; current: [number, number] };
};

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
};

/** The comparison's own code: a change to how pictures are judged judges every kept result again. */
let codeStamp: string | null = null;
function judgedBy(): string {
  codeStamp ??= createHash('sha1')
    .update(['compare.ts', 'diff.ts'].map((f) => readFileSync(join(__dirname, f), 'utf8')).join('\0'))
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

/** One capture against its baseline (both present): the same bytes are the same page, without decoding either. */
export function compareOne(runDir: string, key: string, baselineDir: string, allowance: number | undefined): Result {
  const rawA = readFileSync(join(baselineDir, key));
  const rawB = readFileSync(join(runDir, key));
  if (rawA.equals(rawB)) return { key, status: 'unchanged', ratio: 0 };
  const a = PNG.sync.read(rawA);
  const b = PNG.sync.read(rawB);
  if (a.width !== b.width || a.height !== b.height) {
    return { key, status: 'changed', ratio: 1, sizes: { baseline: [a.width, a.height], current: [b.width, b.height] } };
  }
  // What the capture asked to be left out, as it was found now and in the baseline (a title that moved).
  const ignore = [join(runDir, key), join(baselineDir, key)].flatMap((png) => readJson<Rect[]>(ignorePath(png)) ?? []);
  const { ratio, areas, diff } = compareImages(a.data, b.data, a.width, a.height, ignore);
  // A screen's own allowance (`maxDiff`) forgives what is left as long as it stays under that share.
  if (!areas.length || (allowance != null && ratio <= allowance)) return { key, status: 'unchanged', ratio };
  const out = join(runDir, '_diff', key);
  mkdirSync(dirname(out), { recursive: true });
  const png = new PNG({ width: a.width, height: a.height });
  png.data = Buffer.from(diff.buffer);
  writeFileSync(out, PNG.sync.write(png));
  return { key, status: 'changed', ratio, areas };
}

export function compareRun(runDir: string, baselineDir = BASELINE_DIR): Result[] {
  const info = readJson<RunInfo>(join(runDir, 'run.json'));
  const captured = listPngs(runDir);
  const baseline = new Set(listPngs(baselineDir));
  const allowed = new Map(SCREENS.filter((s) => s.maxDiff != null).map((s) => [s.id, s.maxDiff!]));
  const cacheFile = compareCachePath(runDir);
  const kept = readJson<Cache>(cacheFile);
  const old = kept?.judgedBy === judgedBy() ? kept.entries : {};
  const cache: Cache = { judgedBy: judgedBy(), entries: {} };
  const results: Result[] = captured.map((key) => {
    if (!baseline.has(key)) return { key, status: 'new', ratio: null };
    const allowance = allowed.get(key.split('/').pop()!.split('@')[0]);
    const current = join(runDir, key);
    const base = join(baselineDir, key);
    const stamp = [fileStamp(current), fileStamp(base), fileStamp(ignorePath(current)), fileStamp(ignorePath(base)), allowance ?? '-'].join('|');
    const reuse = old[key];
    const diffImage = join(runDir, '_diff', key);
    const result =
      reuse?.stamp === stamp && (reuse.result.status !== 'changed' || reuse.result.sizes || existsSync(diffImage))
        ? reuse.result
        : compareOne(runDir, key, baselineDir, allowance);
    // A diff image left from when it was changed would show a change that is no longer there.
    if (result.status === 'unchanged') rmSync(diffImage, { force: true });
    cache.entries[key] = { stamp, result };
    return result;
  });
  const platforms = new Set(info?.platforms ?? []);
  const taken = new Set(captured);
  const inScope = (key: string) => {
    const [platform, device, name] = key.split('/');
    return (
      platforms.has(platform as Platform) &&
      (!info?.devices?.length || info.devices.includes(device)) &&
      (!info?.only?.length || info.only.includes(name.split('@')[0])) &&
      // An extended run's captures in the baseline aren't missing from a release run (variants.ts), and a device
      // named on its own (--device phone-large) is in scope whatever the set.
      (inSet(key, info?.variants ?? 'release') || !!info?.devices?.includes(device))
    );
  };
  for (const key of baseline) {
    if (inScope(key) && !taken.has(key)) results.push({ key, status: 'missing', ratio: null });
  }
  writeJson(join(runDir, 'results.json'), results);
  writeJson(cacheFile, cache);
  return results;
}
