/**
 * Where a sticker's drawing sits in its square, and what the thread and a quote make of it (round 24, the owner's:
 * 點點 stood under half its square, so a sticker in the thread had empty paper over it, and a quote of one stood
 * low in its frame). The catalog says, as fractions of the side `[left, top, right, bottom]`, where every frame of
 * the animation lies (`box`) and where the key frame does (`poseBox`); the whole square for a sticker this build
 * has no numbers for. The apps read the same numbers from `public/stickers/catalog.json` (iOS ResonanceKit
 * Chat/Stickers.swift, Android core/kit chat/StickerCatalog.kt) and lay a sticker out by the same rules.
 */

/** `[left, top, right, bottom]`, fractions of the square's side. */
export type StickerBounds = readonly [number, number, number, number];

/** The whole square: a sticker whose art has no numbers here. */
export const WHOLE_SQUARE: StickerBounds = [0, 0, 1, 1];

/** The paper the thread leaves over and under a drawing (a fraction of the side). */
export const STICKER_TRIM_MARGIN = 0.02;

/** How much of a quote's frame a quoted key frame fills, at most (4 % clear of each edge). */
export const QUOTE_FILL = 0.92;

/** Numbers that can stand for a drawing's place: four finite fractions with a box of some size. */
function usable(b: StickerBounds | null | undefined): b is StickerBounds {
  if (!b || b.length !== 4 || !b.every((n) => Number.isFinite(n))) return false;
  const [l, t, r, bottom] = b;
  return l >= 0 && t >= 0 && r <= 1 && bottom <= 1 && r > l && bottom > t;
}

/**
 * A sticker in the thread lays out by its drawing, not its square: its box is as tall as the drawing with
 * {@link STICKER_TRIM_MARGIN} over and under it (clamped to the square), and the square is drawn whole, `top` of
 * its side above that box — so the empty paper over (and under) the puppet takes no room. Its width is the
 * square's. Nothing is cut: every frame lies inside `box`, so the square reaches past the layout box only where
 * it is transparent.
 */
export interface StickerTrim {
  /** How far above the layout box the square starts (a fraction of the side). */
  top: number;
  /** The layout box's height (a fraction of the side). */
  height: number;
}

export function stickerTrim(box: StickerBounds | null | undefined): StickerTrim {
  if (!usable(box)) return { top: 0, height: 1 };
  const [, t, , b] = box;
  const m = STICKER_TRIM_MARGIN;
  return { top: round(Math.max(0, t - m)), height: round(Math.min(1, b - t + 2 * m)) };
}

/**
 * Where the key frame's drawing starts inside the thread's layout box (a fraction of the side): a sticker
 * answering a quote comes up over it by its drawing (round 22), not by its box.
 */
export function stickerArtTop(box: StickerBounds | null | undefined, poseBox: StickerBounds | null | undefined): number {
  if (!usable(poseBox)) return 0;
  return round(Math.max(0, poseBox[1] - stickerTrim(box).top));
}

/**
 * A sticker quoted small (its key frame standing for the message — a reply row's thumbnail, a quote in a bubble):
 * drawn so its key frame's box is centred in the frame and as large as fits {@link QUOTE_FILL} of it — never
 * smaller than the square drawn whole. `x` / `y` move the square (fractions of its side, before `scale`, from its
 * top-left corner): `translate(x, y) scale(scale)` with the origin at the top-left.
 */
export interface StickerFit {
  scale: number;
  x: number;
  y: number;
}

export function stickerQuoteFit(poseBox: StickerBounds | null | undefined): StickerFit {
  if (!usable(poseBox)) return { scale: 1, x: 0, y: 0 };
  const [l, t, r, b] = poseBox;
  const scale = Math.max(1, QUOTE_FILL / Math.max(r - l, b - t));
  return { scale: round(scale), x: round(0.5 - ((l + r) / 2) * scale), y: round(0.5 - ((t + b) / 2) * scale) };
}

/** The fit as a CSS transform for a square image (`transform-origin: 0 0`). */
export function stickerFitTransform(fit: StickerFit): string | undefined {
  if (fit.scale === 1 && fit.x === 0 && fit.y === 0) return undefined;
  return `translate(${pct(fit.x)}, ${pct(fit.y)}) scale(${fit.scale})`;
}

const round = (n: number) => Math.round(n * 10000) / 10000;
const pct = (n: number) => `${Math.round(n * 100000) / 1000}%`;
