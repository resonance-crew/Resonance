'use client';

import { isResting } from './rest';

/**
 * The ripple: a wave of ink weight through a title's characters, like a plucked string — each one 700 → 900 → 700 in
 * 480 ms, a hair sideways and back, one after another 70 ms apart (回應 swelling a little more). Noto Serif TC is a
 * variable face here (src/styles/fonts.ts), so its weight animates without fetching anything; an ideograph keeps its
 * 1 em advance at any weight, so nothing reflows. Latin titles (Playfair is static here) ripple by a per-word baseline
 * wave instead (transform only). Motion (motion.dev) is fetched the first time a ripple runs, never before paint.
 */
let motion: Promise<typeof import('motion')> | null = null;
const loadMotion = () => (motion ??= import('motion'));

export interface RippleOptions {
  /** Seconds each part waits: by default 70 ms per part in reading order. */
  delays?: number[];
  /** CJK: the weight wave (from `rest` to `peak`); Latin: the baseline wave. */
  kind: 'weight' | 'baseline';
  rest?: number;
  peak?: number;
}

const last = new WeakMap<Element, number>();
/** At most every 1.5 s per title. */
const GAP_MS = 1500;

export function ripple(root: Element | null, opts: RippleOptions): void {
  if (!root || isResting()) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const now = performance.now();
  if (now - (last.get(root) ?? -Infinity) < GAP_MS) return;
  last.set(root, now);
  const parts = Array.from(root.querySelectorAll<HTMLElement>('[data-ripple]'));
  if (!parts.length) return;
  void loadMotion()
    .then(({ animate }) => {
      parts.forEach((el, i) => {
        const delay = opts.delays?.[i] ?? i * 0.07;
        const strong = el.dataset.ripple === 'accent';
        if (opts.kind === 'weight') {
          const rest = opts.rest ?? 700;
          const peak = opts.peak ?? 900;
          animate(
            el,
            {
              fontWeight: [rest, peak, rest],
              x: ['0em', '0.03em', '-0.012em', '0em'],
              scale: strong ? [1, 1.04, 1] : [1, 1.012, 1],
            },
            { duration: 0.48, delay, ease: 'easeInOut' },
          );
        } else {
          animate(el, { y: ['0em', '-0.07em', '0.015em', '0em'] }, { duration: 0.52, delay, ease: 'easeInOut' });
        }
      });
    })
    .catch(() => {
      // a ripple is decoration: none, then
    });
}
