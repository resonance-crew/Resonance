import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Blur-to-sharp on iOS and the Mac (Wave 2 #7): a remote picture that arrives after its box is on screen comes in
 * blurred and sharpens, one at hand is simply there — and that rule lives in one place, `CoverLazyImage`
 * (DesignSystem/Components/OrganicImage.swift, on `ImageReveal`), or on a chat picture drawn from the app's own
 * store with `.imageReveal(…)` on the same line. A picture drawn any other way (`LazyImage(`, `Image(uiImage:`)
 * skips the reveal, so this counts them: a file may hold only what EXCLUDED says, each with why (pictures that are
 * never revealed: stickers, the share card's renderer, a composer's or writer's own picture, the app's own art), and
 * whatever is left is the unshared count, pinned at UNSHARED. The counts are exact and only ever fall.
 */
const root = resolve(__dirname, '../../..');
const IOS = resolve(root, 'apps/ios');

/** file (relative to apps/ios) → [direct draws allowed, why]. */
const EXCLUDED: Record<string, [number, string]> = {
  // The shared component itself.
  'Packages/DesignSystem/Sources/DesignSystem/Components/OrganicImage.swift': [1, 'CoverLazyImage: the one LazyImage, the reveal in it'],
  // Stickers: bundled art playing its own frames (never blurred in).
  'Resonance/Features/Messages/ThreadStickers.swift': [1, "a sticker's frames (the album tile beside it is revealed)"],
  'Resonance/Features/Messages/StickerPanel.swift': [1, "the picker's sticker cells"],
  // The 9:16 share card is rendered off screen into a picture that leaves the device.
  'Packages/DesignSystem/Sources/DesignSystem/Cards/ShareCardView.swift': [2, "the share card's renderer (cover, author photo)"],
  // Pictures already on the device: a composer's or writer's own, a streaming preview, a crop.
  'Resonance/Features/Messages/ThreadComposer.swift': [1, 'the composer’s chosen pictures (local)'],
  'Packages/DesignSystem/Sources/DesignSystem/Components/Messages.swift': [1, 'a composer row tile’s picked picture (local)'],
  'Packages/DesignSystem/Sources/DesignSystem/Components/Writing.swift': [1, 'HandDrawnImage’s `.image` source: a picture just picked (local)'],
  'Resonance/Features/Write/PublishStep.swift': [1, 'the illustration streaming in (a local partial preview)'],
  'Packages/DesignSystem/Sources/DesignSystem/Components/Atoms.swift': [1, 'HandDrawnAvatar’s `image`: a photo just cropped (local)'],
  // The app's own art, drawn from the bundle.
  'Packages/DesignSystem/Sources/DesignSystem/Grain/GrainLayer.swift': [2, 'grain tiles (bundled)'],
  'Packages/DesignSystem/Sources/DesignSystem/Components/OrganicIcon.swift': [1, 'icons (bundled template images)'],
  'Packages/DesignSystem/Sources/DesignSystem/Components/SquareFlag.swift': [1, 'flags (bundled)'],
};

/** Remote pictures drawn outside the shared component and with no reveal: none since Wave 2 (only ever falls). */
const UNSHARED = 0;

const PATTERNS: RegExp[] = [/(?<![A-Za-z])LazyImage\s*\(/g, /\bImage\(\s*uiImage:/g];

function swiftFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    // dot folders too: Xcode's derived data kept beside the project (-derivedDataPath .dd-ios) holds the packages' sources
    if (name.startsWith('.') || ['build', 'Generated', 'ResonanceTests', 'Tests', 'Resonance.xcodeproj'].includes(name)) continue;
    if (statSync(p).isDirectory()) out.push(...swiftFiles(p));
    else if (name.endsWith('.swift')) out.push(p);
  }
  return out;
}

/** The code of a line, its `//` comment left out. */
const code = (line: string) => line.replace(/^\s*\/\/.*$/, '').replace(/\s\/\/\s.*$/, '');

function draws(file: string): string[] {
  const found: string[] = [];
  readFileSync(file, 'utf8')
    .split('\n')
    .forEach((line, i) => {
      const c = code(line);
      // A chat picture from the app's own store, revealed where it is drawn.
      if (c.includes('.imageReveal(')) return;
      for (const re of PATTERNS) for (const m of c.matchAll(re)) found.push(`${i + 1}: ${m[0].trim()} — ${line.trim()}`);
    });
  return found;
}

describe('iOS remote pictures go through the shared image component (blur-to-sharp)', () => {
  const files = swiftFiles(IOS);

  it('finds the app', () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it('every direct draw is an excluded one, file by file, and the rest stay at the pinned count', () => {
    const counts: Record<string, string[]> = {};
    for (const f of files) {
      const hits = draws(f);
      if (hits.length) counts[relative(IOS, f)] = hits;
    }
    const overExcluded = Object.entries(counts)
      .filter(([f, hits]) => EXCLUDED[f] && hits.length > EXCLUDED[f][0])
      .map(([f, hits]) => `${f} (${hits.length}, excluded ${EXCLUDED[f][0]}):\n  ${hits.join('\n  ')}`);
    const unshared = Object.entries(counts)
      .filter(([f]) => !EXCLUDED[f])
      .flatMap(([f, hits]) => hits.map((h) => `${f}:${h}`));
    const stale = Object.entries(EXCLUDED)
      .filter(([f, [n]]) => (counts[f]?.length ?? 0) < n)
      .map(([f, [n]]) => `${f} (${counts[f]?.length ?? 0}, excluded ${n})`);
    expect(overExcluded, 'a new direct draw in an excluded file: draw a remote picture through CoverLazyImage / OrganicImage / RemoteImage').toEqual([]);
    expect(unshared.length, `remote pictures outside CoverLazyImage (use it, or .imageReveal on a store's picture):\n${unshared.join('\n')}`).toBeLessThanOrEqual(UNSHARED);
    expect(unshared.length, 'fewer unshared draws than pinned: lower UNSHARED').toBe(UNSHARED);
    expect(stale, 'excluded files with fewer draws than listed: lower or remove them').toEqual([]);
  });
});
