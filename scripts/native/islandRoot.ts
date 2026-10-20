/**
 * The editor island's :root: the web's tokens (src/styles/tokens.css) as a
 * WebView reads them, so the island sets a story with src/styles/story.css —
 * the reader's and the web writer's own rules — instead of a copy of its own
 * numbers. scripts/native/build-editor.mjs puts it first in the island's
 * stylesheet.
 *
 * Every declaration a story's type can read is carried over: the faces, the
 * story's numbers, the measure, the colours and the radii. Lengths, numbers
 * and font stacks go as written (next/font's --font-* variables are absent in
 * the island, so each stack falls back to the family name the island's
 * @font-face rules declare). Colours are resolved here, the way CSS does it
 * (./oklch), to #rrggbb or rgb(r g b / a): an older Android WebView has no
 * oklch() or color-mix(). A colour this can't resolve is left out.
 */
import { mix, mixWithBlack, parseOklch, srgbHex, type Oklch } from './oklch';

/** The tokens a story's type may read. */
const CARRIED = /^(?:font-|story-|color-|button-|radius-)|^(?:measure|placeholder|link-card-muted)$/;

/** The declarations of a stylesheet's custom properties, comments left out (the last one of a name wins). */
export function customProperties(css: string): Map<string, string> {
  const out = new Map<string, string>();
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const m of bare.matchAll(/--([\w-]+)\s*:\s*([^;{}]+);/g)) out.set(m[1], m[2].trim());
  return out;
}

/** Splits a function's arguments at its top-level commas. */
function args(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let from = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '(') depth++;
    else if (s[i] === ')') depth--;
    else if (s[i] === ',' && depth === 0) {
      out.push(s.slice(from, i).trim());
      from = i + 1;
    }
  }
  out.push(s.slice(from).trim());
  return out;
}

type Colour = Oklch | 'black' | 'transparent';

function colour(value: string, tokens: Map<string, string>, seen: Set<string>): Colour | null {
  const v = value.trim();
  if (v === 'black') return 'black';
  if (v === 'transparent') return 'transparent';
  if (/^oklch\([^)]*\)$/.test(v)) return parseOklch(v);
  const ref = /^var\(\s*--([\w-]+)\s*(?:,\s*([\s\S]+))?\)$/.exec(v);
  if (ref) {
    const [, name, fallback] = ref;
    const own = tokens.get(name);
    if (own != null && !seen.has(name)) return colour(own, tokens, new Set([...seen, name]));
    return fallback ? colour(fallback, tokens, seen) : null;
  }
  const mixed = /^color-mix\(\s*in oklch\s*,([\s\S]+)\)$/.exec(v);
  if (!mixed) return null;
  const parts = args(mixed[1]).map((part) => {
    const m = /^([\s\S]+?)(?:\s+([\d.]+)%)?$/.exec(part)!;
    return { c: colour(m[1], tokens, seen), p: m[2] == null ? null : Number(m[2]) / 100 };
  });
  if (parts.length !== 2) return null;
  const [a, b] = parts;
  if (!a.c || !b.c || a.c === 'black' || a.c === 'transparent') return null;
  // color-mix(in oklch, X, black N%)
  if (b.c === 'black') return b.p == null ? null : mixWithBlack(a.c, b.p);
  // color-mix(in oklch, X P%, transparent): X at P% opacity (transparent's hue and lightness are "none").
  if (b.c === 'transparent') return a.p == null ? null : { ...a.c, alpha: a.c.alpha * a.p };
  // color-mix(in oklch, X P%, Y)
  return mix(a.c, b.c, a.p ?? (b.p == null ? 0.5 : 1 - b.p));
}

const COLOURISH = /oklch\(|color-mix\(|\b(?:black|transparent)\b/;

function cssColour(c: Oklch): string {
  const hex = srgbHex(c);
  if (c.alpha >= 1) return hex;
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return `rgb(${r} ${g} ${b} / ${Math.round(c.alpha * 1000) / 1000})`;
}

/** The island's `:root { … }`, from tokens.css's text. */
export function islandRoot(tokensCss: string): string {
  const tokens = customProperties(tokensCss);
  const lines: string[] = [];
  for (const [name, value] of tokens) {
    if (!CARRIED.test(name)) continue;
    if (COLOURISH.test(value)) {
      const c = colour(value, tokens, new Set([name]));
      if (c && c !== 'black' && c !== 'transparent') lines.push(`  --${name}: ${cssColour(c)};`);
      continue;
    }
    lines.push(`  --${name}: ${value};`);
  }
  return `/* The web's tokens (src/styles/tokens.css), resolved for the island by scripts/native/islandRoot.ts. */\n:root {\n${lines.join('\n')}\n}\n`;
}
