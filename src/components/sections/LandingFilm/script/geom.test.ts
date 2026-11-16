import { describe, expect, it } from 'vitest';
import { woundAlike } from './geom';

/** A path's cuts by their corners (a curve by its ends), and which way each goes round (> 0: clockwise on the screen). */
function areas(d: string): number[] {
  const out: number[] = [];
  let x = 0;
  let y = 0;
  for (const cut of d.match(/[Mm][^Mm]*/g) ?? []) {
    const pts: [number, number][] = [];
    for (const m of cut.matchAll(/([A-Za-z])([^A-Za-z]*)/g)) {
      const n = (m[2].match(/-?\d*\.?\d+/g) ?? []).map(Number);
      const rel = m[1] === m[1].toLowerCase();
      const up = m[1].toUpperCase();
      if (up === 'M' || up === 'L') for (let i = 0; i + 1 < n.length; i += 2) pts.push(([x, y] = rel ? [x + n[i], y + n[i + 1]] : [n[i], n[i + 1]]));
      else if (up === 'H') for (const v of n) pts.push([(x = rel ? x + v : v), y]);
      else if (up === 'V') for (const v of n) pts.push([x, (y = rel ? y + v : v)]);
      else if (up === 'Q') for (let i = 0; i + 3 < n.length; i += 4) pts.push(([x, y] = rel ? [x + n[i + 2], y + n[i + 3]] : [n[i + 2], n[i + 3]]));
    }
    out.push(pts.reduce((a, p, i) => a + p[0] * pts[(i + 1) % pts.length][1] - pts[(i + 1) % pts.length][0] * p[1], 0) / 2);
  }
  return out;
}

describe('woundAlike: the cuts of a path all wound one way', () => {
  it('keeps a path already wound that way exactly as written', () => {
    const d = 'M0,0L10,0L10,10L0,10ZM20,0h5V8H20Z';
    expect(areas(d)).toEqual([100, 40]);
    expect(woundAlike(d)).toBe(d);
  });

  it('writes a cut wound the other way backwards: the same corners, the other way round', () => {
    const d = 'M0,0L0,10L10,10L10,0ZM20,0L30,0L30,10L20,10Z';
    expect(areas(d)).toEqual([-100, 100]);
    const out = woundAlike(d);
    expect(areas(out)).toEqual([100, 100]);
    expect(out).toBe('M10,0L10,10L0,10L0,0ZM20,0L30,0L30,10L20,10Z');
  });

  it('turns a curved blade round with its curves: each control point stays between the same two corners', () => {
    // a blade of grass drawn right to left
    const d = 'M3,10Q2.5,4 1,0Q0.5,5 0,10Z';
    expect(areas(d)[0]).toBeLessThan(0);
    const out = woundAlike(d);
    expect(out).toBe('M0,10Q0.5,5 1,0Q2.5,4 3,10Z');
    expect(areas(out)[0]).toBeGreaterThan(0);
  });

  it('follows relative steps, and refuses a command the paper is not cut with', () => {
    const d = 'M0,0v10h10v-10Z';
    expect(areas(d)).toEqual([-100]);
    expect(areas(woundAlike(d))).toEqual([100]);
    expect(() => woundAlike('M0,0A5,5 0 1 0 10,0Z')).toThrow(/not cut with/);
  });
});
