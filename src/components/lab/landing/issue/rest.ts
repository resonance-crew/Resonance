'use client';

import { useSyncExternalStore } from 'react';

/**
 * 「讓小紙團休息」 (WCAG 2.2.2): one switch for the whole issue — every stage pauses, the ripple stays still, the stills
 * stop breathing. Remembered per browser (a per-viewer convenience: storage may throw or be gone, and the page is
 * whole without it).
 */
const KEY = 'resonance:issue-pals-rest';
const listeners = new Set<() => void>();
let resting: boolean | null = null;

function read(): boolean {
  if (resting != null) return resting;
  try {
    resting = window.localStorage.getItem(KEY) === '1';
  } catch {
    resting = false;
  }
  return resting;
}

export function isResting(): boolean {
  return typeof window !== 'undefined' && read();
}

export function setResting(v: boolean): void {
  resting = v;
  try {
    if (v) window.localStorage.setItem(KEY, '1');
    else window.localStorage.removeItem(KEY);
  } catch {
    // remembered for this page only
  }
  listeners.forEach((fn) => fn());
}

export function onRest(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** The switch, for a component: false on the server and in the first render (the HTML is the waking page). */
export function useResting(): boolean {
  return useSyncExternalStore(onRest, read, () => false);
}
