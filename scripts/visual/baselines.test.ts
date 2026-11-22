import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { baselineFolder, baselineName, branchInfoPath, decodeName, encodeName, ensureBaseline, listBaselines, MAIN } from './baselines';

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));

/** A `visual/` folder with main's baseline holding one picture and its meta. */
function visual() {
  const root = mkdtempSync(join(tmpdir(), 'visual-baselines-'));
  dirs.push(root);
  mkdirSync(join(root, 'baseline/web/phone'), { recursive: true });
  writeFileSync(join(root, 'baseline/web/phone/home@light-zh-TW.png'), 'main home');
  writeFileSync(join(root, 'baseline/web/meta.json'), JSON.stringify({ commit: 'c0', run: 'r0', acceptedAt: 'then', reason: 'ok' }));
  return root;
}

describe('which baseline a checkout uses', () => {
  it('main’s on main only; a round’s every lane its round’s base; any other branch its own; a detached checkout its commit’s', () => {
    expect(baselineName('main')).toBe(MAIN);
    expect(baselineName('master')).toBe(MAIN);
    for (const lane of ['r30/base', 'r30/web', 'r30/ios', 'r30/android', 'r30/server']) expect(baselineName(lane)).toBe('r30/base');
    expect(baselineName('r29/base')).toBe('r29/base');
    expect(baselineName('worktree-visual-speed-phase0')).toBe('worktree-visual-speed-phase0');
    expect(baselineName('claude/xenodochial-saha-2c8133')).toBe('claude/xenodochial-saha-2c8133');
    // Not a round: a name that only looks like one keeps its own.
    expect(baselineName('r30/base/extra')).toBe('r30/base/extra');
    expect(baselineName('release-r30')).toBe('release-r30');
    expect(baselineName('HEAD', { head: 'da6aaa2a1234' })).toBe('detached-da6aaa2a');
    // VISUAL_BASELINE wins, main included.
    expect(baselineName('r30/web', { override: 'main' })).toBe(MAIN);
    expect(baselineName('main', { override: 'r31/base' })).toBe('r31/base');
    expect(baselineName('r30/web', { override: '  ' })).toBe('r30/base');
  });

  it('makes a folder name of any branch name — never a path, never main’s folder — and reads it back', () => {
    for (const name of ['r30/base', '../../baseline', '..', '.', 'a b/c%d', '功能/測試', 'main/x']) {
      const enc = encodeName(name);
      expect(enc).toMatch(/^[A-Za-z0-9_%-]+$/);
      expect(decodeName(enc)).toBe(name);
    }
    expect(encodeName('r30/base')).toBe('r30%2Fbase');
    expect(encodeName('..')).toBe('%2E%2E');
    const root = '/v';
    expect(baselineFolder(MAIN, root)).toBe('/v/baseline');
    expect(baselineFolder('r30/base', root)).toBe('/v/baselines/r30%2Fbase');
    expect(baselineFolder('../../baseline', root)).toBe('/v/baselines/%2E%2E%2F%2E%2E%2Fbaseline');
  });
});

describe('ensureBaseline', () => {
  it('clones main’s the first time, with a note of where it came from, and never touches main’s', () => {
    const root = visual();
    const said: string[] = [];
    const { folder, made } = ensureBaseline('r30/base', { root, now: () => new Date('2026-11-22T09:00:00Z'), log: (l) => said.push(l) });
    expect(made).toBe(true);
    expect(folder).toBe(join(root, 'baselines/r30%2Fbase'));
    expect(readFileSync(join(folder, 'web/phone/home@light-zh-TW.png'), 'utf8')).toBe('main home');
    expect(JSON.parse(readFileSync(branchInfoPath(folder), 'utf8'))).toEqual({ name: 'r30/base', clonedFrom: 'main', clonedAt: '2026-11-22T09:00:00.000Z' });
    expect(said[0]).toMatch(/Baseline r30\/base: made from main's/);
    // The branch's own accept changes its copy only.
    writeFileSync(join(folder, 'web/phone/home@light-zh-TW.png'), 'r30 home');
    expect(readFileSync(join(root, 'baseline/web/phone/home@light-zh-TW.png'), 'utf8')).toBe('main home');
    expect(existsSync(join(root, 'baseline/branch.json'))).toBe(false);
    // Made once: the second time it is found.
    expect(ensureBaseline('r30/base', { root }).made).toBe(false);
    expect(readFileSync(join(folder, 'web/phone/home@light-zh-TW.png'), 'utf8')).toBe('r30 home');
  });

  it('is main’s folder itself for main, made never; leaves no half-made folder behind; starts empty with no main baseline', () => {
    const root = visual();
    expect(ensureBaseline(MAIN, { root })).toEqual({ folder: join(root, 'baseline'), made: false });
    ensureBaseline('feature/x', { root });
    expect(readdirSync(join(root, 'baselines'))).toEqual(['feature%2Fx']);
    const bare = mkdtempSync(join(tmpdir(), 'visual-bare-'));
    dirs.push(bare);
    const { folder } = ensureBaseline('r31/base', { root: bare });
    expect(readdirSync(folder)).toEqual(['branch.json']);
    expect(existsSync(join(bare, 'baseline'))).toBe(false);
  });

  it('lists main’s and every branch’s by name', () => {
    const root = visual();
    ensureBaseline('r30/base', { root });
    ensureBaseline('worktree-x', { root });
    expect(listBaselines(root).map((b) => [b.name, b.info?.clonedFrom ?? null])).toEqual([
      ['main', null],
      ['r30/base', 'main'],
      ['worktree-x', 'main'],
    ]);
  });
});
