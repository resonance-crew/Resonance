import { autoCurve, autoMag, autoSegments } from '@/lib/design/wobAuto';
import { wobRect } from '@/lib/design/wobRect';
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
 */
export function segmentCapsuleShape(w: number, h: number, segmentW: number, seed: number): SegmentCapsuleShape | null {
  if (!w || !h) return null;
  const outline = wobRect(w, h, CAPSULE_R, seed, autoMag(w, h), {
    segmentsH: autoSegments(w),
    segmentsV: autoSegments(h),
    curve: autoCurve(w, h),
  });
  const pad = Math.max(12, h * 0.3);
  const seam = polyline(boundaryPoints(w - segmentW, h, seed + 11, 1.6, pad));
  const segment = `${seam} L ${w + pad},${h + pad} L ${w + pad},${-pad} Z`;
  return { outline, seam, segment };
}
