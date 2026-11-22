import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { applyAccept, planAccept } from './accept';
import type { BaselineMeta } from './baselineMeta';
import { MAIN, baselineFolder, ensureBaseline } from './baselines';
import { applyPromote, planPromote } from './promote';

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));

const HOME = 'web/phone/home@light-zh-TW.png';
const CARD = 'web/phone/card@light-zh-TW.png';
const IOS_CARD = 'ios/iphone/card@light-zh-TW.png';

/** A machine: main's baseline with home and card (accepted at 00ad099e, older than the round's commits), a round cloned from it, a log. */
function machine() {
  const root = mkdtempSync(join(tmpdir(), 'visual-promote-'));
  dirs.push(root);
  const logFile = join(root, 'log.md');
  const main = baselineFolder(MAIN, root);
  for (const [key, bytes] of [[HOME, 'main home'], [CARD, 'main card'], [IOS_CARD, 'main ios card']]) {
    mkdirSync(dirname(join(main, key)), { recursive: true });
    writeFileSync(join(main, key), bytes);
  }
  for (const p of ['web', 'ios']) writeFileSync(join(main, p, 'meta.json'), JSON.stringify({ commit: '00ad099e', run: 'r0', acceptedAt: '2026-11-01T00:00:00.000Z', reason: 'old' }));
  const round = ensureBaseline('r30/base', { root, now: () => new Date('2026-11-20T00:00:00Z') }).folder;
  let clock = Date.parse('2026-11-21T00:00:00Z');
  const now = () => new Date((clock += 60_000));
  /** The round's run `id` at `commit` taking `shots`, accepted into the round's baseline. */
  const acceptInRound = (id: string, commit: string, shots: Record<string, string>, only: string[] = []) => {
    const dir = join(root, 'runs', id);
    for (const [key, bytes] of Object.entries(shots)) {
      mkdirSync(dirname(join(dir, key)), { recursive: true });
      writeFileSync(join(dir, key), bytes);
    }
    writeFileSync(join(dir, 'run.json'), JSON.stringify({ id, commit, dirty: false, startedAt: '', platforms: ['web', 'ios'], only: [], devices: [], unsettled: [], baseline: 'r30/base' }));
    const planned = planAccept([dir], only);
    if ('error' in planned) throw new Error(planned.error);
    applyAccept(planned.plans, { reason: 'round ok', only, baselineDir: round, logFile, now });
  };
  const read = (folder: string, key: string) => readFileSync(join(folder, key), 'utf8');
  const meta = (platform: string) => JSON.parse(readFileSync(join(main, platform, 'meta.json'), 'utf8')) as BaselineMeta;
  const rows = () => readFileSync(logFile, 'utf8').split('\n').filter((l) => l.startsWith('| 2026'));
  return { root, main, round, acceptInRound, read, meta, rows, now, logFile };
}

describe('promote', () => {
  it('moves only what the round accepted into main’s, each picture with its own commit, one log row per run', () => {
    const m = machine();
    m.acceptInRound('a1', '1dee3e0c', { [CARD]: 'round card' });
    m.acceptInRound('a2', 'da6aaa2a', { [IOS_CARD]: 'round ios card' });
    const plan = planPromote('r30/base', { root: m.root, onMain: () => true });
    if ('error' in plan) throw new Error(plan.error);
    // home was never accepted on the round: main's own picture, as it was cloned, is never copied back.
    expect(plan.picks.map((p) => [p.key, p.from.commit])).toEqual([
      [IOS_CARD, 'da6aaa2a'],
      [CARD, '1dee3e0c'],
    ]);
    // main moved on meanwhile: its home is newer than the round's copy and stays so.
    writeFileSync(join(m.main, HOME), 'main home, newer');
    const done = applyPromote(plan, { root: m.root, reason: '好，搬到 main', logFile: m.logFile, now: m.now });
    expect(done).toEqual([
      { run: 'a1', commit: '1dee3e0c', count: 1 },
      { run: 'a2', commit: 'da6aaa2a', count: 1 },
    ]);
    expect([m.read(m.main, CARD), m.read(m.main, IOS_CARD), m.read(m.main, HOME)]).toEqual(['round card', 'round ios card', 'main home, newer']);
    expect(m.meta('web').captures![CARD].commit).toBe('1dee3e0c');
    expect(m.meta('web').captures![HOME].commit).toBe('00ad099e');
    // The trailers of main's older home still count: its start stays at the oldest picture's commit.
    expect(m.meta('web').commit).toBe('00ad099e');
    const promoted = m.rows().filter((r) => r.includes('promoted from r30/base'));
    expect(promoted.map((r) => r.split(' | ').slice(1, 3).join(' '))).toEqual(['a1 1dee3e0c', 'a2 da6aaa2a']);
    expect(promoted[0]).toContain('好，搬到 main (promoted from r30/base)');
  });

  it('names the commits main doesn’t have, so the caller stops (or goes on, said, with --allow-unmerged)', () => {
    const m = machine();
    m.acceptInRound('a1', 'merged', { [CARD]: 'x' });
    m.acceptInRound('a2', 'not-yet', { [IOS_CARD]: 'y' });
    const plan = planPromote('r30/base', { root: m.root, onMain: (c) => c === 'merged' });
    expect('error' in plan ? [] : plan.unmerged).toEqual(['not-yet']);
  });

  it('narrows to --only, and refuses main itself, a baseline that isn’t there, or a round that accepted nothing', () => {
    const m = machine();
    expect(planPromote('r30/base', { root: m.root, onMain: () => true })).toEqual({ error: expect.stringContaining('r30/base accepted nothing since its baseline was made') });
    m.acceptInRound('a1', 'cA', { [CARD]: 'round card', [HOME]: 'round home' });
    const plan = planPromote('r30/base', { root: m.root, only: ['home'], onMain: () => true });
    expect('error' in plan ? plan.error : plan.picks.map((p) => p.key)).toEqual([HOME]);
    expect(planPromote('r30/base', { root: m.root, only: ['settings'], onMain: () => true })).toEqual({ error: expect.stringContaining('matching --only settings') });
    expect(planPromote('main', { root: m.root, onMain: () => true })).toEqual({ error: expect.stringContaining('--from <branch>') });
    expect(planPromote('r99/base', { root: m.root, onMain: () => true })).toEqual({ error: expect.stringContaining('No baseline for r99/base') });
    expect(existsSync(join(m.main, 'web/phone/home@light-zh-TW.png'))).toBe(true);
    expect(m.read(m.main, HOME)).toBe('main home');
  });
});
