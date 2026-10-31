/**
 * How two captures of one screen are told apart. Not a share of the page's pixels: a whole
 * window drawn one pixel lower turns every edge on the page red while nothing changed, and a
 * heading moved across the page is a few hundred pixels of a few million and slips under any
 * share that tolerates the first. So:
 *
 * 1. A pixel differs when its colour is further than pixelmatch's threshold (YIQ, 0.1) from the
 *    other picture's at the same place.
 * 2. A CELL × CELL cell holding such pixels is only *moved*, and forgiven, when one shift of at
 *    most SHIFT px in any direction lines the whole cell up with the other picture (at most
 *    CELL_SLACK pixels still apart): a page drawn a pixel off, a pen line half a pixel over. One
 *    shift for the cell, never a pixel each: every stroke of a "3" has ink of the "2" it replaced
 *    within a pixel or two, but no one shift turns the one into the other. The search runs on
 *    both pictures blurred 3 × 3: a thin line moved by part of a pixel spreads its ink over two
 *    pixels instead of one (the Mac app draws at 77 %), so its exact colours are found nowhere,
 *    though blurred the two look the same.
 * 3. A cell not forgiven with at least CELL_MIN pixels apart is changed, and touching changed
 *    cells make one area (a one-cell area counts: a badge's digit at 2× fills one cell). Cells
 *    under a capture's own `ignore` regions never count: noise it names itself, as the cards'
 *    cover titles on the web, whose glyphs come out spaced a pixel or more differently each run.
 *    The capture changed when any area holds MIN_CELLS cells or more, however small it is beside
 *    the page.
 *
 * The diff image shows the baseline faded, forgiven pixels pale yellow, the rest red, and a box
 * round each area that counted.
 */

export const SHIFT = 2;
export const CELL = 16;
export const CELL_MIN = 6;
export const MIN_CELLS = 1;
/** Pixels of a cell that may stay apart under its best shift (a stray antialiased one). */
export const CELL_SLACK = 2;
/** pixelmatch's default threshold, as its YIQ delta. */
const MAX_DELTA = 35215 * 0.1 * 0.1;
/**
 * The same on the blurred pictures, looser: a 3 × 3 blur evens a line moved half a pixel out to
 * within about 30 grey levels, not to nothing; a stroke that changed stays 100 or more apart.
 */
const SOFT_DELTA = 35215 * 0.13 * 0.13;

export type Area = { x: number; y: number; width: number; height: number; cells: number };

export type Comparison = {
  /** Pixels apart in cells no shift explains, as a share of the page. */
  ratio: number;
  /** Pixels apart in cells a shift of SHIFT px or less explains (forgiven), as a share of the page. */
  shiftedRatio: number;
  /** Areas of real change, largest first; a capture changed when this isn't empty. */
  areas: Area[];
  /** RGBA, the same size as the inputs. */
  diff: Uint8Array;
};

/** pixelmatch's colour distance (YIQ), on two pixels already blended over white. */
function delta(a: Uint8Array, i: number, b: Uint8Array, j: number): number {
  const blend = (c: number, alpha: number) => 255 + (c - 255) * alpha;
  const aa = a[i + 3] / 255;
  const ba = b[j + 3] / 255;
  const r1 = blend(a[i], aa), g1 = blend(a[i + 1], aa), b1 = blend(a[i + 2], aa);
  const r2 = blend(b[j], ba), g2 = blend(b[j + 1], ba), b2 = blend(b[j + 2], ba);
  const y = (r1 - r2) * 0.29889531 + (g1 - g2) * 0.58662247 + (b1 - b2) * 0.11448223;
  const iq = (r1 - r2) * 0.59597799 - (g1 - g2) * 0.2741761 - (b1 - b2) * 0.32180189;
  const q = (r1 - r2) * 0.21147017 - (g1 - g2) * 0.52261711 + (b1 - b2) * 0.31114694;
  return 0.5053 * y * y + 0.299 * iq * iq + 0.1957 * q * q;
}

/**
 * How few pixels of the cell at (cx, cy) stay apart under the best shift of `b` against `a`
 * (both blurred), stopping early once `enough` is beaten.
 */
function bestShift(a: Uint8Array, b: Uint8Array, cx: number, cy: number, width: number, height: number, enough: number): number {
  const x0 = cx * CELL, y0 = cy * CELL;
  const x1 = Math.min(width, x0 + CELL), y1 = Math.min(height, y0 + CELL);
  let best = Infinity;
  for (let dy = -SHIFT; dy <= SHIFT; dy++) {
    for (let dx = -SHIFT; dx <= SHIFT; dx++) {
      let apart = 0;
      for (let y = y0; y < y1 && apart < best; y++) {
        const yy = Math.min(height - 1, Math.max(0, y + dy));
        for (let x = x0; x < x1 && apart < best; x++) {
          const xx = Math.min(width - 1, Math.max(0, x + dx));
          if (delta(a, (y * width + x) * 4, b, (yy * width + xx) * 4) > SOFT_DELTA) apart++;
        }
      }
      if (apart < best) best = apart;
      if (best <= enough) return best;
    }
  }
  return best;
}

/** A 3 × 3 box blur (opaque captures: alpha kept as it is). */
function blurred(src: Uint8Array, width: number, height: number): Uint8Array {
  const out = new Uint8Array(src.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0, g = 0, bl = 0, n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= height) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= width) continue;
          const j = (yy * width + xx) * 4;
          r += src[j]; g += src[j + 1]; bl += src[j + 2]; n++;
        }
      }
      const i = (y * width + x) * 4;
      out[i] = r / n; out[i + 1] = g / n; out[i + 2] = bl / n; out[i + 3] = src[i + 3];
    }
  }
  return out;
}

/** `ignore`: regions (capture pixels) whose cells are never counted — a capture's own noise, as web.ts finds it. */
export function compareImages(
  a: Uint8Array,
  b: Uint8Array,
  width: number,
  height: number,
  ignore: { x: number; y: number; width: number; height: number }[] = [],
): Comparison {
  const diff = new Uint8Array(width * height * 4);
  const put = (i: number, r: number, g: number, bl: number) => {
    diff[i] = r; diff[i + 1] = g; diff[i + 2] = bl; diff[i + 3] = 255;
  };
  const cols = Math.ceil(width / CELL);
  const rows = Math.ceil(height / CELL);
  // Pass 1: which pixels are apart, and how many in each cell.
  const apartAt = new Uint8Array(width * height);
  const perCell = new Uint32Array(cols * rows);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = y * width + x;
      const i = p * 4;
      // Most pixels are the very same bytes: no colour maths for them.
      if (a[i] === b[i] && a[i + 1] === b[i + 1] && a[i + 2] === b[i + 2] && a[i + 3] === b[i + 3]) continue;
      if (delta(a, i, b, i) <= MAX_DELTA) continue;
      apartAt[p] = 1;
      perCell[Math.floor(y / CELL) * cols + Math.floor(x / CELL)]++;
    }
  }
  // Pass 2: a cell with pixels apart is forgiven when one shift lines it up (on the blurred pictures,
  // made only when something is apart: most pairs of captures are the same picture).
  const forgiven = new Uint8Array(cols * rows);
  for (const r of ignore) {
    for (let cy = Math.max(0, Math.floor(r.y / CELL)); cy <= Math.min(rows - 1, Math.floor((r.y + r.height - 1) / CELL)); cy++) {
      for (let cx = Math.max(0, Math.floor(r.x / CELL)); cx <= Math.min(cols - 1, Math.floor((r.x + r.width - 1) / CELL)); cx++) forgiven[cy * cols + cx] = 1;
    }
  }
  if (perCell.some((n, c) => n > 0 && !forgiven[c])) {
    const softA = blurred(a, width, height);
    const softB = blurred(b, width, height);
    for (let c = 0; c < perCell.length; c++) {
      if (!perCell[c] || forgiven[c]) continue;
      if (bestShift(softA, softB, c % cols, Math.floor(c / cols), width, height, CELL_SLACK) <= CELL_SLACK) forgiven[c] = 1;
    }
  }
  let real = 0;
  let shifted = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = y * width + x;
      const i = p * 4;
      if (apartAt[p]) {
        if (forgiven[Math.floor(y / CELL) * cols + Math.floor(x / CELL)]) {
          shifted++;
          put(i, 250, 225, 120);
        } else {
          real++;
          put(i, 230, 40, 40);
        }
      } else {
        // The baseline, faded to a tenth so the change stands out over where it is.
        const lum = 0.299 * a[i] + 0.587 * a[i + 1] + 0.114 * a[i + 2];
        const v = 255 - (255 - lum) * 0.1;
        put(i, v, v, v);
      }
    }
  }

  // Changed cells, then the areas of touching ones (8-neighbourhood).
  const changed = perCell.map((n, c) => (n >= CELL_MIN && !forgiven[c] ? 1 : 0));
  const seen = new Uint8Array(cols * rows);
  const areas: Area[] = [];
  for (let start = 0; start < changed.length; start++) {
    if (!changed[start] || seen[start]) continue;
    let minX = cols, minY = rows, maxX = 0, maxY = 0, cells = 0;
    const stack = [start];
    seen[start] = 1;
    while (stack.length) {
      const c = stack.pop()!;
      const cx = c % cols;
      const cy = Math.floor(c / cols);
      cells++;
      minX = Math.min(minX, cx); maxX = Math.max(maxX, cx);
      minY = Math.min(minY, cy); maxY = Math.max(maxY, cy);
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
          const n = ny * cols + nx;
          if (changed[n] && !seen[n]) {
            seen[n] = 1;
            stack.push(n);
          }
        }
      }
    }
    if (cells < MIN_CELLS) continue;
    const x = minX * CELL;
    const y = minY * CELL;
    areas.push({ x, y, width: Math.min(width, (maxX + 1) * CELL) - x, height: Math.min(height, (maxY + 1) * CELL) - y, cells });
  }
  areas.sort((p, q) => q.cells - p.cells);

  // A box round each area that counted, 3 px of red just outside it.
  for (const area of areas) {
    const x0 = Math.max(0, area.x - 4), y0 = Math.max(0, area.y - 4);
    const x1 = Math.min(width - 1, area.x + area.width + 3), y1 = Math.min(height - 1, area.y + area.height + 3);
    for (let t = 0; t < 3; t++) {
      for (let x = x0; x <= x1; x++) {
        for (const y of [Math.min(y1, y0 + t), Math.max(y0, y1 - t)]) put((y * width + x) * 4, 200, 0, 0);
      }
      for (let y = y0; y <= y1; y++) {
        for (const x of [Math.min(x1, x0 + t), Math.max(x0, x1 - t)]) put((y * width + x) * 4, 200, 0, 0);
      }
    }
  }

  const total = width * height;
  return { ratio: real / total, shiftedRatio: shifted / total, areas, diff };
}
