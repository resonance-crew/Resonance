import { describe, expect, it } from 'vitest';
import { PRESETS, presetFor, presetIn } from './presets';

/** A window whose min-width media queries answer for this width, as the page's CSS reads them. */
function windowOf(width: number): Window {
  return {
    matchMedia: (q: string) => {
      const m = /min-width:\s*(\d+)px/.exec(q);
      return { matches: m ? width >= Number(m[1]) : false, media: q, addEventListener() {}, removeEventListener() {} };
    },
  } as unknown as Window;
}

describe('landing stage presets', () => {
  it('follows the card grid’s breakpoints: one column below 640, two to 1023, three from 1024', () => {
    expect([320, 390, 639].map(w => presetFor(w).name)).toEqual(['phone', 'phone', 'phone']);
    expect([640, 768, 834, 1023].map(w => presetFor(w).name)).toEqual(['tablet', 'tablet', 'tablet', 'tablet']);
    expect([1024, 1280, 1440, 2560].map(w => presetFor(w).name)).toEqual(['desktop', 'desktop', 'desktop', 'desktop']);
  });

  it('reads the window’s width as its media queries do', () => {
    expect(presetIn(windowOf(390))).toBe(PRESETS.phone);
    expect(presetIn(windowOf(834))).toBe(PRESETS.tablet);
    expect(presetIn(windowOf(1024))).toBe(PRESETS.desktop);
  });

  it('sizes 摺摺 120 on a desktop and 80 on a phone (approved), a tablet in between', () => {
    expect(PRESETS.desktop.unitHeight).toBe(120);
    expect(PRESETS.phone.unitHeight).toBe(80);
    expect(PRESETS.tablet.unitHeight).toBeGreaterThan(80);
    expect(PRESETS.tablet.unitHeight).toBeLessThan(120);
  });

  it('gives a phone no walking up to someone and no peeks past the cards (there is no room beside them)', () => {
    expect(PRESETS.phone.walkUp).toBe(false);
    expect(PRESETS.phone.cardPeeks).toBe(false);
    expect(PRESETS.tablet.walkUp && PRESETS.desktop.walkUp).toBe(true);
  });
});
