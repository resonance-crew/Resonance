import { describe, expect, it } from 'vitest';
import { wavyLine } from '@/lib/design/wavyPath';
import { PROGRESS_LINE, progressLineY } from './progressLine';

describe("the progress line's own curve", () => {
  const { width, seed, amp, steps } = PROGRESS_LINE;
  // wavyLine's knots, read back from the path it draws: "M x,y C … x,y C … x,y"
  const knots = [...wavyLine(width, seed, amp, steps).matchAll(/(?:M|C[^C]*?)\s*(-?[\d.]+),(-?[\d.]+)(?=\s*C|$)/g)].map((m) => [Number(m[1]), Number(m[2])]);

  it('passes through every knot of the pen line the player draws, so the dot rides the line', () => {
    expect(knots).toHaveLength(steps + 1);
    for (const [x, y] of knots) expect(progressLineY(x / width)).toBeCloseTo(y, 1);
    expect(progressLineY(0)).toBe(0);
    expect(progressLineY(1)).toBe(0);
  });

  it('is the cubic between two knots too (level handles a third of a step long), and never leaves the line\'s band', () => {
    // halfway along a step, such a cubic is halfway between its knots
    for (let i = 0; i < steps; i++) expect(progressLineY((i + 0.5) / steps)).toBeCloseTo((knots[i][1] + knots[i + 1][1]) / 2, 1);
    for (let f = -0.2; f <= 1.2; f += 0.013) expect(Math.abs(progressLineY(f))).toBeLessThanOrEqual(amp);
    // it does wave: a dot on a level rail would miss it by more than a pen's width somewhere
    expect(Math.max(...knots.map(([, y]) => Math.abs(y)))).toBeGreaterThan(1);
  });
});
