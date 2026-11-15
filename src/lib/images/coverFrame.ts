/**
 * Where a cover is looked at (round 25 §G1). The picture stays whole in
 * storage; the card keeps, inside its `media`, the point of the picture that
 * sits at the centre of every frame it is drawn in and how far it is zoomed:
 *
 *   media.frame = { cx, cy, zoom, ar }      absent = the centre, zoom 1 (as before)
 *     cx, cy  0…1    the picture's point at the frame's centre (fractions of its width and height)
 *     zoom    1…2    1 = the picture just covers the frame
 *     ar      0.2…5  the picture's width ÷ height when it was framed
 *
 * Every shape a cover is drawn in — the feed card (0.62), the card page
 * (0.52), the mini card (0.56), the square thumbs, the share picture (0.5),
 * the chat card and the og image (1.91 : 1) — cuts its own crop from the same
 * frame with `coverCrop`, so the subject stays put from one shape to the
 * next. The function is pinned by `native/fixtures/cover-frame.json`, which
 * the iOS and Android twins read too. `ar` is in the data so the web can draw
 * the crop with CSS alone (no script measuring the picture); a renderer that
 * knows the picture's real size may pass that instead.
 *
 * The firestore rules (`validMedia`) and the server (`cardContentProblem`,
 * edits' `pickMedia`) hold the four numbers to these ranges: keep them in step.
 */

export interface CoverFrame {
  cx: number;
  cy: number;
  zoom: number;
  ar: number;
}

/** A crop of the picture, in fractions of its width (`x`, `w`) and height (`y`, `h`). */
export interface CoverCropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const COVER_FRAME_LIMITS = {
  zoom: { min: 1, max: 2 },
  ar: { min: 0.2, max: 5 },
} as const;

/** The frame a cover without one is drawn with: its centre, just covering. */
export const CENTRED: Readonly<CoverFrame> = Object.freeze({ cx: 0.5, cy: 0.5, zoom: 1, ar: 1 });

const KEYS = ['cx', 'cy', 'zoom', 'ar'] as const;

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Whether `v` is a frame the rules would take: exactly the four numbers, each in its range. */
export function isCoverFrame(v: unknown): v is CoverFrame {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  const o = v as Record<string, unknown>;
  if (Object.keys(o).some((k) => !(KEYS as readonly string[]).includes(k))) return false;
  if (!KEYS.every((k) => finite(o[k]))) return false;
  const { cx, cy, zoom, ar } = o as unknown as CoverFrame;
  return (
    cx >= 0 && cx <= 1 && cy >= 0 && cy <= 1
    && zoom >= COVER_FRAME_LIMITS.zoom.min && zoom <= COVER_FRAME_LIMITS.zoom.max
    && ar >= COVER_FRAME_LIMITS.ar.min && ar <= COVER_FRAME_LIMITS.ar.max
  );
}

/** A stored frame as a reader may use it — exactly its four numbers — or null for a missing or malformed one (the centre). */
export function coverFrameOf(v: unknown): CoverFrame | null {
  if (!isCoverFrame(v)) return null;
  return { cx: v.cx, cy: v.cy, zoom: v.zoom, ar: v.ar };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * The part of a picture (its width ÷ height `ar`) shown in a box whose height
 * ÷ width is `boxRatio` (the feed card's 0.62, the og image's 630 / 1200), for
 * `frame` (null: the centre at zoom 1). At zoom 1 the crop is the largest of
 * the box's shape that fits in the picture; `zoom` shrinks it about the
 * frame's point; it is then moved, never shrunk, to lie inside the picture.
 */
export function coverCrop(ar: number, frame: CoverFrame | null | undefined, boxRatio: number): CoverCropRect {
  const pic = finite(ar) && ar > 0 ? ar : 1;
  const box = finite(boxRatio) && boxRatio > 0 ? 1 / boxRatio : 1; // the box's width ÷ height
  const f = coverFrameOf(frame) ?? CENTRED;
  // At zoom 1: the full height of a picture wider than the box, the full width of one narrower.
  let w = pic > box ? box / pic : 1;
  let h = pic > box ? 1 : pic / box;
  w /= f.zoom;
  h /= f.zoom;
  const x = clamp(f.cx - w / 2, 0, 1 - w);
  const y = clamp(f.cy - h / 2, 0, 1 - h);
  return { x, y, w, h };
}

/** `coverCrop` in a picture's pixels (`width` × `height`), rounded to whole pixels inside it — for sharp's `extract`. */
export function coverCropPixels(
  width: number,
  height: number,
  frame: CoverFrame | null | undefined,
  boxRatio: number,
): { left: number; top: number; width: number; height: number } {
  const r = coverCrop(width / height, frame, boxRatio);
  const w = clamp(Math.round(r.w * width), 1, width);
  const h = clamp(Math.round(r.h * height), 1, height);
  return {
    left: clamp(Math.round(r.x * width), 0, width - w),
    top: clamp(Math.round(r.y * height), 0, height - h),
    width: w,
    height: h,
  };
}

/** What a frame adds to a cover's version (a share image's URL): nothing without one, so unframed covers keep theirs. */
export function coverFrameKey(frame: CoverFrame | null | undefined): string {
  const f = coverFrameOf(frame);
  return f ? `@${KEYS.map((k) => Number(f[k].toFixed(4))).join(',')}` : '';
}
