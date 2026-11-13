import { describe, expect, it } from 'vitest';
import { KOTLIN_FILES, SWIFT_FILES, WEB_FILES, hitsIn, ratchet, relPath, scan, withoutComments, type Ratchet } from './sourceScan';

/**
 * One pen (src/lib/design/strokes.ts; the resonance-ui skill's pre-ship check 1): every line the UI
 * draws is `INK` / `INK_LIGHT` / `INK_STRONG` (the apps' `Tokens.ink` / `inkLight` / `inkStrong`) —
 * a real pen lays down the same line on a big card and a small button. So no number as a stroke's
 * width: web `strokeWidth={1.2}` / `stroke-width: 2px`, Swift `lineWidth: 1`, Kotlin `Stroke(7.dp…)` /
 * `strokeWidth = 1.8f`. A width of 0 (no line at all) is not a pen. Drawn art with its own pens is
 * outside the rule (ART); everything else that still writes a number is listed with how many and why,
 * and the list can only shrink.
 */
const ART: { path: string; why: string }[] = [
  { path: 'src/lib/mascots/', why: "the paper puppets' props: drawn art, not the UI's pen" },
  { path: 'src/components/sections/LandingFilm/', why: "the landing film's world: drawn art in its own pens" },
  { path: 'src/components/lab/', why: "the landing lab's prototypes (unlinked, noindex)" },
  { path: 'src/components/sections/AboutPage/AboutArt.tsx', why: "About's illustration" },
  { path: 'src/components/sections/PaperPalsPage/BlankPal.tsx', why: "the Paper Pals page's blank sixth: drawn art" },
];

const ALLOWED: Ratchet = {
  'src/components/molecules/ThoughtMap/ThoughtMapCanvas.tsx': {
    count: 1,
    why: "an edge's invisible 16px hit area (a transparent stroke for the pointer) — the skill's one sanctioned exception",
  },
  'src/app/[locale]/(app)/card/[slug]/CardDetailClient.tsx': {
    count: 2,
    why: "the resonances' and related section edges' rule at 1.2 — INK_LIGHT by value, not by name",
  },
  'src/components/sections/WriteWorkspace/WriteWorkspace.module.css': {
    count: 1,
    why: "the Leave's glyph at 1.8 in CSS (INK by value; CSS can't read strokes.ts), easing to the ✓'s width",
  },
  'src/components/sections/MessagesPage/Thread.module.css': {
    count: 1,
    why: "a sticker cell's keyboard focus ring at 2px, non-scaling — a focus mark beside the pen",
  },
  'src/components/molecules/OrganicMenu/OrganicMenu.module.css': {
    count: 1,
    why: "a bare menu trigger's keyboard focus ring at 2px, non-scaling",
  },
  'src/components/atoms/BareIconButton/BareIconButton.module.css': {
    count: 1,
    why: "a glyph button's keyboard focus ring at 2px, non-scaling",
  },
  'apps/ios/Resonance/Features/Write/WriteWorkspace.swift': {
    count: 1,
    why: "the workspace divider's grip: a hair of the fields' border at 1 round the arrows",
  },
  'apps/ios/Resonance/Features/ThoughtMap/MapNodeView.swift': {
    count: 1,
    why: "a node's dashed drop ring at 1.6 — between INK_LIGHT and INK, a dash pattern of its own",
  },
  'apps/android/core/design/src/main/kotlin/com/resonance/design/Crop.kt': {
    count: 1,
    why: "the crop ring's 7dp track: a handle's width, not a pen line",
  },
  'apps/android/core/design/src/main/kotlin/com/resonance/design/ShareCard.kt': {
    count: 1,
    why: "the 9:16 share card's verified mark at 1.8 (INK by value) inside a fixed-size picture",
  },
  'apps/android/app/src/main/kotlin/com/resonance/app/ui/CardScreen.kt': {
    count: 1,
    why: "the byline's verified mark at 1.8 — INK by value: should be Tokens.Ink",
  },
  'apps/android/app/src/main/kotlin/com/resonance/app/ui/Workspace.kt': {
    count: 1,
    why: "the split's boundary: a hair of the fields' border (1dp) on the pane's leading edge",
  },
};

/** A number (not 0) where a width belongs. */
const NUM = String.raw`(?!0(?:\.0+)?(?![\d.]))\d*\.?\d+`;
const WEB = [
  new RegExp(String.raw`\bstrokeWidth\s*=\s*\{\s*${NUM}`),
  new RegExp(String.raw`\bstrokeWidth\s*=\s*['"]\s*${NUM}`),
  new RegExp(String.raw`\bstrokeWidth\s*:\s*['"]?\s*${NUM}`),
  new RegExp(String.raw`\bstroke-width\s*[:=]\s*['"]?\s*${NUM}`),
];
const SWIFT = [new RegExp(String.raw`\blineWidth\s*:\s*${NUM}`)];
const KOTLIN = [
  new RegExp(String.raw`\bStroke\(\s*(?:width\s*=\s*)?${NUM}`),
  new RegExp(String.raw`\bstrokeWidth\s*=\s*${NUM}`),
];

const isArt = (file: string) => ART.some((a) => (a.path.endsWith('/') ? file.startsWith(a.path) : file === a.path));

describe('one pen', () => {
  const web = WEB_FILES().filter((f) => !isArt(relPath(f)));
  const found = {
    ...scan(web, (f) => hitsIn(f, WEB)),
    ...scan(SWIFT_FILES(), (f) => hitsIn(f, SWIFT)),
    ...scan(KOTLIN_FILES(), (f) => hitsIn(f, KOTLIN)),
  };
  const { over, under } = ratchet(found, ALLOWED);

  it('draws every line with INK / INK_LIGHT / INK_STRONG outside the listed exceptions', () => {
    expect(over, 'a numeric stroke width (one pen: use INK / INK_LIGHT / INK_STRONG, the apps’ Tokens.ink…)').toEqual([]);
  });

  it('keeps its list of exceptions as short as the code', () => {
    expect(under, 'an exception with fewer numbers left: lower its count or remove it').toEqual([]);
  });

  it('counts a number, not a token, a 0 or a comment', () => {
    const probe = (line: string, patterns: RegExp[], css = false) => patterns.some((re) => re.test(withoutComments(line, css)));
    expect(probe('strokeWidth={1.2}', WEB)).toBe(true);
    expect(probe('strokeWidth="2"', WEB)).toBe(true);
    expect(probe('stroke-width: 2px;', WEB, true)).toBe(true);
    expect(probe('{ strokeWidth: 1.5 }', WEB)).toBe(true);
    expect(probe('strokeWidth={INK}', WEB)).toBe(false);
    expect(probe('strokeWidth={0}', WEB)).toBe(false);
    expect(probe('stroke-width: var(--pen);', WEB, true)).toBe(false);
    expect(probe('// strokeWidth={2} was too heavy', WEB)).toBe(false);
    expect(probe('shape.strokeBorder(color, lineWidth: 1)', SWIFT)).toBe(true);
    expect(probe('StrokeStyle(lineWidth: Tokens.ink)', SWIFT)).toBe(false);
    expect(probe('val track = Stroke(7.dp.toPx(), cap = StrokeCap.Round)', KOTLIN)).toBe(true);
    expect(probe('Stroke(width = 2f)', KOTLIN)).toBe(true);
    expect(probe('OrganicIcon(name, strokeWidth = 1.8f)', KOTLIN)).toBe(true);
    expect(probe('Stroke(Tokens.Ink.toPx())', KOTLIN)).toBe(false);
    expect(probe('Stroke(pen * s.width)', KOTLIN)).toBe(false);
  });
});
