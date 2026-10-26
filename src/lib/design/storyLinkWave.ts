import { penWaveTile } from './wavyPath';
import { seedFromString } from './prng';
import { INK } from './strokes';
import { encode, toLinearSrgb } from './oklch';
import { DEFAULT_ACCENT, paletteFor, type Accent, type Scheme } from './palette';

/** Width of one repeating tile: eight crests at the pen's 4.5px rhythm. */
export const WAVE_TILE = 36;
/**
 * How far a crest leans off the line, in px (tokens.css --link-wave-amp, which
 * the apps draw from): lower than the pen's own 1.2, so under running text the
 * wave keeps the pen's rhythm (a crest every 4.5px) but lies flatter and
 * smoother, a line under the words rather than a scribble.
 */
export const WAVE_AMP = 0.75;
/**
 * The tile's height, centred on the pen's line: the crests (at most
 * 1.35 × WAVE_AMP ≈ 1px off the line) plus half the INK stroke fit inside it,
 * so nothing of the wave is ever cut at the tile's edge.
 */
export const WAVE_TILE_H = 6;
/**
 * The palette's --link-wave (the accent at 0.6× its chroma, a touch lighter
 * in light, a touch darker in dark) for a theme and scheme, as sRGB — a data
 * URI can't read the page's CSS variables, so the page hands each link the
 * ink it wears now (useLinkWaveInk). Quieter than the words it underlines,
 * which keep the deep accent label ink.
 */
export function waveInk(accent: Accent, scheme: Scheme): string {
  const [r, g, b] = toLinearSrgb(paletteFor(accent, scheme)['link-wave']).map((v) => Math.round(encode(v) * 255));
  return `rgb(${r},${g},${b})`;
}

/**
 * Light terracotta's wave — what the server's HTML carries (it can't know the
 * reader's theme), and what dark terracotta's barely differs from.
 */
export const WAVE_INK = waveInk(DEFAULT_ACCENT, 'light');

/**
 * How far under the baseline the wave's centre runs, in em of the link's
 * text — the depth every platform draws a story link's wave at (the apps
 * stroke `penWave` there; the web places its tiles so, see the readers'
 * CSS). Clear of Chinese glyphs, with Latin descenders just dipping into the
 * up crests.
 */
export const WAVE_DEPTH_EM = 0.29;

export interface StoryLinkWave {
  /** The tile at rest (~0.7 opacity) and pointed at or pressed (full), as CSS `url()`s. */
  rest: string;
  strong: string;
  /** The tile's `background-size`. */
  size: string;
}

const cache = new Map<string, StoryLinkWave>();

function tile(d: string, opacity: number, ink: string): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${WAVE_TILE}" height="${WAVE_TILE_H}" viewBox="0 ${-WAVE_TILE_H / 2} ${WAVE_TILE} ${WAVE_TILE_H}">` +
    `<path d="${d}" fill="none" stroke="${ink}" stroke-opacity="${opacity}" stroke-width="${INK}" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

/**
 * The pen-wave underline of a link inside story text, as CSS values for a
 * repeating background (`--wave`, `--wave-strong`, `--wave-size`). A tile
 * (not one long stroke) because an inline link that wraps needs a stroke
 * under every line fragment; the tile starts and ends on the same crest, so
 * the repeats join without a step. Seeded by the link so neighbours don't
 * wave in step. `ink` is the wave's colour (waveInk; light terracotta's by
 * default).
 */
export function storyLinkWave(href: string, ink: string = WAVE_INK): StoryLinkWave {
  const key = `${ink}|${href}`;
  let hit = cache.get(key);
  if (!hit) {
    const d = penWaveTile(WAVE_TILE, seedFromString(href), WAVE_AMP);
    hit = { rest: tile(d, 0.7, ink), strong: tile(d, 1, ink), size: `${WAVE_TILE}px ${WAVE_TILE_H}px` };
    if (cache.size > 500) cache.clear();
    cache.set(key, hit);
  }
  return hit;
}

/** The three custom properties a link (or a whole editor) wears its wave through. */
export function storyLinkWaveVars(href: string, ink?: string): Record<'--wave' | '--wave-strong' | '--wave-size', string> {
  const wave = storyLinkWave(href, ink);
  return { '--wave': wave.rest, '--wave-strong': wave.strong, '--wave-size': wave.size };
}

/** {@link storyLinkWaveVars} as an inline `style` attribute's text, for a surface styled outside React (the editors). */
export function storyLinkWaveStyle(href: string, ink?: string): string {
  return Object.entries(storyLinkWaveVars(href, ink))
    .map(([name, value]) => `${name}: ${value}`)
    .join('; ');
}
