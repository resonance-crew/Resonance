import { describe, expect, it } from 'vitest';
import { contrastRatio, flatten, hexOf, isBrightIsland, minimumRatio, oklabLightness, over, parseCssColor, relativeLuminance } from './contrast';
import { contrast as paletteContrast, cssOklch, paletteFor } from './palette';

const close = (a: number, b: number, d = 0.01) => expect(Math.abs(a - b)).toBeLessThan(d);

describe('the contrast audit’s maths', () => {
  it('reads every colour a computed style writes', () => {
    expect(parseCssColor('rgb(255, 0, 0)')).toEqual({ r: 1, g: 0, b: 0, a: 1 });
    expect(parseCssColor('rgba(0, 0, 0, 0.5)')).toEqual({ r: 0, g: 0, b: 0, a: 0.5 });
    expect(parseCssColor('rgb(0 128 255 / 25%)')!.a).toBe(0.25);
    expect(parseCssColor('#faf2e9')).toMatchObject({ a: 1 });
    expect(hexOf(parseCssColor('#faf2e9')!)).toBe('#faf2e9');
    expect(parseCssColor('transparent')!.a).toBe(0);
    expect(parseCssColor('color(srgb 0.5 0.5 0.5 / 0.2)')).toEqual({ r: 0.5, g: 0.5, b: 0.5, a: 0.2 });
    // Display P3's white is sRGB's white.
    const p3 = parseCssColor('color(display-p3 1 1 1)')!;
    close(p3.r, 1);
    close(p3.g, 1);
    close(p3.b, 1);
    // oklch() as a computed style writes it (L a number) and as an author does (L a percentage).
    expect(hexOf(parseCssColor('oklch(0.965 0.015 75)')!)).toBe('#faf2e9');
    expect(hexOf(parseCssColor('oklch(96.5% 0.015 75)')!)).toBe('#faf2e9');
    expect(parseCssColor('oklch(26% 0.03 60 / 0.24)')!.a).toBe(0.24);
    expect(hexOf(parseCssColor('oklab(1 0 0)')!)).toBe('#ffffff');
    expect(parseCssColor('none')).toBeNull();
    expect(parseCssColor('url(#grad)')).toBeNull();
  });

  it('composites a translucent layer over what is under it, as a browser does', () => {
    const paper = parseCssColor('#faf2e9')!;
    const scrim = parseCssColor('oklch(26% 0.03 60 / 0.24)')!;
    // The modal's backdrop over the cream is the bars' dimmed colour (lib/design/appearance).
    expect(hexOf(over(scrim, paper))).toBe('#c9c0b6');
    // Layers topmost first, down to the first opaque one; nothing under it shows.
    const red = { r: 1, g: 0, b: 0, a: 1 };
    expect(flatten([{ r: 0, g: 0, b: 1, a: 0.5 }, red, paper])).toEqual({ r: 0.5, g: 0, b: 0.5, a: 1 });
    // No opaque layer: they lie on the ground (white by default).
    expect(flatten([{ r: 0, g: 0, b: 0, a: 0.5 }])).toEqual({ r: 0.5, g: 0.5, b: 0.5, a: 1 });
  });

  it('measures as WCAG 2 does, and as the palette’s own test', () => {
    const white = parseCssColor('#ffffff')!;
    const black = parseCssColor('#000000')!;
    close(relativeLuminance(white), 1, 1e-9);
    close(contrastRatio(white, black), 21, 1e-6);
    for (const scheme of ['light', 'dark'] as const) {
      const p = paletteFor('terracotta', scheme);
      const ink = parseCssColor(cssOklch(p['color-text']))!;
      const paper = parseCssColor(cssOklch(p['color-cream']))!;
      close(contrastRatio(ink, paper), paletteContrast(p['color-text'], p['color-cream']), 0.02);
    }
  });

  it('holds large text to 3:1 and the rest to 4.5:1', () => {
    expect(minimumRatio(16, 400)).toBe(4.5);
    expect(minimumRatio(24, 400)).toBe(3);
    expect(minimumRatio(19, 700)).toBe(3);
    expect(minimumRatio(19, 600)).toBe(4.5);
    expect(minimumRatio(18, 800)).toBe(4.5);
  });

  it('calls an opaque light slab bigger than 64 × 64 a bright island, in dark', () => {
    const cream = parseCssColor(cssOklch(paletteFor('terracotta', 'light')['color-cream']))!;
    const night = parseCssColor(cssOklch(paletteFor('terracotta', 'dark')['color-cream']))!;
    close(oklabLightness(cream), 0.965, 0.005);
    expect(isBrightIsland(cream, 200, 120)).toBe(true);
    expect(isBrightIsland(cream, 60, 300)).toBe(false);
    expect(isBrightIsland({ ...cream, a: 0.5 }, 200, 200)).toBe(false);
    expect(isBrightIsland(night, 800, 600)).toBe(false);
  });
});
