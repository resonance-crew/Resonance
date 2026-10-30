'use client';

import { useEffect } from 'react';
import { keyboardInset } from './useKeyboardInset';

/**
 * The on-screen keyboard's height, remembered (round 22 §4.1, §6.3): the
 * sticker panel takes the keyboard's place at the height the keyboard last
 * had, per orientation and across visits — so the capsule doesn't move as one
 * gives way to the other. None known yet (or a hardware keyboard, a floating
 * one): {@link PANEL_DEFAULT}; a phone on its side keeps it under
 * {@link PANEL_LANDSCAPE_MAX}.
 */
const KEY = 'resonance:keyboard-height:';
export const PANEL_DEFAULT = 300;
export const PANEL_LANDSCAPE_MAX = 200;
/** Less than this isn't a keyboard (a bar of suggestions, the browser's own chrome moving). */
const KEYBOARD_MIN = 150;

const orientation = () => (typeof window !== 'undefined' && window.innerWidth > window.innerHeight ? 'landscape' : 'portrait');

/** The height the sticker panel opens at. */
export function rememberedKeyboardHeight(): number {
  const side = orientation();
  let h = PANEL_DEFAULT;
  try {
    const kept = Number(window.localStorage.getItem(KEY + side));
    if (Number.isFinite(kept) && kept >= KEYBOARD_MIN) h = kept;
  } catch {
    // no storage: the default
  }
  return side === 'landscape' ? Math.min(h, PANEL_LANDSCAPE_MAX) : h;
}

/** While `active` (the field has the focus), the keyboard's height is kept as it changes. */
export function useRememberKeyboardHeight(active: boolean): void {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!active || !vv) return;
    let frame = 0;
    const read = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const h = keyboardInset();
        if (h < KEYBOARD_MIN) return;
        try {
          window.localStorage.setItem(KEY + orientation(), String(h));
        } catch {
          // no storage
        }
      });
    };
    read();
    vv.addEventListener('resize', read);
    return () => {
      cancelAnimationFrame(frame);
      vv.removeEventListener('resize', read);
    };
  }, [active]);
}
