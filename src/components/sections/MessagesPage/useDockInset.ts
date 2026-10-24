'use client';

import { useLayoutEffect, useState } from 'react';

/** The CSS variable the thread's body reads the floating foot's height from (Thread.module.css). */
export const DOCK_INSET_VAR = '--dock-h';

/**
 * The thread runs on under its floating foot (the composer, or the notice in
 * its place) to the screen's edge: the body is pulled down under the foot by
 * the foot's height, and its list keeps that much room at its end (plus the
 * air under the newest message), so the newest message always clears the
 * capsule and the slip over it — as the field grows to five lines, a reply is
 * picked, or a picture rides along. The height is the foot's whole box (the
 * capsule, the slip, the gap under it and the safe area), measured live and
 * written straight onto the body as `--dock-h`: no render of the thread for it
 * (typing never draws the thread again), and before the first paint.
 */
export function useDockInset(): { bodyRef: (el: HTMLElement | null) => void; dockRef: (el: HTMLElement | null) => void } {
  // The two elements, as they mount (the foot comes and goes with what the thread offers).
  const [body, setBody] = useState<HTMLElement | null>(null);
  const [dock, setDock] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (!body || !dock) return;
    let last = -1;
    const write = () => {
      const h = Math.round(dock.getBoundingClientRect().height);
      if (h === last) return;
      last = h;
      body.style.setProperty(DOCK_INSET_VAR, `${h}px`);
    };
    write();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(write);
    ro.observe(dock);
    return () => ro.disconnect();
  }, [body, dock]);
  return { bodyRef: setBody, dockRef: setDock };
}
