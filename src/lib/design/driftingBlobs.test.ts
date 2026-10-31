import { describe, expect, it } from 'vitest';
import {
  type Oklab,
  type Paint,
  type World,
  SETTLE,
  atRest,
  blend,
  blobColours,
  blobsAt,
  createWorld,
  makeGrid,
  parseOklch,
  placeSeed,
  restNow,
  sampleField,
  step,
  traceContours,
} from './driftingBlobs';

const PAPER = parseOklch('oklch(96.5% 0.015 75)')!;
const LAVENDER: Paint = { ink: parseOklch('oklch(80% 0.07 290)')!, alpha: 0.25 };
const SAGE: Paint = { ink: parseOklch('oklch(78% 0.07 140)')!, alpha: 0.25 };
const W = 1440;
const H = 900;

function outline(world: World) {
  const g = makeGrid(world.width, world.height, 6);
  sampleField(world, g);
  return traceContours(g);
}

function area(loops: number[][]): number {
  let sum = 0;
  for (const l of loops) {
    let a = 0;
    for (let i = 0; i < l.length; i += 2) {
      const j = (i + 2) % l.length;
      a += l[i] * l[j + 1] - l[j] * l[i + 1];
    }
    sum += Math.abs(a / 2);
  }
  return sum;
}

function run(world: World, seconds: number, each?: (w: World) => void) {
  for (let s = 0; s < seconds; s += 0.1) {
    step(world, 0.1);
    each?.(world);
  }
}

function chroma(c: Oklab): number {
  return Math.hypot(c[1], c[2]);
}

describe('drifting blobs', () => {
  it('draws a lone blob as one closed outline about its size, whose shape changes while it moves', () => {
    const world = createWorld({
      width: W, height: H, seed: 3, paper: PAPER,
      blobs: [{ x: 500, y: 450, R: 150, paint: SAGE, drift: [1, 0] }],
    });
    const first = outline(world);
    expect(first).toHaveLength(1);
    const b = world.blobs[0];
    const radii = (loop: number[]) =>
      Array.from({ length: loop.length / 2 }, (_, i) => Math.hypot(loop[2 * i] - b.x, loop[2 * i + 1] - b.y));
    for (const r of radii(first[0])) {
      expect(r).toBeGreaterThan(0.75 * 150);
      expect(r).toBeLessThan(1.2 * 150);
    }
    // Its area is that of a disc of radius R, give or take.
    expect(Math.sqrt(area(first) / Math.PI)).toBeCloseTo(150, -1);

    run(world, 6);
    const later = outline(world);
    expect(later).toHaveLength(1);
    const spread = (loop: number[]) => {
      const r = radii(loop);
      return Math.max(...r) - Math.min(...r);
    };
    // Same blob, a different silhouette, and a little way from its place.
    expect(Math.abs(spread(later[0]) - spread(first[0])) + Math.abs(area(later) - area(first))).toBeGreaterThan(1);
    expect(Math.hypot(b.x - 500, b.y - 450)).toBeGreaterThan(5);
  });

  it('strays only a little from its place, comes back to rest exactly there, and then nothing moves', () => {
    const world = createWorld({
      width: W, height: H, seed: 7, paper: PAPER,
      blobs: [
        { x: 300, y: 260, R: 180, paint: SAGE, drift: [1, 0.2] },
        { x: 1150, y: 640, R: 90, paint: LAVENDER, drift: [-1, 0] },
      ],
    });
    let farthest = 0;
    run(world, SETTLE - 0.5, (w) => {
      farthest = Math.max(farthest, Math.hypot(w.blobs[0].x - 300, w.blobs[0].y - 260) / 180);
    });
    expect(farthest).toBeGreaterThan(0.1);
    expect(farthest).toBeLessThan(0.4);
    expect(world.settled).toBe(false);
    run(world, 1);
    expect(world.settled).toBe(true);
    expect(atRest(world)).toBe(true);
    expect(world.blobs.map((b) => [b.x, b.y])).toEqual([[300, 260], [1150, 640]]);
    const still = outline(world);
    run(world, 30);
    expect(outline(world)).toEqual(still);
    // The pointer over one still darkens it, and that eases out again.
    world.hovered = blobsAt(world, 300, 260);
    step(world, 0.1);
    expect(atRest(world)).toBe(false);
    world.hovered = new Set();
    run(world, 5);
    expect(atRest(world)).toBe(true);
  });

  it('sends a visitor that melts into the largest, joined by a neck first, without growing it much', () => {
    const world = createWorld({
      width: W, height: H, seed: 11, paper: PAPER,
      blobs: [
        { x: 1200, y: 300, R: 160, paint: LAVENDER, drift: [-1, 0.2] },
        { x: 200, y: 700, R: 80, paint: LAVENDER, drift: [1, 0] },
      ],
      visitor: SAGE,
    });
    const host = world.blobs[0];
    let joined = false;
    let most = 0;
    let lastArea = area(outline(world));
    let fusedAt = -1;
    run(world, SETTLE + 2, (w) => {
      most = Math.max(most, w.blobs.length);
      const loops = outline(w);
      if (w.blobs.length === 3 && w.pairs.length && loops.length === 2) joined = true;
      const now = area(loops);
      if (fusedAt < 0 && w.t > 2 && w.blobs.length === 2) {
        fusedAt = w.t;
        // Becoming one blob is seamless: the outline doesn't jump.
        expect(Math.abs(now - lastArea) / lastArea).toBeLessThan(0.03);
      }
      lastArea = now;
    });
    expect(most).toBe(3);
    expect(joined).toBe(true);
    expect(fusedAt).toBeGreaterThan(0);
    expect(fusedAt).toBeLessThan(SETTLE - 5);
    expect(world.settled).toBe(true);
    const merged = world.blobs.find((b) => b.seed === 0)!;
    expect(merged.id).not.toBe(host.id);
    expect(merged.R).toBeGreaterThan(160);
    expect(merged.R).toBeLessThanOrEqual(160 * 1.06 + 1e-9);
    expect([merged.x, merged.y]).toEqual([1200, 300]);
    // Lavender taking in sage makes a colour, not grey.
    expect(chroma(merged.paint.ink)).toBeGreaterThan(0.06);
    expect(merged.lobes.every((l) => l.fade === 0)).toBe(true);
  });

  it('blends colours round the hue circle instead of through grey', () => {
    const mid = blend([LAVENDER.ink, SAGE.ink], [1, 1]);
    expect(chroma(mid)).toBeCloseTo(0.07, 5);
    expect(mid[0]).toBeCloseTo(0.79, 5);
    const colours = blobColours(
      createWorld({ width: W, height: H, seed: 1, paper: PAPER, blobs: [{ x: 700, y: 400, R: 100, paint: SAGE, drift: [1, 0] }] }),
    );
    // A blob is its ink laid on the paper at its alpha.
    expect([...colours.values()][0][0]).toBeCloseTo(PAPER[0] + (SAGE.ink[0] - PAPER[0]) * 0.25, 5);
  });

  it('finds the blob under the pointer, with whatever it is melting into', () => {
    const world = createWorld({
      width: W, height: H, seed: 5, paper: PAPER,
      blobs: [
        { x: 300, y: 400, R: 100, paint: SAGE, drift: [1, 0] },
        { x: 480, y: 400, R: 100, paint: LAVENDER, drift: [-1, 0] },
        { x: 1100, y: 400, R: 100, paint: SAGE, drift: [1, 0] },
      ],
    });
    expect([...blobsAt(world, 1100, 400)]).toEqual([world.blobs[2].id]);
    expect(blobsAt(world, 800, 150).size).toBe(0);
    step(world, 0.1);
    expect([...blobsAt(world, 300, 400)].sort()).toEqual([world.blobs[0].id, world.blobs[1].id].sort());
  });

  it('follows its place to a new layout, at rest or not, keeping its size to its seed', () => {
    const world = createWorld({
      width: W, height: H, seed: 13, paper: PAPER,
      blobs: [{ x: 1200, y: 300, R: 160, paint: LAVENDER, drift: [-1, 0] }],
      visitor: SAGE,
    });
    run(world, SETTLE + 2);
    const grown = world.blobs[0].R / 160;
    placeSeed(world, 0, 500, 200, 100);
    expect([world.blobs[0].x, world.blobs[0].y]).toEqual([500, 200]);
    expect(world.blobs[0].R / 100).toBeCloseTo(grown, 6);
    expect(Math.sqrt(area(outline(world)) / Math.PI)).toBeCloseTo(100 * grown, -1);

    const fresh = createWorld({
      width: W, height: H, seed: 13, paper: PAPER,
      blobs: [{ x: 1200, y: 300, R: 160, paint: LAVENDER, drift: [-1, 0] }],
      visitor: SAGE,
    });
    run(fresh, 4);
    restNow(fresh);
    expect(fresh.settled).toBe(true);
    expect(fresh.blobs).toHaveLength(1);
    expect([fresh.blobs[0].x, fresh.blobs[0].y]).toEqual([1200, 300]);
  });
});

// The outline is traced 30 times a second into arrays kept between frames:
// a smaller grid after a larger one, or the same grid again, traces exactly
// what a first trace would.
describe('tracing outlines frame after frame', () => {
  it('traces the same loops whatever was traced before it', () => {
    const world = (w: number, h: number, x: number) =>
      createWorld({
        width: w, height: h, seed: 5, paper: PAPER,
        blobs: [
          { x, y: h / 2, R: 120, paint: SAGE, drift: [1, 0] },
          { x: x + 260, y: h / 2 + 40, R: 90, paint: LAVENDER, drift: [-1, 0] },
        ],
      });
    const wide = world(W, H, 400);
    const small = world(640, 400, 120);
    const first = outline(wide);
    const firstSmall = outline(small);
    expect(first.length).toBeGreaterThan(0);
    expect(firstSmall.length).toBeGreaterThan(0);
    // Again, and in another order: the leftovers of a larger grid change nothing.
    expect(outline(small)).toEqual(firstSmall);
    expect(outline(wide)).toEqual(first);
    expect(outline(small)).toEqual(firstSmall);
    // And a grid with nothing on it still has no outline.
    const empty = makeGrid(320, 200, 6);
    expect(traceContours(empty)).toEqual([]);
    expect(outline(wide)).toEqual(first);
  });
});
