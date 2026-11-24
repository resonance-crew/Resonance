/**
 * One crop stage for the profile photo and the cover (round 25 §G3): the picture under a frame `ratio` (its height ÷
 * width) tall, in units of the frame's width — the avatar's square (ratio 1, where these are avatarCrop's own
 * numbers) and the feed card's cover (0.62). The picture is drawn at s = sMin × z, sMin making it just cover the
 * frame; its centre sits (ox, oy) frame-widths from the frame's centre, never so far that the frame shows past the
 * picture's edge. A cover's view and its stored `media.frame` (lib/images/coverFrame) are two ways of saying the same.
 */
import { COVER_FRAME_LIMITS, type CoverFrame } from './coverFrame';
import type { CropImage, CropView } from './avatarCrop';

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** The picture's scale (frame widths per image px) at zoom z. */
export function frameScale(img: CropImage, ratio: number, z: number): number {
  return Math.max(1 / img.width, ratio / img.height) * z;
}

/** How far the picture's centre may move from the frame's at zoom z, each way, in frame widths: 0 where it just covers. */
export function frameRoom(img: CropImage, ratio: number, z: number): { x: number; y: number } {
  const s = frameScale(img, ratio, z);
  return { x: Math.max(0, (img.width * s - 1) / 2), y: Math.max(0, (img.height * s - ratio) / 2) };
}

/** The most a drag past the picture's edge moves it (round 33 §Q5's rubber band), px. */
export const RUBBER_MAX = 24;

/**
 * How far the picture follows a drag that has gone `over` px past where it can go (round 33 §Q5): about a half at
 * first, firmer the further, never more than {@link RUBBER_MAX} — the sign kept.
 */
export function rubberBand(over: number, max = RUBBER_MAX): number {
  if (!over) return 0;
  return Math.sign(over) * max * (1 - Math.exp(-Math.abs(over) / (2 * max)));
}

/** The view inside its bounds: zoom in [1, zMax], the frame always covered. */
export function clampFrameView(img: CropImage, ratio: number, view: CropView, zMax: number): CropView {
  const z = clamp(view.z, 1, zMax);
  const room = frameRoom(img, ratio, z);
  return { z, ox: clamp(view.ox, -room.x, room.x), oy: clamp(view.oy, -room.y, room.y) };
}

export function panFrameView(img: CropImage, ratio: number, view: CropView, dx: number, dy: number, zMax: number): CropView {
  return clampFrameView(img, ratio, { ...view, ox: view.ox + dx, oy: view.oy + dy }, zMax);
}

/** Zoomed to z keeping the picture's point under `anchor` (frame widths from its centre) where it is. */
export function zoomFrameView(
  img: CropImage,
  ratio: number,
  view: CropView,
  z: number,
  zMax: number,
  anchor: { x: number; y: number } = { x: 0, y: 0 },
): CropView {
  const zz = clamp(z, 1, zMax);
  const k = zz / view.z;
  return clampFrameView(img, ratio, { z: zz, ox: anchor.x - (anchor.x - view.ox) * k, oy: anchor.y - (anchor.y - view.oy) * k }, zMax);
}

/** Whether a view has moved from the start (unzoomed, centred): 重設 shows. */
export const viewMoved = (v: CropView) => Math.abs(v.z - 1) > 1e-3 || Math.abs(v.ox) > 1e-4 || Math.abs(v.oy) > 1e-4;

/** The slider's scale: multiplying (its position is ln z), so the slider, a pinch and the wheel are one control. */
export const sliderOfZoom = (z: number) => Math.log(z);
export const zoomOfSlider = (v: number) => Math.exp(v);

/** A cover's view as its `media.frame`: the picture's point at the frame's centre, the zoom, the picture's shape. */
export function coverFrameOfView(img: CropImage, ratio: number, view: CropView): CoverFrame {
  const s = frameScale(img, ratio, view.z);
  const round = (v: number) => Math.round(v * 10000) / 10000;
  return {
    cx: round(clamp(0.5 - view.ox / (s * img.width), 0, 1)),
    cy: round(clamp(0.5 - view.oy / (s * img.height), 0, 1)),
    zoom: round(clamp(view.z, COVER_FRAME_LIMITS.zoom.min, COVER_FRAME_LIMITS.zoom.max)),
    ar: round(clamp(img.width / img.height, COVER_FRAME_LIMITS.ar.min, COVER_FRAME_LIMITS.ar.max)),
  };
}

/** A stored frame as the stage's view (null: the start). */
export function viewOfCoverFrame(img: CropImage, ratio: number, frame: CoverFrame | null | undefined): CropView {
  if (!frame) return { z: 1, ox: 0, oy: 0 };
  const z = clamp(frame.zoom, 1, COVER_FRAME_LIMITS.zoom.max);
  const s = frameScale(img, ratio, z);
  return clampFrameView(img, ratio, { z, ox: (0.5 - frame.cx) * s * img.width, oy: (0.5 - frame.cy) * s * img.height }, COVER_FRAME_LIMITS.zoom.max);
}

/**
 * The stage for a room (the dialog's content width) and a window: as wide as the room up to `max`, and never taller
 * than the window's height − 200 (the width follows), so a phone held sideways keeps the frame and its buttons on
 * one screen. The frame is `inset` in from the stage on every side, `ratio` of its width tall.
 */
export function frameStage(room: number, windowHeight: number, { max, inset, ratio }: { max: number; inset: number; ratio: number }) {
  let width = Math.max(0, Math.min(max, Math.floor(room)));
  const tallest = Math.max(0, windowHeight - 200);
  const heightOf = (w: number) => Math.max(0, w - 2 * inset) * ratio + 2 * inset;
  if (windowHeight > 0 && heightOf(width) > tallest) width = Math.max(2 * inset, Math.floor((tallest - 2 * inset) / ratio + 2 * inset));
  const frameW = Math.max(0, width - 2 * inset);
  return { width, height: Math.round(heightOf(width)), frameW, frameH: frameW * ratio };
}
