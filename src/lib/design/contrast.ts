/**
 * The maths of the contrast audit (window.__contrastAudit, ./contrastAudit):
 * a computed CSS colour read as sRGB, translucent layers laid over each other
 * as a browser composites them, and WCAG 2's ratio and thresholds. Pure: no
 * DOM, so a test pins every step.
 */
import { encode, toLinearSrgb } from './oklch';

/** A colour in encoded sRGB, each channel and alpha 0–1. */
export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

const clamp = (v: number) => Math.min(1, Math.max(0, v));
const num = (s: string, scale = 1) => (s.endsWith('%') ? Number(s.slice(0, -1)) / 100 : Number(s) / scale);
const alphaOf = (s: string | undefined) => (s === undefined ? 1 : clamp(num(s)));

/** Linear-light sRGB → encoded sRGB, clamped to the gamut. */
const fromLinear = (rgb: [number, number, number], a: number): Rgba => {
  const [r, g, b] = rgb.map(encode);
  return { r, g, b, a };
};

/** Encoded sRGB (or Display P3, which shares the transfer curve) → linear light. */
const toLinear = (v: number) => {
  const x = Math.abs(v);
  const lin = x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  return Math.sign(v) * lin;
};

/**
 * A colour as getComputedStyle writes it — `rgb()`/`rgba()`, `color(srgb …)`,
 * `color(display-p3 …)`, `oklch()`, `oklab()`, `#rrggbb` or `transparent` —
 * as encoded sRGB, or null for anything else (`none`, a gradient, `url()`).
 */
export function parseCssColor(css: string): Rgba | null {
  const s = css.trim().toLowerCase();
  if (s === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
  const hex = /^#([0-9a-f]{3,8})$/.exec(s)?.[1];
  if (hex && [3, 4, 6, 8].includes(hex.length)) {
    const full = hex.length <= 4 ? [...hex].map((c) => c + c).join('') : hex;
    const v = (i: number) => parseInt(full.slice(i, i + 2), 16) / 255;
    return { r: v(0), g: v(2), b: v(4), a: full.length === 8 ? v(6) : 1 };
  }
  const fn = /^([a-z-]+)\((.*)\)$/.exec(s);
  if (!fn) return null;
  const [, name, body] = fn;
  const [channels, alpha] = body.split('/').map((p) => p.trim());
  const parts = channels.split(/[\s,]+/).filter(Boolean);
  if (name === 'rgb' || name === 'rgba') {
    if (parts.length < 3) return null;
    const a = alpha ?? parts[3];
    return { r: clamp(num(parts[0], 255)), g: clamp(num(parts[1], 255)), b: clamp(num(parts[2], 255)), a: alphaOf(a) };
  }
  if (name === 'color') {
    const [space, ...v] = parts;
    if (v.length < 3) return null;
    const [r, g, b] = v.slice(0, 3).map((x) => num(x));
    if (space === 'srgb') return { r: clamp(r), g: clamp(g), b: clamp(b), a: alphaOf(alpha) };
    if (space === 'display-p3') {
      const [lr, lg, lb] = [r, g, b].map(toLinear);
      // Linear Display P3 → linear sRGB.
      const rgb: [number, number, number] = [
        1.2249401 * lr - 0.2249404 * lg,
        -0.0420569 * lr + 1.0420571 * lg,
        -0.0196376 * lr - 0.0786361 * lg + 1.0982735 * lb,
      ];
      return fromLinear(rgb, alphaOf(alpha));
    }
    if (space === 'srgb-linear') return fromLinear([r, g, b], alphaOf(alpha));
    return null;
  }
  if (name === 'oklch') {
    if (parts.length < 3) return null;
    const L = parts[0].endsWith('%') ? num(parts[0]) : Number(parts[0]);
    const C = parts[1].endsWith('%') ? num(parts[1]) * 0.4 : Number(parts[1]);
    const H = parts[2] === 'none' ? 0 : Number(parts[2].replace('deg', ''));
    return fromLinear(toLinearSrgb({ L, C: parts[1] === 'none' ? 0 : C, H, alpha: 1 }), alphaOf(alpha));
  }
  if (name === 'oklab') {
    if (parts.length < 3) return null;
    const L = parts[0].endsWith('%') ? num(parts[0]) : Number(parts[0]);
    const A = parts[1].endsWith('%') ? num(parts[1]) * 0.4 : Number(parts[1]);
    const B = parts[2].endsWith('%') ? num(parts[2]) * 0.4 : Number(parts[2]);
    const C = Math.hypot(A, B);
    const H = (Math.atan2(B, A) * 180) / Math.PI;
    return fromLinear(toLinearSrgb({ L, C, H, alpha: 1 }), alphaOf(alpha));
  }
  return null;
}

/** `top` laid over `bottom`, as a browser composites them (source-over, in encoded sRGB). */
export function over(top: Rgba, bottom: Rgba): Rgba {
  const a = top.a + bottom.a * (1 - top.a);
  if (a === 0) return { r: 0, g: 0, b: 0, a: 0 };
  const ch = (t: number, b: number) => (t * top.a + b * bottom.a * (1 - top.a)) / a;
  return { r: ch(top.r, bottom.r), g: ch(top.g, bottom.g), b: ch(top.b, bottom.b), a };
}

/** A stack of layers, topmost first, flattened onto an opaque ground (the topmost opaque layer and what's above it). */
export function flatten(layers: readonly Rgba[], ground: Rgba = { r: 1, g: 1, b: 1, a: 1 }): Rgba {
  let out = ground;
  const firstOpaque = layers.findIndex((l) => l.a >= 0.999);
  const used = firstOpaque >= 0 ? layers.slice(0, firstOpaque + 1) : layers;
  for (let i = used.length - 1; i >= 0; i--) out = over(used[i], out);
  return { ...out, a: 1 };
}

/** WCAG 2 relative luminance. */
export function relativeLuminance({ r, g, b }: Rgba): number {
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

/** WCAG 2 contrast ratio of two opaque colours. */
export function contrastRatio(a: Rgba, b: Rgba): number {
  const x = relativeLuminance(a);
  const y = relativeLuminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** What text must clear (WCAG 2 AA): 3:1 for large text (≥ 24px, or ≥ 18.66px bold), 4.5:1 for the rest. */
export function minimumRatio(fontSizePx: number, fontWeight: number): number {
  return fontSizePx >= 24 || (fontSizePx >= 18.66 && fontWeight >= 700) ? 3 : 4.5;
}

/** OKLab lightness of an sRGB colour (0 black, 1 white). */
export function oklabLightness({ r, g, b }: Rgba): number {
  const [lr, lg, lb] = [r, g, b].map(toLinear);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
}

/** In dark: an opaque surface brighter than L 0.8 and bigger than 64 × 64 (a light slab left on the night paper). */
export function isBrightIsland(fill: Rgba, width: number, height: number): boolean {
  return fill.a >= 0.9 && width > 64 && height > 64 && oklabLightness(fill) > 0.8;
}

/** A colour as `#rrggbb` (alpha left out), for a report. */
export function hexOf({ r, g, b }: Rgba): string {
  return `#${[r, g, b].map((v) => Math.round(clamp(v) * 255).toString(16).padStart(2, '0')).join('')}`;
}
