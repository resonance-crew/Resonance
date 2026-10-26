import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { INK } from './strokes';
import { lightRootCss } from './paletteCss';
import { WAVE_AMP, WAVE_DEPTH_EM, WAVE_INK, WAVE_TILE, WAVE_TILE_H, storyLinkWave, storyLinkWaveStyle, storyLinkWaveVars, waveInk } from './storyLinkWave';
import { penWaveTilePoints } from './wavyPath';
import { seedFromString } from './prng';

/** The SVG inside a tile's `url("data:…")`. */
const svgOf = (css: string) => decodeURIComponent(css.slice('url("data:image/svg+xml,'.length, -'")'.length));

describe('storyLinkWave', () => {
  it('draws the whole stroke inside its tile, so no crest is ever cut at the tile’s edge', () => {
    for (const href of ['https://example.com/a', 'https://example.com/b', 'editor', '']) {
      const svg = svgOf(storyLinkWave(href).rest);
      expect(svg).toContain(`width="${WAVE_TILE}" height="${WAVE_TILE_H}" viewBox="0 ${-WAVE_TILE_H / 2} ${WAVE_TILE} ${WAVE_TILE_H}"`);
      expect(svg).toContain(`stroke-width="${INK}"`);
      // Its farthest crest (at most 1.35 × WAVE_AMP off the line), plus half the pen, stays inside the half tile.
      const ys = penWaveTilePoints(WAVE_TILE, seedFromString(href), WAVE_AMP).map(([, y]) => Math.abs(y));
      expect(Math.max(...ys)).toBeLessThanOrEqual(1.35 * WAVE_AMP + 1e-9);
      // Flatter than the pen's own wave: the whole stroke spans at most ~2px from crest to crest.
      expect(2 * Math.max(...ys)).toBeLessThanOrEqual(2.1);
      expect(Math.max(...ys) + INK / 2).toBeLessThanOrEqual(WAVE_TILE_H / 2);
    }
  });

  it('joins tile to tile on a crest: the path starts and ends at the same height', () => {
    const svg = svgOf(storyLinkWave('https://example.com/seam').rest);
    const d = svg.match(/ d="([^"]+)"/)![1];
    const start = d.match(/^M ([\d.-]+),([\d.-]+)/)!;
    const end = d.match(/ ([\d.-]+),([\d.-]+)$/)!;
    expect(Number(start[1])).toBe(0);
    expect(Number(end[1])).toBe(WAVE_TILE);
    expect(Number(end[2])).toBe(Number(start[2]));
    expect(Number(start[2])).toBeGreaterThan(0);
  });

  it('rests at 0.7 and strengthens to full ink when pointed at, the same wave either way', () => {
    const wave = storyLinkWave('https://example.com/x');
    expect(svgOf(wave.rest)).toContain('stroke-opacity="0.7"');
    expect(svgOf(wave.strong)).toContain('stroke-opacity="1"');
    expect(svgOf(wave.rest).replace('stroke-opacity="0.7"', '')).toBe(svgOf(wave.strong).replace('stroke-opacity="1"', ''));
  });

  it('draws in the ink of the page’s theme and scheme (a data URI reads no CSS variable), the same wave in each', () => {
    expect(waveInk('terracotta', 'light')).toBe(WAVE_INK);
    const sage = waveInk('sage', 'dark');
    expect(sage).not.toBe(WAVE_INK);
    const wave = storyLinkWave('https://example.com/x', sage);
    expect(svgOf(wave.rest)).toContain(`stroke="${sage}"`);
    const path = (css: string) => svgOf(css).match(/ d="([^"]+)"/)![1];
    expect(path(wave.rest)).toBe(path(storyLinkWave('https://example.com/x').rest));
    expect(storyLinkWaveVars('https://example.com/x', sage)['--wave']).toBe(wave.rest);
  });

  it('hands over the tile’s size with the tile, as custom properties and as a style attribute', () => {
    const vars = storyLinkWaveVars('https://example.com/x');
    expect(vars['--wave-size']).toBe(`${WAVE_TILE}px ${WAVE_TILE_H}px`);
    expect(vars['--wave']).toBe(storyLinkWave('https://example.com/x').rest);
    const style = storyLinkWaveStyle('editor');
    expect(style).toContain(`--wave-size: ${WAVE_TILE}px ${WAVE_TILE_H}px`);
    expect(style).toContain('--wave: url("data:image/svg+xml,');
    expect(style).toContain('--wave-strong: url("data:image/svg+xml,');
  });
});

// jsdom lays nothing out, so the placement lives in the stylesheet: every surface that shows a story's links
// (the reader, the web editor, the apps' editor island) sets them with the one src/styles/story.css.
describe('the wave’s placement in the story stylesheet', () => {
  const root = resolve(__dirname, '../../..');
  const css = readFileSync(resolve(root, 'src/styles/story.css'), 'utf8');
  const ruleAt = (selector: string) => {
    const at = css.indexOf(selector);
    expect(at, selector).toBeGreaterThanOrEqual(0);
    return css.slice(at, css.indexOf('}', at));
  };

  it('is the stylesheet of the reader, the web editor and the island', () => {
    for (const file of ['src/components/molecules/CardDetail/StoryMarkdown.tsx', 'src/components/molecules/MarkdownEditor/MarkdownEditor.tsx']) {
      expect(readFileSync(resolve(root, file), 'utf8')).toContain("import '@/styles/story.css';");
    }
    expect(readFileSync(resolve(root, 'scripts/native/build-editor.mjs'), 'utf8')).toContain("'src/styles/story.css'");
  });

  it('draws the wave the apps draw: the --link-wave ink (light terracotta, palette.css) and --link-wave-amp lean of tokens.css', () => {
    const tokens = readFileSync(resolve(root, 'src/styles/tokens.css'), 'utf8');
    expect(tokens).toMatch(new RegExp(`--link-wave-amp:\\s*${WAVE_AMP};`));
    // oklch(65% 0.084 45) is #ba7f64 in sRGB (the apps' generated Tokens say so beside it).
    expect(lightRootCss()).toMatch(/--link-wave:\s*oklch\(65% 0\.084 45\);/);
    expect(WAVE_INK).toBe('rgb(186,127,100)');
    expect(readFileSync(resolve(root, 'apps/ios/Packages/DesignSystem/Sources/DesignSystem/Generated/Tokens.swift'), 'utf8')).toContain('--link-wave · sRGB #ba7f64');
    expect(svgOf(storyLinkWave('https://example.com/ink').rest)).toContain(`stroke="${WAVE_INK}"`);
  });

  it('puts the tile inside the link’s box, on its bottom edge', () => {
    const rule = ruleAt('.story-prose a:is(.story-link, :not([class])) {');
    expect(rule).toMatch(/text-decoration:\s*none/);
    expect(rule).toMatch(/background-image:\s*var\(--wave\)/);
    expect(rule).toMatch(/background-size:\s*var\(--wave-size\)/);
    // On the box's bottom edge, never past it: an inline box paints its background only inside itself.
    expect(rule).toMatch(/background-position:\s*0 100%/);
  });

  // The content area ends at each face's descent (hhea, read from the web's own font files).
  it.each([
    ['a CJK story', '.story-prose a:is(.story-link, :not([class])) {', 0.288],
    ['a CJK heading', '.story-prose :is(h1, h2, h3, h4, h5, h6) a:is(.story-link, :not([class])) {', 0.286],
    ['a Latin story', ".story-prose[data-script='latin'] a:is(.story-link, :not([class])) {", 0.31],
    ['a Latin heading', ".story-prose[data-script='latin'] :is(h1, h2, h3, h4, h5, h6) a:is(.story-link, :not([class])) {", 0.251],
  ])('%s: the tile’s centre WAVE_DEPTH_EM under the baseline, with a fallback that needs no round()', (_name, selector, descent) => {
    const rule = ruleAt(selector);
    expect(rule).toContain(`padding-bottom: calc(${WAVE_DEPTH_EM}em + ${WAVE_TILE_H / 2}px - round(${descent}em, 1px))`);
    const fallback = /padding-bottom: calc\(3px ([+-]) ([\d.]+)em\)/.exec(rule)!;
    expect(Number(`${fallback[1]}${fallback[2]}`)).toBeCloseTo(WAVE_DEPTH_EM - descent, 6);
  });
});
