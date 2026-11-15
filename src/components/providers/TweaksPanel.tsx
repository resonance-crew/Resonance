'use client';

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { TWEAKS_KEY, applyAppearance, isAccent, isSchemeChoice, type SchemeChoice } from '@/lib/design/appearance';
import type { Accent } from '@/lib/design/palette';

const TWEAK_DEFAULTS: TweakState = {
  accentColor: 'terracotta',
  scheme: 'system',
  fontFamily: 'default',
  grainIntensity: 2,
  mascots: false,
  autoTranslate: false,
};

/** Told on this page whenever a tweak is applied (the storage event tells the other tabs). */
const TWEAKS_EVENT = 'resonance:tweaks';

/*
 * The theme colour and the scheme are attributes on <html> (lib/design/
 * appearance: data-accent, data-scheme), which palette.css turns into every
 * colour of both schemes — each theme re-tints the whole neutral scale, not
 * just the accent pair, as it always did. Nothing colour-related is written
 * inline any more: an inline value would outrank the dark scheme's.
 */

// The self-hosted faces are named through the variables next/font sets on
// <html> (src/styles/fonts.ts) — their real family names are hashed. `default`
// is tokens.css's --font-heading.
const FONT_MAP: Record<string, string> = {
  default: "var(--font-playfair, 'Playfair Display'), var(--font-noto-serif-tc, 'Noto Serif TC'), Georgia, serif",
  handwritten: "'ChenYuluoyan Thin', var(--font-noto-serif-tc, 'Noto Serif TC'), cursive",
};

const GRAIN_MAP = [0, 0.055, 0.1, 0.18];

const STORAGE_KEY = TWEAKS_KEY;

// Card density is gone: it wrote grid-template-columns onto every card grid in
// the page at load, which outlived the grid it was meant for (CardLinkGrid's
// masonry reuses the node: an empty fourth column on a wide screen). Each grid
// owns its columns.
export interface TweakState {
  /** A theme of lib/design/palette (an unknown saved one reads as terracotta). */
  accentColor: Accent;
  /** The reader's scheme: the system's (the default), or always light or dark. */
  scheme: SchemeChoice;
  fontFamily: string;
  grainIntensity: number;
  /**
   * The paper puppets now and then on the home feed and a card's page (round 19): this browser's choice, off until
   * the reader turns it on in Settings → 顯示.
   */
  mascots: boolean;
  /**
   * Settings → 語言 → 自動翻譯 (round 25 §F4): a story in another language than the interface, its title and excerpt in
   * the feeds too, shown translated by AI — this browser's choice, off until the reader turns it on.
   */
  autoTranslate: boolean;
}

export { TWEAK_DEFAULTS };

/** Read persisted tweaks, falling back to defaults. SSR-safe; storage blocked (site data off, a sandboxed frame) reads as nothing saved. */
export function loadTweaks(): TweakState {
  if (typeof window === 'undefined') return TWEAK_DEFAULTS;
  let saved: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '{}');
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) saved = parsed as Record<string, unknown>;
  } catch {
    saved = {};
  }
  return {
    accentColor: isAccent(saved.accentColor) ? saved.accentColor : TWEAK_DEFAULTS.accentColor,
    scheme: isSchemeChoice(saved.scheme) ? saved.scheme : TWEAK_DEFAULTS.scheme,
    fontFamily: typeof saved.fontFamily === 'string' ? saved.fontFamily : TWEAK_DEFAULTS.fontFamily,
    grainIntensity: typeof saved.grainIntensity === 'number' ? saved.grainIntensity : TWEAK_DEFAULTS.grainIntensity,
    mascots: saved.mascots === true,
    autoTranslate: saved.autoTranslate === true,
  };
}

/**
 * Apply a tweak set to the live document and persist it. Runs in the root
 * layout on every page, so nothing here may throw: without storage the
 * choice simply isn't remembered.
 */
export function applyTweaks(vals: TweakState) {
  const root = document.documentElement;
  applyAppearance(vals.accentColor, vals.scheme);
  root.style.setProperty('--font-heading', FONT_MAP[vals.fontFamily] || FONT_MAP.default);
  root.style.setProperty('--grain-opacity', String(GRAIN_MAP[vals.grainIntensity] ?? 0.055));
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(vals));
  } catch {
    // Storage blocked (SecurityError) or full: the tweak lasts this page.
  }
  current = vals;
  window.dispatchEvent(new Event(TWEAKS_EVENT));
  postToEditor({ type: '__edit_mode_set_keys', edits: vals });
}

/** The design-iteration iframe's handshake; nothing listens outside one. */
function postToEditor(message: unknown) {
  try {
    if (window.parent !== window) window.parent.postMessage(message, '*');
  } catch {
    // A parent that can't be reached isn't the editor.
  }
}

/**
 * Hook for the Settings "Appearance" section: exposes the current tweak state
 * plus an `update(patch)` that applies + persists. State lives in localStorage
 * (shared with the global provider below), so changes take effect app-wide.
 */
export function useTweaks() {
  const [state, setState] = useState<TweakState>(TWEAK_DEFAULTS);

  useEffect(() => {
    setState(loadTweaks());
  }, []);

  const update = useCallback((patch: Partial<TweakState>) => {
    setState((prev) => {
      const next = { ...prev, ...patch };
      applyTweaks(next);
      return next;
    });
  }, []);

  return { state, update };
}

/** The tweaks as this page last applied or read them (null: not read yet). */
let current: TweakState | null = null;

function subscribeTweaks(onChange: () => void) {
  const onStorage = (e: StorageEvent) => {
    if (e.key !== STORAGE_KEY && e.key !== null) return;
    current = null;
    onChange();
  };
  window.addEventListener(TWEAKS_EVENT, onChange);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(TWEAKS_EVENT, onChange);
    window.removeEventListener('storage', onStorage);
  };
}
const autoTranslateNow = () => (current ??= loadTweaks()).autoTranslate;
const autoTranslateOnServer = () => false;

/**
 * Whether stories are shown translated by AI (Settings → 語言 → 自動翻譯): false on the server and through hydration
 * (it can't know this browser), this browser's choice from then on, and at once when it changes here or in another
 * tab. A page drawn on the client from the start reads it on its first render: nothing moves after it is drawn.
 */
export function useAutoTranslate(): boolean {
  return useSyncExternalStore(subscribeTweaks, autoTranslateNow, autoTranslateOnServer);
}

/** Forgets what was read (tests that write the storage themselves). */
export function forgetTweaksRead(): void {
  current = null;
}

/**
 * What the provider does on each page load: the saved tweaks, applied — or,
 * when they are the defaults (nothing saved, or the defaults saved), nothing
 * at all: the defaults are the stylesheets' own values, so writing them
 * onto <html> (a style recalc of the whole page) and saving them again
 * changes nothing anyone sees. The theme and scheme are on <html> already
 * (APPEARANCE_SCRIPT, before the first paint). The editor still hears them.
 */
export function applySavedTweaks(): void {
  const saved = loadTweaks();
  const defaults =
    saved.accentColor === TWEAK_DEFAULTS.accentColor &&
    saved.scheme === TWEAK_DEFAULTS.scheme &&
    saved.fontFamily === TWEAK_DEFAULTS.fontFamily &&
    saved.grainIntensity === TWEAK_DEFAULTS.grainIntensity &&
    saved.mascots === TWEAK_DEFAULTS.mascots &&
    saved.autoTranslate === TWEAK_DEFAULTS.autoTranslate;
  if (defaults) postToEditor({ type: '__edit_mode_set_keys', edits: saved });
  else applyTweaks(saved);
}

/**
 * Silent global provider: applies persisted tweaks on mount so the user's saved
 * accent / font / grain are honored on every page. Renders nothing — the
 * controls now live in Settings → Appearance. Retains the edit-mode
 * postMessage handshake used by the external design-iteration iframe.
 */
export default function TweaksPanel() {
  useEffect(() => {
    applySavedTweaks();
    postToEditor({ type: '__edit_mode_available' });
    // `await window.__contrastAudit()` in dev and emulator builds only — the
    // condition is constant in a production build, so the module never ships.
    if (process.env.NODE_ENV !== 'production' || process.env.NEXT_PUBLIC_FIREBASE_EMULATOR === 'true') {
      void import('@/lib/design/contrastAudit').then((m) => m.installContrastAudit());
    }
  }, []);

  return null;
}
