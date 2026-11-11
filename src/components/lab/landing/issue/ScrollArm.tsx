'use client';

import { useEffect } from 'react';

/**
 * The scroll-linked marks (rules drawing in, headings inking in, the spread's fold) wake on the reader's first scroll,
 * and only those still below the screen then (`data-scrollfx` → `data-fx`): until then the page is as the server drew
 * it — every rule drawn, every heading in full ink — so what is already being read never undraws itself, and a page
 * only looked at (or captured whole) is never caught half drawn below the fold.
 */
export function ScrollArm() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>('[data-issue]');
    if (!root) return;
    const arm = () => {
      if (window.scrollY < 4) return;
      window.removeEventListener('scroll', arm);
      const fold = window.innerHeight;
      root.querySelectorAll<HTMLElement | SVGElement>('[data-scrollfx]').forEach((el) => {
        if (el.getBoundingClientRect().top >= fold) el.dataset.fx = '';
      });
    };
    window.addEventListener('scroll', arm, { passive: true });
    arm();
    return () => window.removeEventListener('scroll', arm);
  }, []);
  return null;
}
