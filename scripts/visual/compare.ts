/**
 * A run against the baseline: each capture is unchanged, changed (with a diff
 * image and the areas that changed), new (no baseline yet) or missing (a
 * baseline the run didn't take, on a platform it captured). What counts as a
 * change is ./diff.ts's: an area of pixels that moved further than a couple of
 * pixels, however small beside the page — a page drawn a pixel off, or small
 * text spaced a little wider, never counts.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { PNG } from 'pngjs';
import { compareImages, type Area } from './diff';
import { BASELINE_DIR, ignorePath, listPngs, readJson, writeJson, type Rect } from './util';
import { SCREENS, type Platform } from './screens';

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
  unsettled: string[];
};

export function compareRun(runDir: string): Result[] {
  const info = readJson<RunInfo>(join(runDir, 'run.json'));
  const captured = listPngs(runDir);
  const baseline = new Set(listPngs(BASELINE_DIR));
  const allowed = new Map(SCREENS.filter((s) => s.maxDiff != null).map((s) => [s.id, s.maxDiff!]));
  const results: Result[] = captured.map((key) => {
    if (!baseline.has(key)) return { key, status: 'new', ratio: null };
    const a = PNG.sync.read(readFileSync(join(BASELINE_DIR, key)));
    const b = PNG.sync.read(readFileSync(join(runDir, key)));
    if (a.width !== b.width || a.height !== b.height) {
      return { key, status: 'changed', ratio: 1, sizes: { baseline: [a.width, a.height], current: [b.width, b.height] } };
    }
    // What the capture asked to be left out, as it was found now and in the baseline (a title that moved).
    const ignore = [join(runDir, key), join(BASELINE_DIR, key)].flatMap((png) => readJson<Rect[]>(ignorePath(png)) ?? []);
    const { ratio, areas, diff } = compareImages(a.data, b.data, a.width, a.height, ignore);
    // A screen's own allowance (`maxDiff`) forgives what is left as long as it stays under that share.
    const allowance = allowed.get(key.split('/').pop()!.split('@')[0]);
    if (!areas.length || (allowance != null && ratio <= allowance)) return { key, status: 'unchanged', ratio };
    const out = join(runDir, '_diff', key);
    mkdirSync(dirname(out), { recursive: true });
    const png = new PNG({ width: a.width, height: a.height });
    png.data = Buffer.from(diff.buffer);
    writeFileSync(out, PNG.sync.write(png));
    return { key, status: 'changed', ratio, areas };
  });
  const platforms = new Set(info?.platforms ?? []);
  const taken = new Set(captured);
  const inScope = (key: string) => {
    const [platform, device, name] = key.split('/');
    return (
      platforms.has(platform as Platform) &&
      (!info?.devices?.length || info.devices.includes(device)) &&
      (!info?.only?.length || info.only.includes(name.split('@')[0]))
    );
  };
  for (const key of baseline) {
    if (inScope(key) && !taken.has(key)) results.push({ key, status: 'missing', ratio: null });
  }
  writeJson(join(runDir, 'results.json'), results);
  return results;
}
