import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The web's colour ratchet: outside the files below, no source writes a
 * colour of its own — everything that is drawn goes through the palette
 * (src/lib/design/palette.ts → palette.css), so dark mode and every theme
 * reach it. A literal that must stay (a mask's luminance, a brand's own
 * colour, what lies over a picture in either scheme) says why on its line or
 * the line above with a `colour-fixed:` comment.
 */
const root = resolve(__dirname, '../../..');

/** Files that may write colours: the palette and its generators, and what draws outside the page's stylesheet. */
const ALLOWED: { path: string; why: string }[] = [
  { path: 'src/lib/design/palette.ts', why: 'the palette itself' },
  { path: 'src/lib/design/paletteCss.ts', why: 'writes palette.css' },
  { path: 'src/lib/design/paletteFixture.ts', why: "writes the apps' fixture" },
  { path: 'src/lib/design/oklch.ts', why: 'colour maths' },
  { path: 'src/lib/design/contrast.ts', why: "the contrast audit's maths" },
  { path: 'src/styles/palette.css', why: 'generated from the palette' },
  { path: 'src/lib/design/cardColours.ts', why: "light card families for what draws without the page's CSS (og image, share card)" },
  { path: 'src/lib/design/avatarColors.ts', why: 'stored avatar colours (data, drawn through personFill)' },
  { path: 'src/lib/design/reactions.ts', why: "the reaction stickers keep their colours in both schemes, as emoji do (the rim is the palette's)" },
  { path: 'src/lib/share/', why: 'the 9:16 share card: always light terracotta' },
  { path: 'src/lib/linkImage/', why: 'the og image: always light terracotta' },
  { path: 'src/app/api/og/', why: 'the og image routes: always light terracotta' },
  { path: 'src/lib/api/shareImage.ts', why: 'the og image: always light terracotta' },
  { path: 'src/components/atoms/BrandMark/', why: "other companies' marks, unmodified" },
  { path: 'src/components/atoms/GoogleMark/', why: "Google's own colours" },
  { path: 'src/app/global-error.tsx', why: 'fallbacks for when the stylesheet itself failed' },
];

const allowed = (file: string) => ALLOWED.some((a) => (a.path.endsWith('/') ? file.startsWith(a.path) : file === a.path));

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return sources(full);
    return /\.(tsx?|css)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : [];
  });
}

/** A colour written out: oklch() / rgb() / hsl() with numbers, a hex colour, white / black as a value. */
const LITERAL = [
  /oklch\(\s*[\d.]/,
  /\b(?:rgba?|hsla?)\(\s*[\d.]/,
  /(?:^|[\s'"`(,:=])#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b(?![\w-])/,
  /['"`]\s*(?:white|black)\s*['"`]/,
  /\b(?:white|black)\s+\d+(?:\.\d+)?%/,
  /:\s*(?:white|black)\b(?!-)/,
  /[,(]\s*(?:white|black)\b(?!-)/,
];

/** The source with comments blanked (their lines kept, so line numbers hold). */
function stripComments(text: string, css: boolean): string {
  const blank = (m: string) => m.replace(/[^\n]/g, ' ');
  let out = text.replace(/\/\*[\s\S]*?\*\//g, blank);
  if (!css) out = out.replace(/(^|[^:'"`\\])\/\/[^\n]*/g, (m, lead: string) => lead + blank(m.slice(lead.length)));
  return out;
}

/** Each colour literal outside a mask and without a `colour-fixed:` reason: [file:line, the line]. */
function literalsIn(file: string): string[] {
  const text = readFileSync(file, 'utf8');
  const css = file.endsWith('.css');
  const raw = text.split('\n');
  const lines = stripComments(text, css).split('\n');
  const found: string[] = [];
  // A CSS declaration may run over lines (a mask's gradient): carry its property along.
  let property = '';
  lines.forEach((line, i) => {
    if (css) {
      const decl = /^\s*([-\w]+)\s*:/.exec(line);
      if (decl) property = decl[1];
    }
    const fixed = /colour-fixed:/.test(raw[i]) || (i > 0 && /colour-fixed:/.test(raw[i - 1]));
    const mask = /mask/i.test(line) || (css && /mask/.test(property));
    if (!fixed && !mask && LITERAL.some((re) => re.test(line))) found.push(`${relative(root, file)}:${i + 1}  ${line.trim()}`);
    if (css && /[;{}]\s*$/.test(line)) property = '';
  });
  return found;
}

describe('colour literals on the web', () => {
  it('none outside the palette and the files that draw without the page’s stylesheet', () => {
    const files = sources(resolve(root, 'src')).filter((f) => !allowed(relative(root, f)));
    expect(files.length).toBeGreaterThan(200);
    expect(files.flatMap(literalsIn)).toEqual([]);
  });

  it('catches what it is meant to catch', () => {
    const probe = (line: string, css = false) => LITERAL.some((re) => re.test(stripComments(line, css)));
    expect(probe("fill: 'oklch(90% 0.06 55)'")).toBe(true);
    expect(probe('color: color-mix(in oklch, var(--color-terracotta), black 25%);', true)).toBe(true);
    expect(probe('background: oklch(0% 0 0 / 0.07);', true)).toBe(true);
    expect(probe("ctx.fillStyle = '#f7f1e6';")).toBe(true);
    expect(probe('fill="white"')).toBe(true);
    expect(probe('border: 1px solid rgb(0 0 0 / 10%);', true)).toBe(true);
    // Tokens, relative colours, hue roles and comments are not literals.
    expect(probe('color: var(--color-text); white-space: nowrap;', true)).toBe(false);
    expect(probe('oklch(var(--hue-pen) ${hue})')).toBe(false);
    expect(probe('oklch(from var(--av) 0.4 calc(c * 0.85) h)', true)).toBe(false);
    expect(probe('/* black ink, oklch(20% 0 0) */', true)).toBe(false);
    expect(probe("url(#sg-${id}) // a #fff note")).toBe(false);
    expect(probe("href='#download'")).toBe(false);
  });
});
