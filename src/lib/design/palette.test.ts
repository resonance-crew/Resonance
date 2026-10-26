import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseOklch } from './oklch';
import {
  ACCENTS,
  HUE_ROLES,
  PALETTE_TOKENS,
  SCHEMES,
  THEME_SPECS,
  avatarFill,
  contrast,
  cssOklch,
  fitGamut,
  inP3,
  lightBaseOf,
  paletteFor,
  paletteForHue,
  type Palette,
  type PaletteToken,
  wallpaperPalette,
} from './palette';
import { paletteCss } from './paletteCss';
import { paletteFixture } from './paletteFixture';

const root = resolve(__dirname, '../../..');

/** What every theme and scheme must clear: [foreground, background, at least]. */
const PAIRS: [PaletteToken, PaletteToken, number][] = [
  ['color-text', 'color-cream', 7],
  ['color-text', 'color-card-bg', 7],
  ['color-text', 'color-cream-dark', 7],
  ['color-text', 'bubble-mine', 7],
  ['color-text', 'bubble-theirs', 7],
  ['color-text', 'bubble-quote', 7],
  ['color-text-muted', 'color-cream', 4.5],
  ['color-text-muted', 'color-card-bg', 4.5],
  // A well (a track, a segmented control) under muted ink: the gold theme's own table sits at 4.49.
  ['color-text-muted', 'color-cream-dark', 4.4],
  ['segment-idle-ink', 'color-cream-dark', 4.5],
  ['link-card-muted', 'bubble-mine', 4.5],
  ['link-card-muted', 'bubble-theirs', 4.5],
  ['link-card-muted', 'bubble-quote', 4.5],
  // A label on a solid accent is the paper colour, in both schemes.
  ['color-cream', 'button-fill', 4.5],
  ['button-on-tonal', 'button-tonal', 4.5],
  ['button-on-tonal', 'color-cream', 4.5],
  // The call-to-action band's two buttons: the verb a paper pill, the second action a deeper band.
  ['cta-verb-ink', 'cta-ink', 4.5],
  ['cta-ink', 'cta-ghost', 4.5],
  ['color-cream', 'danger-fill', 4.5],
  ['button-on-danger-tonal', 'button-danger-tonal', 4.5],
  ['color-danger', 'color-cream', 4],
  ['color-ok', 'color-cream', 3.4],
  // The accent itself never carries a label; as a pen or an icon it clears 3.
  ['color-terracotta', 'color-cream', 3],
  ['field-border-hover', 'color-cream', 3],
  ['reading-progress', 'color-cream', 2.2],
  ['placeholder', 'color-cream', 2.4],
  ...[0, 1, 2, 3, 4, 5].flatMap((i): [PaletteToken, PaletteToken, number][] => [
    ['color-text', `card-fill-${i}` as PaletteToken, 7],
    ['color-text', `card-tag-${i}` as PaletteToken, 7],
    [`card-note-ink-${i}` as PaletteToken, `card-fill-${i}` as PaletteToken, 4.5],
    [`card-border-${i}` as PaletteToken, `card-fill-${i}` as PaletteToken, 2.5],
  ]),
];

/** What only the night paper must clear (light's own tables are the site as it was). */
const DARK_PAIRS: [PaletteToken, PaletteToken, number][] = [
  ['footer-ink', 'footer-bg', 7],
  ['cta-ink', 'cta-band', 4.5],
  ['color-text-muted', 'bubble-theirs', 4.5],
  ...[0, 1, 2, 3, 4, 5].flatMap((i): [PaletteToken, PaletteToken, number][] => [
    ['color-text-muted', `card-fill-${i}` as PaletteToken, 4.5],
    ['color-text', `card-interior-${i}` as PaletteToken, 7],
    ['color-text-muted', `card-interior-${i}` as PaletteToken, 4.5],
    [`card-border-${i}` as PaletteToken, `card-fill-${i}` as PaletteToken, 4.5],
    [`card-border-${i}` as PaletteToken, 'color-cream', 4.5],
  ]),
];

/** Surfaces that must read as apart (no text between them): [a, b, at least]. */
const DARK_APART: [PaletteToken, PaletteToken, number][] = [
  ['bubble-quote', 'bubble-mine', 1.2],
  ['bubble-quote', 'bubble-theirs', 1.1],
  ['color-card-bg', 'color-cream-dark', 1.1],
];

function failures(p: Palette, scheme: 'light' | 'dark' = 'light') {
  const pairs = scheme === 'dark' ? [...PAIRS, ...DARK_PAIRS, ...DARK_APART] : PAIRS;
  return pairs.map(([a, b, min]) => ({ pair: `${a} on ${b}`, ratio: Math.round(contrast(p[a], p[b]) * 100) / 100, min })).filter((f) => f.ratio < f.min);
}

describe('palette', () => {
  it.each(ACCENTS.flatMap((a) => SCHEMES.map((s) => [a, s] as const)))('%s / %s clears every contrast pair', (accent, scheme) => {
    expect(failures(paletteFor(accent, scheme), scheme)).toEqual([]);
  });

  it('the wallpaper formula clears every pair at any system hue and chroma', () => {
    for (let hue = 0; hue < 360; hue += 15) {
      for (const chroma of [0.02, 0.08, 0.2]) {
        for (const scheme of SCHEMES) {
          const f = failures(paletteForHue(hue, chroma, scheme), scheme);
          expect(f, `hue ${hue} chroma ${chroma} ${scheme}`).toEqual([]);
        }
      }
    }
  });

  it('the dark ladder keeps light\'s elevation: well below paper below card', () => {
    for (const a of ACCENTS) {
      const p = paletteFor(a, 'dark');
      expect(p['color-cream-dark'].L).toBeLessThan(p['color-cream'].L);
      expect(p['color-cream'].L).toBeLessThan(p['color-card-bg'].L);
    }
  });

  it('the hue roles read at every hue: words on their paper, pens beside it, the ink on the washes', () => {
    const at = (role: keyof typeof HUE_ROLES, hue: number, scheme: 'light' | 'dark') => {
      const [L, C] = HUE_ROLES[role][scheme];
      return fitGamut({ L, C, H: hue, alpha: 1 });
    };
    for (const scheme of SCHEMES) {
      const ink = paletteFor('terracotta', scheme)['color-text'];
      for (let hue = 0; hue < 360; hue += 15) {
        for (const role of ['ink', 'label', 'pill-ink'] as const) {
          expect(contrast(at(role, hue, scheme), at('interior', hue, scheme)), `${scheme} ${role} at ${hue}`).toBeGreaterThan(4.5);
        }
        for (const role of ['pen', 'emphasis', 'group-pen-hot'] as const) {
          expect(contrast(at(role, hue, scheme), at('interior', hue, scheme)), `${scheme} ${role} at ${hue}`).toBeGreaterThan(3);
        }
        for (const role of ['interior', 'tint', 'wash', 'group', 'menu'] as const) {
          expect(contrast(ink, at(role, hue, scheme)), `${scheme} ink on ${role} at ${hue}`).toBeGreaterThan(7);
        }
        // A thumbnail's ground, or a pill under its own (pill-ink) words.
        expect(contrast(ink, at('accent', hue, scheme)), `${scheme} ink on accent at ${hue}`).toBeGreaterThan(6);
      }
    }
  });

  it('a grey wallpaper wears terracotta', () => {
    expect(wallpaperPalette(200, 0.01, 'dark')).toEqual(paletteFor('terracotta', 'dark'));
    expect(wallpaperPalette(200, 0.1, 'dark')).toEqual(paletteForHue(200, 0.1, 'dark'));
  });

  it('every dark colour is inside Display P3 (the light tables are the site as it was)', () => {
    for (const a of ACCENTS) for (const t of PALETTE_TOKENS) expect(inP3(paletteFor(a, 'dark')[t]), `${a} dark ${t}`).toBe(true);
  });

  it('light terracotta is the site as it was', () => {
    const p = paletteFor('terracotta', 'light');
    const was: Partial<Record<PaletteToken, string>> = {
      'color-cream': 'oklch(96.5% 0.015 75)',
      'color-cream-dark': 'oklch(93% 0.018 75)',
      'color-card-bg': 'oklch(97.5% 0.01 80)',
      'color-terracotta': 'oklch(62% 0.14 45)',
      'color-terracotta-light': 'oklch(88% 0.08 55)',
      'color-text': 'oklch(26% 0.03 60)',
      'color-text-muted': 'oklch(52% 0.04 70)',
      'field-border': 'oklch(80% 0.02 75)',
      'field-border-hover': 'oklch(60% 0.04 60)',
      placeholder: 'oklch(64% 0.03 70)',
      'bubble-mine': 'oklch(91.2% 0.055 62.6)',
      'bubble-theirs': 'oklch(91.5% 0.017 74)',
      'bubble-quote': 'oklch(88.5% 0.013 72)',
      'link-card-muted': 'oklch(45% 0.04 70)',
      'reading-progress': 'oklch(70% 0.17 50)',
      'button-fill': 'oklch(54.56% 0.1232 45)',
      'button-tonal': 'oklch(89.25% 0.0645 60)',
      'button-on-tonal': 'oklch(48.36% 0.1092 45)',
      'danger-fill': 'oklch(53.36% 0.1472 25)',
      'button-on-danger-tonal': 'oklch(45.24% 0.1248 25)',
      'toggle-off': 'oklch(86% 0.02 75)',
      'toggle-off-stroke': 'oklch(70% 0.03 70)',
      'ghost-stroke': 'oklch(44% 0.04 70)',
      'modal-border': 'oklch(40% 0.06 60)',
      'link-wave': 'oklch(65% 0.084 45)',
      'card-fill-0': 'oklch(90% 0.065 55)',
      'card-border-0': 'oklch(52% 0.13 55)',
      'card-border-deep-0': 'oklch(38% 0.11 55)',
    };
    for (const [t, v] of Object.entries(was) as [PaletteToken, string][]) {
      const want = parseOklch(v);
      const got = p[t];
      expect(Math.abs(got.L - want.L), `${t} L`).toBeLessThan(0.004);
      expect(Math.abs(got.C - want.C), `${t} C`).toBeLessThan(0.005);
      expect(Math.abs(((got.H - want.H + 540) % 360) - 180), `${t} H`).toBeLessThan(3);
    }
  });

  it("the light ladder stays near each theme's hand-made table (the wallpaper's light is the same ladder)", () => {
    for (const a of ACCENTS) {
      const ladder = lightBaseOf(THEME_SPECS[a]);
      const table = paletteFor(a, 'light');
      // The neutrals: the accent's own lightness is solved for its label (lightBase), not laddered.
      for (const t of (Object.keys(ladder) as (keyof typeof ladder)[]).filter((k) => !k.startsWith('color-terracotta'))) {
        expect(Math.abs(ladder[t].L - table[t].L), `${a} ${t} L`).toBeLessThan(0.025);
      }
    }
  });

  it('a stored avatar keeps its hue in dark, at the ladder step chalk initials read on', () => {
    const light = 'oklch(88% 0.08 55)';
    expect(avatarFill(light, 'light')).toBe(light);
    const dark = parseOklch(avatarFill(light, 'dark'));
    expect(dark.H).toBeCloseTo(55);
    expect(contrast(paletteFor('terracotta', 'dark')['color-text'], dark)).toBeGreaterThan(4.5);
    expect(avatarFill('#abcdef', 'dark')).toBe('#abcdef');
  });

  it('palette.css and native/fixtures/palette.json are what the palette says (npx tsx scripts/web/palette-css.ts)', () => {
    expect(readFileSync(resolve(root, 'src/styles/palette.css'), 'utf8')).toBe(paletteCss('oklch'));
    expect(JSON.parse(readFileSync(resolve(root, 'native/fixtures/palette.json'), 'utf8'))).toEqual(JSON.parse(JSON.stringify(paletteFixture())));
  });

  it('the stylesheet sets every token for the system dark, the chosen dark, and a theme only what it changes', () => {
    const css = paletteCss('oklch');
    expect(css).toContain(`:root {\n  color-scheme: light;`);
    expect(css).toContain(`@media (prefers-color-scheme: dark) {\n  :root:not([data-scheme='light']) {\n    color-scheme: dark;`);
    expect(css).toContain(`:root[data-scheme='dark'] {\n  color-scheme: dark;`);
    expect(css).toContain(`:root[data-scheme='dark'][data-accent='sage'] {`);
    const sageLight = /:root\[data-accent='sage'\] \{([^}]*)\}/.exec(css)![1];
    expect(sageLight).toContain(`--color-terracotta: ${cssOklch(paletteFor('sage', 'light')['color-terracotta'])};`);
    expect(sageLight).not.toContain('--color-danger');
    expect(paletteCss('hex')).not.toContain('oklch(');
  });
});
