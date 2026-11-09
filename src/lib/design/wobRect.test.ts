import { describe, it, expect } from 'vitest';
import { edgeDraws, wobAmp, wobRect } from './wobRect';

// wobRect generates the wobbly card/border outlines. It must be deterministic
// per seed (SSR/CSR parity) and always emit a well-formed, closed SVG path.
const PATH = /^M [\d.,\s-]+/;

describe('wobRect', () => {
  it('returns a closed path that starts with a moveto and ends with Z', () => {
    const d = wobRect(200, 120, 16, 1);
    expect(d).toMatch(PATH);
    expect(d.trim().endsWith('Z')).toBe(true);
    expect(d).toContain('C'); // contains cubic bezier segments
  });

  it('is deterministic for a given seed', () => {
    expect(wobRect(200, 120, 16, 99)).toBe(wobRect(200, 120, 16, 99));
  });

  it('changes the path when the seed changes', () => {
    expect(wobRect(200, 120, 16, 1)).not.toBe(wobRect(200, 120, 16, 2));
  });

  it('emits only finite numeric coordinates (no NaN/Infinity leaking in)', () => {
    const d = wobRect(300, 80, 24, 5, undefined, {
      curve: 1.5,
      cornerJitter: 1,
      cornerOffset: 4,
      segmentsH: [2, 5],
      segmentsV: 3,
    });
    const numbers = d.match(/-?\d+(\.\d+)?/g) ?? [];
    expect(numbers.length).toBeGreaterThan(0);
    for (const n of numbers) {
      expect(Number.isFinite(Number(n))).toBe(true);
    }
  });

  it('produces more segments for a higher segment count', () => {
    const few = wobRect(400, 400, 20, 3, 6, { segmentsH: 2, segmentsV: 2 });
    const many = wobRect(400, 400, 20, 3, 6, { segmentsH: 8, segmentsV: 8 });
    const count = (s: string) => (s.match(/C/g) ?? []).length;
    expect(count(many)).toBeGreaterThan(count(few));
  });

  // Round 23: a shape that grows from a resting height (the chat composer) keeps its foot and corners — only its
  // sides take the growth — and is the plain shape at that height.
  it('grows a steady shape by its sides alone, and is the plain one at its resting height', () => {
    const W = 300;
    const rest = 48;
    const amp = wobAmp(W, rest, 2.6, 1.6);
    const steady = { ampX: amp, draws: edgeDraws(rest - 32, 2, amp) };
    const draw = (H: number, segV: number) => wobRect(W, H, 16, 7, 2.6, { segmentsH: 3, segmentsV: segV, curve: 1.6, steady });
    expect(draw(rest, 2)).toBe(wobRect(W, rest, 16, 7, 2.6, { segmentsH: 3, segmentsV: 2, curve: 1.6 }));
    const cubics = (d: string) => d.split(' C ').slice(1).map((c) => c.split(' ').map((p) => p.split(',').map(Number)));
    const restC = cubics(draw(rest, 2));
    const tall = 220;
    const tallC = cubics(draw(tall, 4));
    // TL corner + 3 top + TR corner: the same points.
    expect(tallC.slice(0, 5)).toEqual(restC.slice(0, 5));
    // BR corner + 3 bottom + BL corner: the same points, moved down by the growth.
    const footRest = restC.slice(5 + 2, 5 + 2 + 5);
    const footTall = tallC.slice(5 + 4, 5 + 4 + 5).map((c) => c.map(([x, y]) => [x, +(y - (tall - rest)).toFixed(2)]));
    expect(footTall).toEqual(footRest);
  });

  it('counts what an edge takes of the stream: nothing for a straight one', () => {
    expect(edgeDraws(100, 1, 2)).toBe(0);
    expect(edgeDraws(6, 3, 2)).toBe(0);
    expect(edgeDraws(100, 3, 2)).toBe(4);
  });
});
