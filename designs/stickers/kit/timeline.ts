/**
 * Time in a sticker. A choreography is a pure function of t (seconds, 0 → duration): the renderer samples it 12 times a
 * second ("on twos", cut-paper stop motion), and t = 0 and t = duration must both be the key pose — the file's first and
 * last frame (its thumb is the `hero` frame). Every helper here is a function of t alone, so any frame stands alone.
 */
import { bell as bellU, clamp, easeOut, lerp, smooth } from '../../../src/lib/mascots/geometry';

export { clamp, lerp, smooth };

/** The frame rate every sticker is drawn at. */
export const FPS = 12;

/** Frame n's time, seconds (frame 12 is t = 1). */
export const fr = (n: number): number => n / FPS;

export type Ease = (u: number) => number;

export const ease = {
  linear: (u: number) => clamp(u, 0, 1),
  /** Smoothstep: eases in and out (the engine's default). */
  smooth,
  in: (u: number) => clamp(u, 0, 1) ** 2,
  out: easeOut,
  /** A little past the end and back: a settle with weight, never a spring. */
  settle: (u: number) => {
    const v = clamp(u, 0, 1);
    return 1 + 0.12 * Math.sin(Math.PI * v) * (1 - v) - (1 - easeOut(v));
  },
} satisfies Record<string, Ease>;

/** A value through keyframes `[time, value, ease into this key?]`, held before the first and after the last. */
export function keys(t: number, frames: readonly (readonly [number, number, Ease?])[]): number {
  if (!frames.length) return 0;
  if (t <= frames[0][0]) return frames[0][1];
  for (let i = 1; i < frames.length; i++) {
    const [t1, v1, e = smooth] = frames[i];
    if (t <= t1) {
      const [t0, v0] = frames[i - 1];
      return lerp(v0, v1, e(t1 === t0 ? 1 : (t - t0) / (t1 - t0)));
    }
  }
  return frames[frames.length - 1][1];
}

/** 0 before `a`, up to 1 by `b`, 1 until `c`, down to 0 by `d` (smoothly). */
export function env(t: number, a: number, b: number, c: number, d: number, e: Ease = smooth): number {
  if (t <= a || t >= d) return 0;
  if (t < b) return e((t - a) / (b - a));
  if (t <= c) return 1;
  return 1 - e((t - c) / (d - c));
}

/** 0 → 1 → 0 across [a, b], easing in over `inF` of it and out over `outF` (the engine's bell). */
export function bell(t: number, a: number, b: number, inF = 0.3, outF = inF): number {
  return bellU(clamp((t - a) / (b - a), 0, 1), inF, outF);
}

/** u (0..1) across [a, b], clamped. */
export const span = (t: number, a: number, b: number): number => clamp((t - a) / (b - a), 0, 1);

/** A sine that runs `cycles` whole times across [a, b] (0 outside), so it starts and ends at 0 — loops close. */
export function cycles(t: number, a: number, b: number, n: number, phase = 0): number {
  if (t <= a || t >= b) return 0;
  return Math.sin(2 * Math.PI * n * ((t - a) / (b - a)) + phase);
}

/** `n` taps across [a, b]: each a quick rise and fall (a pat, a nod), 0 between and outside. */
export function taps(t: number, a: number, b: number, n: number): number {
  if (t <= a || t >= b) return 0;
  const u = ((t - a) / (b - a)) * n;
  const f = u - Math.floor(u);
  return Math.sin(Math.PI * f) ** 2;
}

/**
 * Stop-motion holds: t snapped back to the latest of `poses` (times, ascending). Drive the body — anything large —
 * with snap(t, …) and it changes only on those frames and holds between: a frame where the whole body moves costs
 * the file about as much as a fresh picture (≈ 8–10 KB), one where only a mitten, the eyes or a small prop moves a
 * tenth of that. Hold the body, move the small things on every frame, and put the big changes on the same frames.
 */
export function snap(t: number, poses: readonly number[]): number {
  let at = poses[0] ?? 0;
  for (const p of poses) {
    if (p <= t + 1e-6) at = p;
    else break;
  }
  return at;
}

/** t on a coarser clock: on fours (`every` = 1/6 s) the body moves every other frame and holds between. */
export function step(t: number, every = 1 / 6): number {
  return Math.floor(t / every + 1e-6) * every;
}

/** The times a sticker of `duration` seconds is sampled at: 0, 1/12, … — the last frame (t = duration) repeats the first. */
export function frameTimes(duration: number, fps = FPS): number[] {
  const n = Math.round(duration * fps);
  return Array.from({ length: n }, (_, i) => i / fps);
}
