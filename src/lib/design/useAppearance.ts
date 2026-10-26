'use client';

import { useMemo, useSyncExternalStore } from 'react';
import { resolvedAccent, resolvedScheme } from './appearance';
import { paletteFor, type Accent, type Palette, type Scheme } from './palette';

/**
 * The theme and scheme the page wears, for what draws its colours in script
 * (a canvas, a colour handed to a library) rather than through palette.css.
 * Re-renders when the reader changes either (`<html>`'s data-accent /
 * data-scheme) or the system flips between light and dark. The server's
 * answer is light terracotta, so a drawing made before hydration matches the
 * CSS defaults.
 */
function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-accent', 'data-scheme'] });
  const media = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;
  media?.addEventListener('change', onChange);
  return () => {
    observer.disconnect();
    media?.removeEventListener('change', onChange);
  };
}

const snapshot = () => `${resolvedAccent()}/${resolvedScheme()}`;
const serverSnapshot = () => 'terracotta/light';

export function useAppearance(): { accent: Accent; scheme: Scheme } {
  const key = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  return useMemo(() => {
    const [accent, scheme] = key.split('/') as [Accent, Scheme];
    return { accent, scheme };
  }, [key]);
}

/** The palette the page wears now (see useAppearance). */
export function usePalette(): Palette {
  const { accent, scheme } = useAppearance();
  return useMemo(() => paletteFor(accent, scheme), [accent, scheme]);
}
