import { describe, expect, it } from 'vitest';
import { compareImages } from './diff';

const W = 400;
const H = 300;

/** A cream page with dark "text" blocks: each `[x, y, w, h]` a bar of ink with a one-pixel grey edge. */
function page(blocks: [number, number, number, number][], cover?: { x: number; y: number; spacing: number }): Uint8Array {
  const px = new Uint8Array(W * H * 4);
  for (let i = 0; i < W * H; i++) px.set([247, 241, 232, 255], i * 4);
  const ink = (x: number, y: number, v: number) => {
    if (x >= 0 && y >= 0 && x < W && y < H) px.set([v, v, v, 255], (y * W + x) * 4);
  };
  for (const [bx, by, bw, bh] of blocks) {
    for (let y = by - 1; y <= by + bh; y++) {
      for (let x = bx - 1; x <= bx + bw; x++) {
        const edge = y === by - 1 || y === by + bh || x === bx - 1 || x === bx + bw;
        ink(x, y, edge ? 150 : 40);
      }
    }
  }
  // A cover title: seven small glyphs whose spacing depends on a fractional scale.
  if (cover) {
    for (let g = 0; g < 7; g++) {
      const gx = Math.round(cover.x + g * cover.spacing);
      for (let y = cover.y; y < cover.y + 8; y++) for (let x = gx; x < gx + 6; x++) ink(x, y, 120);
    }
  }
  return px;
}

const LAYOUT: [number, number, number, number][] = [
  [20, 20, 120, 14], // a heading
  [20, 60, 360, 6],
  [20, 74, 340, 6],
  [20, 88, 300, 6],
  [200, 200, 30, 30], // an icon
];

const shifted = (blocks: typeof LAYOUT, dx: number, dy: number) => blocks.map(([x, y, w, h]) => [x + dx, y + dy, w, h] as typeof LAYOUT[0]);

describe('compareImages', () => {
  it('finds nothing in the same picture', () => {
    const a = page(LAYOUT);
    const result = compareImages(a, page(LAYOUT), W, H);
    expect(result.areas).toEqual([]);
    expect(result.ratio).toBe(0);
  });

  it('forgives a whole page drawn a pixel off (the Mac window placed a pixel lower)', () => {
    const result = compareImages(page(LAYOUT), page(shifted(LAYOUT, 1, 1)), W, H);
    expect(result.areas).toEqual([]);
    expect(result.shiftedRatio).toBeGreaterThan(0);
  });

  it('skips what a capture asked to leave out (a cover title whose spacing wanders by pixels)', () => {
    const a = page(LAYOUT, { x: 250, y: 120, spacing: 9 });
    const b = page(LAYOUT, { x: 250, y: 120, spacing: 10 });
    expect(compareImages(a, b, W, H).areas.length).toBeGreaterThan(0);
    expect(compareImages(a, b, W, H, [{ x: 248, y: 118, width: 80, height: 12 }]).areas).toEqual([]);
  });

  it('forgives a thin pen line moved by part of a pixel (its ink spread over two pixels instead of one)', () => {
    const line = (columns: [number, number][]) => {
      const px = page(LAYOUT);
      for (let y = 100; y < 260; y++) for (const [x, v] of columns) px.set([v, v, v, 255], (y * W + x) * 4);
      return px;
    };
    const a = line([[300, 70], [301, 70]]);
    // The same ink, centred half a pixel to the right: what a fractional scale makes of a one-pixel move.
    const b = line([[300, 159], [301, 70], [302, 159]]);
    expect(compareImages(a, b, W, H).areas).toEqual([]);
  });

  it('finds a glyph that changed in place (a badge going from 2 to 3), though every stroke has ink beside it', () => {
    // Two 12 × 18 glyphs of 3 px strokes in the same box: top, middle and bottom bars, joined on the
    // right for a "3", top right then bottom left for a "2".
    const glyph = (two: boolean) => {
      const bars: [number, number, number, number][] = [[300, 140, 12, 3], [300, 147, 12, 3], [300, 155, 12, 3]];
      bars.push(two ? [309, 140, 3, 8] : [309, 140, 3, 18], ...(two ? [[300, 147, 3, 11] as [number, number, number, number]] : []));
      return page([...LAYOUT, ...bars]);
    };
    expect(compareImages(glyph(false), glyph(true), W, H).areas.length).toBeGreaterThan(0);
  });

  it('finds a heading moved across the page, however little of the page it is', () => {
    const moved: typeof LAYOUT = [[80, 20, 120, 14], ...LAYOUT.slice(1)];
    const result = compareImages(page(LAYOUT), page(moved), W, H);
    expect(result.ratio).toBeLessThan(0.05);
    // Where it left and where it arrived (a bar moved by less than its length overlaps itself).
    expect(result.areas.length).toBeGreaterThan(0);
    expect(Math.min(...result.areas.map((a) => a.x))).toBeLessThanOrEqual(20);
    expect(Math.max(...result.areas.map((a) => a.x + a.width))).toBeGreaterThanOrEqual(200);
    expect(result.areas.every((a) => a.y <= 20 && a.y + a.height <= 48)).toBe(true);
  });

  it('finds a change in one place even when the whole page also moved a pixel', () => {
    const changed: typeof LAYOUT = [...LAYOUT.slice(0, 4), [200, 200, 30, 60]];
    const result = compareImages(page(LAYOUT), page(shifted(changed, 0, 1)), W, H);
    expect(result.areas).toHaveLength(1);
    expect(result.areas[0].y).toBeGreaterThanOrEqual(192);
  });

  it('boxes each area in the diff image', () => {
    const moved: typeof LAYOUT = [[80, 20, 120, 14], ...LAYOUT.slice(1)];
    const { diff, areas } = compareImages(page(LAYOUT), page(moved), W, H);
    const { x, y } = areas[0];
    const at = (Math.max(0, y - 4) * W + Math.max(0, x - 4)) * 4;
    expect([...diff.slice(at, at + 3)]).toEqual([200, 0, 0]);
  });
});
