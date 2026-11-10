/**
 * The stage's measures (SPEC §3.1): one CSS length per world unit (`--u`), the ground's and the horizon's screen y,
 * the room the hero keeps, the puppets' size. The CSS computes them (film.module.css `.film`), so the server's frame 0
 * and the runtime agree; the runtime reads them back from probes and keeps them here, with the derived ones.
 * `computeLayout` is the same formula in TypeScript, for tests and for the server's own reasoning.
 */
export type LayoutName = 'wide' | 'tall';

export interface Layout {
  name: LayoutName;
  /** Tall and at least 640 px wide: a tablet held upright. */
  tablet: boolean;
  /** The stage's width and the small viewport's height (100svh), px; the large one (100lvh), px. */
  w: number;
  h: number;
  lvh: number;
  /** px per world unit. */
  u: number;
  /** Screen y of the world's ground (y 885) and of its horizon (y 614), px. */
  groundY: number;
  hz: number;
  /** The room the hero block keeps at the top, px. */
  heroBottom: number;
  /** 摺摺's height, px (every puppet's `k` = pal / 420). */
  pal: number;
  lip: number;
  pad: number;
  /** How many world units the stage shows across. */
  view: number;
}

/** wide when the window is at least 1.1 times as wide as it is tall. */
export const layoutName = (w: number, h: number): LayoutName => (w / h >= 1.1 ? 'wide' : 'tall');

/** The CSS's formula (film.module.css), given the window. */
export function computeLayout(w: number, h: number, lvh = h): Layout {
  const name = layoutName(w, h);
  const tablet = name === 'tall' && w >= 640;
  let lip = 56;
  let pad = 24;
  let heroBottom = 340;
  let pal = 88;
  if (tablet) {
    // a tablet held upright: the hero's words end by 355 px (the longest, English on a 768 screen), so the world comes
    // up under them; its puppets near the phone's share of the world (摺摺 ~160 px drawn on a 1180 px screen)
    lip = 64;
    heroBottom = 380;
    pal = 146;
  }
  if (name === 'wide') {
    lip = 64;
    pad = 32;
    heroBottom = 0.42 * h;
    pal = Math.min(140, Math.max(112, 0.147 * h));
  }
  const u = Math.max(w / 1900, (h - lip - pad - heroBottom - 16) / 515);
  const groundY = h - lip - pad;
  return finishLayout({ name, tablet, w, h, lvh, u, groundY, heroBottom, pal, lip, pad });
}

/** The derived measures from the measured ones. */
export function finishLayout(m: Omit<Layout, 'hz' | 'view'>): Layout {
  return { ...m, hz: m.groundY - 271 * m.u, view: m.w / m.u };
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export const rectCenter = (r: Rect): [number, number] => [r.x + r.w / 2, r.y + r.h / 2];
