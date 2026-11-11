/**
 * lift — "the curtain". The camera drops behind the old foreground: the new scene is already standing behind the old
 * one, nearly in place, and the old one is flown off it, nearest first and fastest.
 *
 * - Paint order: the whole new set behind the whole old set (new z 1–9, old z 20–28, each set far to near), so the new
 *   world is only ever seen where the old one has gone — revealed, never laid over.
 * - The first instant (p < P_SWITCH): the new set turns opaque behind the old (hidden by it), then the old set changes
 *   its feet without a pixel moving on screen: the ground to its cut-out (`cut`: its grass and a short torn foot — what
 *   shows under it is the lip and the new ground, the same paper), the middle flats of home and the journey to the
 *   pieces one saw (`rest`, world.ts `restClip`, drawn for the journey's resting camera too), the sea, the peaks and
 *   the range to their cut-outs (each behind the paper in front of it).
 * - The old ground's grass is the curtain's hem: it flies up out of the frame first and fastest (0.01 → 0.29), the near
 *   hill with its lone tree next (0.02 → 0.30, fading as it nears the header). The middle flats (hills, town,
 *   headland) lift a little and fade into the haze (by 0.18–0.27); the sea, the peaks and the range fade behind them.
 *   Leaving the puppets fade where they stand (their grass lifted from under them, they don't ride it up).
 * - The new set settles up a short way, by depth: its ground 0.4 %, hills 6.5 %, town 5 %, headland and near hill as
 *   far as they must to stay under the old horizon. The new town and headland only come in once the old town is gone
 *   (never two towns at once), the journey's tall near hill once the old landmarks have gone, the far range and peaks
 *   last (0.44 → 0.70, after the old ones have faded: the sky alone between them). The new puppets rise in at 0.26–0.38.
 * - c3 (the valley → the night): the valley keeps home's far layers (world.ts `keep`), so they simply stay (swapped
 *   for the identical new paper at once); the banks melt into the night as they fly, the bridge goes first (the pair
 *   at the top fades with it), and home's ground and near hill rise from behind the lip.
 * - The hour turns across the change (eased), the hero lifts a little and fades by 0.14, the card on the wind and the
 *   pair barely float (2 % at the middle). Every move is upward; pure in (p, info).
 */
import { computeLayout } from '../layout';
import { clamp01, easeOut, smooth, span } from '../timeline';
import type { ChangeFrame, ChangeInfo, ChangeOrder, ChangePlane, ChangeStyle, FootMode, PlaneMove } from './types';

/* ───────────── the knobs ───────────── */

/** The first instant: the new set turns opaque behind the old (at p > 0), then (at P_SWITCH) the old changes its feet. */
export const P_SWITCH = 0.002;
/** The paint order: the new set's z starts here, the old set's at OLD_Z (each set far to near). */
const NEW_Z = 1;
const OLD_Z = 20;
/** The layers the valley keeps from the opening (world.ts `keep`): in c3 they are the same paper on both sides. */
export const KEPT = ['range', 'sea', 'headland', 'town', 'hills'] as const;
/** The new town and headland come in once the old town is gone (p). */
export const NEW_TOWN_IN: [number, number] = [0.17, 0.32];
/** The old town is gone by NEW_TOWN_IN[0] (p). */
const OLD_TOWN_OUT: [number, number] = [0.02, 0.17];

/* ───────────── the curves ───────────── */

/** Accelerating from rest: a flat lifted, then hauled away. */
const accel = (u: number) => u * u;
const byId = (list: ChangePlane[], id: string) => list.find((pl) => pl.id === id);

/** The same paper in both sets (c3: the valley keeps home's far layers): it simply stays. */
function sameIn(n: number, pl: ChangePlane, other: ChangePlane[]): boolean {
  if (n !== 3 || !(KEPT as readonly string[]).includes(pl.id)) return false;
  const o = byId(other, pl.id);
  return !!o && Math.abs(o.top - pl.top) < 1e-6 && Math.abs(o.foot - pl.foot) < 1e-6 && Math.abs((o.cutFoot ?? 0) - (pl.cutFoot ?? 0)) < 1e-6;
}

/** Where a new layer starts, below its rest (stage heights): hidden behind the old set, settling up as it goes. */
function settleOf(info: ChangeInfo, pl: ChangePlane): number {
  if (info.n === 3) {
    // into the night: home's ground and near hill rise from behind the lip (where the valley's gap showed the bridge)
    const L = computeLayout(info.w, info.h, info.lvh);
    const lipTop = (info.h - L.lip) / info.h;
    if (pl.id === 'ground') return Math.max(0.01, lipTop - pl.top + 0.012);
    if (pl.id === 'near') return Math.max(0.06, lipTop - pl.top + 0.01);
    return pl.id === 'peaks' ? 0.03 : 0;
  }
  // a layer whose art stands over the old horizon (a headland's lighthouse, the lone tree) starts under it
  const seaTop = byId(info.old, 'sea')?.top ?? 0.6;
  switch (pl.id) {
    case 'ground':
      return 0.004;
    case 'hills':
      return 0.065;
    case 'town':
      return 0.05;
    case 'headland':
      return Math.min(0.16, Math.max(0.05, seaTop - pl.top + 0.015));
    case 'near':
      return Math.min(0.28, Math.max(0.06, seaTop - pl.top + 0.02));
    case 'bridge':
    case 'sea':
      return 0;
    default:
      return 0.03;
  }
}

/* ───────────── the two sets ───────────── */

function oldMove(p: number, pl: ChangePlane, n: number, same: boolean): PlaneMove {
  if (p < P_SWITCH) return { y: 0, alpha: 1, foot: 'paper' };
  if (same) return { y: 0, alpha: 1 - smooth(span(p, 0.012, 0.024)), foot: 'paper' };
  // the middle flats fly as the pieces one saw (home's and the journey's); the valley has none
  const piece: FootMode = n === 3 ? 'paper' : 'rest';
  switch (pl.id) {
    case 'ground':
      // the curtain's hem: the old grass flies first and fastest (leaving the valley it melts into the night as it goes)
      return { y: -((pl.cutFoot ?? pl.foot) + 0.2) * accel(span(p, 0.01, 0.29)), alpha: n === 3 ? 1 - smooth(span(p, 0.03, 0.13)) : 1, foot: 'cut' };
    case 'bridge':
      // the bridge goes before the pair at the top could see it fly past them
      return { y: -1.1 * accel(span(p, 0.04, 0.24)), alpha: 1 - smooth(span(p, 0.01, 0.11)), foot: 'paper' };
    case 'near':
      return { y: -1.2 * accel(span(p, 0.02, 0.3)), alpha: 1 - smooth(span(p, 0.13, 0.27)), foot: piece };
    case 'hills':
      return { y: -0.2 * smooth(span(p, 0.02, 0.32)), alpha: 1 - smooth(span(p, 0.05, 0.26)), foot: piece };
    case 'town':
      return { y: -0.15 * smooth(span(p, 0.02, 0.34)), alpha: 1 - smooth(span(p, OLD_TOWN_OUT[0], OLD_TOWN_OUT[1])), foot: piece };
    case 'headland':
      return { y: -0.11 * smooth(span(p, 0.02, 0.36)), alpha: 1 - smooth(span(p, 0.05, 0.27)), foot: piece };
    case 'sea':
      // the new sea stands behind it, the same paper: only its lines and its light change as it goes
      return { y: -0.04 * smooth(span(p, 0.1, 0.5)), alpha: 1 - smooth(span(p, 0.16, 0.42)), foot: 'cut' };
    default:
      // the range and the peaks
      return { y: -0.035 * smooth(span(p, 0.1, 0.5)), alpha: 1 - smooth(span(p, 0.18, 0.42)), foot: 'cut' };
  }
}

function newMove(p: number, pl: ChangePlane, info: ChangeInfo, same: boolean): PlaneMove {
  const there = p > 0 ? 1 : 0;
  if (same || pl.id === 'sea') return { y: 0, alpha: there, foot: 'paper' };
  const d = settleOf(info, pl);
  // the far range and peaks last, once the old ones have faded (the sky alone between them)
  if (pl.id === 'range' || pl.id === 'peaks') return { y: d * (1 - easeOut(span(p, 0.36, 1))), alpha: smooth(span(p, 0.44, 0.7)), foot: 'paper' };
  // the journey's near hill stands tall over the old sea: it comes in once the old landmarks have gone
  if (pl.id === 'near' && info.n !== 3) return { y: d * (1 - easeOut(span(p, 0.22, 0.8))), alpha: smooth(span(p, 0.28, 0.48)), foot: 'paper' };
  const at = pl.id === 'ground' && info.n !== 3 ? [0.02, 0.6] : pl.id === 'near' || pl.id === 'ground' ? [0.1, 0.85] : [0.08, 0.66];
  // the new town (and its headland) only once the old one has gone: never two towns at once
  const shown = (pl.id === 'town' || pl.id === 'headland') && info.n !== 3 ? smooth(span(p, NEW_TOWN_IN[0], NEW_TOWN_IN[1])) : there;
  return { y: d * (1 - easeOut(span(p, at[0], at[1]))), alpha: shown, foot: 'paper' };
}

export const lift: ChangeStyle = {
  name: 'lift',
  strips: 0,

  order(info: ChangeInfo): ChangeOrder {
    return { old: info.old.map((pl) => OLD_Z + pl.index), new: info.new.map((pl) => NEW_Z + pl.index), fringe: { old: 50, new: 60 } };
  },

  frame(p: number, info: ChangeInfo): ChangeFrame {
    const q = clamp01(p);
    // the leaving puppets fade where they stand as their grass is lifted from under them (摺摺 waves a moment first)
    const actorsOld = info.n === 1 ? 1 - smooth(span(q, 0.02, 0.1)) : 1 - smooth(span(q, 0, 0.09));
    const ground = byId(info.old, 'ground');
    const stay = ground && actorsOld > 0 ? -oldMove(q, ground, info.n, false).y : 0;
    return {
      old: info.old.map((pl) => oldMove(q, pl, info.n, sameIn(info.n, pl, info.new))),
      new: info.new.map((pl) => newMove(q, pl, info, sameIn(info.n, pl, info.old))),
      fringe: {
        // the corner grass is the nearest paper of all: it goes first, fastest, fading as it flies
        old: { y: -1.2 * accel(span(q, 0, 0.26)), alpha: 1 - smooth(span(q, 0.04, 0.16)) },
        new: { y: 0.1 * (1 - easeOut(span(q, 0.72, 1))), alpha: smooth(span(q, 0.74, 0.96)) },
      },
      held: info.n === 3 ? { y: 0, alpha: 1 - smooth(span(q, 0.06, 0.32)) } : { y: -0.02 * Math.sin(Math.PI * q), alpha: 1 },
      lanterns: { y: 0, alpha: 1 },
      actors: {
        old: { y: stay, alpha: actorsOld },
        new: { y: 0.06 * (1 - easeOut(span(q, 0.24, 0.5))), alpha: smooth(span(q, 0.26, 0.38)) },
      },
      hero: { y: -0.03 * smooth(span(q, 0, 0.2)), alpha: 1 - smooth(span(q, 0, 0.14)) },
      hour: smooth(span(q, 0.02, 0.86)),
      strips: [],
    };
  },
};
