import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { cardContentProblem } from '@/lib/db/firestore/cardContent';
import { coverCrop, coverCropPixels, coverFrameKey, coverFrameOf, isCoverFrame, type CoverFrame } from './coverFrame';

// A cover's frame (round 25 §G1): the picture stays whole, every shape it is
// drawn in centres its own crop on the frame's point at its zoom, clamped
// inside the picture. The cases below are the fixture the iOS and Android
// twins read (native/fixtures/cover-frame.json): `UPDATE_COVER_FRAME=1 npx
// vitest run src/lib/images/coverFrame.test.ts` writes it, and the test fails
// while the file and the function disagree.

const FIXTURE = join(process.cwd(), 'native/fixtures/cover-frame.json');

/** The shapes covers are drawn in, height ÷ width. */
const BOXES = { feed: 0.62, page: 0.52, mini: 0.56, square: 1, share: 0.5, og: 630 / 1200 } as const;
const PICTURES = { wide: 2, landscape: 1.5, square: 1, portrait: 0.75, tall: 0.4 } as const;
const FRAMES: Record<string, CoverFrame | null> = {
  none: null,
  centre: { cx: 0.5, cy: 0.5, zoom: 1, ar: 1.5 },
  left: { cx: 0.1, cy: 0.5, zoom: 1, ar: 1.5 },
  topRightZoomed: { cx: 0.8, cy: 0.2, zoom: 1.6, ar: 1.5 },
  bottomEdgeMax: { cx: 0.5, cy: 1, zoom: 2, ar: 0.75 },
  corner: { cx: 0, cy: 0, zoom: 1.25, ar: 1 },
};

const round = (n: number) => Number(n.toFixed(6));

function cases() {
  const out: { name: string; ar: number; frame: CoverFrame | null; boxRatio: number; crop: { x: number; y: number; w: number; h: number } }[] = [];
  for (const [p, ar] of Object.entries(PICTURES))
    for (const [f, frame] of Object.entries(FRAMES))
      for (const [b, boxRatio] of Object.entries(BOXES)) {
        const c = coverCrop(ar, frame, boxRatio);
        out.push({ name: `${p}/${f}/${b}`, ar, frame, boxRatio: round(boxRatio), crop: { x: round(c.x), y: round(c.y), w: round(c.w), h: round(c.h) } });
      }
  return out;
}

describe('coverCrop', () => {
  it('cuts the centre at zoom 1 without a frame, as covers were drawn before', () => {
    // A 2:1 picture in the feed card (0.62 tall): the full height, 0.806 of the width, centred.
    const c = coverCrop(2, null, 0.62);
    expect(c.h).toBe(1);
    expect(c.w).toBeCloseTo(1 / 0.62 / 2, 9);
    expect(c.x).toBeCloseTo((1 - c.w) / 2, 9);
    expect(c.y).toBe(0);
    // A tall picture in a wide box: the full width, a band of its height.
    const t = coverCrop(0.5, null, 0.5);
    expect(t).toEqual({ x: 0, y: expect.closeTo(0.375, 9), w: 1, h: expect.closeTo(0.25, 9) });
  });

  it("keeps the frame's point at the crop's centre while it fits, in every shape", () => {
    const frame = { cx: 0.6, cy: 0.45, zoom: 1.5, ar: 1.5 };
    for (const box of Object.values(BOXES)) {
      const c = coverCrop(1.5, frame, box);
      expect(c.x + c.w / 2).toBeCloseTo(0.6, 9);
      expect(c.y + c.h / 2).toBeCloseTo(0.45, 9);
      // The crop has the box's shape, in the picture's pixels: (w · ar) ÷ h = the box's width ÷ height.
      expect((c.w * 1.5) / c.h).toBeCloseTo(1 / box, 9);
    }
  });

  it('zooms by shrinking the crop and moves it inside the picture at an edge, never shrinking it more', () => {
    const one = coverCrop(1.5, { cx: 0.5, cy: 0.5, zoom: 1, ar: 1.5 }, 0.62);
    const two = coverCrop(1.5, { cx: 0.5, cy: 0.5, zoom: 2, ar: 1.5 }, 0.62);
    expect(two.w).toBeCloseTo(one.w / 2, 9);
    expect(two.h).toBeCloseTo(one.h / 2, 9);
    const edge = coverCrop(1.5, { cx: 1, cy: 0, zoom: 2, ar: 1.5 }, 0.62);
    expect(edge.w).toBeCloseTo(two.w, 9);
    expect(edge.x + edge.w).toBeCloseTo(1, 9);
    expect(edge.y).toBe(0);
  });

  it('reads a malformed frame as the centre', () => {
    const centre = coverCrop(1.5, null, 0.62);
    for (const bad of [{ cx: 2, cy: 0.5, zoom: 1, ar: 1 }, { cx: 0.5, cy: 0.5, zoom: 3, ar: 1 }, { cx: 0.5 }, 'x'])
      expect(coverCrop(1.5, bad as unknown as CoverFrame, 0.62)).toEqual(centre);
  });

  it('gives whole pixels inside the picture for the og image', () => {
    const px = coverCropPixels(2000, 1000, { cx: 0.9, cy: 0.5, zoom: 1, ar: 2 }, 630 / 1200);
    expect(px.height).toBe(1000);
    expect(px.width).toBe(1905);
    expect(px.left).toBe(95);
    expect(px.top).toBe(0);
  });

  it('matches native/fixtures/cover-frame.json, which the apps read', () => {
    const made = { note: 'coverCrop(ar, frame, boxRatio) → crop {x, y, w, h} in fractions of the picture (src/lib/images/coverFrame.ts; UPDATE_COVER_FRAME=1 npx vitest run src/lib/images/coverFrame.test.ts writes this file). boxRatio is the box height ÷ width; frame null = the centre at zoom 1. Compare to 1e-5.', cases: cases() };
    if (process.env.UPDATE_COVER_FRAME === '1') writeFileSync(FIXTURE, `${JSON.stringify(made, null, 2)}\n`);
    const stored = JSON.parse(readFileSync(FIXTURE, 'utf8')) as typeof made;
    expect(stored.cases.length).toBe(made.cases.length);
    for (const [i, c] of stored.cases.entries()) {
      const got = coverCrop(c.ar, c.frame, c.boxRatio);
      for (const k of ['x', 'y', 'w', 'h'] as const) expect(got[k], `${c.name}.${k}`).toBeCloseTo(c.crop[k], 5);
      expect(c.name).toBe(made.cases[i].name);
    }
  });
});

describe('a stored frame', () => {
  it('is exactly four numbers in their ranges', () => {
    expect(isCoverFrame({ cx: 0, cy: 1, zoom: 2, ar: 5 })).toBe(true);
    expect(isCoverFrame({ cx: 0.5, cy: 0.5, zoom: 1, ar: 0.2 })).toBe(true);
    for (const bad of [
      { cx: -0.1, cy: 0.5, zoom: 1, ar: 1 },
      { cx: 0.5, cy: 1.1, zoom: 1, ar: 1 },
      { cx: 0.5, cy: 0.5, zoom: 0.9, ar: 1 },
      { cx: 0.5, cy: 0.5, zoom: 2.1, ar: 1 },
      { cx: 0.5, cy: 0.5, zoom: 1, ar: 0.1 },
      { cx: 0.5, cy: 0.5, zoom: 1, ar: 6 },
      { cx: 0.5, cy: 0.5, zoom: 1 },
      { cx: 0.5, cy: 0.5, zoom: 1, ar: 1, rotate: 90 },
      { cx: '0.5', cy: 0.5, zoom: 1, ar: 1 },
      { cx: Number.NaN, cy: 0.5, zoom: 1, ar: 1 },
      null,
      [0.5, 0.5, 1, 1],
    ])
      expect(isCoverFrame(bad), JSON.stringify(bad)).toBe(false);
    expect(coverFrameOf({ cx: 0.5, cy: 0.5, zoom: 3, ar: 1 })).toBeNull();
  });

  it("changes a share image's version only when there is one", () => {
    expect(coverFrameKey(null)).toBe('');
    expect(coverFrameKey({ cx: 0.25, cy: 0.5, zoom: 1.2, ar: 1.5 })).toBe('@0.25,0.5,1.2,1.5');
  });

  it("is held by cardContentProblem as the rules' validMedia holds it", () => {
    const base = { thoughtCore: 't', story: 's', tags: [] as string[] };
    const media = (frame?: unknown) => ({ type: 'image', url: 'https://img.example/image/u/1.avif', ...(frame === undefined ? {} : { frame: frame as CoverFrame }) });
    const opts = { publicBases: [] };
    expect(cardContentProblem({ ...base, media: media() }, opts)).toBeNull();
    expect(cardContentProblem({ ...base, media: media({ cx: 0.3, cy: 0.7, zoom: 1.4, ar: 1.5 }) }, opts)).toBeNull();
    expect(cardContentProblem({ ...base, media: media({ cx: 0.3, cy: 0.7, zoom: 4, ar: 1.5 }) }, opts)).toBe('media');
    expect(cardContentProblem({ ...base, media: media({ cx: 0.3 }) }, opts)).toBe('media');
  });
});
