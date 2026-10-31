import { describe, expect, it } from 'vitest';
import { bandClipPath, edgePoints, type EdgeSpec } from './sectionEdge';

const SPEC: EdgeSpec = { seed: 443, height: 80, amplitude: 0.14, steps: 14 };

const swell = (pts: [number, number][]) => Math.max(...pts.map(([, y]) => Math.abs(y - 80 * 0.78)));

describe('the wave between bands', () => {
  it('takes its turns at full width, fewer and gentler on a narrower screen', () => {
    expect(edgePoints(SPEC, null)).toHaveLength(15);
    expect(edgePoints(SPEC, 1440)).toEqual(edgePoints(SPEC, null));
    expect(edgePoints(SPEC, 820)).toHaveLength(9);
    expect(edgePoints(SPEC, 390)).toHaveLength(5);
    // a phone's swell is at most 55 % of the full one
    expect(swell(edgePoints(SPEC, 390))).toBeLessThanOrEqual(80 * 0.14 * 0.55 + 1e-9);
    expect(swell(edgePoints(SPEC, 1440))).toBeGreaterThan(80 * 0.14 * 0.55);
  });

  it("clips a band's blobs to the paper between its own wave and the next band's", () => {
    const d = bandClipPath(SPEC, { ...SPEC, seed: 472 }, 390, 900);
    const nums = (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
    const xs = nums.filter((_, i) => i % 2 === 0);
    const ys = nums.filter((_, i) => i % 2 === 1);
    expect(d.startsWith('M 0,')).toBe(true);
    expect(d.endsWith('Z')).toBe(true);
    expect(Math.min(...xs)).toBe(0);
    expect(Math.max(...xs)).toBe(390);
    // from about the band's own wave to about the next one's, 900 px further down
    expect(Math.min(...ys)).toBeGreaterThan(80 * 0.78 - 80 * 0.14 - 1);
    expect(Math.max(...ys)).toBeGreaterThan(900 + 50);
    expect(Math.max(...ys)).toBeLessThan(900 + 80);
    // the page's first band has nothing above
    expect(bandClipPath(null, SPEC, 390, 900)).toContain('-2000');
  });
});
