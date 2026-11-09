'use client';

import { useSyncExternalStore } from 'react';

/**
 * 「讓小紙團休息」: one switch for the whole page (WCAG 2.2.2). While it is on, every stage pauses, the stills stop
 * breathing and blinking, and nothing loops; `data-pals-rest` on <html> is what the CSS reads. Remembered in this
 * browser only, and only where storage works (a private window may refuse it).
 */
const KEY = 'resonance:oneday-rest';
const listeners = new Set<() => void>();
let resting: boolean | null = null;

function read(): boolean {
  if (resting !== null) return resting;
  try {
    resting = window.localStorage.getItem(KEY) === '1';
  } catch {
    resting = false;
  }
  return resting;
}

function apply(on: boolean): void {
  document.documentElement.toggleAttribute('data-pals-rest', on);
}

export function setResting(on: boolean): void {
  resting = on;
  try {
    if (on) window.localStorage.setItem(KEY, '1');
    else window.localStorage.removeItem(KEY);
  } catch {
    // remembered for this visit only
  }
  apply(on);
  listeners.forEach((fn) => fn());
}

export function isResting(): boolean {
  return typeof window === 'undefined' ? false : read();
}

export function onRestChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Whether the pals are resting (false on the server and until hydrated). */
export function useResting(): boolean {
  return useSyncExternalStore(
    (fn) => {
      apply(read());
      return onRestChange(fn);
    },
    () => read(),
    () => false,
  );
}
