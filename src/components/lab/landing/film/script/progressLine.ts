/**
 * The player's progress line: `wavyLine`'s own curve (lib/design/wavyPath), as a function — so the dot rides the pen
 * line itself, not the straight rail under it (round 4, the owner: 「進度條上面的點點並沒有貼著進度條的這個曲線在移動」).
 * `wavyLine` joins its knots with cubics whose handles are level and a third of a step long: x is then linear along a
 * step and y the smoothstep between its two knots, which is all this needs.
 */
import { makePrng } from '@/lib/design/prng';

export const PROGRESS_LINE = { width: 1000, seed: 47, amp: 2.4, steps: 14 } as const;

let knots: number[] | null = null;
function knotYs(): number[] {
  if (knots) return knots;
  const { seed, amp, steps } = PROGRESS_LINE;
  const rnd = makePrng(seed);
  knots = Array.from({ length: steps + 1 }, (_, i) => (i === 0 || i === steps ? 0 : (rnd() - 0.5) * 2 * amp));
  return knots;
}

/** The line's height (its own units: px, + down) at `frac` of the way along it. */
export function progressLineY(frac: number): number {
  const ys = knotYs();
  const n = PROGRESS_LINE.steps;
  const f = Math.min(1, Math.max(0, frac)) * n;
  const i = Math.min(n - 1, Math.floor(f));
  const t = f - i;
  return ys[i] + (ys[i + 1] - ys[i]) * t * t * (3 - 2 * t);
}
