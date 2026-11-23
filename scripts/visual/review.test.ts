import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { Result } from './compare';
import { RATE_LIMITED, agyParallel, agyReviewer, itemsOn, names, readTrailer, reviewWithAgy, visualLines, type AgyAnswer, type AgyRunner, type Item } from './review';

describe('a Visual: line', () => {
  it('names the screens before its first colon', () => {
    expect(readTrailer('card, ios/thread: the composer’s ＋ sits inside the capsule')).toEqual({
      targets: ['card', 'ios/thread'],
      reason: 'the composer’s ＋ sits inside the capsule',
    });
    expect(readTrailer('web/phone/landing: the film’s foot').targets).toEqual(['web/phone/landing']);
  });

  it('names every screen with *, written out', () => {
    expect(readTrailer('*: the header’s pen line is a shade lighter').targets).toEqual(['*']);
  });

  it('names the screens among the first words of a line written loosely', () => {
    expect(readTrailer('landing (desktop web): the scrollbar is drawn over the film')).toEqual({
      targets: ['landing'],
      reason: 'the scrollbar is drawn over the film',
    });
    expect(readTrailer('landing (web) — the landing page is now the film').targets).toEqual(['landing']);
  });

  it('names no screen when it says none, or names none it knows — never every screen', () => {
    for (const value of ['none — the captures have no address bar; checked on a Pixel 10 Pro in Chrome', 'none', 'None: tests only']) {
      expect(readTrailer(value).targets).toEqual([]);
    }
    expect(readTrailer('the header’s pen line is a shade lighter').targets).toEqual([]);
    expect(readTrailer('the sky: a gradient now').targets).toEqual([]);
    expect(readTrailer('ios/nothing-like-this: why').targets).toEqual([]);
  });
});

describe('the Visual: lines of a log', () => {
  it('reads them anywhere in a message — a paragraph of their own above Co-Authored-By too — each with its commit', () => {
    const log = [
      'abc1234\x1ffix: 🎬 the sun\n\nWhy it changed.\n\nVisual: landing: no change intended\n\nCo-Authored-By: Claude <x@y>\n',
      'def5678\x1ffeat: two screens\n\nVisual: card: shorter\nVisual: ios/thread: the ＋ moved\nCo-Authored-By: Claude <x@y>\n',
      'aaa0000\x1fchore: nothing to see\n\nNot a Visual: line in running text.\n',
    ].join('\x1e');
    expect(visualLines(log)).toEqual([
      { commit: 'abc1234', value: 'landing: no change intended' },
      { commit: 'def5678', value: 'card: shorter' },
      { commit: 'def5678', value: 'ios/thread: the ＋ moved' },
    ]);
  });
});

describe('names', () => {
  const key = 'ios/iphone/card@dark-zh-TW.png';
  it('matches a screen, a platform’s screen, a device’s screen, or every screen', () => {
    expect(['card', 'ios/card', 'ios/iphone/card', '*'].map((t) => names(t, key))).toEqual([true, true, true, true]);
    expect(['home', 'android/card', 'ios/ipad/card'].map((t) => names(t, key))).toEqual([false, false, false]);
  });
});

describe('the agy review, several batches at once', () => {
  const dirs: string[] = [];
  afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));
  const runDir = () => {
    const dir = mkdtempSync(join(tmpdir(), 'visual-review-'));
    dirs.push(dir);
    return dir;
  };
  const item = (dir: string, key: string): Item => ({ key, status: 'changed', expect: '', intended: [], baseline: null, current: join(dir, key), diff: null, areas: [] });
  const keysOf = (args: string[]) => [...args[1].matchAll(/`([^`]+\.png)`/g)].map((m) => m[1]);
  const answer = (keys: string[]): AgyAnswer => ({
    status: 0,
    stderr: '',
    stdout: JSON.stringify({ status: 'SUCCESS', structured_output: { verdicts: keys.map((key) => ({ key, verdict: 'ok', note: `saw ${key}` })) } }),
  });
  /** A stand-in agy: answers each batch after `ms`, counting how many run at once. */
  const fakeAgy = (ms: number, turnAway: (call: number) => boolean = () => false) => {
    const seen = { calls: 0, now: 0, most: 0, mostAfterTurnAway: 0, turnedAway: false };
    const runner: AgyRunner = async (args) => {
      const call = ++seen.calls;
      seen.now++;
      seen.most = Math.max(seen.most, seen.now);
      if (seen.turnedAway) seen.mostAfterTurnAway = Math.max(seen.mostAfterTurnAway, seen.now);
      await new Promise((r) => setTimeout(r, ms));
      seen.now--;
      if (turnAway(call)) {
        seen.turnedAway = true;
        return { status: 1, stdout: '', stderr: 'Error: 429 Too Many Requests (RESOURCE_EXHAUSTED)' };
      }
      return answer(keysOf(args));
    };
    return { runner, seen };
  };

  it('runs three batches at once, every capture judged once, in the order given, verdicts.json written', async () => {
    const dir = runDir();
    const { runner, seen } = fakeAgy(20);
    const keys = Array.from({ length: 23 }, (_, i) => `web/phone/s${i}@light-zh-TW.png`);
    const lines: string[] = [];
    const verdicts = await reviewWithAgy(dir, [], (l) => lines.push(l), false, { runner, size: 5, limit: 3 });
    expect(verdicts).toEqual([]);
    const reviewer = agyReviewer(dir, (l) => lines.push(l), { runner, size: 5, limit: 3 });
    await reviewer.add(keys.map((k) => item(dir, k)));
    const all = await reviewer.done();
    expect(seen.calls).toBe(5);
    expect(seen.most).toBe(3);
    expect(all.map((v) => v.key)).toEqual(keys);
    expect(all.every((v) => v.verdict === 'ok')).toBe(true);
    expect(JSON.parse(readFileSync(join(dir, 'review', 'verdicts.json'), 'utf8'))).toHaveLength(23);
    expect(lines).toContain('agy (gemini-3.8-flash-medium) 21–23 of 23…');
  });

  it('takes captures while others are judged (a phase’s, as it ends), never judging one twice', async () => {
    const dir = runDir();
    const { runner, seen } = fakeAgy(20);
    const reviewer = agyReviewer(dir, () => {}, { runner, size: 2, limit: 3 });
    const web = reviewer.add(['web/phone/a.png', 'web/phone/b.png', 'mac/mac/c.png'].map((k) => item(dir, k)));
    const later = reviewer.add(['android/phone/d.png', 'web/phone/a.png'].map((k) => item(dir, k)));
    await Promise.all([web, later]);
    // The end of the run hands everything over again: what was judged is skipped.
    await reviewer.add(['web/phone/a.png', 'ios/iphone/e.png'].map((k) => item(dir, k)));
    const all = await reviewer.done();
    expect(all.map((v) => v.key)).toEqual(['web/phone/a.png', 'web/phone/b.png', 'mac/mac/c.png', 'android/phone/d.png', 'ios/iphone/e.png']);
    expect(seen.calls).toBe(4);
  });

  it('a batch turned away for its rate is tried once more, and from then on the batches go one at a time', async () => {
    const dir = runDir();
    const { runner, seen } = fakeAgy(15, (call) => call === 1);
    const lines: string[] = [];
    const reviewer = agyReviewer(dir, (l) => lines.push(l), { runner, size: 1, limit: 3 });
    await reviewer.add(['a', 'b', 'c', 'd', 'e', 'f'].map((k) => item(dir, `web/phone/${k}.png`)));
    const all = await reviewer.done();
    expect(all.map((v) => v.verdict)).toEqual(['ok', 'ok', 'ok', 'ok', 'ok', 'ok']);
    expect(seen.calls).toBe(7);
    // Two were already under way when the first came back turned away; after them, one at a time.
    expect(lines.some((l) => /turned a batch away .*one batch at a time/.test(l))).toBe(true);
    expect(seen.mostAfterTurnAway).toBeLessThanOrEqual(2);
  });

  it('a batch that fails another way is not tried again: its captures are unsure, with why', async () => {
    const dir = runDir();
    const runner: AgyRunner = async () => ({ status: 2, stdout: '', stderr: 'agy: not logged in' });
    const all = await reviewWithAgy(dir, [{ key: 'web/phone/a@light-zh-TW.png', status: 'changed', ratio: 0.1 }], () => {}, false, { runner, limit: 3 });
    expect(all).toEqual([{ key: 'web/phone/a@light-zh-TW.png', verdict: 'unsure', note: 'Not judged: agy: not logged in' }]);
  });

  it('runs three at once by default, VISUAL_AGY_PARALLEL setting how many (1: one after the other)', () => {
    const was = process.env.VISUAL_AGY_PARALLEL;
    try {
      delete process.env.VISUAL_AGY_PARALLEL;
      expect(agyParallel()).toBe(3);
      process.env.VISUAL_AGY_PARALLEL = '1';
      expect(agyParallel()).toBe(1);
      process.env.VISUAL_AGY_PARALLEL = 'x';
      expect(agyParallel()).toBe(3);
    } finally {
      if (was == null) delete process.env.VISUAL_AGY_PARALLEL;
      else process.env.VISUAL_AGY_PARALLEL = was;
    }
    expect(RATE_LIMITED.test('HTTP 429')).toBe(true);
    expect(RATE_LIMITED.test('quota exceeded for model')).toBe(true);
    expect(RATE_LIMITED.test('not logged in')).toBe(false);
  });

  it('itemsOn keeps a phase’s platforms only', () => {
    const dir = runDir();
    const results: Result[] = [
      { key: 'web/phone/a@light-zh-TW.png', status: 'changed', ratio: 0.1 },
      { key: 'mac/mac/b@light-zh-TW.png', status: 'new', ratio: null },
      { key: 'android/phone/c@light-zh-TW.png', status: 'changed', ratio: 0.1 },
      { key: 'web/phone/d@light-zh-TW.png', status: 'unchanged', ratio: 0 },
    ];
    expect(itemsOn(dir, results, ['web', 'mac']).map((i) => i.key)).toEqual(['web/phone/a@light-zh-TW.png', 'mac/mac/b@light-zh-TW.png']);
  });
});
