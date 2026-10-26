import type { CSSProperties } from 'react';

/**
 * A person's colour — the pastel a profile stores for its hand-drawn avatar —
 * as the page's scheme draws it. A stored colour rides in `--av` under the
 * global `.res-av` rule (globals.css): as stored in light; in dark the same
 * hue at the ladder's avatar step (palette.ts `avatarFill`, written in CSS),
 * so the chalk initials read on it and the server's HTML is already right in
 * either scheme. A token (`var(--…)`) follows the scheme by itself and is
 * drawn as it is.
 */
export interface PersonFill {
  /** What to paint with (an SVG fill, a background). */
  fill: string;
  /** The class the painted element (or an ancestor) wears: `res-av` for a stored colour, else ''. */
  className: string;
  /** The custom property it carries (`--av`), else nothing. */
  style: CSSProperties;
}

export function personFill(color: string): PersonFill {
  if (color.trim().startsWith('var(')) return { fill: color, className: '', style: {} };
  return { fill: 'var(--av-fill)', className: 'res-av', style: { '--av': color } as CSSProperties };
}
