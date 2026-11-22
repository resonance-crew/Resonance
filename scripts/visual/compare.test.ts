import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { PNG } from 'pngjs';
import { afterEach, describe, expect, it } from 'vitest';
import { compareCachePath, compareRun } from './compare';

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));

/** A run folder and a baseline folder, side by side. */
function world() {
  const root = mkdtempSync(join(tmpdir(), 'visual-compare-'));
  dirs.push(root);
  const runDir = join(root, 'run');
  const baselineDir = join(root, 'baseline');
  mkdirSync(runDir, { recursive: true });
  writeFileSync(join(runDir, 'run.json'), JSON.stringify({ id: 'r1', commit: 'c', dirty: false, startedAt: '', platforms: ['web'], only: [], devices: [], unsettled: [] }));
  return { runDir, baselineDir };
}

/** A 64 × 64 page of paper, with a dark square where `mark` says. */
function page(mark: number | null): Buffer {
  const png = new PNG({ width: 64, height: 64 });
  for (let i = 0; i < png.data.length; i += 4) png.data.set([250, 247, 240, 255], i);
  if (mark != null) {
    for (let y = mark; y < mark + 20; y++) for (let x = mark; x < mark + 20; x++) png.data.set([20, 20, 20, 255], (y * 64 + x) * 4);
  }
  return PNG.sync.write(png);
}

const put = (dir: string, key: string, bytes: Buffer) => {
  mkdirSync(dirname(join(dir, key)), { recursive: true });
  writeFileSync(join(dir, key), bytes);
};

const SAME = 'web/phone/home@light-zh-TW.png';
const MOVED = 'web/phone/me@light-zh-TW.png';
const NEW = 'web/phone/settings@light-zh-TW.png';

describe('compareRun', () => {
  it('tells unchanged, changed and new apart, and the same bytes never need decoding', () => {
    const { runDir, baselineDir } = world();
    // Not a PNG at all, but the very same bytes on both sides: the same page, never decoded.
    put(baselineDir, SAME, Buffer.from('the very same bytes'));
    put(runDir, SAME, Buffer.from('the very same bytes'));
    put(baselineDir, MOVED, page(4));
    put(runDir, MOVED, page(36));
    put(runDir, NEW, page(10));
    const results = compareRun(runDir, baselineDir);
    expect(Object.fromEntries(results.map((r) => [r.key, r.status]))).toEqual({ [SAME]: 'unchanged', [MOVED]: 'changed', [NEW]: 'new' });
    expect(existsSync(join(runDir, '_diff', MOVED))).toBe(true);
    expect(JSON.parse(readFileSync(join(runDir, 'results.json'), 'utf8'))).toHaveLength(3);
  });

  it('judges each capture once: a second comparison reuses what nothing changed under', () => {
    const { runDir, baselineDir } = world();
    put(baselineDir, MOVED, page(4));
    put(runDir, MOVED, page(36));
    const file = join(baselineDir, MOVED);
    utimesSync(file, 1_700_000_000, 1_700_000_000);
    const first = compareRun(runDir, baselineDir);
    // The baseline's bytes made unreadable, its size and time kept: only a result reused from the cache survives this.
    writeFileSync(file, Buffer.alloc(statSync(file).size, 7));
    utimesSync(file, 1_700_000_000, 1_700_000_000);
    expect(compareRun(runDir, baselineDir)).toEqual(first);
    expect(Object.keys(JSON.parse(readFileSync(compareCachePath(runDir), 'utf8')).entries)).toEqual([MOVED]);
  });

  it('after an accept, judges only the captures it copied again — and drops their stale diff', () => {
    const { runDir, baselineDir } = world();
    put(baselineDir, SAME, page(4));
    put(runDir, SAME, page(4));
    put(baselineDir, MOVED, page(4));
    put(runDir, MOVED, page(36));
    expect(compareRun(runDir, baselineDir).find((r) => r.key === MOVED)!.status).toBe('changed');
    // The accept copies the capture into the baseline (a new mtime): judged again, now the same bytes.
    writeFileSync(join(baselineDir, MOVED), readFileSync(join(runDir, MOVED)));
    const after = compareRun(runDir, baselineDir);
    expect(after.map((r) => r.status)).toEqual(['unchanged', 'unchanged']);
    expect(existsSync(join(runDir, '_diff', MOVED))).toBe(false);
  });

  it('judges again when an ignore list changes, or a diff image went missing', () => {
    const { runDir, baselineDir } = world();
    put(baselineDir, MOVED, page(4));
    put(runDir, MOVED, page(36));
    compareRun(runDir, baselineDir);
    // Skipping both squares makes the change go away: the new list is read, not the cached verdict.
    writeFileSync(join(runDir, MOVED.replace(/\.png$/, '.ignore.json')), JSON.stringify([{ x: 0, y: 0, width: 64, height: 64 }]));
    expect(compareRun(runDir, baselineDir)[0].status).toBe('unchanged');
    rmSync(join(runDir, MOVED.replace(/\.png$/, '.ignore.json')));
    expect(compareRun(runDir, baselineDir)[0].status).toBe('changed');
    rmSync(join(runDir, '_diff'), { recursive: true });
    expect(compareRun(runDir, baselineDir)[0].status).toBe('changed');
    expect(existsSync(join(runDir, '_diff', MOVED))).toBe(true);
  });
});
