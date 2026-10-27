import { describe, expect, it } from 'vitest';
import { wobRect } from '@/lib/design/wobRect';
import { flattenPath } from './svgPath';

const near = (a: readonly number[], b: readonly number[], eps = 0.01) => Math.hypot(a[0] - b[0], a[1] - b[1]) < eps;

describe('flattenPath', () => {
  it('walks lines and curves, absolute and relative, about every step along them', () => {
    const pts = flattenPath('M 0,0 L 100,0 l 0,50 H 0 v -50', 10);
    expect(pts).not.toBeNull();
    const p = pts as [number, number][];
    expect(p[0]).toEqual([0, 0]);
    expect(p).toContainEqual([100, 0]);
    expect(p).toContainEqual([100, 50]);
    expect(p).toContainEqual([0, 50]);
    expect(p[p.length - 1]).toEqual([0, 0]);
    // 300 units of outline at 10: thirty steps, give or take the corners
    expect(p.length).toBeGreaterThanOrEqual(30);
    expect(p.length).toBeLessThan(36);
    for (let i = 1; i < p.length; i++) expect(Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1])).toBeLessThanOrEqual(10.01);
  });

  it('follows a cubic through its control points, its smooth twin reflecting them, and closes the shape', () => {
    const p = flattenPath('M0 0C0 50 100 50 100 0S200 -50 200 0Z', 4) as [number, number][];
    // the first curve's middle is 37.5 down; the S mirrors it upward
    const mid1 = p.reduce((a, b) => (Math.abs(b[0] - 50) < Math.abs(a[0] - 50) ? b : a));
    const mid2 = p.reduce((a, b) => (Math.abs(b[0] - 150) < Math.abs(a[0] - 150) && b[1] < 0 ? b : a));
    expect(mid1[1]).toBeCloseTo(37.5, 0);
    expect(mid2[1]).toBeCloseTo(-37.5, 0);
    expect(near(p[p.length - 1], [0, 0])).toBe(true);   // Z: back to the start
  });

  it('reads quadratics (and T), implicit linetos after a moveto, and numbers run together', () => {
    const q = flattenPath('M0,0Q50,100 100,0T200,0', 5) as [number, number][];
    expect(q.find(pt => near(pt, [50, 50], 3))).toBeDefined();   // the Q's middle: halfway to its control point
    expect(q.find(pt => near(pt, [150, -50], 3))).toBeDefined();   // the T mirrors it
    expect(q.every(pt => pt[1] <= 50.01 && pt[1] >= -50.01)).toBe(true);
    const m = flattenPath('M0-10 10-10 .5.5', 100) as [number, number][];
    expect(m).toEqual([[0, -10], [10, -10], [0.5, 0.5]]);
  });

  it('reads the site’s own hand-drawn outline exactly where the browser would draw it', () => {
    const d = wobRect(384, 520, 18, 7);
    const p = flattenPath(d, 4) as [number, number][];
    expect(p.length).toBeGreaterThan(400);
    const xs = p.map(q => q[0]);
    const ys = p.map(q => q[1]);
    expect(Math.min(...xs)).toBeGreaterThan(-12);
    expect(Math.max(...xs)).toBeLessThan(384 + 12);
    expect(Math.min(...ys)).toBeGreaterThan(-12);
    expect(Math.max(...ys)).toBeLessThan(520 + 12);
  });

  it('keeps to its cap, stepping a long path more coarsely', () => {
    expect((flattenPath('M0 0L100000 0', 1, 500) as unknown[]).length).toBeLessThanOrEqual(501);
  });

  it('leaves an arc, or anything it cannot read, to the browser', () => {
    for (const d of ['M0 0A10 10 0 0 1 20 0', 'M0 0 L10', 'L10 10', 'M0 0 Z 5 5', 'M0 0 X 1 2', 'M0 0 L1e400 0']) {
      expect(flattenPath(d, 4), d).toBeNull();
    }
  });
});
