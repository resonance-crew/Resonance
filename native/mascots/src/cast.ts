/**
 * The cast with every part image inside the island: the build (scripts/native/build-mascots.mjs) puts each
 * public/mascots picture into the page as a data URL under its site path, and each part points at its own.
 */
import { MASCOT_CAST } from '@/lib/mascots/cast.generated';
import type { CastEntry } from '@/lib/mascots/types';

declare global {
  interface Window {
    /** Site path (`/mascots/<slug>/<part>.webp`) → data URL, written by the build. */
    __MASCOT_PARTS?: Record<string, string>;
  }
}

const parts = window.__MASCOT_PARTS ?? {};

export const ISLAND_CAST: readonly CastEntry[] = MASCOT_CAST.map((c) => ({
  ...c,
  base: '',
  manifest: {
    ...c.manifest,
    parts: c.manifest.parts.map((p) => ({ ...p, img: parts[c.base + p.img.split('?')[0]] ?? c.base + p.img })),
  },
}));
