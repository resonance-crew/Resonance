import { describe, expect, it } from 'vitest';
import { M, changeMoves, heldLift, inFlat, isBackdrop, outFlat, reachOf, win, type PlaneSpec } from './parallax';

/** A place's planes as a phone sees them at rest (tops and feet in stage heights). */
const PLANES: PlaneSpec[] = [
  { depth: 0.08, top: 0.42, bottom: 1.16 },
  { depth: 0.2, top: 0.55, bottom: 1.16 },
  { depth: 0.27, top: 0.62, bottom: 1.16 },
  { depth: 0.34, top: 0.58, bottom: 0.66 },
  { depth: 0.5, top: 0.63, bottom: 0.83 },
  { depth: 0.66, top: 0.69, bottom: 1.02 },
  { depth: 0.82, top: 0.44, bottom: 1.03 },
  { depth: 1, top: 0.86, bottom: 1.19 },
];

describe('the scene change', () => {
  it('starts and ends at rest: the old place in place at p = 0, the new one at p = 1', () => {
    const at0 = changeMoves(0, PLANES, PLANES);
    for (const m of at0.old) expect(m).toEqual({ y: -0, alpha: 1 });
    expect(changeMoves(0.4, PLANES, PLANES).old[0].alpha).toBe(0);
    at0.new.forEach((m, i) => {
      if (isBackdrop(PLANES[i].depth)) expect(m.alpha).toBe(0);
      else expect(PLANES[i].top + m.y).toBeGreaterThanOrEqual(1); // still below the stage
    });
    const at1 = changeMoves(1, PLANES, PLANES);
    for (const m of at1.new) expect(m).toEqual({ y: 0, alpha: 1 });
  });

  it('flies every old flat off the stage by the end (its torn foot too)', () => {
    const at1 = changeMoves(1, PLANES, PLANES);
    at1.old.forEach((m, i) => {
      if (!isBackdrop(PLANES[i].depth)) expect(PLANES[i].bottom + m.y).toBeLessThanOrEqual(0);
    });
  });

  it('moves the near flats first and fastest, and lands the near ones last', () => {
    expect(win(1)).toBeCloseTo(0.35);
    expect(win(0.35)).toBeCloseTo(0.7);
    expect(outFlat(1, 0.2)).toBeLessThan(outFlat(0.5, 0.2));
    expect(inFlat(0.5, 0.6)).toBeLessThan(inFlat(1, 0.6));
    expect(reachOf({ depth: 1, top: 0.9, bottom: 1.19 })).toBeCloseTo(1.23);
    expect(reachOf({ depth: 0.5, top: 0.6, bottom: 0.8 })).toBe(1 + M);
  });

  it('never shows sky under the ground: below the town line every row is paper at every p (a rising flat wears its apron)', () => {
    for (let p = 0; p <= 1.0001; p += 0.02) {
      const m = changeMoves(p, PLANES, PLANES);
      const covers = [
        ...m.old.map((x, i) => [x, PLANES[i], false] as const),
        ...m.new.map((x, i) => [x, PLANES[i], true] as const),
      ]
        .filter(([x]) => x.alpha >= 1)
        .map(([x, pl, rising]) => [pl.top + x.y, rising && !isBackdrop(pl.depth) ? Infinity : pl.bottom + x.y]);
      for (let f = 0.7; f <= 1; f += 0.01) expect(covers.some(([a, b]) => a <= f && b >= f), `p ${p.toFixed(2)} row ${f.toFixed(2)}`).toBe(true);
    }
  });

  it('shows one set of landmarks at a time: the old backdrop is gone before the new one comes', () => {
    for (let p = 0; p <= 1.0001; p += 0.02) {
      const m = changeMoves(p, PLANES, PLANES);
      const oldA = m.old[0].alpha;
      const newA = m.new[0].alpha;
      expect(Math.min(oldA, newA), `p ${p.toFixed(2)}`).toBeLessThanOrEqual(0.02);
    }
  });

  it('lets the held cards lift a little mid-change and come back', () => {
    expect(heldLift(0)).toBe(0);
    expect(heldLift(0.5)).toBeCloseTo(0.06);
    expect(heldLift(1)).toBeCloseTo(0, 6);
  });
});
