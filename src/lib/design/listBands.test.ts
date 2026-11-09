import { describe, expect, it } from 'vitest';
import {
  BAND_AMP,
  BAND_END_KEY,
  BAND_HOVER_MIX,
  BAND_PRESS_DELAY_MS,
  BAND_PRESS_MIX,
  BAND_ROW_PAD,
  BAND_TITLE_TO_BAND,
  bandCurve,
  bandRegion,
  bandSteps,
  bandsBelow,
  translatePath,
} from './listBands';
import { rowBoundary } from './rowMenu';
import { seedFromString } from './prng';

// The bands a list's rows are parted into (round 23 §4/§5): curves shared between neighbours, seeded by the row
// below, turning about every 100 px — and the menus' own boundary left exactly as it was.

describe('rowBoundary', () => {
  it('keeps a menu’s four turns by default, point for point (the native fixtures hold)', () => {
    expect(rowBoundary(40, 200, 11, 2, 12)).toEqual(rowBoundary(40, 200, 11, 2, 12, 4));
    expect(rowBoundary(40, 200, 11, 2, 12)).toHaveLength(4 + 3);
  });

  it('takes more turns across a wider row when asked, flat where it meets the ends', () => {
    const pts = rowBoundary(10, 1400, 5, 2, 0, 14);
    expect(pts).toHaveLength(14 + 3);
    expect(pts[1]).toEqual([0, 10]);
    expect(pts.at(-2)).toEqual([1400, 10]);
    for (const [, y] of pts) expect(Math.abs(y - 10)).toBeLessThanOrEqual(2);
  });
});

describe('the bands', () => {
  it('keep the numbers every platform shares', () => {
    expect(BAND_AMP).toBe(2);
    expect(BAND_ROW_PAD).toBe(12);
    // A title stands clear of the curves' swing by 4 more.
    expect(BAND_TITLE_TO_BAND).toBe(6);
    expect(BAND_PRESS_DELAY_MS).toBe(80);
    expect([BAND_HOVER_MIX, BAND_PRESS_MIX]).toEqual([6, 12]);
  });

  it('turn about every 100 px, never fewer than a menu’s 4', () => {
    expect(bandSteps(320)).toBe(4);
    expect(bandSteps(390)).toBe(4);
    expect(bandSteps(480)).toBe(5);
    expect(bandSteps(820)).toBe(8);
    expect(bandSteps(1440)).toBe(14);
  });

  it('share the curve between two rows: the upper row’s bottom is the lower row’s top', () => {
    const w = 390;
    const upperH = 70;
    const below = bandCurve(upperH, w, 'b');
    const lowerTop = bandCurve(0, w, 'b');
    expect(below.map(([x, y]) => [x, +(y - upperH).toFixed(2)])).toEqual(lowerTop);
    // The region is drawn from exactly those curves: its own along the top, the next row's along the bottom.
    const region = bandRegion(w, upperH, 'a', 'b');
    const [x0, y0] = bandCurve(0, w, 'a')[0];
    expect(region.startsWith(`M ${x0},${y0}`)).toBe(true);
    const [bx, by] = below.at(-1)!;
    expect(region).toContain(` L ${bx},${by}`);
    expect(region.endsWith(' Z')).toBe(true);
  });

  it('seed each curve by the key of the row below it, never its place: a row arriving on top moves no other curve', () => {
    const before = ['n3', 'n2', 'n1'];
    const after = ['n4', ...before];
    const under = (keys: string[]) => Object.fromEntries(keys.map((k, i) => [k, bandsBelow(keys, 'part:week')[i]]));
    expect(under(after)).toMatchObject(under(before));
    expect(under(after).n4).toBe('n3');
    // The list's last row ends on the list's end; the one over a part's title on that title.
    expect(bandsBelow(before, BAND_END_KEY).at(-1)).toBe(BAND_END_KEY);
    expect(bandsBelow([], BAND_END_KEY)).toEqual([]);
    // Two keys, two curves: the seed is the key's.
    expect(bandCurve(0, 390, 'n1')).toEqual(rowBoundary(0, 390, seedFromString('n1'), 2, 0, 4));
    expect(bandCurve(0, 390, 'n1')).not.toEqual(bandCurve(0, 390, 'n2'));
  });

  it('swing the curves at most BAND_AMP about the row’s edges, flat at both ends of the band', () => {
    for (const key of ['a', 'b', 'c', 'conversation-xyz']) {
      const pts = bandCurve(30, 820, key);
      // (the first and last points are the ends again: a band draws no overshoot of its own)
      expect(pts[1]).toEqual([0, 30]);
      expect(pts.at(-2)).toEqual([820, 30]);
      expect(pts.at(-1)).toEqual([820, 30]);
      for (const [, y] of pts) expect(Math.abs(y - 30)).toBeLessThanOrEqual(BAND_AMP);
    }
  });
});

describe('translatePath', () => {
  it('moves every x,y pair of an absolute path', () => {
    expect(translatePath('M 0,25.16 C 0,11.27 13.89,0 31.01,-0.45 L 300,2 Z', 10, -24)).toBe(
      'M 10,1.16 C 10,-12.73 23.89,-24 41.01,-24.45 L 310,-22 Z',
    );
    expect(translatePath('M 1,2 L 3,4', 0, 0)).toBe('M 1,2 L 3,4');
  });
});
