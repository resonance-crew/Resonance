/**
 * Every colour that changes with the reader's scheme (light / dark) or theme
 * colour (accent) — the one source the web's palette.css, the editor
 * island and both apps' tokens are generated from (scripts/web/palette-css.ts,
 * scripts/native/tokens.ts). Pure: no DOM, no files.
 *
 * Tokens keep their role, not their lightness: `color-cream` is the paper,
 * `color-text` the ink, `color-terracotta` the accent (whatever its hue),
 * `color-terracotta-light` the accent's wash. In the dark scheme the paper
 * is a warm slate and the ink is chalk, so everything drawn "ink on paper"
 * recolours by itself. A label on a solid accent fill is the paper colour in
 * both schemes (a deep accent under cream in light, a bright accent under
 * the slate in dark).
 *
 * Each accent's light base is the table the site always had (TweaksPanel's
 * ACCENT_MAP, tokens.css for terracotta); its dark base and every derived
 * token come from one ladder (`darkBase`, `RECIPES`), so all four themes and
 * the wallpaper colours (`paletteForHue`, Android 12+) clear the same
 * contrasts — palette.test.ts checks every pair for every combination.
 * Shared images (the og image, the apps' 9:16 card) are always
 * `paletteFor('terracotta', 'light')`.
 */
import { mix, mixWithBlack, parseOklch, toLinearSrgb, linearSrgbToLinearP3, type Oklch } from './oklch';

export const ACCENTS = ['terracotta', 'sage', 'lavender', 'yellow'] as const;
export type Accent = (typeof ACCENTS)[number];
export const DEFAULT_ACCENT: Accent = 'terracotta';

export const SCHEMES = ['light', 'dark'] as const;
export type Scheme = (typeof SCHEMES)[number];

/** The six card families' hues, CARD_HUES order (lib/design/dominantHue). */
const FAMILY_HUES = [55, 290, 140, 88, 215, 18] as const;
export const CARD_FAMILY_COUNT = FAMILY_HUES.length;

/** The ten tokens each theme sets by hand (light) or by the ladder (dark). */
const BASE_TOKENS = [
  'color-cream',
  'color-cream-dark',
  'color-card-bg',
  'color-terracotta',
  'color-terracotta-light',
  'color-text',
  'color-text-muted',
  'field-border',
  'field-border-hover',
  'placeholder',
] as const;
type BaseToken = (typeof BASE_TOKENS)[number];
type Base = Record<BaseToken, Oklch>;

const o = (s: string) => parseOklch(s);
const base = (t: Record<BaseToken, string>): Base =>
  Object.fromEntries(Object.entries(t).map(([k, v]) => [k, o(v)])) as Base;

/** Each theme's light table, verbatim from the site as it was (TweaksPanel ACCENT_MAP). */
const LIGHT_BASES: Record<Accent, Base> = {
  terracotta: base({
    'color-terracotta': 'oklch(62% 0.14 45)',
    'color-terracotta-light': 'oklch(88% 0.08 55)',
    'color-cream': 'oklch(96.5% 0.015 75)',
    'color-cream-dark': 'oklch(93% 0.018 75)',
    'color-card-bg': 'oklch(97.5% 0.01 80)',
    'color-text': 'oklch(26% 0.03 60)',
    'color-text-muted': 'oklch(52% 0.04 70)',
    'field-border': 'oklch(80% 0.02 75)',
    'field-border-hover': 'oklch(60% 0.04 60)',
    placeholder: 'oklch(64% 0.03 70)',
  }),
  sage: base({
    'color-terracotta': 'oklch(55% 0.13 140)',
    'color-terracotta-light': 'oklch(86% 0.07 140)',
    'color-cream': 'oklch(96.5% 0.013 140)',
    'color-cream-dark': 'oklch(93% 0.016 140)',
    'color-card-bg': 'oklch(97.5% 0.009 145)',
    'color-text': 'oklch(26% 0.025 150)',
    'color-text-muted': 'oklch(50% 0.035 145)',
    'field-border': 'oklch(80% 0.02 140)',
    'field-border-hover': 'oklch(58% 0.04 142)',
    placeholder: 'oklch(63% 0.03 142)',
  }),
  lavender: base({
    'color-terracotta': 'oklch(58% 0.14 290)',
    'color-terracotta-light': 'oklch(87% 0.065 295)',
    'color-cream': 'oklch(96.5% 0.012 300)',
    'color-cream-dark': 'oklch(93.5% 0.015 300)',
    'color-card-bg': 'oklch(97.5% 0.008 305)',
    'color-text': 'oklch(26% 0.025 295)',
    'color-text-muted': 'oklch(50% 0.035 295)',
    'field-border': 'oklch(80% 0.02 295)',
    'field-border-hover': 'oklch(58% 0.04 292)',
    placeholder: 'oklch(63% 0.03 295)',
  }),
  yellow: base({
    'color-terracotta': 'oklch(64% 0.13 78)',
    'color-terracotta-light': 'oklch(90% 0.09 90)',
    'color-cream': 'oklch(96.5% 0.02 95)',
    'color-cream-dark': 'oklch(93% 0.024 95)',
    'color-card-bg': 'oklch(97.5% 0.013 98)',
    'color-text': 'oklch(26% 0.03 80)',
    'color-text-muted': 'oklch(52% 0.045 88)',
    'field-border': 'oklch(80% 0.025 92)',
    'field-border-hover': 'oklch(60% 0.045 85)',
    placeholder: 'oklch(64% 0.035 90)',
  }),
};

/**
 * What a theme is, as the ladder reads it: the accent's hue and chroma, the
 * hue and chroma its neutrals drift toward, and how light its accent stands
 * on the dark paper (a yellow needs more light than a violet to read as
 * itself; each clears 4.5:1 under a slate label).
 */
export interface ThemeSpec {
  accentHue: number;
  accentChroma: number;
  neutralHue: number;
  /** The paper's chroma in light (terracotta 0.015); the rest of the ladder scales from it. */
  neutralChroma: number;
  darkAccentL: number;
}

export const THEME_SPECS: Record<Accent, ThemeSpec> = {
  terracotta: { accentHue: 45, accentChroma: 0.14, neutralHue: 75, neutralChroma: 0.015, darkAccentL: 0.7 },
  sage: { accentHue: 140, accentChroma: 0.13, neutralHue: 142, neutralChroma: 0.013, darkAccentL: 0.7 },
  lavender: { accentHue: 290, accentChroma: 0.14, neutralHue: 298, neutralChroma: 0.012, darkAccentL: 0.72 },
  yellow: { accentHue: 78, accentChroma: 0.13, neutralHue: 92, neutralChroma: 0.02, darkAccentL: 0.74 },
};

const lch = (L: number, C: number, H: number, alpha = 1): Oklch => ({ L, C, H: ((H % 360) + 360) % 360, alpha });

/** The dark ladder: the warm slate, its raised card and well, chalk ink, the accent brightened to stand on it. */
function darkBase(s: ThemeSpec): Base {
  const n = s.neutralChroma;
  const h = s.neutralHue;
  return {
    'color-cream': lch(0.2, n * 0.8, h),
    'color-card-bg': lch(0.23, n * 0.8, h),
    'color-cream-dark': lch(0.245, n * 0.93, h),
    'color-text': lch(0.91, n * 1.07, h),
    'color-text-muted': lch(0.72, n * 2, h),
    'field-border': lch(0.38, n * 1.33, h),
    'field-border-hover': lch(0.58, n * 2.33, h),
    placeholder: lch(0.56, n * 2, h),
    'color-terracotta': fitGamut(lch(s.darkAccentL, s.accentChroma * 0.93, s.accentHue + 3)),
    'color-terracotta-light': fitGamut(lch(0.35, s.accentChroma * 0.43, s.accentHue + 5)),
  };
}

/**
 * The light ladder, for a theme with no hand-made table (the wallpaper's):
 * the same lightness as terracotta's table at every step, the neutrals
 * tinted toward the theme's hue, the accent as light as it may be while a
 * cream label still clears 4.5:1 on its button.
 */
function lightBase(s: ThemeSpec): Base {
  const n = s.neutralChroma;
  const h = s.neutralHue;
  const cream = lch(0.965, n, h);
  let accent = fitGamut(lch(0.62, s.accentChroma, s.accentHue));
  while (accent.L > 0.4 && contrast(cream, mixWithBlack(accent, 0.12)) < 4.6) accent = fitGamut({ ...accent, L: accent.L - 0.01 });
  return {
    'color-cream': cream,
    'color-cream-dark': lch(0.93, n * 1.2, h),
    'color-card-bg': lch(0.975, n * 0.67, h + 5),
    'color-text': lch(0.26, n * 2, h),
    'color-text-muted': lch(0.51, n * 2.67, h),
    'field-border': lch(0.8, n * 1.33, h),
    'field-border-hover': lch(0.6, n * 2.67, h),
    placeholder: lch(0.64, n * 2, h),
    'color-terracotta': accent,
    'color-terracotta-light': fitGamut(lch(0.87, s.accentChroma * 0.53, s.accentHue + 5)),
  };
}

/** Tokens drawn from a theme's base by one recipe per scheme. */
const DERIVED_TOKENS = [
  'bubble-mine',
  'bubble-theirs',
  'bubble-quote',
  'link-card-muted',
  'reading-progress',
  'button-fill',
  'button-tonal',
  'button-on-tonal',
  'terracotta-ink',
  'terracotta-deep',
  'terracotta-outline',
  'auth-interior',
  'auth-border',
  'toggle-off',
  'toggle-off-stroke',
  'ghost-stroke',
  'modal-border',
  'segment-idle-ink',
  'link-wave',
  'story-code-tint',
] as const;
type DerivedToken = (typeof DERIVED_TOKENS)[number];

/** The same colours whatever the theme, one per scheme. */
const SCHEME_TOKENS = [
  'color-danger',
  'danger-fill',
  'button-danger-tonal',
  'button-on-danger-tonal',
  'color-lavender',
  'color-sage',
  'color-yellow',
  'color-sky',
  'avatar-stroke',
  'tag-stroke',
  'scrim',
  'shadow-ink',
  'grain-ink',
] as const;
type SchemeToken = (typeof SCHEME_TOKENS)[number];

/** Each card family's set (index 0–5 appended: `card-fill-0`). */
const FAMILY_TOKENS = [
  'card-fill',
  'card-border',
  'card-border-deep',
  'card-interior',
  'card-separator',
  'card-note-ink',
  'card-stripe',
  'card-accent',
] as const;
type FamilyToken = (typeof FAMILY_TOKENS)[number];

export type PaletteToken = BaseToken | DerivedToken | SchemeToken | `${FamilyToken}-${number}`;
export type Palette = Record<PaletteToken, Oklch>;

/** Every token name, in the order the generated files list them. */
export const PALETTE_TOKENS: readonly PaletteToken[] = [
  ...BASE_TOKENS,
  ...DERIVED_TOKENS,
  ...SCHEME_TOKENS,
  ...FAMILY_TOKENS.flatMap((t) => FAMILY_HUES.map((_, i) => `${t}-${i}` as PaletteToken)),
];

/** A mix of a over b with a's share p, in oklch (CSS color-mix). */
const over = (a: Oklch, p: number, b: Oklch) => mix(a, b, p);

/** The colour mixed with black by at least `share`, more (in 1% steps) until it clears `min` against `other`. */
function deepenUntil(c: Oklch, share: number, other: Oklch, min: number): Oklch {
  let k = share;
  while (k < 0.6 && contrast(mixWithBlack(c, k), other) < min) k += 0.01;
  return mixWithBlack(c, k);
}

const RECIPES: Record<Scheme, (b: Base) => Record<DerivedToken, Oklch>> = {
  light: (b) => ({
    // The wash over the paper, made opaque (what a bubble overlaps never shows through).
    'bubble-mine': over(b['color-terracotta-light'], 0.62, b['color-cream']),
    'bubble-theirs': over(b['color-text'], 0.07, b['color-cream']),
    'bubble-quote': over(b['color-text'], 0.11, b['color-cream']),
    // The muted ink deepened to clear 4.5:1 on the bubbles' papers.
    'link-card-muted': over(b['color-text'], 0.27, b['color-text-muted']),
    // Brighter than any pen or button, so it reads as progress, not as the line inked in.
    'reading-progress': fitGamut(lch(b['color-terracotta'].L + 0.08, b['color-terracotta'].C + 0.03, b['color-terracotta'].H + 5)),
    // Deepened at least 12% (22% for the tonal label), more where a light accent needs it to clear 4.6:1.
    'button-fill': deepenUntil(b['color-terracotta'], 0.12, b['color-cream'], 4.6),
    'button-tonal': over(b['color-terracotta-light'], 0.75, b['color-cream-dark']),
    'button-on-tonal': deepenUntil(b['color-terracotta'], 0.22, over(b['color-terracotta-light'], 0.75, b['color-cream-dark']), 4.6),
    'terracotta-ink': mixWithBlack(b['color-terracotta'], 0.35),
    'terracotta-deep': mixWithBlack(b['color-terracotta'], 0.25),
    'terracotta-outline': mixWithBlack(b['color-terracotta'], 0.15),
    'auth-interior': over(b['color-terracotta-light'], 0.14, b['color-card-bg']),
    'auth-border': mixWithBlack(b['color-terracotta'], 0.18),
    'toggle-off': lch(0.86, b['color-cream'].C * 1.33, b['color-cream'].H),
    'toggle-off-stroke': lch(0.7, b['color-text-muted'].C * 0.75, b['color-text-muted'].H),
    'ghost-stroke': lch(0.44, b['color-text-muted'].C, b['color-text-muted'].H),
    'modal-border': lch(0.4, b['color-text'].C * 2, b['color-text'].H),
    'segment-idle-ink': mixWithBlack(b['color-text-muted'], 0.1),
    // A link's pen wave under its words: the accent quieter (0.6× its chroma) and a touch lighter.
    'link-wave': lch(b['color-terracotta'].L + 0.03, b['color-terracotta'].C * 0.6, b['color-terracotta'].H),
    // Inline code and code blocks: the ink at a whisper.
    'story-code-tint': { ...b['color-text'], alpha: 0.06 },
  }),
  dark: (b) => ({
    'bubble-mine': over(b['color-terracotta-light'], 0.8, b['color-cream']),
    'bubble-theirs': over(b['color-text'], 0.1, b['color-cream']),
    'bubble-quote': over(b['color-text'], 0.155, b['color-cream']),
    'link-card-muted': over(b['color-text'], 0.2, b['color-text-muted']),
    'reading-progress': fitGamut(lch(b['color-terracotta'].L + 0.05, b['color-terracotta'].C + 0.03, b['color-terracotta'].H + 4)),
    // A bright accent under a slate label (the paper colour, as cream is in light).
    'button-fill': b['color-terracotta'],
    'button-tonal': over(b['color-terracotta-light'], 0.75, b['color-cream-dark']),
    'button-on-tonal': over(b['color-terracotta'], 0.7, b['color-text']),
    // The deeper pens of light are the brighter pens of dark.
    'terracotta-ink': over(b['color-terracotta'], 0.65, b['color-text']),
    'terracotta-deep': over(b['color-terracotta'], 0.75, b['color-text']),
    'terracotta-outline': over(b['color-terracotta'], 0.85, b['color-text']),
    'auth-interior': over(b['color-terracotta-light'], 0.14, b['color-card-bg']),
    'auth-border': over(b['color-terracotta'], 0.82, b['color-text']),
    'toggle-off': lch(0.32, b['color-cream'].C * 1.33, b['color-cream'].H),
    'toggle-off-stroke': lch(0.52, b['color-text-muted'].C * 0.75, b['color-text-muted'].H),
    'ghost-stroke': lch(0.78, b['color-text-muted'].C, b['color-text-muted'].H),
    'modal-border': lch(0.8, b['color-text'].C * 2, b['color-text'].H),
    'segment-idle-ink': over(b['color-text'], 0.1, b['color-text-muted']),
    'link-wave': lch(b['color-terracotta'].L - 0.06, b['color-terracotta'].C * 0.6, b['color-terracotta'].H),
    'story-code-tint': { ...b['color-text'], alpha: 0.08 },
  }),
};

const SCHEME_VALUES: Record<Scheme, Record<SchemeToken, Oklch>> = {
  light: {
    'color-danger': o('oklch(58% 0.16 25)'),
    'danger-fill': mixWithBlack(o('oklch(58% 0.16 25)'), 0.08),
    'button-danger-tonal': over(o('oklch(58% 0.16 25)'), 0.2, o('oklch(98% 0.02 25)')),
    'button-on-danger-tonal': mixWithBlack(o('oklch(58% 0.16 25)'), 0.22),
    'color-lavender': o('oklch(80% 0.07 290)'),
    'color-sage': o('oklch(78% 0.07 140)'),
    'color-yellow': o('oklch(88% 0.10 90)'),
    'color-sky': o('oklch(82% 0.07 220)'),
    'avatar-stroke': o('oklch(36% 0.06 60 / 0.55)'),
    'tag-stroke': o('oklch(32% 0.05 60 / 0.45)'),
    scrim: o('oklch(20% 0.04 60 / 0.28)'),
    'shadow-ink': o('oklch(20% 0.04 60)'),
    'grain-ink': o('oklch(0% 0 0)'),
  },
  dark: {
    'color-danger': o('oklch(68% 0.15 25)'),
    'danger-fill': o('oklch(68% 0.15 25)'),
    'button-danger-tonal': o('oklch(31% 0.06 25)'),
    'button-on-danger-tonal': o('oklch(80% 0.09 25)'),
    'color-lavender': o('oklch(45% 0.06 290)'),
    'color-sage': o('oklch(44% 0.06 140)'),
    'color-yellow': o('oklch(52% 0.08 90)'),
    'color-sky': o('oklch(46% 0.06 220)'),
    'avatar-stroke': o('oklch(82% 0.03 70 / 0.5)'),
    'tag-stroke': o('oklch(84% 0.03 70 / 0.42)'),
    scrim: o('oklch(8% 0.01 60 / 0.6)'),
    'shadow-ink': o('oklch(5% 0.01 60)'),
    'grain-ink': o('oklch(96% 0.01 75)'),
  },
};

/**
 * Each card family as the scheme draws it. Light is the site's table
 * (cardColours.ts, the apps' CardPalette); in dark the fill is a deep tint of
 * the family's hue and its pens are bright — the light "deeper twin" (a
 * stronger pen) is the brighter one there.
 */
const LIGHT_FILL_LC: readonly [number, number][] = [
  [0.9, 0.065],
  [0.94, 0.032],
  [0.93, 0.042],
  [0.92, 0.075],
  [0.92, 0.033],
  [0.89, 0.047],
];
const LIGHT_BORDERS: readonly [string, string][] = [
  ['oklch(52% 0.13 55)', 'oklch(38% 0.11 55)'],
  ['oklch(54% 0.10 290)', 'oklch(42% 0.09 290)'],
  ['oklch(50% 0.12 140)', 'oklch(38% 0.11 140)'],
  ['oklch(58% 0.14 88)', 'oklch(44% 0.12 88)'],
  ['oklch(50% 0.10 215)', 'oklch(38% 0.09 215)'],
  ['oklch(52% 0.09 18)', 'oklch(40% 0.08 18)'],
];

function family(scheme: Scheme, i: number): Record<FamilyToken, Oklch> {
  const h = FAMILY_HUES[i];
  if (scheme === 'light') {
    const [L, C] = LIGHT_FILL_LC[i];
    return {
      'card-fill': lch(L, C, h),
      'card-border': o(LIGHT_BORDERS[i][0]),
      'card-border-deep': o(LIGHT_BORDERS[i][1]),
      'card-interior': lch(0.975, 0.012, h),
      'card-separator': lch(0.55, 0.04, h, 0.4),
      'card-note-ink': lch(0.44, 0.08, h),
      'card-stripe': lch(L - 0.07, C, h),
      'card-accent': lch(0.9, 0.06, h),
    };
  }
  const [, C] = LIGHT_FILL_LC[i];
  const fill = lch(0.29, Math.min(0.045, C * 0.6 + 0.012), h);
  return {
    'card-fill': fill,
    'card-border': fitGamut(lch(0.68, o(LIGHT_BORDERS[i][0]).C * 0.85, h)),
    'card-border-deep': fitGamut(lch(0.8, o(LIGHT_BORDERS[i][1]).C * 0.7, h)),
    'card-interior': lch(0.235, 0.012, h),
    'card-separator': lch(0.62, 0.04, h, 0.4),
    'card-note-ink': fitGamut(lch(0.8, 0.07, h)),
    'card-stripe': lch(fill.L + 0.05, fill.C, h),
    'card-accent': lch(0.38, 0.05, h),
  };
}

function assemble(b: Base, scheme: Scheme): Palette {
  const out = { ...b, ...RECIPES[scheme](b), ...SCHEME_VALUES[scheme] } as Record<string, Oklch>;
  FAMILY_HUES.forEach((_, i) => {
    for (const [k, v] of Object.entries(family(scheme, i))) out[`${k}-${i}`] = v;
  });
  return out as Palette;
}

/** The palette a theme wears in a scheme. */
export function paletteFor(accent: Accent, scheme: Scheme): Palette {
  return assemble(scheme === 'light' ? LIGHT_BASES[accent] : darkBase(THEME_SPECS[accent]), scheme);
}

/**
 * The wallpaper's palette (Android 12+, 桌布配色): only the hue comes from the
 * system — and the chroma, held to the themes' range — while every lightness
 * is the ladder's, so the paper, the ink and their contrasts stay Resonance's.
 * The apps' twin (Kotlin `PaletteFormula`) is pinned to this by
 * native/fixtures/palette.json.
 */
export function paletteForHue(hue: number, chroma: number, scheme: Scheme): Palette {
  const spec = specForHue(hue, chroma);
  return assemble(scheme === 'light' ? lightBase(spec) : darkBase(spec), scheme);
}

/** The ThemeSpec a system accent colour stands for. */
export function specForHue(hue: number, chroma: number): ThemeSpec {
  const accentChroma = Math.min(0.14, Math.max(0.06, chroma));
  return { accentHue: hue, accentChroma, neutralHue: hue + 10, neutralChroma: 0.013, darkAccentL: 0.72 };
}

/** The light base a spec would give — palette.test.ts holds it near the hand-made tables. */
export const lightBaseOf = lightBase;

// ── colour maths ──────────────────────────────────────────────────────────

/** In Display P3 (the apps' gamut, and every wide-gamut screen's). */
export function inP3(c: Oklch): boolean {
  return linearSrgbToLinearP3(toLinearSrgb(c)).every((v) => v >= -1e-4 && v <= 1 + 1e-4);
}

/** The colour with its chroma lowered until it fits Display P3 (lightness and hue kept). */
export function fitGamut(c: Oklch): Oklch {
  if (inP3(c)) return c;
  let lo = 0;
  let hi = c.C;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (inP3({ ...c, C: mid })) lo = mid;
    else hi = mid;
  }
  return { ...c, C: lo };
}

/** WCAG 2 relative luminance of the colour as sRGB shows it (clamped), alpha ignored. */
export function luminance(c: Oklch): number {
  const [r, g, b] = toLinearSrgb(c).map((v) => Math.min(1, Math.max(0, v)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2 contrast ratio of two opaque colours. */
export function contrast(a: Oklch, b: Oklch): number {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** CSS oklch() text of a colour, rounded as the generated files write it. */
export function cssOklch(c: Oklch): string {
  const L = Math.round(c.L * 10000) / 100;
  const C = Math.round(c.C * 10000) / 10000;
  const H = Math.round(c.H * 100) / 100;
  return c.alpha < 1 ? `oklch(${L}% ${C} ${H} / ${Math.round(c.alpha * 1000) / 1000})` : `oklch(${L}% ${C} ${H})`;
}

/**
 * An avatar's stored colour as the scheme draws it: the stored pastel in
 * light; in dark the same hue at the ladder's avatar step, so the chalk
 * initials read on it and a person keeps their colour across schemes.
 */
export function avatarFill(stored: string, scheme: Scheme): string {
  if (scheme === 'light') return stored;
  let c: Oklch;
  try {
    c = parseOklch(stored);
  } catch {
    return stored;
  }
  return cssOklch(fitGamut(lch(0.44, c.C * 0.9, c.H, c.alpha)));
}

/** The browser chrome's colour for a scheme (<meta name="theme-color">): the paper. */
export function themeColor(accent: Accent, scheme: Scheme): Oklch {
  return paletteFor(accent, scheme)['color-cream'];
}

/** Numbers that change with the scheme (CSS custom properties beside the colours). */
export const SCHEME_NUMBERS: Record<Scheme, Record<'grain-scale', number>> = {
  light: { 'grain-scale': 1 },
  dark: { 'grain-scale': 0.55 },
};
