import { describe, expect, it } from 'vitest';
import { autoCurve, fieldCurve, TALL_FIELD, TALL_FIELD_CURVE } from './wobAuto';

describe('fieldCurve', () => {
  it('leaves a one-line field the bow its size gives', () => {
    expect(fieldCurve(320, 48)).toBe(autoCurve(320, 48));
    expect(fieldCurve(320, TALL_FIELD - 1)).toBe(autoCurve(320, TALL_FIELD - 1));
  });

  it('calms a box taller than a line, still bowing', () => {
    // The note box: 4 lines, about 120 tall — a button's bow (1.44) before.
    expect(autoCurve(330, 120)).toBeGreaterThan(1.4);
    expect(fieldCurve(330, 120)).toBe(TALL_FIELD_CURVE);
    expect(fieldCurve(330, TALL_FIELD)).toBe(TALL_FIELD_CURVE);
    // A box big enough to bow less than that already keeps its own.
    expect(fieldCurve(600, 400)).toBe(autoCurve(600, 400));
  });
});
