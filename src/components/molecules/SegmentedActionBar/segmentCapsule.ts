import { autoCurve, autoMag, autoSegments } from '@/lib/design/wobAuto';
import { edgeDraws, wobAmp, wobRect } from '@/lib/design/wobRect';
import { boundaryPoints, polyline } from './SegmentedActionBar';

/** A capsule's one-line height on every platform: one line sits centred in it at any text size (round 9 §4). */
export const CAPSULE_H = 48;
/** The capsule's corner (Field's R). */
export const CAPSULE_R = 16;

export interface SegmentCapsuleShape {
  /** The field's outline: its wobble at its size (wobAuto), at CAPSULE_R. */
  outline: string;
  /** The wavy seam cutting the end segment off. */
  seam: string;
  /** The end segment's region past the seam, reaching out past the outline (which clips it). */
  segment: string;
}

/**
 * A field ending in a segment — the chat composer's capsule (Send its end)
 * and the publish step's tag field (AI 建議 / 新增 its end): its outline at
 * `w` × `h`, and the end segment `segmentW` wide cut off by a wavy seam, one
 * point list for the segment's edge and the seam's stroke (the segmented
 * bar's, so the face's edge lies exactly under the seam). Null until
 * measured.
 *
 * `steady` (the composer's, round 23): the outline grows from its one-line
 * height (CAPSULE_H) moving its sides alone — its bottom edge and corners as
 * at one line whatever it holds, its top edge the same line risen (wobRect's
 * `steady`) — so a row coming to ride along, or going, never redraws the
 * edge under the thumb or Send's corner. At one line it is the plain shape,
 * point for point. The tag field keeps the plain one.
 */
export function segmentCapsuleShape(
  w: number,
  h: number,
  segmentW: number,
  seed: number,
  opts: { steady?: boolean } = {},
): SegmentCapsuleShape | null {
  if (!w || !h) return null;
  const outline = wobRect(w, h, CAPSULE_R, seed, autoMag(w, h), {
    segmentsH: autoSegments(w),
    segmentsV: autoSegments(h),
    curve: autoCurve(w, h),
    steady: opts.steady ? steadyEdges(w) : undefined,
  });
  const pad = Math.max(12, h * 0.3);
  const seam = polyline(boundaryPoints(w - segmentW, h, seed + 11, 1.6, pad));
  const segment = `${seam} L ${w + pad},${h + pad} L ${w + pad},${-pad} Z`;
  return { outline, seam, segment };
}

/** A steady capsule's edges as at one line (CAPSULE_H): the horizontal swing, and what the right edge takes. */
export function steadyEdges(w: number): { ampX: number; draws: number } {
  const ampX = wobAmp(w, CAPSULE_H, autoMag(w, CAPSULE_H), autoCurve(w, CAPSULE_H));
  return { ampX, draws: edgeDraws(CAPSULE_H - 2 * CAPSULE_R, autoSegments(CAPSULE_H), ampX) };
}
