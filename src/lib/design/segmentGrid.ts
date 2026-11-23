/**
 * A segmented choice laid as a grid (the publish step's four card types, 2026-11-23): one fused control — the
 * bar's track, its seams cut in the paper, the chosen cell in its own face — whose cells stand in one row while
 * every glyph and its whole words fit an equal share of the room, else two to a row (2×2), else one (a stack, the
 * largest text sizes on the narrowest phone). A cell never cuts, shrinks or wraps its words, never drops its glyph.
 *
 * The geometry is the bar's (`boundaryPoints`, a seam's seed `seed + i·37 + 11` along the first row, so a grid of
 * one row is the bar point for point) turned into cells: a seam between two columns runs down one row, a seam
 * between two rows runs across one column, each wobbling only between its ends — so the seams meet exactly at
 * the cells' corners and a cell's fill is bounded by the very points its seams are drawn on. iOS `SegmentGrid`
 * (DesignSystem/Components/SegmentGrid.swift) and Android `SegmentGrid` (core/design/SegmentGrid.kt) are twins.
 */
import { makePrng } from './prng';

/** The bar's seam (SegmentedActionBar's `boundaryPoints` with no stubs): a gentle wave down at `x` over `h`, its ends unmoved. */
function wave(x: number, h: number, seed: number, amp: number): [number, number][] {
  const steps = 3;
  const rnd = makePrng(seed);
  const f = (n: number): number => +n.toFixed(2);
  const pts: [number, number][] = [];
  for (let k = 0; k <= steps; k++) {
    const y = (k / steps) * h;
    const off = k === 0 || k === steps ? 0 : (rnd() - 0.5) * 2 * amp;
    pts.push([f(x + off), f(y)]);
  }
  return pts;
}

export type Pt = [number, number];

/** The column counts a grid of `count` cells tries, widest first: 4 → 2 → 1 for four (3 → 2 → 1 for three …). */
export function columnSteps(count: number): number[] {
  const steps: number[] = [];
  for (let cols = count; cols >= 1; ) {
    steps.push(cols);
    cols = cols > 2 ? Math.ceil(cols / 2) : cols - 1;
  }
  return [...new Set(steps)];
}

/**
 * How many columns fit `room`: the first of {@link columnSteps} in which every cell's own width (`naturals`: its
 * padding, glyph, gap and whole words) fits an equal share of the room. One column is taken whatever it measures.
 */
export function gridColumns(room: number, naturals: number[]): number {
  const count = naturals.length;
  if (count === 0) return 1;
  const widest = Math.max(...naturals);
  for (const cols of columnSteps(count)) {
    if (cols === 1 || widest * cols <= room + 0.5) return cols;
  }
  return 1;
}

/** The seed of the seam between columns `c − 1` and `c` in row `r` (first row: the bar's own seeds). */
export function downSeed(seed: number, cols: number, r: number, c: number): number {
  return seed + (r * (cols - 1) + (c - 1)) * 37 + 11;
}

/** The seed of the seam between rows `r − 1` and `r` under column `c`. */
export function acrossSeed(seed: number, cols: number, r: number, c: number): number {
  return seed + 1000 + ((r - 1) * cols + c) * 37 + 23;
}

/** A seam's wobbling points between its two ends, from (x, y0) down to (x, y1): the bar's wave over one row. */
export function seamDown(x: number, y0: number, y1: number, seed: number, amp = 1.6): Pt[] {
  return wave(x, y1 - y0, seed, amp).map(([px, py]) => [px, +(py + y0).toFixed(2)] as Pt);
}

/** A seam's wobbling points from (x0, y) across to (x1, y): the bar's wave turned on its side over one column. */
export function seamAcross(y: number, x0: number, x1: number, seed: number, amp = 1.6): Pt[] {
  return wave(y, x1 - x0, seed, amp).map(([py, px]) => [+(px + x0).toFixed(2), py] as Pt);
}

export interface GridBox {
  w: number;
  h: number;
  cols: number;
  rows: number;
  seed: number;
  /** How far the fills run past the outline, which trims them (the bar's `max(12, h·0.3)` of one row). */
  pad: number;
}

/** The pad of a grid whose rows are `rowH` tall: the bar's rule for one row. */
export function gridPad(rowH: number): number {
  return Math.max(12, rowH * 0.3);
}

/**
 * Cell (r, c)'s region as a closed point list: its inner sides the seams it shares with its neighbours, its outer
 * sides straight and pushed `pad` past the grid (the outline trims them).
 */
export function cellRegion(r: number, c: number, box: GridBox): Pt[] {
  const { w, h, cols, rows, seed, pad } = box;
  const cw = w / cols;
  const rh = h / rows;
  const x0 = c * cw;
  const x1 = (c + 1) * cw;
  const y0 = r * rh;
  const y1 = (r + 1) * rh;
  const L = c === 0;
  const R = c === cols - 1;
  const T = r === 0;
  const B = r === rows - 1;
  const X0 = L ? -pad : x0;
  const X1 = R ? w + pad : x1;
  const Y0 = T ? -pad : y0;
  const Y1 = B ? h + pad : y1;
  // Each side's points in the region's clockwise order; a seam's ends are the cells' corners.
  const top: Pt[] = T ? [[X0, Y0], [X1, Y0]] : [[X0, y0], ...seamAcross(y0, x0, x1, acrossSeed(seed, cols, r, c)), [X1, y0]];
  const right: Pt[] = R ? [[X1, Y0], [X1, Y1]] : [[x1, Y0], ...seamDown(x1, y0, y1, downSeed(seed, cols, r, c + 1)), [x1, Y1]];
  const bottom: Pt[] = B
    ? [[X1, Y1], [X0, Y1]]
    : [[X0, y1], ...seamAcross(y1, x0, x1, acrossSeed(seed, cols, r + 1, c)), [X1, y1]].reverse() as Pt[];
  const left: Pt[] = L ? [[X0, Y1], [X0, Y0]] : [[x0, Y0], ...seamDown(x0, y0, y1, downSeed(seed, cols, r, c)), [x0, Y1]].reverse() as Pt[];
  return [...top, ...right, ...bottom, ...left];
}

/**
 * Every seam as a polyline to stroke in the paper's colour: those between columns, row by row, and those between
 * rows, column by column; an end on the grid's edge runs `pad` past it (the outline trims it).
 */
export function gridSeams(box: GridBox): Pt[][] {
  const { w, h, cols, rows, seed, pad } = box;
  const cw = w / cols;
  const rh = h / rows;
  const seams: Pt[][] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 1; c < cols; c++) {
      const x = c * cw;
      const y0 = r * rh;
      const y1 = (r + 1) * rh;
      seams.push([[x, r === 0 ? -pad : y0], ...seamDown(x, y0, y1, downSeed(seed, cols, r, c)), [x, r === rows - 1 ? h + pad : y1]]);
    }
  }
  for (let r = 1; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const y = r * rh;
      const x0 = c * cw;
      const x1 = (c + 1) * cw;
      seams.push([[c === 0 ? -pad : x0, y], ...seamAcross(y, x0, x1, acrossSeed(seed, cols, r, c)), [c === cols - 1 ? w + pad : x1, y]]);
    }
  }
  return seams;
}

export const closedPath = (pts: Pt[]) => `M ${pts[0][0]},${pts[0][1]} ` + pts.slice(1).map((p) => `L ${p[0]},${p[1]}`).join(' ') + ' Z';
export const openPath = (pts: Pt[]) => `M ${pts[0][0]},${pts[0][1]} ` + pts.slice(1).map((p) => `L ${p[0]},${p[1]}`).join(' ');
