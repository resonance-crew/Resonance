import { describe, expect, it } from 'vitest';
import { compactPath, fmt } from './compact';
import { path, tear, ellipse, ribbon, rng, type Pt } from './geom';
import { fringeArt, placeArt } from './world';

/** Every point a path visits (ends and control points), absolute, by an independent reading of its data. */
function points(d: string): number[][] {
  const t = d.match(/[a-zA-Z]|[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi)!;
  const out: number[][] = [];
  let i = 0;
  let c = '';
  let x = 0;
  let y = 0;
  let sx = 0;
  let sy = 0;
  const n = () => Number(t[i++]);
  while (i < t.length) {
    if (/[a-z]/i.test(t[i])) c = t[i++];
    const r = c === c.toLowerCase();
    switch (c.toUpperCase()) {
      case 'M': {
        const a = n();
        const b = n();
        x = r ? x + a : a;
        y = r ? y + b : b;
        sx = x;
        sy = y;
        out.push([x, y]);
        c = r ? 'l' : 'L';
        break;
      }
      case 'L': {
        const a = n();
        const b = n();
        x = r ? x + a : a;
        y = r ? y + b : b;
        out.push([x, y]);
        break;
      }
      case 'H':
        x = r ? x + n() : n();
        out.push([x, y]);
        break;
      case 'V':
        y = r ? y + n() : n();
        out.push([x, y]);
        break;
      case 'Q': {
        const [a, b, e, f] = [n(), n(), n(), n()];
        out.push([r ? x + a : a, r ? y + b : b]);
        x = r ? x + e : e;
        y = r ? y + f : f;
        out.push([x, y]);
        break;
      }
      case 'A': {
        const [rx, ry, rot, la, sw, e, f] = [n(), n(), n(), n(), n(), n(), n()];
        x = r ? x + e : e;
        y = r ? y + f : f;
        out.push([rx, ry, rot, la, sw, x, y]);
        break;
      }
      case 'Z':
        x = sx;
        y = sy;
        out.push(['z' as unknown as number]);
        break;
      default:
        throw new Error(`command ${c}`);
    }
  }
  return out;
}

const same = (a: string, b: string) => {
  const p = points(a);
  const q = points(b);
  expect(q.length).toBe(p.length);
  p.forEach((pt, i) => pt.forEach((v, j) => (typeof v === 'number' ? expect(Math.abs(q[i][j] - v)).toBeLessThanOrEqual(0.051) : expect(q[i][j]).toBe(v))));
};

describe('compacting path data', () => {
  it('writes numbers to a tenth, as short as they go', () => {
    expect(fmt(0.04)).toBe('0');
    expect(fmt(-0.04)).toBe('0');
    expect(fmt(0.5)).toBe('.5');
    expect(fmt(-0.5)).toBe('-.5');
    expect(fmt(12.34)).toBe('12.3');
    expect(fmt(-300)).toBe('-300');
  });

  it('keeps every point of every kind of path the world draws, to a tenth, and makes them shorter', () => {
    const r = rng(3);
    const samples = [
      'M-300,772L-295,771L-289,770L-283,769Z',
      'M-291.0,831.4Q-290.3,828.7 -290.6,826.9Q-289.4,829.4 -288.1,831.4ZM-28,10h12v7h-12Z',
      'M1404,476a11,11 0 1 0 22,0a11,11 0 1 0 -22,0Z',
      'M10 10 L20 20 30 10 M40 40 l5 -5 5 5 z m3 3 h2 v2 H1 V0',
      path(tear(ellipse(0, 0, 100, 60, 64), 312, { jag: 1.2, wander: 5 }), true, 0),
      path(tear(ribbon([0, 1, 2, 3, 4].map((k): Pt => [k * 40 + r(), 50 + r() * 4]), 12, 0.3), 9, { jag: 1, wander: 2 }), true, 1),
      fringeArt('left'),
    ];
    for (const d of samples) {
      const c = compactPath(d);
      same(d, c);
      expect(c.length).toBeLessThanOrEqual(d.length);
    }
  });

  it('keeps the whole world (every part of every place), a third shorter or more', () => {
    let before = 0;
    let after = 0;
    for (const place of ['home', 'journey', 'valley', 'valleyT'] as const)
      for (const plane of placeArt(place).planes)
        for (const p of plane.parts) {
          if (!p.d) continue;
          const c = compactPath(p.d);
          same(p.d, c);
          before += p.d.length;
          after += c.length;
        }
    expect(after).toBeLessThan(before * 0.67);
  });

  it('leaves a path it does not read exactly as it was', () => {
    expect(compactPath('M0 0C1 2 3 4 5 6')).toBe('M0 0C1 2 3 4 5 6');
  });
});
