import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { PNG } from 'pngjs';
import { afterEach, describe, expect, it } from 'vitest';
import { compareCachePath, compareRun, type Result } from './compare';
import { compareImages } from './diff';
import { decodePng } from './judge';
import { ignorePath, listPngs, readJson, type Rect } from './util';

/** The comparison on this thread (0 workers) or on a pool of them. */
const cmp = (runDir: string, baselineDir: string, workers = 0) =>
  compareRun(runDir, {
    baselineDir,
    workers,
    // A worker that failed would fall back to this thread silently: here it fails the test instead.
    log: (line) => {
      throw new Error(`the pool fell back: ${line}`);
    },
  });

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

describe('compareRun', async () => {
  it('tells unchanged, changed and new apart, and the same bytes never need decoding', async () => {
    const { runDir, baselineDir } = world();
    // Not a PNG at all, but the very same bytes on both sides: the same page, never decoded.
    put(baselineDir, SAME, Buffer.from('the very same bytes'));
    put(runDir, SAME, Buffer.from('the very same bytes'));
    put(baselineDir, MOVED, page(4));
    put(runDir, MOVED, page(36));
    put(runDir, NEW, page(10));
    const results = (await cmp(runDir, baselineDir));
    expect(Object.fromEntries(results.map((r) => [r.key, r.status]))).toEqual({ [SAME]: 'unchanged', [MOVED]: 'changed', [NEW]: 'new' });
    expect(existsSync(join(runDir, '_diff', MOVED))).toBe(true);
    expect(JSON.parse(readFileSync(join(runDir, 'results.json'), 'utf8'))).toHaveLength(3);
  });

  it('judges each capture once: a second comparison reuses what nothing changed under', async () => {
    const { runDir, baselineDir } = world();
    put(baselineDir, MOVED, page(4));
    put(runDir, MOVED, page(36));
    const file = join(baselineDir, MOVED);
    utimesSync(file, 1_700_000_000, 1_700_000_000);
    const first = (await cmp(runDir, baselineDir));
    // The baseline's bytes made unreadable, its size and time kept: only a result reused from the cache survives this.
    writeFileSync(file, Buffer.alloc(statSync(file).size, 7));
    utimesSync(file, 1_700_000_000, 1_700_000_000);
    expect((await cmp(runDir, baselineDir))).toEqual(first);
    expect(Object.keys(JSON.parse(readFileSync(compareCachePath(runDir), 'utf8')).entries)).toEqual([MOVED]);
  });

  it('after an accept, judges only the captures it copied again — and drops their stale diff', async () => {
    const { runDir, baselineDir } = world();
    put(baselineDir, SAME, page(4));
    put(runDir, SAME, page(4));
    put(baselineDir, MOVED, page(4));
    put(runDir, MOVED, page(36));
    expect((await cmp(runDir, baselineDir)).find((r) => r.key === MOVED)!.status).toBe('changed');
    // The accept copies the capture into the baseline (a new mtime): judged again, now the same bytes.
    writeFileSync(join(baselineDir, MOVED), readFileSync(join(runDir, MOVED)));
    const after = (await cmp(runDir, baselineDir));
    expect(after.map((r) => r.status)).toEqual(['unchanged', 'unchanged']);
    expect(existsSync(join(runDir, '_diff', MOVED))).toBe(false);
  });

  it('judges again when an ignore list changes, or a diff image went missing', async () => {
    const { runDir, baselineDir } = world();
    put(baselineDir, MOVED, page(4));
    put(runDir, MOVED, page(36));
    (await cmp(runDir, baselineDir));
    // Skipping both squares makes the change go away: the new list is read, not the cached verdict.
    writeFileSync(join(runDir, MOVED.replace(/\.png$/, '.ignore.json')), JSON.stringify([{ x: 0, y: 0, width: 64, height: 64 }]));
    expect((await cmp(runDir, baselineDir))[0].status).toBe('unchanged');
    rmSync(join(runDir, MOVED.replace(/\.png$/, '.ignore.json')));
    expect((await cmp(runDir, baselineDir))[0].status).toBe('changed');
    rmSync(join(runDir, '_diff'), { recursive: true });
    expect((await cmp(runDir, baselineDir))[0].status).toBe('changed');
    expect(existsSync(join(runDir, '_diff', MOVED))).toBe(true);
  });
});

/**
 * The comparison as it was before libvips and the worker threads: pngjs decoding, the same compareImages, pngjs
 * writing the diff. The new one must give the very same verdicts, ratios, areas and diff pixels.
 */
function reference(runDir: string, baselineDir: string): { results: Result[]; diffs: Map<string, Buffer> } {
  const diffs = new Map<string, Buffer>();
  const results = listPngs(runDir).map((key): Result => {
    if (!existsSync(join(baselineDir, key))) return { key, status: 'new', ratio: null };
    const rawA = readFileSync(join(baselineDir, key));
    const rawB = readFileSync(join(runDir, key));
    const a = PNG.sync.read(rawA);
    const b = PNG.sync.read(rawB);
    if (a.width !== b.width || a.height !== b.height) return { key, status: 'changed', ratio: 1, sizes: { baseline: [a.width, a.height], current: [b.width, b.height] } };
    const ignore = [join(runDir, key), join(baselineDir, key)].flatMap((png) => readJson<Rect[]>(ignorePath(png)) ?? []);
    const { ratio, areas, diff } = compareImages(a.data, b.data, a.width, a.height, ignore);
    if (!areas.length) return { key, status: 'unchanged', ratio };
    diffs.set(key, Buffer.from(diff.buffer));
    return { key, status: 'changed', ratio, areas };
  });
  return { results, diffs };
}

/** A page of paper with marks: squares, a grey ramp and a hairline, so the judgement has edges, fills and shifts to weigh. */
function drawn(width: number, height: number, marks: { x: number; y: number; size: number; ink: number }[], alpha = false): Buffer {
  const png = new PNG({ width, height, colorType: alpha ? 6 : 2 });
  for (let i = 0; i < png.data.length; i += 4) png.data.set([250, 247, 240, 255], i);
  for (const m of marks) {
    for (let y = m.y; y < Math.min(height, m.y + m.size); y++) {
      for (let x = m.x; x < Math.min(width, m.x + m.size); x++) png.data.set([m.ink, m.ink, Math.min(255, m.ink + 30), alpha ? 200 : 255], (y * width + x) * 4);
    }
  }
  for (let x = 0; x < width; x++) png.data.set([120, 110, 100, 255], (Math.floor(height / 2) * width + x) * 4);
  return PNG.sync.write(png, { colorType: alpha ? 6 : 2 });
}

describe('the comparison is the same judgement as before (libvips, worker threads)', () => {
  it('gives the old code’s verdicts, ratios, areas and diff pixels, on this thread and on a pool', async () => {
    const { runDir, baselineDir } = world();
    const cases: [string, Buffer, Buffer, Rect[]?][] = [
      ['web/phone/home@light-zh-TW.png', drawn(96, 96, [{ x: 8, y: 8, size: 20, ink: 30 }]), drawn(96, 96, [{ x: 8, y: 8, size: 20, ink: 30 }])],
      ['web/phone/me@light-zh-TW.png', drawn(96, 96, [{ x: 8, y: 8, size: 20, ink: 30 }]), drawn(96, 96, [{ x: 9, y: 9, size: 20, ink: 30 }])],
      ['web/phone/card@light-zh-TW.png', drawn(96, 96, [{ x: 8, y: 8, size: 20, ink: 30 }]), drawn(96, 96, [{ x: 50, y: 60, size: 24, ink: 60 }])],
      ['web/phone/settings@light-zh-TW.png', drawn(96, 96, [{ x: 8, y: 8, size: 20, ink: 30 }], true), drawn(96, 96, [{ x: 40, y: 8, size: 20, ink: 90 }], true)],
      ['web/tablet/home@light-zh-TW.png', drawn(80, 120, []), drawn(96, 120, [])],
      ['web/desktop/home@light-zh-TW.png', drawn(128, 64, [{ x: 0, y: 0, size: 30, ink: 10 }]), drawn(128, 64, [{ x: 90, y: 20, size: 30, ink: 10 }]), [{ x: 0, y: 0, width: 40, height: 40 }]],
      ['web/desktop/thought-map@light-zh-TW.png', drawn(128, 64, [{ x: 4, y: 4, size: 10, ink: 40 }]), drawn(128, 64, [{ x: 100, y: 40, size: 10, ink: 40 }])],
    ];
    for (const [key, base, now, ignore] of cases) {
      put(baselineDir, key, base);
      put(runDir, key, now);
      if (ignore) writeFileSync(ignorePath(join(runDir, key)), JSON.stringify(ignore));
    }
    put(runDir, 'web/phone/new-screen@light-zh-TW.png', drawn(96, 96, []));
    const want = reference(runDir, baselineDir);
    const strip = (rs: Result[]) => rs.filter((r) => r.status !== 'missing').map((r) => ({ ...r, ratio: r.ratio }));
    for (const workers of [0, 3]) {
      rmSync(compareCachePath(runDir), { force: true });
      rmSync(join(runDir, '_diff'), { recursive: true, force: true });
      const got = await cmp(runDir, baselineDir, workers);
      // thought-map has its own allowance (maxDiff) the reference doesn't apply: compared on what both judge alike.
      const sameJudge = (r: Result) => !r.key.includes('thought-map');
      expect(strip(got).filter(sameJudge), `workers ${workers}`).toEqual(strip(want.results).filter(sameJudge));
      for (const [key, pixels] of want.diffs) {
        if (key.includes('thought-map') && got.find((r) => r.key === key)!.status === 'unchanged') continue;
        const decoded = await decodePng(readFileSync(join(runDir, '_diff', key)));
        expect(Buffer.compare(Buffer.from(decoded.data), pixels), `${key} diff pixels, workers ${workers}`).toBe(0);
      }
    }
  });

  it('decodes a PNG to pngjs’s very RGBA, opaque or not', async () => {
    for (const bytes of [drawn(33, 17, [{ x: 2, y: 2, size: 9, ink: 50 }]), drawn(33, 17, [{ x: 2, y: 2, size: 9, ink: 50 }], true)]) {
      const mine = await decodePng(bytes);
      const theirs = PNG.sync.read(bytes);
      expect([mine.width, mine.height]).toEqual([theirs.width, theirs.height]);
      expect(Buffer.compare(Buffer.from(mine.data), theirs.data)).toBe(0);
    }
  });
});

