'use client';

import { useEffect, type RefObject } from 'react';

/**
 * Rules drawn once (PenRule `draw="once"`, the last page's ruling) inside `ref`: armed (hidden, ready to draw) on the
 * reader's first scroll if the box is still below the screen then, and drawn in one stroke when `threshold` of it is
 * in view. Until that first scroll, and with reduced motion or no script, they are simply drawn (as ScrollArm leaves
 * the scroll-linked marks), so a page only looked at — or captured whole — is never caught half ruled.
 */
export function useDrawnOnView(ref: RefObject<HTMLElement | null>, threshold = 0.25): void {
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver !== 'function') return;
    let seen: IntersectionObserver | null = null;
    const arm = () => {
      if (window.scrollY < 4) return;
      window.removeEventListener('scroll', arm);
      // on screen already: leave it drawn rather than undraw what is being read
      if (el.getBoundingClientRect().top < window.innerHeight) return;
      el.dataset.armed = '';
      seen = new IntersectionObserver(
        (entries) => {
          if (!entries.some((e) => e.isIntersecting)) return;
          seen?.disconnect();
          el.dataset.drawn = '';
        },
        { threshold },
      );
      seen.observe(el);
    };
    window.addEventListener('scroll', arm, { passive: true });
    arm();
    return () => {
      window.removeEventListener('scroll', arm);
      seen?.disconnect();
    };
  }, [ref, threshold]);
}
