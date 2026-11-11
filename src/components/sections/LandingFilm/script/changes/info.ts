/**
 * What a change's style is told (`ChangeInfo`): each set's planes at rest in stage heights, the screen, the clearance
 * under the header. The director builds it on every measure from the planes the server drew (their `data-*`), a test
 * from world.ts's own planes — the same numbers either way. Pure, no DOM.
 */
import { walkwayAt } from '../ground';
import type { Layout } from '../layout';
import type { SceneN } from '../timeline';
import type { ChangeInfo, ChangeN, ChangePlane, PlaneId } from './types';

/** The top of each plane's drawn paper (world y): what the styles know of where its art starts (the bridge: its walkway's apex). */
export const PLANE_TOP: Record<PlaneId, number> = { range: 384, peaks: 494, sea: 600, headland: 462, town: 590, hills: 650, near: 390, bridge: Math.round(walkwayAt(1000)), ground: 830 };

/** Depth below this is the backdrop (the far range, the peaks, the sea): it barely moves in legacy's change. */
export const BACKDROP_BELOW = 0.35;

/** A set's plane as drawn (world units). */
export interface SetPlane {
  id: PlaneId;
  depth: number;
  /** Where its paper ends (world y). */
  foot: number;
  /** Its own left edge (world x). */
  x0: number;
  /** Its cut-out foot sampled every `step` units from x0 (world y) — or null (no cut-out). */
  cut: { step: number; ys: number[] } | null;
}

/** `"100:910,912,…"` (World.tsx's `data-cut-ys`) → samples. */
export function parseCut(attr: string | null | undefined): SetPlane['cut'] {
  if (!attr) return null;
  const [step, list] = attr.split(':');
  const ys = (list ?? '').split(',').map(Number);
  return Number(step) > 0 && ys.length && ys.every(Number.isFinite) ? { step: Number(step), ys } : null;
}

/** The cut-out foot's world y at world x (linear between samples, its ends held). */
export function cutAt(cut: NonNullable<SetPlane['cut']>, x0: number, x: number): number {
  const f = (x - x0) / cut.step;
  if (f <= 0) return cut.ys[0];
  if (f >= cut.ys.length - 1) return cut.ys[cut.ys.length - 1];
  const i = Math.floor(f);
  return cut.ys[i] + (cut.ys[i + 1] - cut.ys[i]) * (f - i);
}

/** World y → stage heights from the stage's top, on a scene's layout. */
export const stageY = (L: Layout, y: number) => (L.groundY + (y - 885) * L.u) / L.h;

/**
 * A set's planes as a style sees them: `c0` the scene's camera at rest, `cam` where it is during this change (the
 * journey's camera has travelled by c2); a plane of depth d has c0 + (cam − c0)·d under the stage's centre.
 */
export function changePlanes(planes: SetPlane[], L: Layout, c0: number, cam: number): ChangePlane[] {
  return planes.map((pl, index) => {
    const xc = c0 + (cam - c0) * pl.depth;
    return {
      id: pl.id,
      depth: pl.depth,
      backdrop: pl.depth < BACKDROP_BELOW,
      index,
      top: stageY(L, PLANE_TOP[pl.id] ?? 600),
      foot: stageY(L, pl.foot),
      cutFoot: pl.cut ? stageY(L, cutAt(pl.cut, pl.x0, xc)) : null,
    };
  });
}

/** One change on one screen. `clearPx`: 12 px under the header's pen line, from the stage's top. */
export function changeInfo(n: ChangeN, L: Layout, old: ChangePlane[], nw: ChangePlane[], clearPx: number): ChangeInfo {
  return {
    n,
    from: n as SceneN,
    to: (n + 1) as SceneN,
    layout: L.name,
    tablet: L.tablet,
    w: L.w,
    h: L.h,
    lvh: L.lvh,
    old,
    new: nw,
    clear: clearPx / L.h,
  };
}
