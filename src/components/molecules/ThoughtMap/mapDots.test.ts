import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DOT_EDGE, DOT_LEVELS, DOT_PERIOD, DOT_RADIUS, GRID, dotLevel, mapDots } from './mapDots';
import { MAX_SCALE, MIN_SCALE } from './mapMath';

// The paper reaches the apps as native/fixtures/map-dots.json; after a change:
//   UPDATE_MAP_DOTS=1 npx vitest run src/components/molecules/ThoughtMap/mapDots.test.ts
const FIXTURE = resolve(__dirname, '../../../../native/fixtures/map-dots.json');
const SCALES = [0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.7, 0.8, 0.9, 1, 1.25, 1.5, 2];
const TILES: [number, number][] = [[0, 0], [1, 0], [2, 0], [2, 2], [4, 2], [4, 4], [8, 12], [-1, 0], [-2, -2], [-4, -4], [-4, 6], [-3, -8]];
const fixture = () => ({
  generatedBy:
    'src/components/molecules/ThoughtMap/mapDots.test.ts (UPDATE_MAP_DOTS=1). The thought map\'s dotted paper at a zoom s: a dot at the centre of every `grid`-unit world tile i = floor(x / grid), j = floor(y / grid); it shows at levels[dotLevel(i, j)] (levels finest first; a tile is in lattice k when i and j are both multiples of 2^k, dotLevel = the coarsest, at most levels − 1), with `radius` screen points (an edge of `edge` more, antialiased from radius to radius + edge), in field-border at alpha × that level × the scheme\'s `map-dot-alpha` (palette.ts SCHEME_NUMBERS: the apps\' Palette.mapDotAlpha / Tokens.MapDotAlpha), on color-card-bg.',
  grid: GRID,
  levels: DOT_LEVELS,
  radius: DOT_RADIUS,
  edge: DOT_EDGE,
  cases: SCALES.map((s) => ({ s, ...mapDots(s) })),
  dotLevel: TILES.map(([i, j]) => ({ i, j, level: dotLevel(i, j) })),
});
if (process.env.UPDATE_MAP_DOTS) writeFileSync(FIXTURE, `${JSON.stringify(fixture(), null, 2)}\n`);

const range = Array.from({ length: 176 }, (_, n) => MIN_SCALE + ((MAX_SCALE - MIN_SCALE) * n) / 175);

describe('the thought map\'s dotted paper', () => {
  it('is the paper it always was at 100 % and closer', () => {
    for (const s of [1, 1.5, MAX_SCALE]) {
      const d = mapDots(s);
      expect(d.levels).toEqual(Array(DOT_LEVELS).fill(1));
      expect(d.radius).toBe(DOT_RADIUS);
      expect(d.alpha).toBe(1);
      expect(d.tile).toBeCloseTo(GRID * s);
    }
  });

  it('keeps its tone on screen when zoomed out: a lattice gives way before its dots crowd', () => {
    for (const s of range) {
      const { tile, levels } = mapDots(s);
      // The finest lattice drawn whole stands 26 to 52 px apart (or 100 %'s 26 × s, closer in).
      const whole = levels.findIndex((v) => v >= 1);
      const spacing = tile * 2 ** whole;
      expect(spacing).toBeGreaterThanOrEqual(GRID - 1e-9);
      expect(spacing).toBeLessThanOrEqual(Math.max(2 * GRID, GRID * s) + 1e-9);
      // Nothing closer than 13 px is drawn at all.
      levels.forEach((v, k) => {
        if (tile * 2 ** k <= GRID / 2) expect(v).toBe(0);
      });
    }
  });

  it('puts as much ink on the screen at every zoom up to 100 % (before it recedes)', () => {
    // A tile's dot is at its coarsest lattice's strength: 3/4 of lattice k's tiles are in it alone (k < 2), all of the last's.
    const shares = Array.from({ length: DOT_LEVELS }, (_, k) => (k === DOT_LEVELS - 1 ? 4 ** -k : 4 ** -k - 4 ** -(k + 1)));
    for (const s of range.filter((s) => s <= 1)) {
      const { tile, levels } = mapDots(s);
      const ink = levels.reduce((sum, v, k) => sum + v * shares[k], 0) / (tile / GRID) ** 2;
      expect(ink).toBeCloseTo(1, 9);
    }
  });

  it('never inks a dot twice: while a lattice fades, every finer one is gone and every coarser one whole', () => {
    for (const s of range) {
      const { levels } = mapDots(s);
      levels.forEach((v, k) => {
        if (v > 0 && v < 1) {
          for (let f = 0; f < k; f++) expect(levels[f]).toBe(0);
          for (let c = k + 1; c < levels.length; c++) expect(levels[c]).toBe(1);
        }
      });
      expect(levels[levels.length - 1]).toBe(1);
    }
  });

  it('recedes smoothly as the board does: smaller and fainter, never larger', () => {
    let last = mapDots(MIN_SCALE);
    expect(last.radius).toBeLessThan(DOT_RADIUS);
    expect(last.alpha).toBeLessThan(1);
    for (const s of range.slice(1)) {
      const d = mapDots(s);
      expect(d.radius).toBeGreaterThanOrEqual(last.radius);
      expect(d.alpha).toBeGreaterThanOrEqual(last.alpha);
      d.levels.forEach((v, k) => expect(v).toBeGreaterThanOrEqual(last.levels[k]));
      // No jump between neighbouring zooms (1 % of the range apart).
      expect(d.alpha - last.alpha).toBeLessThan(0.05);
      d.levels.forEach((v, k) => expect(v - last.levels[k]).toBeLessThan(0.35));
      last = d;
    }
  });

  it('nests its lattices: a tile in a coarse lattice is in every finer one', () => {
    expect(DOT_PERIOD).toBe(2 ** (DOT_LEVELS - 1));
    for (let i = -9; i <= 9; i++) {
      for (let j = -9; j <= 9; j++) {
        const k = dotLevel(i, j);
        const step = 2 ** k;
        expect(i % step === 0 && j % step === 0).toBe(true);
        if (k < DOT_LEVELS - 1) expect(i % (step * 2) === 0 && j % (step * 2) === 0).toBe(false);
        // The pattern repeats every DOT_PERIOD tiles, as the web's layer does.
        expect(dotLevel(i + DOT_PERIOD, j - DOT_PERIOD)).toBe(k);
      }
    }
  });

  it('is what the apps draw (native/fixtures/map-dots.json)', () => {
    expect(existsSync(FIXTURE), 'run with UPDATE_MAP_DOTS=1').toBe(true);
    expect(JSON.parse(readFileSync(FIXTURE, 'utf8'))).toEqual(JSON.parse(JSON.stringify(fixture())));
  });
});
