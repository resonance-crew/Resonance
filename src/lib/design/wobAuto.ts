/**
 * Size-aware defaults for hand-drawn wobbly borders.
 *
 * Two intuitions baked in:
 *   1. Long edges need more turning points so the wobble reads as drawn
 *      rather than as a single lazy bow.
 *   2. Large surfaces should curve *less* (in proportion) — strong wobble
 *      on a big card looks crooked, not organic. Small chips/buttons need
 *      *more* relative curve so the hand-drawn quality is visible at all.
 */

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/**
 * Turning points along one edge. Each side is measured independently, so a
 * long edge naturally gets more points than a short edge on the same shape,
 * and a big surface gets more points than a small surface.
 *
 * ~1 point per 75px of edge length, clamped 2–8:
 *   ≤110px (button / chip side, avatar)   → 2
 *   120–185px (tag, small input)          → 2
 *   200–280px (medium input, AI row)      → 3
 *   ~400px                                → 5
 *   ~600px (panel long edge)              → 8 (ceiling)
 */
export function autoSegments(edge: number): number {
  return clamp(Math.round(edge / 95), 2, 8);
}

/**
 * Perpendicular wobble amplitude in absolute pixels.
 * Small surfaces clamp to a visible floor; large surfaces clamp to a ceiling
 * so the border doesn't go visibly drunk.
 */
export function autoMag(w: number, h: number): number {
  const s = Math.min(w, h);
  return clamp(2 + s * 0.013, 2.4, 4);
}

/**
 * Per-segment curve factor. Higher = more bow per segment. Inverse of size,
 * with a steep slope so chips bend hard and big panels stay calm:
 *   ~44px chip   → ~1.6  (capped at ceiling)
 *   ~90px input  → ~1.5
 *   ~250px box   → ~1.05
 *   ~400px panel → ~0.6  (capped at floor)
 */
export function autoCurve(w: number, h: number): number {
  const s = Math.min(w, h);
  return clamp(1.8 - s * 0.003, 0.6, 1.6);
}

/** A field this tall or taller holds more than one line (a textarea, the note box). */
export const TALL_FIELD = 72;
/** The most a tall field bows: the writer's title's calm line. */
export const TALL_FIELD_CURVE = 0.8;

/**
 * A text field's bow: its size's own while it holds one line, never more than
 * TALL_FIELD_CURVE once it is taller (the owner, 2026-10-31: a big box bowing
 * like a button looked bent; still drawn, just calmer).
 */
export function fieldCurve(w: number, h: number): number {
  const c = autoCurve(w, h);
  return h >= TALL_FIELD ? Math.min(c, TALL_FIELD_CURVE) : c;
}
