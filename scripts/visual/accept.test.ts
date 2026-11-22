import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { applyAccept, planAccept } from './accept';
import type { BaselineMeta } from './baselineMeta';
import { compareRun } from './compare';

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));

function machine() {
  const root = mkdtempSync(join(tmpdir(), 'visual-accept-'));
  dirs.push(root);
  const baselineDir = join(root, 'baseline');
  const logFile = join(root, 'visual-accept-log.md');
  /** A run taking `shots` ({ key: bytes }), at `commit`. */
  const run = (id: string, commit: string, shots: Record<string, string>, ignore: Record<string, unknown> = {}) => {
    const dir = join(root, 'runs', id);
    mkdirSync(dir, { recursive: true });
    const platforms = [...new Set(Object.keys(shots).map((k) => k.split('/')[0]))];
    writeFileSync(join(dir, 'run.json'), JSON.stringify({ id, commit, dirty: false, startedAt: '', platforms, only: [], devices: [], unsettled: [] }));
    for (const [key, bytes] of Object.entries(shots)) {
      mkdirSync(dirname(join(dir, key)), { recursive: true });
      writeFileSync(join(dir, key), bytes);
    }
    for (const [key, rects] of Object.entries(ignore)) writeFileSync(join(dir, key.replace(/\.png$/, '.ignore.json')), JSON.stringify(rects));
    return dir;
  };
  const accept = (runDirs: string[], only: string[] = []) => {
    const planned = planAccept(runDirs, only);
    if ('error' in planned) return planned;
    return { ...planned, done: applyAccept(planned.plans, { reason: '可以，接受基準', only, baselineDir, logFile, now: () => new Date('2026-11-22T08:00:00Z') }) };
  };
  const base = (key: string) => (existsSync(join(baselineDir, key)) ? readFileSync(join(baselineDir, key), 'utf8') : null);
  const meta = (platform: string) => JSON.parse(readFileSync(join(baselineDir, platform, 'meta.json'), 'utf8')) as BaselineMeta;
  const rows = () => readFileSync(logFile, 'utf8').split('\n').filter((l) => l.startsWith('| 2026'));
  return { root, baselineDir, run, accept, base, meta, rows };
}

const WEB_CARD = 'web/phone/card@light-zh-TW.png';
const WEB_HOME = 'web/phone/home@light-zh-TW.png';
const IOS_CARD = 'ios/iphone/card@light-zh-TW.png';
const IOS_CARD_EN = 'ios/iphone/card@light-en.png';
const MAC_CARD = 'mac/mac/card@light-zh-TW.png';

describe('accept', () => {
  it('one run, as before: all of it or what --only names, its ignore lists with it, one row in the log', () => {
    const m = machine();
    const r = m.run('r1', 'c1', { [WEB_CARD]: 'card1', [WEB_HOME]: 'home1' }, { [WEB_CARD]: [{ x: 0, y: 0, width: 4, height: 4 }] });
    const res = m.accept([r], ['card']);
    expect('done' in res && res.done).toEqual([{ run: 'r1', count: 1 }]);
    expect(m.base(WEB_CARD)).toBe('card1');
    expect(m.base(WEB_HOME)).toBeNull();
    expect(existsSync(join(m.baselineDir, WEB_CARD.replace(/\.png$/, '.ignore.json')))).toBe(true);
    expect(m.rows()).toHaveLength(1);
    expect(m.rows()[0]).toContain('| r1 | c1 | web | card | 1 | 可以，接受基準 |');
  });

  it('several runs at once (a slice taken platform by platform): each its own row and its own commit per capture', () => {
    const m = machine();
    const web = m.run('w', 'cw', { [WEB_CARD]: 'web' });
    const ios = m.run('i', 'ci', { [IOS_CARD]: 'ios', [IOS_CARD_EN]: 'ios-en' });
    const mac = m.run('m', 'cm', { [MAC_CARD]: 'mac' });
    const res = m.accept([web, ios, mac], ['card']);
    expect('done' in res && res.done).toEqual([
      { run: 'w', count: 1 },
      { run: 'i', count: 2 },
      { run: 'm', count: 1 },
    ]);
    expect([m.base(WEB_CARD), m.base(IOS_CARD), m.base(IOS_CARD_EN), m.base(MAC_CARD)]).toEqual(['web', 'ios', 'ios-en', 'mac']);
    expect(m.rows().map((r) => r.split(' | ').slice(1, 4).join(' '))).toEqual(['w cw web', 'i ci ios', 'm cm mac']);
    expect(m.meta('ios').captures![IOS_CARD].commit).toBe('ci');
    expect(m.meta('mac').run).toBe('m');
  });

  it('a capture two runs took comes from the one named last (the retake), and the other is said', () => {
    const m = machine();
    const first = m.run('i1', 'c1', { [IOS_CARD]: 'early', [IOS_CARD_EN]: 'en-1' });
    const retake = m.run('i2', 'c2', { [IOS_CARD]: 'retaken' });
    const res = m.accept([first, retake]);
    expect('replaced' in res && res.replaced).toEqual([`${IOS_CARD} from i1 (taken again in i2)`]);
    expect([m.base(IOS_CARD), m.base(IOS_CARD_EN)]).toEqual(['retaken', 'en-1']);
    expect(m.meta('ios').captures![IOS_CARD].commit).toBe('c2');
    expect(m.meta('ios').captures![IOS_CARD_EN].commit).toBe('c1');
  });

  it('accepts nothing at all when one named run is missing, gives nothing for --only, or is named twice', () => {
    const m = machine();
    const web = m.run('w', 'cw', { [WEB_CARD]: 'web' });
    const ios = m.run('i', 'ci', { [IOS_CARD]: 'ios' });
    expect(m.accept([web, join(m.root, 'runs', 'typo')])).toEqual({ error: expect.stringContaining('No run typo') });
    expect(m.accept([web, ios], ['home'])).toEqual({ error: expect.stringContaining('Nothing in w matches --only home') });
    expect(m.accept([web, web])).toEqual({ error: expect.stringContaining('named twice') });
    expect(m.accept([])).toEqual({ error: expect.stringContaining('No run to accept') });
    expect([m.base(WEB_CARD), m.base(IOS_CARD)]).toEqual([null, null]);
    expect(existsSync(join(m.root, 'visual-accept-log.md'))).toBe(false);
  });

  it('after a several-run accept every run compares unchanged where it was accepted', async () => {
    const m = machine();
    const web = m.run('w', 'cw', { [WEB_CARD]: 'web bytes' });
    const ios = m.run('i', 'ci', { [IOS_CARD]: 'ios bytes' });
    m.accept([web, ios]);
    for (const dir of [web, ios]) {
      const results = await compareRun(dir, { baselineDir: m.baselineDir, workers: 0 });
      expect(results.map((r) => r.status)).toEqual(['unchanged']);
    }
  });
});
