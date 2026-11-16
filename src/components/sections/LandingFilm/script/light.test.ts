import { describe, expect, it } from 'vitest';
import { hourOf } from './changes/flats';
import { FOLD_LEAD, LIGHT_STEP, LIGHT_STEPS, LIGHT_VAR, MAIN_STEP_AT_REST, MAIN_STEP_IN_CHANGE, PAPER_KEYS, UNFOLD_AFTER, deltaE, flatKey, restAt, isSceneryPaint, lightAt, oklabOfSrgb, parseOklch, shownPaints } from './light';
import { hourAt, paletteAt, srgb, type LCH } from './palette';
import { FILM_END, SEG, changeAt, lerp } from './timeline';
import type { ChangeN } from './changes/types';

/**
 * §A (round 25, the owner: 「这些圆这些卡片它都是一节一节慢慢变暗或是变亮」): what the director draws, frame by frame, at
 * 60 fps along the whole film, the hour as the director turns it (through a change, as far as the default change
 * style has turned it — flats.ts `hourOf`, eased, so faster than the film's own pace mid-change).
 *
 * - While a scene is at rest (`restAt`) the planes' paper — the hills, the sea, the town, the trees' round canopies,
 *   every paint but the light's — is the two keys composited in sRGB at the upper one's opacity: within ΔE(OK) 0.005 of
 *   the exact hour at every frame, and from one frame to the next no more than the exact hour moves plus 0.0015. Main
 *   stepped it every twelfth of an hour: 0.021 a step (MAIN_STEP_AT_REST).
 * - Through a scene change (and FOLD_LEAD / UNFOLD_AFTER around it) it is drawn as main draws it; its steps are main's
 *   own (stated below, and held on the director's drawing by runtime/director.test.tsx, the seams too).
 * - The light (LIGHT_VAR: the sky, the disc, the halo, the clouds, the birds, the wind) still steps every twelfth of an
 *   hour, as on main: written finer it repaints the sky over the whole viewport on nearly every frame of a change, which
 *   costs headed WebKit half its frames. Its own bound below is what that step measures, so it can only stay or shrink.
 */

const encoded = (v: string) => srgb(parseOklch(v));
/** What a pixel shows: the upper paint at `mix` over the lower one — opacity composites the encoded values. */
function shown({ a, b, mix }: { a: string; b: string; mix: number }): LCH {
  const lo = encoded(a);
  const hi = encoded(b);
  return oklabOfSrgb(lo.map((v, i) => v + (hi[i] - v) * mix) as LCH);
}
const exact = (v: string) => oklabOfSrgb(encoded(v));

/** The hour the director draws at film time s (runtime/director.ts `hourS`, with the default change style). */
function hourDrawn(s: number): number {
  const ch = changeAt(s);
  return hourAt(ch ? lerp(ch.seg.t0, ch.seg.t1, hourOf(ch.from as ChangeN, ch.p)) : s);
}

const FRAMES = Math.ceil(FILM_END * 60);

describe.each([false, true])('the light along the film (dark scheme %s)', (dim) => {
  // one pass over the film, kept for the assertions below
  const worst = {
    paperOff: { d: 0, k: '', s: 0 },
    paperStep: { d: 0, k: '', s: 0 },
    paperOwn: { d: 0, k: '', s: 0 },
    lightOff: { d: 0, k: '', s: 0 },
    lightStep: { d: 0, k: '', s: 0 },
  };
  const keep = (w: { d: number; k: string; s: number }, d: number, k: string, s: number) => {
    if (d > w.d) Object.assign(w, { d, k, s });
  };
  let prev: Record<string, LCH> | null = null;
  let prevExact: Record<string, LCH> | null = null;
  for (let i = 0; i <= FRAMES; i++) {
    const s = Math.min(FILM_END, i / 60);
    const hour = hourDrawn(s);
    const want = paletteAt(hour, { dim });
    const now: Record<string, LCH> = {};
    const nowExact: Record<string, LCH> = {};
    const rest = restAt(s) && restAt(s - 1 / 60);
    for (const [k, v] of Object.entries(shownPaints(hour, { dim }))) {
      const c = shown(v);
      now[k] = c;
      nowExact[k] = exact(want[k]);
      const light = LIGHT_VAR.test(k);
      if (!light && !rest) continue;
      keep(light ? worst.lightOff : worst.paperOff, deltaE(c, nowExact[k]), k, s);
      const was = prev?.[k];
      if (!was || !prevExact) continue;
      const step = deltaE(c, was);
      keep(light ? worst.lightStep : worst.paperStep, step, k, s);
      // how much more than the exact hour itself moves this frame (the hour runs fastest early in c2)
      if (!light) keep(worst.paperOwn, step - deltaE(nowExact[k], prevExact[k]), k, s);
    }
    prev = now;
    prevExact = nowExact;
  }
  const at = (w: { k: string; s: number }) => `${w.k} at s ${w.s.toFixed(3)}`;

  it('shows the planes’ paper within ΔE(OK) 0.005 of the exact hour, at every frame at rest', () => {
    expect(worst.paperOff.d, at(worst.paperOff)).toBeLessThan(0.005);
  });

  it('moves the planes’ paper from one frame to the next no more than the exact hour does: no step of its own', () => {
    // at rest under 0.006 a frame, as the spec asks, and within 0.0015 of the exact hour's own motion (the sRGB mix of
    // two keys is a little off a straight path in OKLab)
    expect(worst.paperOwn.d, at(worst.paperOwn)).toBeLessThan(0.0015);
    expect(worst.paperStep.d, at(worst.paperStep)).toBeLessThan(0.006);
  });

  it('steps the light no more than a twelfth of an hour’s change, as main did', () => {
    expect(worst.lightStep.d, at(worst.lightStep)).toBeLessThan(LIGHT_STEP);
    expect(worst.lightOff.d, at(worst.lightOff)).toBeLessThan(LIGHT_STEP);
    // (and it does step: were it continuous, this test would hold it to the paper's bounds instead)
    expect(worst.lightStep.d).toBeGreaterThan(0.006);
  });
});

describe('what the director is told', () => {
  it('covers every colour of the world, and leaves the chrome’s ink and the numbers out', () => {
    const keys = Object.keys(shownPaints(12));
    const all = Object.keys(paletteAt(12));
    expect(keys).toEqual(all.filter(isSceneryPaint));
    expect(keys).toContain('--film-sky-0');
    expect(keys).toContain('--film-c-ground');
    expect(keys).toContain('--film-c-canopy');
    expect(keys.some((k) => k.startsWith('--film-chrome'))).toBe(false);
  });

  it('writes the light every twelfth of an hour, and the paper between keys 1/12 apart', () => {
    for (const hour of [5.33, 6.2, 8.0417, 16.74, 21.99]) {
      const at = lightAt(hour);
      expect(hour - at.light).toBeGreaterThanOrEqual(0);
      expect(hour - at.light).toBeLessThan(1 / LIGHT_STEPS + 1e-9);
      expect(at.light * LIGHT_STEPS).toBeCloseTo(Math.round(at.light * LIGHT_STEPS), 9);
      expect(at.paper.hi - at.paper.lo).toBeCloseTo(1 / PAPER_KEYS, 9);
      expect(at.paper.lo + at.paper.mix / PAPER_KEYS).toBeCloseTo(hour, 9);
    }
    // the golden hour into the sunset (the paper's long hue sweep): its twelfths cut in two
    for (const hour of [16.52, 16.6]) {
      const at = lightAt(hour);
      expect(at.paper.hi - at.paper.lo).toBeCloseTo(1 / (2 * PAPER_KEYS), 9);
      expect(at.paper.lo + at.paper.mix * (at.paper.hi - at.paper.lo)).toBeCloseTo(hour, 9);
    }
  });

  it('in the stills (?rest=1, the capture screens) draws as main does: the paper whole at its twelfth, the light at its step', () => {
    const at = lightAt(17.23, { rest: true });
    const key = Math.floor(17.23 * 12) / 12;
    expect(at.light).toBeCloseTo(key, 12);
    expect(at.paper.lo).toBeCloseTo(key, 12);
    expect(at.paper.hi).toBeCloseTo(key, 12);
    expect(at.paper.mix).toBe(0);
    // (the first frame, which the landing screen captures: main drew 5.25 for the film's 5.33, and so does this)
    expect(lightAt(hourAt(0), { rest: true }).paper.lo).toBe(5.25);
    const want = paletteAt(key);
    for (const [k, v] of Object.entries(shownPaints(17.23, { rest: true }))) {
      expect(v.mix).toBe(0);
      expect(v.a, k).toBe(want[k]);
      expect(v.b, k).toBe(want[k]);
    }
  });

  it('held still (paused) gives the paper whole at the exact hour, and leaves the light on its step', () => {
    const at = lightAt(17.23, { still: true });
    expect(at.paper).toEqual({ lo: 17.23, hi: 17.23, mix: 0 });
    expect(at.light).toBe(lightAt(17.23).light);
    const want = paletteAt(17.23);
    for (const [k, v] of Object.entries(shownPaints(17.23, { still: true }))) {
      expect(v.mix).toBe(0);
      if (!LIGHT_VAR.test(k)) expect(v.a, k).toBe(want[k]);
    }
  });
});

describe('around the scene changes (drawn as main draws them)', () => {
  it('is at rest outside the changes, FOLD_LEAD before each and UNFOLD_AFTER after', () => {
    for (const seg of [SEG.c1, SEG.c2, SEG.c3]) {
      expect(restAt(seg.t0 - FOLD_LEAD - 0.01)).toBe(true);
      expect(restAt(seg.t0 - FOLD_LEAD + 0.01)).toBe(false);
      expect(restAt((seg.t0 + seg.t1) / 2)).toBe(false);
      expect(restAt(seg.t1 + UNFOLD_AFTER - 0.01)).toBe(false);
      expect(restAt(seg.t1 + UNFOLD_AFTER + 0.01)).toBe(true);
    }
    // the dawn while 摺摺 writes and the dusk on the bridge are at rest
    expect(restAt(5)).toBe(true);
    expect(restAt(SEG.meet.t0 + 3)).toBe(true);
  });

  it.each([false, true])('states main’s own largest steps, which the drawing is held to (dark scheme %s)', (dim) => {
    let prev: number | null = null;
    const worst = { rest: 0, change: 0 };
    for (let i = 0; i <= FRAMES; i++) {
      const s = Math.min(FILM_END, i / 60);
      const k = flatKey(hourDrawn(s), !!changeAt(s));
      if (prev != null && k !== prev) {
        const a = paletteAt(prev, { dim });
        const b = paletteAt(k, { dim });
        for (const p of Object.keys(a)) {
          if (!isSceneryPaint(p) || LIGHT_VAR.test(p)) continue;
          const d = deltaE(exact(a[p]), exact(b[p]));
          const w = restAt(s) ? 'rest' : 'change';
          worst[w] = Math.max(worst[w], d);
        }
      }
      prev = k;
    }
    expect(worst.rest).toBeLessThanOrEqual(MAIN_STEP_AT_REST);
    expect(worst.change).toBeLessThanOrEqual(MAIN_STEP_IN_CHANGE);
    if (!dim) {
      // (the numbers are main's, not loose: within 0.002 of what it draws)
      expect(worst.rest).toBeGreaterThan(MAIN_STEP_AT_REST - 0.002);
      expect(worst.change).toBeGreaterThan(MAIN_STEP_IN_CHANGE - 0.002);
    }
  });
});
