import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { baselineFiles, mentionedIn, planPrune, prune, RUNNING_MS } from './prune';

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));
const NOW = Date.parse('2026-11-23T12:00:00Z');
const HOUR = 3600_000;

/** A visual/ folder (and a checkout with an accept log) of a test's own. */
function world() {
  const root = mkdtempSync(join(tmpdir(), 'visual-prune-'));
  dirs.push(root);
  const visual = join(root, 'visual');
  const write = (path: string, text: string) => {
    mkdirSync(join(path, '..'), { recursive: true });
    writeFileSync(path, text);
  };
  const run = (id: string, startedAt: string | null) => {
    mkdirSync(join(visual, 'runs', id, 'web', 'phone'), { recursive: true });
    writeFileSync(join(visual, 'runs', id, 'web', 'phone', 'home@light-zh-TW.png'), 'png');
    if (startedAt) writeFileSync(join(visual, 'runs', id, 'run.json'), JSON.stringify({ id, startedAt }));
  };
  return { root, visual, write, run };
}

describe('visual prune', () => {
  it('keeps the newest, what a baseline or an accept log names, visual/latest and what may still run — and only those', () => {
    const runs = [
      { id: '20261101-000000', startedAt: NOW - 500 * HOUR },
      { id: '20261102-000000', startedAt: NOW - 400 * HOUR },
      { id: '20261103-000000', startedAt: NOW - 300 * HOUR },
      { id: '20261104-000000', startedAt: NOW - 200 * HOUR },
      { id: '20261105-000000', startedAt: null },
      { id: '20261106-000000', startedAt: NOW - RUNNING_MS + HOUR },
      { id: '20261107-000000', startedAt: NOW - 100 * HOUR },
      { id: '20261108-000000', startedAt: NOW - 90 * HOUR },
    ];
    const plan = planPrune(runs, { keep: 1, named: new Set(['20261102-000000']), latest: '20261104-000000', now: NOW });
    expect(plan.remove).toEqual(['20261101-000000', '20261103-000000', '20261107-000000']);
    expect(Object.fromEntries(plan.keep.map((k) => [k.id, k.why]))).toEqual({
      '20261102-000000': 'named by a baseline or an accept log',
      '20261104-000000': 'visual/latest',
      '20261105-000000': 'its run.json unread: maybe running',
      '20261106-000000': 'started under 6 h ago: maybe running',
      '20261108-000000': 'one of the newest 1',
    });
  });

  it('reads the runs every baseline names — main’s and each branch’s, per picture — and the accept logs', () => {
    const w = world();
    w.write(join(w.visual, 'baseline/web/meta.json'), JSON.stringify({ run: '20261110-000000', captures: { 'web/phone/a.png': { run: '20261111-000000' } } }));
    w.write(join(w.visual, 'baselines/r30%2Fbase/ios/meta.json'), JSON.stringify({ run: '20261112-000000' }));
    w.write(join(w.visual, 'baselines/r30%2Fbase/branch.json'), JSON.stringify({ clonedAt: '2026-11-22' }));
    w.write(join(w.root, 'docs/visual-accept-log.md'), '| 2026-11-15T05:18:17Z | 20261113-000000 | 752eac5e | ios |\n');
    expect(baselineFiles(w.visual).length).toBe(3);
    expect([...mentionedIn([...baselineFiles(w.visual), join(w.root, 'docs/visual-accept-log.md'), join(w.root, 'missing.md')])].sort()).toEqual([
      '20261110-000000', '20261111-000000', '20261112-000000', '20261113-000000',
    ]);
  });

  it('removes nothing on --dry-run, then only the runs no rule keeps — never a folder that isn’t a run', () => {
    const w = world();
    const old = (h: number) => new Date(NOW - h * HOUR).toISOString();
    w.run('20261101-000000', old(500));
    w.run('20261102-000000', old(400));
    w.run('20261103-000000', old(300));
    w.run('20261104-000000', old(200));
    mkdirSync(join(w.visual, 'runs', 'notes'), { recursive: true });
    w.write(join(w.visual, 'baseline/android/meta.json'), JSON.stringify({ run: '20261102-000000' }));
    w.write(join(w.visual, 'latest'), '20261103-000000\n');
    const lines: string[] = [];
    const dry = prune({ keep: 1, dryRun: true, log: (l) => lines.push(l), visualDir: w.visual, root: w.root, now: NOW });
    expect(dry.remove).toEqual(['20261101-000000']);
    expect(readdirSync(join(w.visual, 'runs')).sort()).toEqual(['20261101-000000', '20261102-000000', '20261103-000000', '20261104-000000', 'notes']);
    expect(lines.at(-1)).toMatch(/^Would remove 1 of 4 runs .* nothing removed \(--dry-run\)$/);
    prune({ keep: 1, log: () => {}, visualDir: w.visual, root: w.root, now: NOW });
    expect(existsSync(join(w.visual, 'runs', '20261101-000000'))).toBe(false);
    expect(readdirSync(join(w.visual, 'runs')).sort()).toEqual(['20261102-000000', '20261103-000000', '20261104-000000', 'notes']);
  });
});
