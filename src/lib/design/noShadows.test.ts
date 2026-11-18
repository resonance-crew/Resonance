import { describe, expect, it } from 'vitest';
import { KOTLIN_FILES, SWIFT_FILES, WEB_FILES, hitsIn, ratchet, scan, withoutComments, type Ratchet } from './sourceScan';

/**
 * No shadows anywhere (round 18, the owner's: the page is flat, so is every menu — what floats is told
 * by its line, as a card is; designs/DESIGN.md has listed "Strong drop shadows" as an anti-pattern since
 * 2026-04-24). Round 17's shadowed menus were reversed the next day, and an agent proposed a shade under
 * the landing film's paper as late as 2026-11-10. So: no `box-shadow` / `drop-shadow` / `text-shadow` on
 * the web, no `.shadow(` or layer shadow on iOS, no `shadow` / `elevation` on Android — outside the
 * files below, each with how many it keeps and why. The list can only shrink: a hit gone fails until
 * its number is lowered.
 */
const ALLOWED: Ratchet = {
  'src/styles/globals.css': {
    count: 1,
    why: "a shape's CSS stand-in draws its pen as an inset ring (`--shape-ink-width`, no blur, no offset) until the drawn shape fades in — a line, not a shadow",
  },
  'src/components/sections/MessagesPage/Thread.module.css': {
    count: 1,
    why: "a quoted bubble's keyboard focus: an inset 2px ring in the focus colour (no blur, no offset) — a line",
  },
  'src/components/molecules/CardDetail/ReadingProgress.module.css': {
    count: 1,
    why: "the reading-progress line's soft glow (`--reading-progress-glow`, round 5 E1) — the one glow kept; iOS Chrome.swift and Android Chrome.kt draw its twins",
  },
  'src/components/sections/LandingFilm/film.module.css': {
    count: 2,
    why: "the film's graphite contour on a puppet crossing sky and paper: four 1px drop-shadows with no blur trace an outline — a pen line, not a shade",
  },
  'apps/ios/Packages/DesignSystem/Sources/DesignSystem/Components/Chrome.swift': {
    count: 1,
    why: "the reading-progress line's glow, the web's ReadingProgress twin",
  },
};

/** CSS (and CSS written in strings): a shadow other than `none`, a drop-shadow filter, an SVG drop shadow. */
const WEB = [
  /(?:box|text)-shadow\s*:\s*(?!\s*(?:none|initial|unset|inherit)\b)/,
  /\b(?:boxShadow|textShadow)\s*:\s*(?!\s*['"`]\s*none\b)/,
  /drop-shadow\(/,
  /<feDropShadow\b/,
];
/** SwiftUI's `.shadow(…)` and a layer's shadow. */
const SWIFT = [/\.shadow\s*\(/, /\bshadow(?:Opacity|Radius|Offset|Color|Path)\s*=/];
/** Compose's `Modifier.shadow`, a Surface's shadow, a Material elevation other than none. */
const KOTLIN = [
  /\.shadow\s*\(/,
  /\bshadowElevation\s*=/,
  /\b(?:card|button|floatingActionButton)Elevation\s*\(/,
  /(?<![\w.])elevation\s*=(?!\s*0(?:\.0)?(?:f|\.dp)\b)/,
];

describe('no shadows anywhere', () => {
  const web = WEB_FILES();
  const swift = SWIFT_FILES();
  const kotlin = KOTLIN_FILES();
  const found = {
    ...scan(web, (f) => hitsIn(f, WEB)),
    ...scan(swift, (f) => hitsIn(f, SWIFT)),
    ...scan(kotlin, (f) => hitsIn(f, KOTLIN)),
  };
  const { over, under } = ratchet(found, ALLOWED);

  it('reads all three platforms', () => {
    expect(web.length).toBeGreaterThan(300);
    expect(swift.length).toBeGreaterThan(100);
    expect(kotlin.length).toBeGreaterThan(100);
  });

  it('casts none outside the listed exceptions: what floats is told by its line', () => {
    expect(over, 'a shadow (round 18: no shadow anywhere — draw the pen line instead)').toEqual([]);
  });

  it('keeps its list of exceptions as short as the code', () => {
    expect(under, 'an exception with fewer shadows left: lower its count or remove it').toEqual([]);
  });

  it('counts a shadow, not a comment, a `none` or a token named shadow', () => {
    const probe = (line: string, patterns: RegExp[], css = false) => patterns.some((re) => re.test(withoutComments(line, css)));
    expect(probe('box-shadow: 0 2px 8px var(--x);', WEB, true)).toBe(true);
    expect(probe('filter: drop-shadow(0 0 4px var(--x));', WEB, true)).toBe(true);
    expect(probe("style={{ boxShadow: '0 1px 2px var(--x)' }}", WEB)).toBe(true);
    expect(probe('<feDropShadow dx="2" />', WEB)).toBe(true);
    expect(probe('box-shadow: none;', WEB, true)).toBe(false);
    expect(probe("boxShadow: 'none'", WEB)).toBe(false);
    expect(probe('transition: background-color 280ms, box-shadow 280ms;', WEB, true)).toBe(false);
    expect(probe('/* no box-shadow: 0 0 2px lift */', WEB, true)).toBe(false);
    expect(probe('.shadow(color: .black, radius: 4)', SWIFT)).toBe(true);
    expect(probe('layer.shadowOpacity = 0.2', SWIFT)).toBe(true);
    expect(probe('pressInk: Tokens.shadowInk.opacity(0.14)', SWIFT)).toBe(false);
    expect(probe('/// never a shadow: no .shadow(', SWIFT)).toBe(false);
    expect(probe('Modifier.shadow(4.dp, shape)', KOTLIN)).toBe(true);
    expect(probe('Surface(shadowElevation = 2.dp) {}', KOTLIN)).toBe(true);
    expect(probe('Card(elevation = CardDefaults.cardElevation(2.dp))', KOTLIN)).toBe(true);
    expect(probe('Surface(elevation = 0.dp)', KOTLIN)).toBe(false);
    expect(probe('// the deep shadow ink, 20%', KOTLIN)).toBe(false);
  });
});
