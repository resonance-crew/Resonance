import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { PNG } from 'pngjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LOOKS, samePicture, secondLook, wantsSecondLook, type Shot } from './secondLook';

const W = 160;
const H = 120;

/** A cream page with ink blocks `[x, y, w, h]`: a loaded card has a title and lines, a skeleton none. */
function page(blocks: [number, number, number, number][]): Buffer {
  const png = new PNG({ width: W, height: H });
  for (let i = 0; i < W * H; i++) png.data.set([247, 241, 232, 255], i * 4);
  for (const [bx, by, bw, bh] of blocks) {
    for (let y = by; y < by + bh; y++) for (let x = bx; x < bx + bw; x++) png.data.set([40, 36, 32, 255], (y * W + x) * 4);
  }
  return PNG.sync.write(png);
}

const LOADED = page([[10, 10, 90, 12], [10, 40, 140, 6], [10, 54, 120, 6]]);
const SKELETON = page([]);
const OTHER = page([[10, 80, 60, 20]]);
const KEY = 'android/phone/card@light-zh-TW.png';

const shot = (png: Buffer, settled = true): Shot => ({ png, settled });
/** A retake that answers the given pictures in turn, counting its calls. */
function takes(...pngs: Buffer[]) {
  const fn = Object.assign(async () => shot(pngs[Math.min(fn.calls++, pngs.length - 1)]), { calls: 0 });
  return fn;
}

let baseline: string;
const put = (key: string, png: Buffer) => {
  const file = join(baseline, key);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, png);
};
const options = (over = {}) => ({ key: KEY, baselineDir: baseline, wait: async () => {}, ...over });

beforeEach(() => {
  baseline = mkdtempSync(join(tmpdir(), 'second-look-'));
});
afterEach(() => rmSync(baseline, { recursive: true, force: true }));

describe('samePicture', () => {
  it("is the comparison's rule: the same page drawn again, but not another page", () => {
    expect(samePicture(LOADED, page([[10, 10, 90, 12], [10, 40, 140, 6], [10, 54, 120, 6]]))).toBe(true);
    expect(samePicture(LOADED, SKELETON)).toBe(false);
  });

  it('leaves out what a capture skips, and forgives a screen its allowance', () => {
    expect(samePicture(SKELETON, OTHER, [{ x: 0, y: 70, width: W, height: 40 }])).toBe(true);
    expect(samePicture(SKELETON, OTHER, [], 0.5)).toBe(true);
  });
});

describe('a second look', () => {
  it('is not taken when the capture is its baseline', async () => {
    put(KEY, LOADED);
    const retake = takes(SKELETON);
    expect(await secondLook(shot(LOADED), retake, options())).toEqual({ png: LOADED, settled: true, retaken: false });
    expect(retake.calls).toBe(0);
  });

  it('keeps a real change: the same picture again', async () => {
    put(KEY, LOADED);
    const retake = takes(OTHER);
    const look = await secondLook(shot(OTHER), retake, options());
    expect(look).toMatchObject({ settled: true, retaken: false });
    expect(look.png.equals(OTHER)).toBe(true);
    expect(retake.calls).toBe(1);
  });

  it('catches a capture taken before the page loaded (the 2.5.0 Android cards): keeps the later one, marked retaken', async () => {
    put(KEY, LOADED);
    const retake = takes(LOADED);
    const look = await secondLook(shot(SKELETON), retake, options());
    expect(look).toMatchObject({ settled: true, retaken: true });
    expect(look.png.equals(LOADED)).toBe(true);
  });

  it('looks once more when the later look is another change, and keeps it once it holds', async () => {
    put(KEY, LOADED);
    const retake = takes(OTHER, OTHER);
    const look = await secondLook(shot(SKELETON), retake, options());
    expect(look).toMatchObject({ settled: true, retaken: true });
    expect(look.png.equals(OTHER)).toBe(true);
    expect(retake.calls).toBe(2);
  });

  it(`calls a page that keeps changing over ${LOOKS} looks unsettled`, async () => {
    put(KEY, LOADED);
    const busy = page([[0, 0, 30, 30]]);
    const retake = takes(OTHER, busy);
    const look = await secondLook(shot(SKELETON), retake, options());
    expect(look).toMatchObject({ settled: false, retaken: true });
    expect(retake.calls).toBe(LOOKS - 1);
  });

  it("keeps the first look's own word that it never settled", async () => {
    put(KEY, LOADED);
    expect(await secondLook(shot(OTHER, false), takes(OTHER), options())).toMatchObject({ settled: false });
  });

  it('waits the given time before each further look', async () => {
    put(KEY, LOADED);
    const waits: number[] = [];
    await secondLook(shot(SKELETON), takes(OTHER, OTHER), options({ waitMs: 1234, wait: async (ms: number) => void waits.push(ms) }));
    expect(waits).toEqual([1234, 1234]);
  });

  it('looks again at a web capture with no baseline only on a platform that has one', () => {
    const web = 'web/phone/card@light-zh-TW.png';
    expect(wantsSecondLook(web, LOADED, [], baseline)).toBe(false);
    put('web/phone/home@light-zh-TW.png', LOADED);
    expect(wantsSecondLook(web, LOADED, [], baseline)).toBe(true);
  });

  // A first run (or the extended set's first, or a new screen) on an app has nothing to go by: a skeleton taken there
  // would become the baseline the next run trusts. So every app capture without a baseline is looked at again.
  it('looks again at every app capture with no baseline, a machine’s first run included', async () => {
    expect(wantsSecondLook(KEY, LOADED, [], baseline)).toBe(true);
    expect(wantsSecondLook('ios/ipad-landscape/card@light-zh-TW.png', LOADED, [], baseline)).toBe(true);
    const retake = takes(LOADED);
    const look = await secondLook(shot(SKELETON), retake, options());
    expect(look).toEqual({ png: LOADED, settled: true, retaken: true });
    // A page that holds: one more look, kept as it was.
    const steady = await secondLook(shot(LOADED), takes(LOADED), options());
    expect(steady).toEqual({ png: LOADED, settled: true, retaken: false });
  });

  // Its first look is already a settled one (Android: held 3.5 s, no skeleton named; iOS and the Mac: 4 s after the
  // launch), so a new capture's second look is one plain frame: the same page again is two looks that agree.
  it('looks at a new capture once more with one plain frame, after the same wait, and keeps its first look', async () => {
    const retake = takes(OTHER);
    const glance = Object.assign(async () => LOADED, { calls: 0 });
    const waited: number[] = [];
    const look = await secondLook(shot(LOADED), retake, options({ glance, wait: async (ms: number) => void waited.push(ms) }));
    expect(look).toEqual({ png: LOADED, settled: true, retaken: false });
    expect(retake.calls).toBe(0);
    expect(waited).toEqual([5000]);
  });

  it('goes on with whole looks as before when the frame shows another page: the first look was early', async () => {
    // The first look a skeleton that held still; the frame 5 s later the loaded card; whole looks then settle on it.
    const retake = takes(LOADED, LOADED);
    const look = await secondLook(shot(SKELETON), retake, options({ glance: async () => LOADED }));
    expect(look).toEqual({ png: LOADED, settled: true, retaken: true });
    expect(retake.calls).toBe(2);
    // Still moving through every whole look: unsettled, as ever.
    const moving = await secondLook(shot(SKELETON), takes(LOADED, OTHER, SKELETON), options({ glance: async () => OTHER }));
    expect(moving.settled).toBe(false);
  });

  it('never glances at a capture that has a baseline: a changed one gets whole looks, as before', async () => {
    put(KEY, LOADED);
    const glance = Object.assign(async () => OTHER, { calls: 0 });
    let glanced = 0;
    const retake = takes(OTHER);
    const look = await secondLook(shot(OTHER), retake, options({ glance: async () => (glanced++, glance()) }));
    expect(look).toEqual({ png: OTHER, settled: true, retaken: false });
    expect(glanced).toBe(0);
    expect(retake.calls).toBe(1);
  });

  it("skips what the baseline asked to skip too (its .ignore.json)", () => {
    put(KEY, SKELETON);
    writeFileSync(join(baseline, KEY.replace(/\.png$/, '.ignore.json')), JSON.stringify([{ x: 0, y: 70, width: W, height: 40 }]));
    expect(wantsSecondLook(KEY, OTHER, [], baseline)).toBe(false);
  });
});
