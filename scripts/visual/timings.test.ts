import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readTimings, stopwatch, summarizeTimings, writeTiming, writeTimingsSummary } from './timings';

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));
const runDir = () => {
  const dir = mkdtempSync(join(tmpdir(), 'visual-timings-'));
  dirs.push(dir);
  return dir;
};

describe('where each capture’s time goes', () => {
  it('times each step from the last lap, a step met twice (a retake) adding up, and writes a line per capture', () => {
    const dir = runDir();
    let t = 1000;
    const clock = () => t;
    const sw = stopwatch(clock);
    t += 200;
    sw.lap('launch');
    t += 1500;
    sw.lap('ready');
    t += 700;
    sw.lap('settle');
    t += 300;
    sw.lap('settle');
    const timing = sw.done(dir, 'android/phone/home@light-zh-TW.png');
    expect(timing).toMatchObject({ key: 'android/phone/home@light-zh-TW.png', kind: 'capture', totalMs: 2700, steps: { launch: 200, ready: 1500, settle: 1000 } });
    expect(readTimings(dir)).toHaveLength(1);
  });

  it('sums each device up — its captures, its sign-ins, the builds — by median, and writes _timings.json', () => {
    const dir = runDir();
    const at = new Date().toISOString();
    for (const [ms, ready] of [[6000, 2000], [8000, 3000], [10000, 5000]]) {
      writeTiming(dir, { key: `ios/iphone/s${ms}@light-zh-TW.png`, kind: 'capture', totalMs: ms, steps: { ready, settle: 1000 }, at });
    }
    writeTiming(dir, { key: 'ios/iphone/alice@light-zh-TW', kind: 'sign-in', totalMs: 10400, steps: { launch: 400, wait: 10000 }, at });
    writeTiming(dir, { key: 'build/mac', kind: 'build', totalMs: 95000, steps: {}, at });
    const summary = summarizeTimings(readTimings(dir));
    expect(summary).toEqual([
      { device: 'ios/iphone', kind: 'capture', count: 3, medianMs: 8000, sumMs: 24000, steps: { ready: 3000, settle: 1000 } },
      { device: 'ios/iphone', kind: 'sign-in', count: 1, medianMs: 10400, sumMs: 10400, steps: { launch: 400, wait: 10000 } },
      { device: 'build/mac', kind: 'build', count: 1, medianMs: 95000, sumMs: 95000, steps: {} },
    ]);
    const lines = writeTimingsSummary(dir);
    expect(lines[0]).toBe('Timings ios/iphone: 3 captures, median 8.0 s  (ready 3.0 s · settle 1.0 s)');
    expect(lines[2]).toBe('Timings build/mac 95.0 s');
    expect(JSON.parse(readFileSync(join(dir, '_timings.json'), 'utf8'))).toEqual(summary);
  });

  it('says nothing for a run that timed nothing', () => {
    expect(writeTimingsSummary(runDir())).toEqual([]);
  });
});
