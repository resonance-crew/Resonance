/**
 * The Android app's colour literals, ratcheted: every colour a screen draws comes from the palette
 * (palette.ts → the generated ResonanceColors, read through Tokens and LocalResonanceColors), so it
 * follows the scheme and theme on screen (a colour from a card's own hue through the palette's hue
 * roles). A literal — `Color(0x…)`, `Color.White`/`Black`, a
 * `Color(r, g, b)` of floats, an `oklch(…)` written out — is a colour that stays light in dark mode
 * (or dark in light). The few that mean to stay the same in both are listed below with why; a new
 * one anywhere fails, and so does a listed file holding fewer than it says (lower its count).
 * Comments don't count. Generated code and the tests are not scanned.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '../../..');
const android = join(root, 'apps/android');

/** What is allowed to stay a literal, per file: how many, and why. */
const ALLOWED: Record<string, { count: number; why: string }> = {
  'app/src/main/kotlin/com/resonance/app/ui/Shared.kt': { count: 2, why: "fadingEdges' alpha mask (DstOut): black means opaque, not a colour" },
  'app/src/main/kotlin/com/resonance/app/ui/ThreadActions.kt': { count: 1, why: "a held message too tall for the room: its foot's fade, an alpha mask" },
  'core/design/src/main/kotlin/com/resonance/design/Story.kt': { count: 2, why: "a table's sideways fade: an alpha mask" },
  'core/design/src/main/kotlin/com/resonance/design/StoryToc.kt': { count: 2, why: "the contents rail's fade: an alpha mask" },
  'core/design/src/main/kotlin/com/resonance/design/Components.kt': { count: 1, why: "Google's mark on its white disc (the brand's own)" },
  'core/design/src/main/kotlin/com/resonance/design/ShareCardRecipe.kt': { count: 1, why: "the 9:16 share card's recipe (it leaves the device, light terracotta), pinned to the web's" },
  'core/design/src/main/kotlin/com/resonance/design/Composer.kt': { count: 8, why: "the field's and the sticker picker's scroll fades (round 22): alpha masks" },
  'app/src/main/kotlin/com/resonance/app/ui/Gallery.kt': { count: 2, why: "a photo's empty selection ring: white with a faint dark disc reads on any photo, as the system pickers draw it" },
  'core/design/src/main/kotlin/com/resonance/design/Grain.kt': { count: 1, why: 'the tile itself is black: no tinted copy is made for black ink' },
};

/** One kind of literal each. */
const PATTERNS: RegExp[] = [
  /\bColor\(0x[0-9A-Fa-f]+/g,
  /\bColor\.(?:White|Black|Gray|DarkGray|LightGray|Red|Green|Blue|Yellow|Cyan|Magenta)\b/g,
  /\bColor\(\s*-?[0-9.]+f\s*,/g,
  /\boklch\(\s*[0-9.]/g,
  /\bOklchColor\.of\(\s*[0-9.]/g,
  /\b(?:android\.graphics\.)?Color\.(?:BLACK|WHITE|GRAY|DKGRAY|LTGRAY|RED|GREEN|BLUE|YELLOW|CYAN|MAGENTA)\b/g,
  /\bColor\.parseColor\(/g,
  /\bColor\.rgb\(/g,
];

function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'build' || name === 'generated' || name === 'test' || name === 'androidTest' || name.startsWith('.')) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) sources(path, out);
    else if (name.endsWith('.kt')) out.push(path);
  }
  return out;
}

/** The code without its comments (a `//` after `:` is an address, not a comment). */
function code(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function count(text: string): number {
  const bare = code(text);
  return PATTERNS.reduce((n, p) => n + (bare.match(p)?.length ?? 0), 0);
}

describe('Android colour literals', () => {
  const files = ['app', 'core'].flatMap((d) => sources(join(android, d)));
  const found: Record<string, number> = Object.fromEntries(
    files.map((f) => [relative(android, f), count(readFileSync(f, 'utf8'))] as const).filter(([, n]) => n > 0),
  );

  it('scans the app and its modules', () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it('draws every other colour from the palette', () => {
    const extra = Object.entries(found).filter(([f, n]) => n > (ALLOWED[f]?.count ?? 0));
    expect(extra, 'colour literals where the palette should be (palette.ts → Tokens)').toEqual([]);
  });

  it('keeps its list as short as the code', () => {
    const stale = Object.entries(ALLOWED).filter(([f, { count: allowed }]) => (found[f] ?? 0) < allowed).map(([f, { count: allowed }]) => [f, found[f] ?? 0, allowed]);
    expect(stale, 'fewer literals than listed: lower the count (or drop the file)').toEqual([]);
  });

  it('counts a literal, not a comment', () => {
    expect(count('val a = Color.White // Color.Black\n/* Color(0xFF000000) */ val b = Tokens.Cream')).toBe(1);
    expect(count('OklchColor.of(0.3, 0.02, 70.0) + oklch(l, c, h) + "oklch(52% 0.11 h)" + Color(0.25f, 0.19f, 0.13f, 0.45f)')).toBe(3);
    expect(count('val url = "https://resonance.channel" // Color.Black')).toBe(0);
  });
});
