/**
 * The thought map's dotted paper at a zoom: which dots show, how large and how
 * strong. Shared with both apps through native/fixtures/map-dots.json
 * (mapDots.test.ts writes it), so the three draw the same paper.
 *
 * A dot sits at the centre of every GRID-unit tile of the world. Drawn at one
 * screen size whatever the zoom, a zoomed-out board turned into a haze: at 25 %
 * the dots stood 6.5 px apart and, beside cards drawn at a quarter of their
 * size, looked four times larger. So the paper keeps its tone on screen
 * instead — every 2nd, then every 4th dot (nested lattices: a coarser one is a
 * subset of the finer), the dots in between fading so the ink per area stays
 * the same at every zoom up to 100 % — and recedes a little as the board does:
 * smaller, fainter.
 */

/** World units between neighbouring dots. */
export const GRID = 26;
/** The lattices: every tile, every 2nd, every 4th. */
export const DOT_LEVELS = 3;
/** The coarsest lattice's period, in tiles: the paper repeats every this many. */
export const DOT_PERIOD = 2 ** (DOT_LEVELS - 1);

/** A lattice is whole at GRID px apart on screen and gone at half that. */
const GONE = GRID / 2;
/** A dot's radius at 100 % and above (its soft edge runs DOT_EDGE further). */
export const DOT_RADIUS = 1.2;
export const DOT_EDGE = 0.3;
/** From NEAR_SCALE down to FAR_SCALE (by octaves) the dot loses FAR_RADIUS of its radius and FAR_ALPHA of its ink. */
const NEAR_SCALE = 0.75;
const FAR_SCALE = 0.25;
const FAR_RADIUS = 0.15;
const FAR_ALPHA = 0.2;

export interface MapDots {
  /** Screen px between neighbouring tiles (GRID × s). */
  tile: number;
  /** Each lattice's strength, finest first; a dot takes its coarsest lattice's. */
  levels: number[];
  /** The dot's radius in screen px (its soft edge runs DOT_EDGE further). */
  radius: number;
  /** The paper's ink, before the scheme's `map-dot-alpha`. */
  alpha: number;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export function mapDots(s: number): MapDots {
  const tile = GRID * s;
  // A lattice p px apart is drawn at ((p / GONE)² − 1) / 3: with the next one
  // (2p apart) whole and the finer ones gone, a quarter of the tiles at full
  // ink and the rest at that share make the ink per area 100 %'s. While one
  // fades the coarser are whole and the finer gone, so no dot is inked twice.
  const levels = Array.from({ length: DOT_LEVELS }, (_, k) =>
    k === DOT_LEVELS - 1 ? 1 : clamp01(((tile * 2 ** k) / GONE) ** 2 / 3 - 1 / 3),
  );
  const far = clamp01(Math.log2(NEAR_SCALE / s) / Math.log2(NEAR_SCALE / FAR_SCALE));
  return {
    tile,
    levels,
    radius: DOT_RADIUS * (1 - FAR_RADIUS * far),
    alpha: 1 - FAR_ALPHA * far,
  };
}

/** The coarsest lattice the dot of tile (i, j) belongs to (0 = every tile only). */
export function dotLevel(i: number, j: number): number {
  let k = 0;
  while (k < DOT_LEVELS - 1 && ((i >> (k + 1)) << (k + 1)) === i && ((j >> (k + 1)) << (k + 1)) === j) k++;
  return k;
}
