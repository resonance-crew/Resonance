import { describe, expect, it } from 'vitest';
import { LIGHT_STEPS, PAPER_KEYS, deltaE, isSceneryPaint, lightAt, oklabOfSrgb, parseOklch, shownPaints } from './light';
import { hourAt, paletteAt, srgb, type LCH } from './palette';
import { FILM_END } from './timeline';

/**
 * §A (round 25): the film's light runs continuously. At every frame of the film at 60 fps, for every scenery paint,
 * what the screen shows — the two keys composited in sRGB at the upper one's opacity — is within ΔE(OK) 0.005 of the
 * exact hour's colour, and no paint moves more than 0.006 from one frame to the next. (Main stepped the light every
 * twelfth of an hour and the planes' paper every quarter through a change: 0.02 a step at rest, up to 0.06 in a
 * change.)
 */

const encoded = (v: string) => srgb(parseOklch(v));
/** What a pixel shows: the upper paint at `mix` over the lower one — opacity composites the encoded values. */
function shown({ a, b, mix }: { a: string; b: string; mix: number }): LCH {
  const lo = encoded(a);
  const hi = encoded(b);
  return oklabOfSrgb(lo.map((v, i) => v + (hi[i] - v) * mix) as LCH);
}
const exact = (v: string) => oklabOfSrgb(encoded(v));

const FRAMES = Math.ceil(FILM_END * 60);

describe.each([false, true])('the light along the film (dark scheme %s)', (dim) => {
  // one pass over the film, kept for the assertions below
  let worstOff = { d: 0, k: '', s: 0 };
  let worstStep = { d: 0, k: '', s: 0 };
  let prev: Record<string, LCH> | null = null;
  for (let i = 0; i <= FRAMES; i++) {
    const s = Math.min(FILM_END, i / 60);
    const hour = hourAt(s);
    const want = paletteAt(hour, { dim });
    const now: Record<string, LCH> = {};
    for (const [k, v] of Object.entries(shownPaints(hour, { dim }))) {
      const c = shown(v);
      now[k] = c;
      const off = deltaE(c, exact(want[k]));
      if (off > worstOff.d) worstOff = { d: off, k, s };
      const was = prev?.[k];
      if (was) {
        const step = deltaE(c, was);
        if (step > worstStep.d) worstStep = { d: step, k, s };
      }
    }
    prev = now;
  }

  it('shows every scenery paint within ΔE(OK) 0.005 of the exact hour, at every frame', () => {
    expect(worstOff.d, `${worstOff.k} at s ${worstOff.s.toFixed(3)}`).toBeLessThan(0.005);
  });

  it('never moves a paint more than 0.006 from one frame to the next', () => {
    expect(worstStep.d, `${worstStep.k} at s ${worstStep.s.toFixed(3)}`).toBeLessThan(0.006);
  });
});

describe('what the director is told', () => {
  it('covers every colour of the world, and leaves the chrome’s ink and the numbers out', () => {
    const keys = Object.keys(shownPaints(12));
    const all = Object.keys(paletteAt(12));
    expect(keys).toEqual(all.filter(isSceneryPaint));
    expect(keys).toContain('--film-sky-0');
    expect(keys).toContain('--film-c-ground');
    expect(keys.some((k) => k.startsWith('--film-chrome'))).toBe(false);
  });

  it('writes the light at most 1/120 of an hour stale, and the paper between keys 1/12 apart', () => {
    for (const hour of [5.33, 6.2, 8.0417, 16.74, 21.99]) {
      const at = lightAt(hour);
      expect(hour - at.light).toBeGreaterThanOrEqual(0);
      expect(hour - at.light).toBeLessThan(1 / LIGHT_STEPS + 1e-9);
      expect(at.paper.hi - at.paper.lo).toBeCloseTo(1 / PAPER_KEYS, 9);
      expect(at.paper.lo + at.paper.mix / PAPER_KEYS).toBeCloseTo(hour, 9);
    }
    // the golden hour into the sunset (the paper's long hue sweep): its twelfths cut in two
    for (const hour of [16.52, 16.6]) {
      const at = lightAt(hour);
      expect(at.paper.hi - at.paper.lo).toBeCloseTo(1 / (2 * PAPER_KEYS), 9);
      expect(at.paper.lo + (at.paper.mix * (at.paper.hi - at.paper.lo))).toBeCloseTo(hour, 9);
    }
  });

  it('at rest (the stills) gives the exact hour whole: no upper paint half-faded', () => {
    const at = lightAt(17.23, true);
    expect(at).toEqual({ light: 17.23, paper: { lo: 17.23, hi: 17.23, mix: 0 } });
    const want = paletteAt(17.23);
    for (const [k, v] of Object.entries(shownPaints(17.23, { rest: true }))) {
      expect(v.mix).toBe(0);
      expect(v.a, k).toBe(want[k]);
    }
  });
});
