import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The iOS app's colours come from the palette (src/lib/design/palette.ts → Generated/Tokens.swift,
 * dynamic by scheme and theme). A colour written into a Swift file stays the same in dark mode and in
 * every theme — the "small component left unconverted" (spec §6.2). This scans apps/ios for colour
 * literals outside generated code and tests; a file may hold only what ALLOWED says, each with why.
 * The counts are exact, so the list only ever shrinks: remove one, lower its number.
 */
const root = resolve(__dirname, '../../..');
const IOS = resolve(root, 'apps/ios');

/** file (relative to apps/ios) → [literals allowed, why]. */
const ALLOWED: Record<string, [number, string]> = {
  // The palette's own machinery: oklch numbers made into Display P3 colours.
  'Packages/DesignSystem/Sources/DesignSystem/Color/OKLCHColor.swift': [2, "the palette's machinery (oklch → P3)"],
  'Packages/DesignSystem/Sources/DesignSystem/Color/Palette.swift': [3, "the palette's machinery (its tables → UIColor)"],
  // Masks: only their alpha is read.
  'Packages/DesignSystem/Sources/DesignSystem/Components/ScrollEdgeFades.swift': [3, 'a mask (alpha only)'],
  'Packages/DesignSystem/Sources/DesignSystem/Story/StoryTable.swift': [3, 'a mask (alpha only)'],
  'Resonance/Features/Write/StoryEditor.swift': [3, 'a mask (alpha only)'],
  'Resonance/Features/ThoughtMap/MapNodeView.swift': [1, 'a mask (alpha only)'],
  // A shape's coverage handed to the grain shader, which draws --grain-ink itself.
  'Packages/DesignSystem/Sources/DesignSystem/Grain/GrainLayer.swift': [1, 'coverage for the grain shader'],
  // A template image: UIKit tints it.
  'Packages/DesignSystem/Sources/DesignSystem/Components/OrganicIcon.swift': [1, 'a template image (tinted where drawn)'],
  // Google's mark stands on a white disc in both schemes (its brand rules).
  'Packages/DesignSystem/Sources/DesignSystem/Components/OrganicButton.swift': [1, "Google's mark on its white disc"],
  // The picture viewer is dark in both schemes, and what stands on a picture is fixed.
  'Resonance/Features/Messages/ChatPictureViewer.swift': [1, "the picture viewer's black"],
  'Packages/DesignSystem/Sources/DesignSystem/Color/DerivedTokens.swift': [3, "the image chip over a picture, the viewer's dark"],
  'Resonance/Features/Settings/AvatarCrop.swift': [1, 'the crop scrim over the photo'],
  // The 9:16 share card leaves the device: always light terracotta (spec §1.5).
  'Packages/DesignSystem/Sources/DesignSystem/Cards/ShareCardRecipe.swift': [1, 'the share card (light terracotta always)'],
  // `.black` here is a font weight, not a colour.
  'Packages/DesignSystem/Sources/DesignSystem/Typography/AppFonts.swift': [1, 'UIFont.Weight.black'],
};

const PATTERNS: RegExp[] = [
  /\b(?:UI)?Color\(\s*(?:red|white|hue|displayP3Red)\s*:/g,
  /\bColor\(\s*\.(?:displayP3|sRGB|sRGBLinear)\b/g,
  /\b(?:UI)?Color\.(?:white|black|gray|grey|red|orange|yellow|green|blue|purple|pink|brown|cyan|mint|teal|indigo|primary|secondary|label|secondaryLabel|systemBackground|system[A-Z]\w*)\b/g,
  // (not `.yellow`: a palette token of that name)
  /[([,:=]\s*\.(?:white|black|gray|red|orange|green|blue)\b(?!\s*:)/g,
  /\bOKLCHColor\.(?:color|parse)\(\s*["\d.]/g,
  /"oklch\(/g,
  /#colorLiteral/g,
];

function swiftFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (['build', '.build', 'Generated', 'ResonanceTests', 'Tests', 'Resonance.xcodeproj'].includes(name)) continue;
    if (statSync(p).isDirectory()) out.push(...swiftFiles(p));
    else if (name.endsWith('.swift')) out.push(p);
  }
  return out;
}

/** The code of a line, its `//` comment left out (a `//` inside a string literal is rare enough to ignore). */
const code = (line: string) => line.replace(/^\s*\/\/.*$/, '').replace(/\s\/\/\s.*$/, '');

function literals(file: string): string[] {
  const found: string[] = [];
  readFileSync(file, 'utf8')
    .split('\n')
    .forEach((line, i) => {
      const c = code(line);
      for (const re of PATTERNS) for (const m of c.matchAll(re)) found.push(`${i + 1}: ${m[0].trim()} — ${line.trim()}`);
    });
  return found;
}

describe('iOS colour literals', () => {
  const files = swiftFiles(IOS);

  it('finds the app', () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it('every colour outside the palette is one the list allows, file by file (lower a count when you remove one)', () => {
    const counts: Record<string, string[]> = {};
    for (const f of files) {
      const hits = literals(f);
      if (hits.length) counts[relative(IOS, f)] = hits;
    }
    const unexpected = Object.entries(counts)
      .filter(([f, hits]) => hits.length !== (ALLOWED[f]?.[0] ?? 0))
      .map(([f, hits]) => `${f} (${hits.length}, allowed ${ALLOWED[f]?.[0] ?? 0}):\n  ${hits.join('\n  ')}`);
    const stale = Object.keys(ALLOWED).filter((f) => !counts[f]);
    expect(unexpected, 'a colour literal: use a Tokens colour (the palette), Palette.hue, or Palette.mix').toEqual([]);
    expect(stale, 'allowed files with no literal left: remove them from ALLOWED').toEqual([]);
  });
});
