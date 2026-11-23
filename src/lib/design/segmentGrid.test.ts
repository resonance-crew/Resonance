import { describe, expect, it } from 'vitest';
import { boundaryPoints } from '@/components/molecules/SegmentedActionBar/SegmentedActionBar';
import { cellRegion, columnSteps, downSeed, gridColumns, gridPad, gridSeams, seamDown, type GridBox } from './segmentGrid';

// The publish step's four card types (2026-11-23): one row while every glyph and its whole words fit an equal
// share, else 2×2, else one to a row — never cut, shrunk or glyphless.
describe('gridColumns', () => {
  // 公開 · 連結的人 · 匿名公開 · 私人卡 at 14/600 with a 16 glyph, 6 gap and 12 a side.
  const zh = [74, 102, 102, 88];
  it('tries 4, then 2, then 1', () => {
    expect(columnSteps(4)).toEqual([4, 2, 1]);
    expect(columnSteps(3)).toEqual([3, 2, 1]);
    expect(columnSteps(1)).toEqual([1]);
  });
  it('keeps one row while the widest cell fits an equal share (a desktop or tablet column)', () => {
    expect(gridColumns(640, zh)).toBe(4);
    expect(gridColumns(408, zh)).toBe(4);
  });
  it('lays 2×2 on a phone, where an equal quarter cannot hold 連結的人 beside its glyph', () => {
    expect(gridColumns(350, zh)).toBe(2);
    expect(gridColumns(204, zh)).toBe(2);
  });
  it('stacks one to a row when even half the room is too little (the largest text on the narrowest phone)', () => {
    expect(gridColumns(200, zh)).toBe(1);
    expect(gridColumns(0, zh)).toBe(1);
  });
});

describe('the grid’s seams and cells', () => {
  const box = (cols: number, rows: number): GridBox => ({ w: 340, h: rows * 48, cols, rows, seed: 71, pad: gridPad(48) });

  it('one row is the bar point for point: the same seams, seeded seed + i·37 + 11', () => {
    const b = box(4, 1);
    const seams = gridSeams(b);
    expect(seams).toHaveLength(3);
    seams.forEach((seam, i) => {
      expect(seam).toEqual(boundaryPoints(((i + 1) * b.w) / 4, b.h, 71 + i * 37 + 11, 1.6, b.pad));
    });
    expect(downSeed(71, 4, 0, 2)).toBe(71 + 37 + 11);
  });

  it('2×2: two seams down (one a row) and two across (one a column), each meeting the others at the centre', () => {
    const b = box(2, 2);
    const seams = gridSeams(b);
    expect(seams).toHaveLength(4);
    const centre: [number, number] = [170, 48];
    // Every seam has the centre as one of its ends' points (down seams: the inner end; across: the inner end).
    for (const seam of seams) expect(seam.some(([x, y]) => x === centre[0] && y === centre[1])).toBe(true);
  });

  it('a cell’s fill runs along the very points its seam is drawn on (no sliver between face and cut)', () => {
    const b = box(2, 2);
    const right = cellRegion(0, 0, b);
    const seam = seamDown(170, 0, 48, downSeed(71, 2, 0, 1));
    for (const p of seam) expect(right).toContainEqual(p);
    // Its neighbour shares the same points on its left.
    const left = cellRegion(0, 1, b);
    for (const p of seam) expect(left).toContainEqual(p);
    // The cell under it shares the seam across.
    const below = cellRegion(1, 0, b);
    const top = right.filter(([, y]) => Math.abs(y - 48) < 2 && right.length > 0);
    for (const p of top) expect(below.some(([x, y]) => x === p[0] && y === p[1])).toBe(true);
  });

  it('outer sides reach past the grid, so the outline trims every fill', () => {
    const b = box(2, 2);
    const first = cellRegion(0, 0, b);
    expect(Math.min(...first.map(([x]) => x))).toBe(-b.pad);
    expect(Math.min(...first.map(([, y]) => y))).toBe(-b.pad);
    const last = cellRegion(1, 1, b);
    expect(Math.max(...last.map(([x]) => x))).toBe(b.w + b.pad);
    expect(Math.max(...last.map(([, y]) => y))).toBe(b.h + b.pad);
  });
});
