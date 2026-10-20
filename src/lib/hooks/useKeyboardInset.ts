'use client';

import { useEffect, useState } from 'react';

/** How much of the layout viewport's foot the on-screen keyboard covers, in CSS px. */
export function keyboardInset(): number {
  const vv = typeof window === 'undefined' ? undefined : window.visualViewport;
  if (!vv) return 0;
  return Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
}

/**
 * How far the on-screen keyboard reaches up the window (0 with none, a
 * hardware keyboard, or a browser without visualViewport): what a bar docked
 * on the keyboard rises by (the writer's format bar, `--kb-inset`) and what
 * the caret keeps clear of. Read from visualViewport's resize and scroll, at
 * most once a frame, and only while `active` (a field has the focus) — iOS
 * Safari fires both a lot while the page scrolls under the keyboard. The
 * window's own height stays alone (the viewport meta's interactive-widget is
 * the chat composer's to rely on).
 */
export function useKeyboardInset(active = true): number {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!active || !vv) {
      setInset(0);
      return;
    }
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setInset(keyboardInset()));
    };
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      cancelAnimationFrame(frame);
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, [active]);
  return inset;
}
