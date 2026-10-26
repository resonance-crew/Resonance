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
 * What a theme is, as the ladders read it. Light: the accent's hue and
 * chroma and the hue and chroma its neutrals drift toward (the wallpaper's
 * light table; the four themes have their own). Dark: the night paper's hue
 * and chroma, and the accent as it stands on it — a yellow needs more light
 * than a violet to read as itself; each clears 4.5:1 under a night-paper label.
 */
export interface ThemeSpec {
  accentHue: number;
  accentChroma: number;
  neutralHue: number;
  /** The paper's chroma in light (terracotta 0.015); the light ladder scales from it. */
  neutralChroma: number;
  darkNeutralHue: number;
  /** The night paper's chroma; the dark ladder scales from it. */
  darkNeutralChroma: number;
  darkAccent: { L: number; C: number; H: number };
}

export const THEME_SPECS: Record<Accent, ThemeSpec> = {
  terracotta: { accentHue: 45, accentChroma: 0.14, neutralHue: 75, neutralChroma: 0.015, darkNeutralHue: 62, darkNeutralChroma: 0.013, darkAccent: { L: 0.71, C: 0.135, H: 47 } },
  sage: { accentHue: 140, accentChroma: 0.13, neutralHue: 142, neutralChroma: 0.013, darkNeutralHue: 140, darkNeutralChroma: 0.013, darkAccent: { L: 0.73, C: 0.12, H: 145 } },
  lavender: { accentHue: 290, accentChroma: 0.14, neutralHue: 298, neutralChroma: 0.012, darkNeutralHue: 298, darkNeutralChroma: 0.011, darkAccent: { L: 0.73, C: 0.115, H: 292 } },
  yellow: { accentHue: 78, accentChroma: 0.13, neutralHue: 92, neutralChroma: 0.02, darkNeutralHue: 88, darkNeutralChroma: 0.015, darkAccent: { L: 0.79, C: 0.125, H: 80 } },
};

const lch = (L: number, C: number, H: number, alpha = 1): Oklch => ({ L, C, H: ((H % 360) + 360) % 360, alpha });

/**
 * The dark ladder: night paper at 20.5%, the raised card lighter (24%) and
 * the recessed well darker (17%) — the order light has — chalk ink at 88%
 * (not brighter: a long read glares), muted ink at 68%, the accent
 * brightened to stand on the paper, its wash a low tint.
 */
function darkBase(s: ThemeSpec): Base {
  const n = s.darkNeutralChroma;
  const h = s.darkNeutralHue;
  const k = n / 0.013;
  const accent = fitGamut(lch(s.darkAccent.L, s.darkAccent.C, s.darkAccent.H));
  return {
    'color-cream': lch(0.205, n, h),
    'color-card-bg': lch(0.24, n * 1.08, h + 2),
    'color-cream-dark': lch(0.17, n * 0.85, h - 2),
    'color-text': lch(0.88, 0.02 * k, h + 14),
    'color-text-muted': lch(0.68, 0.03 * k, h + 8),
    'field-border': lch(0.4, 0.02 * k, h + 8),
    'field-border-hover': lch(0.6, 0.035 * k, h + 4),
    placeholder: lch(0.58, 0.03 * k, h + 8),
    'color-terracotta': accent,
    'color-terracotta-light': fitGamut(lch(0.36, accent.C * 0.5, accent.H + 5)),
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
  'footer-bg',
  'footer-ink',
  'cta-band',
  'cta-ink',
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
  'toward-ink',
  'footer-ink-soft',
  'picture-backing',
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
  'card-hover',
  'card-skeleton',
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
    // The footer is a band of ink with paper words; the call to action a band of the accent.
    'footer-bg': b['color-text'],
    'footer-ink': b['color-cream'],
    'cta-band': b['color-terracotta'],
    'cta-ink': b['color-cream'],
  }),
  dark: (b) => {
    const accent = b['color-terracotta'];
    const paper = b['color-cream'];
    return {
      'bubble-mine': over(b['color-terracotta-light'], 0.8, paper),
      'bubble-theirs': over(b['color-text'], 0.1, paper),
      // Quieter than theirs and well apart from mine: a reply carries its quote right against the sender's bubble.
      'bubble-quote': lch(0.24, paper.C * 0.85, paper.H + 4),
      'link-card-muted': over(b['color-text'], 0.35, b['color-text-muted']),
      'reading-progress': fitGamut(lch(accent.L + 0.07, accent.C + 0.015, accent.H + 7)),
      // A bright accent under a night-paper label (the paper colour, as cream is in light).
      'button-fill': accent,
      'button-tonal': over(b['color-terracotta-light'], 0.75, b['color-cream-dark']),
      'button-on-tonal': fitGamut(lch(accent.L + 0.1, accent.C * 0.75, accent.H + 7)),
      // The deeper pens of light are the brighter pens of dark.
      'terracotta-ink': over(accent, 0.65, b['color-text']),
      'terracotta-deep': over(accent, 0.75, b['color-text']),
      'terracotta-outline': over(accent, 0.85, b['color-text']),
      'auth-interior': over(b['color-terracotta-light'], 0.14, b['color-card-bg']),
      'auth-border': over(accent, 0.82, b['color-text']),
      'toggle-off': lch(0.32, paper.C * 1.33, paper.H + 8),
      'toggle-off-stroke': lch(0.52, b['color-text-muted'].C * 0.75, b['color-text-muted'].H),
      'ghost-stroke': lch(0.78, b['color-text-muted'].C, b['color-text-muted'].H),
      'modal-border': lch(0.8, b['color-text'].C * 2, b['color-text'].H),
      'segment-idle-ink': over(b['color-text'], 0.1, b['color-text-muted']),
      'link-wave': lch(accent.L - 0.06, accent.C * 0.6, accent.H),
      'story-code-tint': { ...b['color-text'], alpha: 0.08 },
      // Ink as a band would be a cream slab, the accent a glaring one: both go deep, their words light.
      'footer-bg': lch(0.15, paper.C * 0.75, paper.H),
      'footer-ink': b['color-text'],
      'cta-band': fitGamut(lch(0.44, accent.C * 0.78, accent.H - 2)),
      'cta-ink': lch(0.93, b['color-text'].C, b['color-text'].H),
    };
  },
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
    // What "further from the paper" mixes toward (color-mix(in oklch, X, var(--toward-ink) N%)); real shadows stay --shadow-ink.
    'toward-ink': o('oklch(0% 0 0)'),
    // The footer's quiet words, in either scheme a light ink on its dark band (CSS takes it at 0.65–0.9).
    'footer-ink-soft': o('oklch(85% 0.015 75)'),
    // Behind a story picture: none in light; in dark a light paper, so a transparent logo's black words still show.
    'picture-backing': o('oklch(96.5% 0.015 75 / 0)'),
  },
  dark: {
    'color-danger': o('oklch(70% 0.15 25)'),
    'danger-fill': o('oklch(67% 0.15 25)'),
    'button-danger-tonal': o('oklch(30% 0.06 25)'),
    'button-on-danger-tonal': o('oklch(83% 0.08 25)'),
    // Blobs and washes: as quiet against the night paper as the pastels are against cream.
    'color-lavender': o('oklch(30% 0.045 290)'),
    'color-sage': o('oklch(30% 0.045 140)'),
    'color-yellow': o('oklch(31% 0.05 85)'),
    'color-sky': o('oklch(30% 0.045 220)'),
    'avatar-stroke': o('oklch(85% 0.02 70 / 0.35)'),
    'tag-stroke': o('oklch(84% 0.03 70 / 0.42)'),
    scrim: o('oklch(8% 0.01 60 / 0.6)'),
    'shadow-ink': o('oklch(5% 0.01 60)'),
    'grain-ink': o('oklch(96% 0.01 75)'),
    'toward-ink': o('oklch(100% 0 0)'),
    'footer-ink-soft': o('oklch(85% 0.015 75)'),
    'picture-backing': o('oklch(93% 0.012 75)'),
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
  const [L, C] = LIGHT_FILL_LC[i];
  if (scheme === 'light') {
    return {
      'card-fill': lch(L, C, h),
      'card-border': o(LIGHT_BORDERS[i][0]),
      'card-border-deep': o(LIGHT_BORDERS[i][1]),
      'card-interior': lch(0.975, 0.012, h),
      'card-separator': lch(0.55, 0.04, h, 0.4),
      'card-note-ink': lch(0.44, 0.08, h),
      'card-stripe': lch(L - 0.07, C, h),
      'card-accent': lch(0.9, 0.06, h),
      'card-hover': lch(0.925, 0.024, h),
      'card-skeleton': lch(0.88, 0.08, h),
    };
  }
  // Each family keeps its own calibration (yellow needs more chroma to read as yellow), at 0.75×;
  // the yellow family's hue leans to 85 so it doesn't go olive this deep.
  const fill = i === 3 ? lch(0.31, 0.045, 85) : fitGamut(lch(0.3, C * 0.75, h));
  return {
    'card-fill': fill,
    'card-border': fitGamut(lch(0.72, o(LIGHT_BORDERS[i][0]).C * 0.75, h)),
    'card-border-deep': fitGamut(lch(0.84, o(LIGHT_BORDERS[i][0]).C * 0.5, h)),
    'card-interior': lch(0.235, 0.014, h),
    'card-separator': lch(0.72, 0.04, h, 0.4),
    'card-note-ink': fitGamut(lch(0.78, 0.08, h)),
    'card-stripe': lch(fill.L + 0.05, fill.C, fill.H),
    'card-accent': lch(0.38, 0.05, h),
    'card-hover': lch(0.27, 0.022, h),
    'card-skeleton': lch(0.34, 0.05, h),
  };
}

function assemble(b: Base, scheme: Scheme): Palette {
  const out = { ...b, ...RECIPES[scheme](b), ...SCHEME_VALUES[scheme] } as Record<string, Oklch>;
  FAMILY_HUES.forEach((_, i) => {
    for (const [k, v] of Object.entries(family(scheme, i))) out[`${k}-${i}`] = v;
  });
  return out as Palette;
}

/**
 * Light terracotta is the site as it always was, to the digit: where a recipe
 * lands a hair off a value the site and the apps' fixtures pin, the value wins.
 */
const LIGHT_TERRACOTTA_EXACT: Partial<Record<PaletteToken, Oklch>> = {
  'bubble-mine': o('oklch(91.2% 0.055 62.6)'),
  'bubble-theirs': o('oklch(91.5% 0.017 74)'),
  'bubble-quote': o('oklch(88.5% 0.013 72)'),
  'link-card-muted': o('oklch(45% 0.04 70)'),
};

/** The palette a theme wears in a scheme. */
export function paletteFor(accent: Accent, scheme: Scheme): Palette {
  const p = assemble(scheme === 'light' ? LIGHT_BASES[accent] : darkBase(THEME_SPECS[accent]), scheme);
  return accent === DEFAULT_ACCENT && scheme === 'light' ? ({ ...p, ...LIGHT_TERRACOTTA_EXACT } as Palette) : p;
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

/**
 * The ThemeSpec a system accent colour stands for. A wallpaper with almost no
 * colour (chroma under WALLPAPER_MIN_CHROMA) has no hue worth taking: callers
 * wear terracotta then (`wallpaperPalette`).
 */
export function specForHue(hue: number, chroma: number): ThemeSpec {
  const accentChroma = Math.min(0.14, Math.max(0.06, chroma));
  return {
    accentHue: hue,
    accentChroma,
    neutralHue: hue + 10,
    neutralChroma: 0.013,
    darkNeutralHue: hue + 10,
    darkNeutralChroma: 0.012,
    darkAccent: { L: 0.73, C: Math.min(0.13, accentChroma), H: hue + 2 },
  };
}

export const WALLPAPER_MIN_CHROMA = 0.03;

/** What the wallpaper accent wears: its hue's palette, or terracotta's for a grey wallpaper. */
export function wallpaperPalette(hue: number, chroma: number, scheme: Scheme): Palette {
  return chroma < WALLPAPER_MIN_CHROMA ? paletteFor(DEFAULT_ACCENT, scheme) : paletteForHue(hue, chroma, scheme);
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
  return cssOklch(fitGamut(lch(0.4, c.C * 0.85, c.H, c.alpha)));
}

/** The browser chrome's colour for a scheme (<meta name="theme-color">): the paper. */
export function themeColor(accent: Accent, scheme: Scheme): Oklch {
  return paletteFor(accent, scheme)['color-cream'];
}

/** Numbers that change with the scheme (CSS custom properties beside the colours). */
export const SCHEME_NUMBERS: Record<Scheme, Record<'grain-scale' | 'reading-progress-glow-alpha', number>> = {
  // Light specks on night paper read louder than dark ones on cream.
  light: { 'grain-scale': 1, 'reading-progress-glow-alpha': 0.55 },
  // A glow on dark reads as neon at light's strength.
  dark: { 'grain-scale': 0.4, 'reading-progress-glow-alpha': 0.4 },
};
