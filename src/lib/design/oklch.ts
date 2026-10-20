/**
 * OKLCH colour math, the way CSS does it — for whatever draws the web's
 * colours without a browser: the native pipelines (the generated app tokens,
 * scripts/native/tokens.ts, and the editor island's :root,
 * scripts/native/islandRoot.ts, so neither the apps nor the island needs
 * oklch() or color-mix() at runtime) and the link-preview image
 * (/api/og/card, whose renderer reads no oklch()). Pure: no files, no side
 * effects.
 */

export type Oklch = { L: number; C: number; H: number; alpha: number };

export function parseOklch(s: string): Oklch {
  const m = /oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\s*\)/.exec(s);
  if (!m) throw new Error(`not an oklch() color: ${s}`);
  const L = m[2] === '%' ? Number(m[1]) / 100 : Number(m[1]);
  return { L, C: Number(m[3]), H: Number(m[4]), alpha: m[5] ? Number(m[5]) : 1 };
}

/** CSS Color 5: color-mix(in oklch, c, black p) — black has no hue, so c's hue carries. */
export function mixWithBlack(c: Oklch, blackShare: number): Oklch {
  const k = 1 - blackShare;
  return { L: c.L * k, C: c.C * k, H: c.H, alpha: c.alpha };
}

/** CSS Color 5: color-mix(in oklch, a p, b) — shorter-arc hue interpolation. */
export function mix(a: Oklch, b: Oklch, p: number): Oklch {
  let dh = b.H - a.H;
  if (dh > 180) dh -= 360;
  if (dh < -180) dh += 360;
  const H = (((a.H + dh * (1 - p)) % 360) + 360) % 360;
  return { L: a.L * p + b.L * (1 - p), C: a.C * p + b.C * (1 - p), H, alpha: a.alpha * p + b.alpha * (1 - p) };
}

// OKLCH → OKLab → linear sRGB (Björn Ottosson) → linear Display P3.
export function toLinearSrgb({ L, C, H }: Oklch): [number, number, number] {
  const a = C * Math.cos((H * Math.PI) / 180);
  const b = C * Math.sin((H * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

export function linearSrgbToLinearP3([r, g, b]: [number, number, number]): [number, number, number] {
  return [
    0.8224621 * r + 0.177538 * g,
    0.0331941 * r + 0.9668058 * g,
    0.0170827 * r + 0.0723974 * g + 0.9105199 * b,
  ];
}

/** The sRGB transfer function, clamped to the gamut. */
export const encode = (x: number) => {
  const v = Math.min(1, Math.max(0, x));
  return v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
};

/** The colour as #rrggbb in sRGB (clamped to the gamut; alpha left out). */
export function srgbHex(c: Oklch): string {
  return `#${toLinearSrgb(c)
    .map(encode)
    .map((v) => Math.round(v * 255).toString(16).padStart(2, '0'))
    .join('')}`;
}
