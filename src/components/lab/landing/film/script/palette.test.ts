import { describe, expect, it } from 'vitest';
import { computeLayout, type Layout } from './layout';
import { CREAM, KEYFRAMES, chromeInk, contrast, hourAt, mixLab, paintAt, paletteAt, skyAt } from './palette';
import { HERO_DEPTH, outFlat } from './parallax';
import { FILM_END, SEG, smooth, span } from './timeline';

const LAYOUTS: Layout[] = [
  computeLayout(390, 844),
  computeLayout(820, 1180),
  computeLayout(1180, 820),
  computeLayout(1440, 900),
  computeLayout(1366, 768),
];

/** Where the h1's and the subtitle's last lines end (px), by the hero's CSS (film.module.css; no badges since round 3). */
function heroLines(L: Layout) {
  if (L.name === 'tall' && !L.tablet) return { h1: 108 + 44 * 1.12 * 2, sub: 108 + 44 * 1.12 * 2 + 16 + 16 * 1.55 * 2 };
  if (L.name === 'tall') return { h1: 144 + 72 * 1.12, sub: 144 + 72 * 1.12 + 16 + 18 * 1.55 * 2 };
  const top = Math.min(156, Math.max(104, 0.16 * L.h));
  const h1 = Math.min(80, Math.max(56, 0.084 * L.h)) * 1.12;
  return { h1: top + h1, sub: top + h1 + 16 + 19 * 1.55 };
}

describe('the light', () => {
  it('keeps the cream hero readable on the sky while it is there (light and dim)', () => {
    for (const dim of [false, true]) {
      for (const L of LAYOUTS) {
        const lines = heroLines(L);
        for (let s = 0; s <= SEG.c1.t1; s += 0.1) {
          const p = span(s, SEG.c1.t0, SEG.c1.t1);
          const ty = s < SEG.c1.t0 ? 0 : outFlat(HERO_DEPTH, p, 1.1) * L.lvh;
          const alpha = 1 - smooth(span(p, 0.06, 0.34));
          if (alpha < 0.5) continue;
          const h = hourAt(s);
          const y1 = lines.h1 + ty;
          const y2 = lines.sub + ty;
          if (y1 > 0) expect(contrast(CREAM, skyAt(h, y1 / L.hz, dim)), `h1 ${L.w}×${L.h} s ${s.toFixed(1)}`).toBeGreaterThanOrEqual(3);
          if (y2 > 0) {
            const sky = skyAt(h, y2 / L.hz, dim);
            expect(contrast(mixLab(sky, CREAM, 0.96), sky), `sub ${L.w}×${L.h} s ${s.toFixed(1)}`).toBeGreaterThanOrEqual(4.5);
          }
        }
      }
    }
  });

  it('gives the chrome an ink that reads on the sky top at every hour of the film (light and dim)', () => {
    for (const dim of [false, true]) {
      for (let h = 5.33; h <= 22.5; h += 0.05) {
        const top = paintAt(h, dim).c['sky-0'];
        expect(contrast(chromeInk(top), top), `hour ${h.toFixed(2)} ${dim ? 'dim' : 'light'}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('passes the hours from the blue hour through the day to the night', () => {
    expect(hourAt(0)).toBeCloseTo(5.33);
    expect(hourAt(FILM_END)).toBeCloseTo(22.5);
    // each hour stays where it was in its scene, however long the film (round 3 slowed it)
    expect(hourAt(SEG.c1.t0)).toBeCloseTo(6.17);
    expect(hourAt(SEG.journey.t0)).toBeCloseTo(8);
    expect(hourAt(SEG.reply.t0)).toBeCloseTo(14.5);
    expect(hourAt(SEG.bridge.t0)).toBeCloseTo(17.5);
    expect(hourAt(SEG.c3.t0)).toBeCloseTo(19.5);
    expect(hourAt(SEG.yours.t0)).toBeCloseTo(21);
    expect(KEYFRAMES.map(([, n]) => n)).toEqual(['blueHour', 'sunrise', 'day', 'day', 'golden', 'sunset', 'dusk', 'evening', 'night']);
    const L = (h: number) => paintAt(h).c['sky-0'][0];
    expect(L(5.33)).toBeLessThan(0.4); // the blue hour's dark top
    expect(L(21)).toBeLessThan(0.2); // night
    // the day to the golden hour mixes through a pale sky, never green
    const mid = paintAt(15.25).c['sky-1'];
    expect(mid[1] < 0.05 || mid[2] < 120 || mid[2] > 200).toBe(true);
  });

  it('keeps the far range and the ground apart at every hour (depth by colour never washes into one tone)', () => {
    for (const dim of [false, true]) {
      for (let h = 5.33; h <= 22.5; h += 0.05) {
        const P = paintAt(h, dim).c;
        // the dark scheme dims every layer (×0.92, the bright hours ×0.82), the gap with them
        expect(Math.abs(P.range[0] - P.ground[0]), `hour ${h.toFixed(2)} ${dim ? 'dim' : 'light'}`).toBeGreaterThanOrEqual(dim ? 0.25 * 0.82 : 0.25);
      }
    }
  });

  it("keeps the golden hour's zenith blue", () => {
    const top = paintAt(16.5).c['sky-0'];
    expect(top[2]).toBeGreaterThanOrEqual(240);
    expect(top[2]).toBeLessThanOrEqual(255);
  });

  it('writes every variable the stage paints with, dimmer under the dark scheme', () => {
    const v = paletteAt(6);
    for (const k of ['--film-sky-0', '--film-sky-3', '--film-c-ground', '--film-c-rim', '--film-c-shade', '--film-win-4', '--film-stars', '--film-chrome-ink']) expect(v[k]).toBeTruthy();
    // the bright hours dim further (no noon glare in a dark room), the others ×0.92
    expect(paintAt(14, true).c.ground[0]).toBeCloseTo(paintAt(14).c.ground[0] * 0.82, 5);
    expect(paintAt(14, true).c['sky-0'][1]).toBeCloseTo(paintAt(14).c['sky-0'][1] * 0.85, 5);
    expect(paintAt(19.5, true).c.ground[0]).toBeCloseTo(paintAt(19.5).c.ground[0] * 0.92, 5);
    expect(paintAt(22, true).c['sky-0'][0]).toBeCloseTo(0.145, 3);
  });
});
