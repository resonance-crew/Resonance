/**
 * A run against the baseline: each capture is unchanged, changed (with a diff
 * image), new (no baseline yet) or missing (a baseline the run didn't take, on
 * a platform it captured). A change is more than DIFF_RATIO of the pixels
 * apart after pixelmatch's antialiasing allowance, so a pen line drawn half a
 * pixel off on another day never counts.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { BASELINE_DIR, listPngs, readJson, writeJson } from './util';
import { SCREENS, type Platform } from './screens';

export const DIFF_RATIO = 0.0005;

export type Status = 'unchanged' | 'changed' | 'new' | 'missing';
export type Result = {
  /** `<platform>/<device>/<screen>@<theme>-<locale>.png` */
  key: string;
  status: Status;
  /** Share of pixels apart (changed), or null. */
  ratio: number | null;
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
    const diff = new PNG({ width: a.width, height: a.height });
    const apart = pixelmatch(a.data, b.data, diff.data, a.width, a.height, { threshold: 0.1, alpha: 0.2, diffColor: [230, 40, 40] });
    const ratio = apart / (a.width * a.height);
    if (ratio <= (allowed.get(key.split('/').pop()!.split('@')[0]) ?? DIFF_RATIO)) return { key, status: 'unchanged', ratio };
    const out = join(runDir, '_diff', key);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, PNG.sync.write(diff));
    return { key, status: 'changed', ratio };
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
