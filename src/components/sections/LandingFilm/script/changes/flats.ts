/**
 * flats — "the paper theatre" (the film's change: `?change=flats`, the default). Each flat is a cut-out on a toy
 * stage: the header's pen line is the proscenium's top, the player's strip (the lip) the stage's floor, the sky and the
 * sea the back cloth that never flies.
 *
 * A change, in four beats (c1 and c2; c3 below):
 * 1. A bank of tissue cloud wells up over the floor (a few torn layers of round puffs, lit on top, in the hour's
 *    paints): it covers the front grass, the ground and the puppets on it while they are still whole — they are let go
 *    inside it, never faded where they stand.
 * 2. The old flats fly up out of it into the sky, nearest first, fastest and farthest, each as the piece one saw at rest
 *    (world.ts `restClip`), hauled from its top with a slight swing — in its own paper for most of the way (on a tall
 *    screen each climbs by its depth, the near hill 0.6 of the stage, the town 0.45, through the held card's band:
 *    the roll-up seen whole), then paling into the haze over the last part of its climb (`haze`: its paper painted
 *    over, opaque, in the sky's colour), so it recedes as a far hill does and lets go as the next one starts to pale:
 *    depth by colour, never two see-through flats over one another. The hero flies first, as a flat of depth 0.6, its
 *    words passing under the header's pen line. The far range and peaks go last, one mountain cloth dissolving into
 *    the light low over the horizon. The bank rises after them and thins away from the top, its underside lifting off
 *    the floor. (c2 turns the hour early, so its flats pale into the sunset's warm light, never the golden hour's khaki.)
 * 3. The stage stands open for a breath while the hour turns (the sunrise, the sunset over the sea): low mists the bank
 *    left drift on the water, glints catch the light, and a big tissue cloud or two sweeps up in front — the nearest
 *    paper of all, fastest.
 * 4. The new world rises, farthest first: the range, the peaks and the headland surface from behind the horizon (out of
 *    the haze, behind the old sea's cloth, which lets go of them once they stand), the nearer flats come up from behind
 *    the floor, each settling with a tiny bounce (a 2–3 % overshoot), low mists lingering in their folds and clearing;
 *    the new puppets come up on their ground.
 *
 * c3 (the valley → the night): the far world is the same paper (the valley keeps home's far layers), so it stands while
 * the night falls. A night bank takes the valley's banks and its four (a heap of it over the bridge's top, where two of
 * them met); the bridge stays where it was built and is gone once the bank is over it (round 5: it never flies); home's near hill and ground come
 * up early with the five on it, who stand through the lanterns while mists clear from the folds.
 *
 * Pure in (p, info): transforms and opacity only; the tissue's paper is drawn once (`paper`), in square units.
 */
import { computeLayout } from '../layout';
import { ellipse, path, rng, tear, type Pt } from '../geom';
import { walkwayAt } from '../ground';
import { clamp01, easeOut, smooth, span } from '../timeline';
import { cloudPaper, streakPaper } from './paper';
import type { ChangeFrame, ChangeInfo, ChangeN, ChangeOrder, ChangePlane, ChangeStyle, FootMode, PlaneId, PlaneMove, StripMove, StripPaint } from './types';

/* ───────────── the knobs ───────────── */

/** The swing of a flat being flown out (degrees, about its top), of the mountain cloth, and of one settling (about its foot). */
export const SWING_OUT = 1.3;
export const SWING_FAR = 0.5;
export const SWING_IN = 0.5;
/** The bounce: how far a flat rising into place overshoots, as a share of its travel. */
export const BOUNCE = 0.025;

/** The bank wells up over the floor by BANK_COVER (p); what it covers is let go inside it (LET_GO). */
export const BANK_COVER = 0.1;
export const LET_GO: [number, number] = [0.105, 0.14];
/** How fast the bank rises once it has covered the floor (stage heights per p), and when each layer thins (the top first). */
const BANK_RISE = 0.35;
const BANK_THIN = 0.145;
const BANK_THIN_STEP = 0.03;
const BANK_THIN_DUR = 0.08;

/** The old middle flats: the first one's start, each next one's delay, the nearest's flight and how much longer each farther one takes (p). */
const OUT_FROM = 0.05;
const OUT_STEP = 0.065;
const OUT_DUR = 0.15;
const OUT_SLOWER = 0.01;
/** A wide screen: where a flown flat's middle is as it is gone (stage heights from the top), below the cards' band. */
export const VANISH = 0.36;
/** …and how far above its foot that is: a flown flat's foot rises to VANISH + BODY_UP. */
const BODY_UP = 0.18;
/** A big piece on a wide screen (taller than BIG: its near hill) flies until its foot is at BIG_FOOT, and quicker. */
const BIG = 0.36;
const BIG_FOOT = 0.4;
const BIG_DUR = 0.16;
/** …growing smaller as it recedes (never so small its sides show). */
const BIG_SHRINK = 0.08;
/**
 * A tall screen (a phone, a tablet upright): each flat climbs by its depth before it lets go (stage heights) — the
 * nearest most, through the held card's band (the card and 點點 are drawn in front) to the header's pen line, the
 * farther ones less: the roll-up seen whole, not a fade where it stands. Its middle never passes the clearance line.
 */
export const TALL_CLIMB: Partial<Record<PlaneId, number>> = { headland: 0.3, town: 0.45, hills: 0.55, near: 0.6 };
const TALL_CLIMB_ELSE = 0.45;
/** …the near hill growing a little smaller as it recedes. */
const TALL_SHRINK = 0.1;
/**
 * A flown flat keeps its own paper over the first third of its flight (it is seen rolling up, not fading in place) and
 * then pales into the haze as it recedes (from PALE_FROM of its travel: a wide screen's, a tall one's), to HAZE_END; it
 * lets go over the last LET_GO_FROM of its flight — by then the flat in front of it is gone, so no two paled flats are
 * ever seen through one another. A phone's flats fill its width, so they pale from a third: held in their own paper
 * to the top, the near hill (the darkest paper) crossed the sky as a dark slab.
 */
const PALE_FROM: Record<'wide' | 'tall', number> = { wide: 0.35, tall: 0.34 };
const HAZE_END = 0.92;
const LET_GO_FROM = 0.8;
/** The old range and peaks, flown together as one cloth (p), and how far they lift while they dissolve (a wide screen, a tall one). */
const FAR_OUT: [number, number] = [0.25, 0.44];
const FAR_LIFT: Record<'wide' | 'tall', number> = { wide: 0.1, tall: 0.15 };
/** The hero block (c1) flies first, as a flat of depth 0.6 (SPEC §4): its window (p) and climb (a wide screen, a tall one). */
const HERO_OUT: [number, number] = [0, 0.24];
const HERO_CLIMB: Record<'wide' | 'tall', number> = { wide: 0.38, tall: 0.5 };
/** The new far planes surface from behind the horizon: when, and how hazed they come up. */
const FAR_IN_FROM = 0.45;
const FAR_IN_DUR = 0.24;
const FAR_IN_STEP = 0.05;
const HAZE_IN = 0.55;
/** The old sea's cloth lets go of the new headland's shore once it stands. */
const OLD_SEA_OUT: [number, number] = [0.8, 0.9];
/** The new nearer flats: each one's rise and the delay between them; the last lands at p 1. */
const IN_DUR = 0.24;
const IN_STEP = 0.055;
/** c3: home's near hill and ground come up early, the five on it (they stand through the lanterns). */
const C3_IN: [number, number] = [0.3, 0.58];
const C3_IN_STEP = 0.05;

/** The far world the valley and home share (world.ts: the valley keeps home's far layers): c3 leaves it standing. */
const SHARED: Record<ChangeN, readonly PlaneId[]> = { 1: [], 2: [], 3: ['range', 'peaks', 'sea', 'headland', 'town', 'hills'] };
/** The middle flats that fly as their silhouettes at rest (world.ts REST_PLANES, drawn for home's and the journey's sets). */
const REST_IDS: readonly PlaneId[] = ['headland', 'town', 'hills', 'near'];
/**
 * On a tall screen the journey's near hill fills the frame and hides these at rest (c2): as it flies they would be
 * uncovered as whole bodies (full-width slabs of paper no one had seen), so they fly as their cut-outs — the torn strip
 * under their top, trees and roofs. (Home's town is seen at rest, c1: it keeps its silhouette.)
 */
const TALL_CUT: readonly PlaneId[] = ['town', 'hills'];

/* ───────────── the curves ───────────── */

/** easeOutBack with its overshoot set by s, zero velocity at the end. */
function backOut(u: number, s: number): number {
  const v = clamp01(u) - 1;
  return 1 + (s + 1) * v * v * v + s * v * v;
}
/** The s that makes easeOutBack overshoot by `over` (bisection: the overshoot grows with s). */
export function backS(over: number): number {
  let lo = 0;
  let hi = 3;
  for (let i = 0; i < 40; i++) {
    const s = (lo + hi) / 2;
    const x = (-2 * s) / (3 * (s + 1));
    const peak = (s + 1) * x * x * x + s * x * x;
    if (peak > over) hi = s;
    else lo = s;
  }
  return (lo + hi) / 2;
}
const BACK_S = backS(BOUNCE);
/** A haul: off the floor gently, quickening out. */
const haul = (u: number) => clamp01(u) ** 1.3;
/** A swing over a flight: none at either end, one lean and a smaller one back. */
const swing = (u: number) => Math.sin(1.5 * Math.PI * clamp01(u)) * (1 - clamp01(u)) ** 0.6;

/* ───────────── the cast of planes ───────────── */

type Role = 'cloth' | 'far' | 'flat' | 'keep';

function roleOf(pl: ChangePlane, n: ChangeN): Role {
  if (SHARED[n].includes(pl.id)) return 'keep';
  if (pl.id === 'sea') return 'cloth';
  // the headland stands in front of the sea (its shore over the water): it leaves as a flat, but comes in from behind
  // the horizon as the far planes do (`riseFar`)
  if (pl.backdrop && pl.id !== 'headland') return 'far';
  return 'flat';
}

/** The old flats that fly, nearest first (the ground and the bridge stay behind, in the bank). */
const fliers = (info: ChangeInfo) =>
  info.old.filter((pl) => roleOf(pl, info.n) === 'flat' && pl.id !== 'ground' && pl.id !== 'bridge').sort((a, b) => b.depth - a.depth || b.index - a.index);
/** The new planes that surface from behind the horizon (farthest first), and those that come up from behind the floor. */
const surfacing = (info: ChangeInfo) =>
  info.new.filter((pl) => roleOf(pl, info.n) === 'far' || (pl.id === 'headland' && roleOf(pl, info.n) === 'flat')).sort((a, b) => a.depth - b.depth);
const rising = (info: ChangeInfo) =>
  info.new.filter((pl) => roleOf(pl, info.n) === 'flat' && pl.id !== 'headland').sort((a, b) => a.depth - b.depth || a.index - b.index);

/** The sea's top at rest (the theatre's horizon). */
const seaOf = (planes: ChangePlane[]) => planes.find((pl) => pl.id === 'sea')?.top ?? 0.64;
const groundOf = (planes: ChangePlane[]) => planes.find((pl) => pl.id === 'ground');

/* ───────────── the screen's numbers ───────────── */

interface Stage {
  /** The bank's top when it has covered the floor (stage heights): just over the leaving puppets' heads. */
  cover: number;
  /** How deep the bank is (stage heights): from its top down past the lip's top. */
  depth: number;
  /** How far the leaving puppets sink into it (stage heights). */
  duck: number;
  /** How far the arriving puppets come up behind their ground's grass (stage heights): never above the floor before it. */
  lag: number;
  /** The tissue's widths keep the paper square: a strip h stage heights tall is ASPECT × h × (h px / w px) wide. */
  wOf: (h: number) => number;
  /** A cloud of the breath (a cumulus: CUMULUS wide to 1 tall) `fw` stage widths wide: its height, stage heights. */
  hOf: (fw: number) => number;
  /**
   * c3: the heap of cloud over the bridge's top, where 摺摺 and 聆聆 met (they stand higher than the bank's line): its
   * width (stage widths), its top when it has them covered; null elsewhere.
   */
  heap: { w: number; top: number } | null;
}
const ASPECT = 10;
const CUMULUS = 3;
const MIN_W = 1.5;
/** The leaving puppets' heads over their feet, in 摺摺's heights: the home's 摺摺; the journey's 聆聆 (and 點點); the valley's four on the bridge. */
const HEADS: Record<ChangeN, number> = { 1: 1.06, 2: 0.86, 3: 1.06 };
/** How far the leaving puppets sink into the bank as it comes over them (摺摺's heights): they wade in, so it stays low. */
const DUCK = 0.45;

function stageOf(info: ChangeInfo): Stage {
  const L = computeLayout(info.w, info.h, info.lvh);
  // the journey's puppets are drawn larger on a tall screen (film.module.css --pal-2)
  const zoom = info.from === 2 && L.name === 'tall' ? 1 + ((L.tablet ? 1.36 : 1.4) - 1) * 0.85 : 1;
  // their feet: the ground's line (world y 885); in the valley two of them stand on the bridge's top (walkwayAt(1000))
  const feet = L.groundY / info.h;
  const pal = (L.pal * zoom) / info.h;
  const lipTop = (info.h - L.lip - L.pad) / info.h;
  let cover = Math.min(0.84, feet - (HEADS[info.n] - DUCK) * pal - 0.012);
  let heap: Stage['heap'] = null;
  if (info.n === 3) {
    const apex = (L.groundY - (885 - walkwayAt(1000, L.name === 'tall')) * L.u) / info.h;
    // the two a hand's width apart, with room for an arm each
    const w = Math.min(0.9, (3.3 * L.pal) / info.w);
    const top = apex - (HEADS[3] - DUCK) * pal - 0.012;
    heap = { w, top };
    // the bank meets the heap's foot
    const hh = (w * info.w) / (CUMULUS * info.h);
    cover = Math.min(cover, top + 0.78 * hh);
  }
  return {
    cover,
    heap,
    depth: Math.max(0.14, lipTop + 0.03 - cover, 1.02 - cover),
    duck: DUCK * pal,
    lag: (1.6 * L.pal) / info.h,
    wOf: (h: number) => Math.max(MIN_W, (ASPECT * h * info.h) / info.w),
    hOf: (fw: number) => (fw * info.w) / (CUMULUS * info.h),
  };
}

/* ───────────── the moves of the planes ───────────── */

/** Where an old flat's paper ends as it flies (stage heights): its silhouette at rest. */
function bottomOf(pl: ChangePlane, groundTop: number): number {
  if (REST_IDS.includes(pl.id)) return Math.min(pl.foot, groundTop + 0.05);
  return Math.min(1, pl.foot);
}

/** When an old flat flies (rank 0 the nearest: first and fastest). */
const outWindow = (rank: number): [number, number] => [OUT_FROM + rank * OUT_STEP, OUT_FROM + rank * OUT_STEP + OUT_DUR + rank * OUT_SLOWER];

/** How far an old flat climbs before it is gone (stage heights). */
function climbOf(pl: ChangePlane, bottom: number, vanish: number, info: ChangeInfo): number {
  const mid = (pl.top + bottom) / 2;
  // a tall screen: by its depth, its middle kept under the clearance line
  if (info.layout === 'tall') return Math.max(0.14, Math.min(TALL_CLIMB[pl.id] ?? TALL_CLIMB_ELSE, mid - info.clear - 0.04));
  const big = bottom - pl.top > BIG;
  return Math.max(0.14, bottom - (big ? BIG_FOOT : vanish + BODY_UP));
}

/**
 * An old flat flown out: hauled from its top with a swing, up out of the bank, keeping its own paper for most of the
 * way and paling into the haze (opaque: its paper painted over in the haze's colour) only over the last part of its
 * travel, then letting go as a near-sky shape. A middle flat flies as its silhouette at rest — worn from the change's
 * first frame, where it changes nothing on screen.
 */
function flyOut(pl: ChangePlane, [a, b]: [number, number], p: number, groundTop: number, vanish: number, dir: number, info: ChangeInfo): PlaneMove {
  const tall = info.layout === 'tall';
  // a tall screen: the flats the near hill hid at rest fly as their torn top (trees, roofs), never as bodies no one saw
  const hidden = tall && info.n === 2 && TALL_CUT.includes(pl.id) && pl.cutFoot != null;
  const foot: FootMode = hidden ? 'cut' : REST_IDS.includes(pl.id) ? 'rest' : 'paper';
  const bottom = hidden ? Math.min(bottomOf(pl, groundTop), pl.cutFoot!) : bottomOf(pl, groundTop);
  // a wide screen's big piece goes quicker, and recedes as it goes (smaller about its top: upstage, into the haze)
  const big = !tall && bottom - pl.top > BIG;
  const u = span(p, a, big ? a + BIG_DUR : b);
  if (u <= 0) return { y: 0, alpha: 1, foot };
  const gone = haul(u);
  const y = -climbOf(pl, bottom, vanish, info) * gone;
  // it pales with the distance it has flown (not the time), over the last part of its travel only
  const haze = HAZE_END * smooth(span(gone, PALE_FROM[tall ? 'tall' : 'wide'], 1));
  const alpha = u >= 1 ? 0 : 1 - smooth(span(u, LET_GO_FROM, 1));
  const scale = big ? 1 - BIG_SHRINK * smooth(u) : tall && pl.id === 'near' ? 1 - TALL_SHRINK * smooth(u) : 1;
  return { y, alpha, haze, scale, rot: dir * SWING_OUT * swing(u), origin: 'top', foot };
}

/** The old range and peaks: one mountain cloth (cut free a little under the horizon), lifting as it dissolves into the light low over it. */
function farOut(p: number, tall: boolean): PlaneMove {
  const u = span(p, FAR_OUT[0], FAR_OUT[1]);
  if (u <= 0) return { y: 0, alpha: 1, foot: p > 0 ? 'cut' : 'paper' };
  return { y: -FAR_LIFT[tall ? 'tall' : 'wide'] * haul(u), alpha: u >= 1 ? 0 : 1 - smooth(span(u, 0.78, 1)), haze: smooth(span(u, 0.1, 0.8)), rot: -SWING_FAR * swing(u), origin: 'top', foot: 'cut' };
}

/**
 * The hero block (c1): the first flat out, flown as a plane of depth 0.6 — up through the sky, its words passing under
 * the header's pen line (the hero's roof, film.module.css `.heroRoof`, takes them there), letting go at the end.
 */
function heroOut(p: number, tall: boolean): { y: number; alpha: number } {
  const u = span(p, HERO_OUT[0], HERO_OUT[1]);
  return { y: -HERO_CLIMB[tall ? 'tall' : 'wide'] * haul(u), alpha: u >= 1 ? 0 : 1 - smooth(span(u, 0.7, 1)) };
}

/**
 * How far the hour has turned through a change. c2 (golden → sunset → dusk) turns early, so the flats flying out pale
 * into the sunset's warm low sky rather than the golden hour's (whose blue-and-gold wash mixed is a khaki), and holds at
 * the sunset while the sea stands open, then goes on to the dusk as the valley comes up.
 */
export function hourOf(n: ChangeN, p: number): number {
  if (n === 3) return smooth(span(p, 0.06, 0.8));
  if (n === 2) return 0.55 * smooth(span(p, 0, 0.36)) + 0.45 * smooth(span(p, 0.56, 0.92));
  return smooth(span(p, 0.12, 0.86));
}

/** A new plane surfacing from behind the horizon (behind the old sea's cloth), out of the haze. */
function riseFar(pl: ChangePlane, [a, b]: [number, number], p: number, horizon: number): PlaneMove {
  const u = span(p, a, b);
  const from = Math.max(0.02, horizon + 0.012 - pl.top);
  // (unseen behind the old sea's cloth until it starts)
  if (u <= 0) return { y: from, alpha: 0, haze: HAZE_IN, foot: 'cut' };
  if (u >= 1) return { y: 0, alpha: 1, foot: 'paper' };
  return { y: from * (1 - backOut(u, BACK_S)), alpha: 1, haze: HAZE_IN * (1 - smooth(span(u, 0.2, 1))), foot: pl.id === 'headland' ? 'paper' : 'cut' };
}

/** A new plane rising into place from behind the floor, settling with a bounce. */
function riseIn(pl: ChangePlane, [a, b]: [number, number], p: number, dir: number): PlaneMove {
  const u = span(p, a, b);
  const below = Math.max(0, 1.02 - pl.top);
  if (u <= 0) return { y: below, alpha: 1, foot: 'paper' };
  if (u >= 1) return { y: 0, alpha: 1, foot: 'paper' };
  const y = below * (1 - backOut(u, BACK_S));
  const rot = dir * SWING_IN * Math.sin(2 * Math.PI * u) * (1 - u) ** 2;
  return { y, alpha: 1, rot, foot: 'paper' };
}

/** When each new plane comes up: the surfacing ones and the rising ones, by plane id. */
function inWindows(info: ChangeInfo): Map<PlaneId, [number, number]> {
  const out = new Map<PlaneId, [number, number]>();
  if (info.n === 3) {
    const rs = rising(info);
    rs.forEach((pl, i) => out.set(pl.id, [C3_IN[0] + i * C3_IN_STEP, C3_IN[1] - (rs.length - 1 - i) * C3_IN_STEP]));
    return out;
  }
  surfacing(info).forEach((pl, i) => out.set(pl.id, [FAR_IN_FROM + i * FAR_IN_STEP, FAR_IN_FROM + i * FAR_IN_STEP + FAR_IN_DUR]));
  const rs = rising(info);
  rs.forEach((pl, i) => {
    const end = 1 - (rs.length - 1 - i) * IN_STEP;
    out.set(pl.id, [end - IN_DUR, end]);
  });
  return out;
}

/** How far the new ground has come up (0 below the floor … 1 in place, never past it). */
function groundUp(win: Map<PlaneId, [number, number]>, p: number): number {
  const w = win.get('ground');
  return w ? clamp01(backOut(span(p, w[0], w[1]), BACK_S)) : 1;
}

/* ───────────── the tissue ───────────── */

/** A layer of the bank: its centre under the bank's top and its height (both × the bank's depth), across, drift, turn. */
interface Layer {
  off: number;
  h: number;
  x: number;
  dx: number;
  rot: number;
}
/** The bank, top to bottom (each layer's solid band reaches the next one's puffs; the lower ones nearer, in front). */
const BANK: Layer[] = [
  { off: 0.12, h: 0.7, x: 0.46, dx: 0.03, rot: -0.4 },
  { off: 0.37, h: 0.9, x: 0.55, dx: -0.04, rot: 0.5 },
  { off: 0.68, h: 1.2, x: 0.44, dx: 0.035, rot: -0.3 },
];
/**
 * The near clouds of the breath: tissue cumulus sweeping up in front, faster than anything — `fw` its width on a tall
 * screen and on a wide one (stage widths), its window (p), its strength.
 */
const NEAR: { fw: [number, number]; x: number; dx: number; win: [number, number]; a: number }[] = [
  { fw: [0.78, 0.4], x: 0.3, dx: 0.05, win: [0.27, 0.64], a: 0.55 },
  { fw: [0.62, 0.32], x: 0.74, dx: -0.04, win: [0.37, 0.76], a: 0.5 },
];
/** The low mists the bank leaves on the water (their place under the horizon, their size and drift). */
const MISTS: { d: number; w: number; h: number; x: number; dx: number; rot: number; a: number }[] = [
  { d: 0.06, w: 0.7, h: 0.035, x: 0.28, dx: 0.06, rot: -0.4, a: 0.6 },
  { d: 0.14, w: 0.85, h: 0.045, x: 0.74, dx: -0.07, rot: 0.5, a: 0.55 },
  { d: 0.24, w: 0.95, h: 0.055, x: 0.4, dx: 0.05, rot: -0.3, a: 0.5 },
];
const GLINTS = 9;
const GLINT_ALPHA = 0.5;
/** The strips, in the order `strips()` answers them and `paper()` draws them. */
const S_GLINT = 0;
const S_BANK = S_GLINT + GLINTS;
const S_HEAP = S_BANK + 2 * BANK.length;
const S_NEAR = S_HEAP + 2;
const S_MIST = S_NEAR + 2 * NEAR.length;
const S_FOLD = S_MIST + MISTS.length;
const FOLDS = 3;
const STRIPS = S_FOLD + FOLDS;

/** A glint's paper: a short tapered ribbon of light, torn. */
function glintPaper(seed: number): string {
  const r = rng(seed);
  const ph = r() * 6;
  const line: Pt[] = [];
  for (let x = 0; x <= 1000; x += 25) line.push([x, 50 + Math.sin(x / 120 + ph) * 3]);
  const top = line.map(([x, y]): Pt => [x, y - 34 * Math.sin((Math.PI * x) / 1000) ** 0.6]);
  const low = [...line].reverse().map(([x, y]): Pt => [x, y + 30 * Math.sin((Math.PI * x) / 1000) ** 0.6]);
  return path(tear([...top, ...low], seed + 3, { amp: 1, jag: 0.8, wander: 2 }), true, 1);
}

/**
 * A tissue cumulus, drawn for a strip CUMULUS times wider than tall (px): a flat torn base and round puffs heaped on
 * it, the middle tallest. Its crest is the same paper a little up and left, a little smaller — laid lighter over it, it
 * leaves a sliver of the body's deeper tone along each puff's lower right (the sky's paper clouds' shading).
 */
function cumulusPaper(seed: number, crest: boolean): string {
  const r = rng(seed);
  const W = CUMULUS * 100;
  const sx = 1000 / W;
  const ox = crest ? -3 : 0;
  const oy = crest ? -3 : 0;
  const k = crest ? 0.92 : 1;
  const parts: string[] = [];
  const put = (pts: Pt[], sd: number) => parts.push(path(tear(pts, sd, { amp: 1, jag: 0.5, wander: 1.2 }).map(([x, y]): Pt => [x * sx, y]), true, 1));
  // the base: a long flat lens
  put(ellipse(W / 2 + ox, 78 + oy, (W / 2 - 14) * k, 14 * k, 40), seed + (crest ? 2 : 1));
  // the puffs, tallest in the middle
  const count = 6;
  for (let i = 0; i < count; i++) {
    const t = (i + 0.5) / count;
    const hump = Math.sin(Math.PI * t);
    // (inside the box: the strip's svg clips at its edges)
    const R = (14 + 18 * hump + r() * 6) * k;
    const cx = 30 + t * (W - 60) + (r() - 0.5) * 12 + ox;
    const cy = 78 - 6 - R * 0.55 - 10 * hump + oy;
    put(ellipse(cx, cy, R, R * 0.92, 26), seed + (crest ? 211 : 11) + i);
  }
  return parts.join('');
}

function paperOf(i: number): string {
  if (i < S_BANK) return glintPaper(9100 + i * 7);
  if (i < S_HEAP) {
    const k = i - S_BANK;
    return cloudPaper(9200 + (k >> 1) * 13, 46, 86, 16, 34, k % 2 === 1);
  }
  if (i < S_NEAR) return cumulusPaper(9250, i - S_HEAP === 1);
  if (i < S_MIST) {
    const k = i - S_NEAR;
    return cumulusPaper(9300 + (k >> 1) * 17, k % 2 === 1);
  }
  return streakPaper(9400 + (i - S_MIST) * 7, 48);
}

/** The hour's tissue, by change: the bank's layers (crest, body) top to bottom, the near clouds', the mists'. */
type Pair = [StripPaint, StripPaint];
const TONES: Record<ChangeN, { bank: Pair[]; near: Pair[]; mist: StripPaint[] }> = {
  1: {
    bank: [['halo', 'cloud-front'], ['cloud-front', 'streak'], ['streak', 'mist']],
    near: [['cloud-front', 'streak'], ['halo', 'mist']],
    mist: ['cloud-front', 'halo', 'mist'],
  },
  2: {
    bank: [['cloud-front', 'halo'], ['halo', 'sky-3'], ['sky-3', 'mist']],
    near: [['cloud-front', 'halo'], ['halo', 'mist']],
    mist: ['halo', 'cloud-front', 'mist'],
  },
  3: {
    bank: [['mist', 'cloud-back'], ['cloud-back', 'mist'], ['mist', 'cloud-back']],
    near: [['streak', 'halo'], ['cloud-front', 'streak']],
    mist: ['streak', 'halo', 'cloud-front'],
  },
};

const HIDDEN: StripMove = { x: 0.5, y: 2, w: 1, h: 0.1, alpha: 0, paint: 'mist', z: 0 };
/** The paint order's slots for the tissue (the planes' are in `order`). */
const Z = { glint: 10, mist: 11, bank: 22, near: 52 } as const;

/** The bank's line (its top) at p: up over the floor by BANK_COVER, then rising on as it thins. */
function bankTop(p: number, st: Stage): number {
  const start = 1.0;
  if (p <= BANK_COVER) return start - (start - st.cover) * easeOut(span(p, 0, BANK_COVER));
  return st.cover - BANK_RISE * (p - BANK_COVER);
}

function strips(p: number, info: ChangeInfo, st: Stage, win: Map<PlaneId, [number, number]>, order: ChangeOrder): StripMove[] {
  const n = info.n;
  const t = TONES[n];
  const out: StripMove[] = [];
  const cloud = (y: number, h: number, w: number, x: number, alpha: number, [crest, body]: Pair, z: number, rot: number) => {
    const a = y - 0.5 * h > 1.02 || y + 0.5 * h < -0.02 ? 0 : clamp01(alpha);
    // one piece of paper a cloud (round 5, the owner: 「雲朵也不要疊很多層…一層就好了」): the crest's lighter copy is
    // no longer laid over the body (its strip stays in the list, unseen: the strips keep their order)
    out.push({ x, y, w, h, rot, alpha: a, paint: body, z });
    out.push({ x, y, w, h, rot, alpha: 0, paint: crest, z: z + 1 });
  };
  const seaNow = seaOf(info.old) + (seaOf(info.new) - seaOf(info.old)) * smooth(p);
  const open = n !== 3;

  // the glints on the open sea (behind every flat, over the back cloth)
  const gOn = open ? GLINT_ALPHA * smooth(span(p, n === 2 ? 0.08 : 0.2, n === 2 ? 0.2 : 0.34)) * (1 - smooth(span(p, 0.66, 0.82))) : 0;
  for (let i = 0; i < GLINTS; i++) {
    const tt = (i + 0.5) / GLINTS;
    const depth = tt ** 1.4;
    const x0 = ((i * 0.618034 + 0.17) % 1) * 0.84 + 0.08;
    const room = Math.max(0.05, 0.88 - seaNow - 0.03);
    out.push({
      x: x0 + 0.02 * Math.sin(2 * Math.PI * (0.9 * p + i * 0.37)),
      y: seaNow + 0.03 + room * depth,
      w: 0.08 + 0.2 * depth,
      h: 0.008 + 0.016 * depth,
      rot: ((i % 3) - 1) * 0.5,
      alpha: gOn <= 0.004 ? 0 : gOn * (0.6 + (0.4 * ((i * 7) % 5)) / 4),
      paint: n === 2 ? 'streak' : 'sky-3',
      z: Z.glint,
    });
  }

  // the bank: up over the floor, then rising on and thinning from its top (its underside lifting off the floor)
  const top = bankTop(p, st);
  BANK.forEach((L, j) => {
    const thin = 1 - smooth(span(p, BANK_THIN + j * BANK_THIN_STEP, BANK_THIN + j * BANK_THIN_STEP + BANK_THIN_DUR));
    const h = L.h * st.depth;
    cloud(top + L.off * st.depth, h, st.wOf(h), L.x + L.dx * p, p <= 0 || p >= 1 ? 0 : thin, t.bank[j % t.bank.length], Z.bank + 2 * j, L.rot);
  });

  // c3: the heap over the bridge's top, up with the bank (its foot in the bank's), thinning with its top layer
  if (st.heap) {
    const hh = st.hOf(st.heap.w);
    const y = st.heap.top + 0.5 * hh - 0.12 * hh + (top - st.cover);
    const thin = 1 - smooth(span(p, BANK_THIN, BANK_THIN + BANK_THIN_DUR));
    cloud(y, hh, st.heap.w, 0.5, p <= 0 || p >= 1 ? 0 : thin, t.bank[0], Z.bank + 2 * BANK.length, 0.4);
  } else {
    out.push({ ...HIDDEN }, { ...HIDDEN });
  }

  // the near clouds of the breath: tissue cumulus sweeping up in front
  const tall = info.layout === 'tall';
  NEAR.forEach((c, k) => {
    const u = span(p, c.win[0], c.win[1]);
    const fw = tall ? c.fw[0] : c.fw[1];
    const h = st.hOf(fw);
    // up from under the floor to a little under the cards, thinning away before it nears the header
    const y = 1.0 + 0.6 * h - (0.82 + 0.6 * h) * u;
    const a = open && u > 0 && u < 1 ? c.a * smooth(span(u, 0, 0.1)) * (1 - smooth(span(u, 0.68, 1))) : 0;
    cloud(y, h, fw, c.x + c.dx * u, a, t.near[k % t.near.length], Z.near + 2 * k, k % 2 ? 1.2 : -1);
  });

  // the low mists on the water: left by the bank, drifting, until the new land comes up in front of them
  MISTS.forEach((m, k) => {
    const a = open ? m.a * smooth(span(p, 0.26 + 0.04 * k, 0.4 + 0.04 * k)) * (1 - smooth(span(p, 0.8, 0.94))) : 0;
    out.push({ x: m.x + m.dx * p, y: seaNow + m.d - 0.02 * p, w: m.w, h: m.h, rot: m.rot, alpha: a, paint: t.mist[k % t.mist.length], z: Z.mist });
  });

  // the mists lingering in the new land's folds as it comes up, clearing
  const zOf = (id: PlaneId) => {
    const i = info.new.findIndex((pl) => pl.id === id);
    return i < 0 ? null : order.new[i];
  };
  // (each over a plane — just in front of it — at a line under its top edge, or for the near hill over the ground's)
  const folds: { over: PlaneId; d: number; x: number; h: number; a: number; byGround?: boolean }[] =
    n === 3
      ? [
          { over: 'hills', d: 0.04, x: 0.34, h: 0.06, a: 0.5 },
          { over: 'near', d: -0.03, x: 0.7, h: 0.07, a: 0.45, byGround: true },
          { over: 'near', d: -0.09, x: 0.28, h: 0.06, a: 0.4, byGround: true },
        ]
      : [
          { over: 'town', d: 0.05, x: 0.62, h: 0.07, a: 0.55 },
          { over: 'hills', d: 0.03, x: 0.32, h: 0.08, a: 0.5 },
          { over: 'hills', d: 0.1, x: 0.7, h: 0.09, a: 0.45 },
        ];
  const groundNew = groundOf(info.new);
  folds.forEach((f, k) => {
    const pl = info.new.find((q) => q.id === f.over);
    const z = zOf(f.over);
    const w0 = win.get(f.over);
    // over a kept plane (c3's hills) the mist comes up as the night falls; over a rising one, as it settles
    const [a0, a1] = w0 ?? [0.3, 0.5];
    const shown = smooth(span(p, a0 + 0.55 * (a1 - a0), a1 + 0.04)) * (1 - smooth(span(p, n === 3 ? 0.78 : 0.88, n === 3 ? 0.96 : 0.99)));
    const rise = pl && w0 ? riseIn(pl, w0, p, 1).y : 0;
    const line = f.byGround ? (groundNew?.top ?? 0.85) : (pl?.top ?? 0.7);
    out.push({
      x: f.x + 0.04 * Math.sin(Math.PI * p + k),
      y: line + f.d + rise,
      w: 0.72,
      h: f.h,
      rot: k % 2 ? 0.5 : -0.5,
      alpha: z == null || !pl ? 0 : 0.8 * f.a * shown,
      paint: t.mist[(k + 1) % t.mist.length],
      z: (z ?? 40) + 1,
    });
  });
  return out;
}

/* ───────────── the style ───────────── */

export const flats: ChangeStyle = {
  name: 'flats',
  strips: STRIPS,
  paper: paperOf,

  order(info: ChangeInfo): ChangeOrder {
    const n = info.n;
    if (SHARED[n].length) {
      // the far world stands: each kept plane's new copy just over its old one; the leaving flats, the bank, the arriving
      const z = (pl: ChangePlane, side: 0 | 1) => (roleOf(pl, n) === 'keep' ? 1 + 2 * pl.index + side : side ? 32 + 2 * pl.index : 12 + pl.index);
      return { old: info.old.map((pl) => z(pl, 0)), new: info.new.map((pl) => z(pl, 1)), fringe: { old: 20, new: 60 } };
    }
    // the old far range and peaks, the new ones (behind both seas); the new sea, the new headland, the old sea over
    // both (it lets go of the headland's shore once it stands); glints and mists; the old flats; the bank; the new flats
    const z = (pl: ChangePlane, side: 0 | 1) => {
      const r = roleOf(pl, n);
      if (r === 'far') return 1 + side * 3 + Math.min(2, pl.index);
      if (r === 'cloth') return side ? 7 : 9;
      if (side && pl.id === 'headland') return 8;
      return side ? 32 + 2 * pl.index : 12 + pl.index;
    };
    return { old: info.old.map((pl) => z(pl, 0)), new: info.new.map((pl) => z(pl, 1)), fringe: { old: 20, new: 60 } };
  },

  frame(p: number, info: ChangeInfo): ChangeFrame {
    const n = info.n;
    const st = stageOf(info);
    const win = inWindows(info);
    const seaOld = seaOf(info.old);
    const seaNew = seaOf(info.new);
    const horizon = Math.max(seaOld, seaNew);
    const groundTop = groundOf(info.old)?.top ?? 0.85;
    const outs = fliers(info);
    // the sky's horizon follows smooth(p) across a change (the director's hzAt): the back cloth keeps to it
    const k = smooth(p);
    const old: PlaneMove[] = info.old.map((pl) => {
      const role = roleOf(pl, n);
      if (role === 'keep') return { y: 0, alpha: 1 - smooth(span(p, 0.6, 0.72)), foot: 'paper' };
      if (role === 'cloth') return { y: (seaNew - seaOld) * k, alpha: 1 - smooth(span(p, OLD_SEA_OUT[0], OLD_SEA_OUT[1])), foot: 'paper' };
      if (role === 'far') return farOut(p, info.layout === 'tall');
      // the ground stays in the bank, let go once covered
      if (pl.id === 'ground') return { y: 0, alpha: 1 - smooth(span(p, LET_GO[0] + 0.01, LET_GO[1] + 0.01)), foot: 'paper' };
      // the bridge too (round 5, the owner: 「橋直接消失就好了…它不是那種自然的景觀，它升起來會怪怪的」): built, not
      // grown — it never lifts with the flats; it stays where it stands and is gone once the bank and its heap are over it
      if (pl.id === 'bridge') return { y: 0, alpha: 1 - smooth(span(p, LET_GO[0] + 0.01, LET_GO[1] + 0.01)), foot: 'paper' };
      const rank = outs.indexOf(pl);
      return flyOut(pl, outWindow(rank), p, groundTop, VANISH, rank % 2 === 0 ? 1 : -1, info);
    });
    const nw: PlaneMove[] = info.new.map((pl, i) => {
      const role = roleOf(pl, n);
      if (role === 'keep') return { y: 0, alpha: smooth(span(p, 0.35, 0.6)), foot: 'paper' };
      // the new sea lies under the old one, the same paper at the same line: there at once, unseen
      if (role === 'cloth') return { y: (seaOld - seaNew) * (1 - k), alpha: smooth(span(p, 0, 0.03)), foot: 'paper' };
      const w = win.get(pl.id) ?? [0.6, 1];
      if (role === 'far' || pl.id === 'headland') return riseFar(pl, w, p, horizon);
      return riseIn(pl, w, p, i % 2 === 0 ? -1 : 1);
    });

    const up = groundUp(win, p);
    const ground = groundOf(info.new);
    const gw = win.get('ground');
    const gy = ground && gw ? riseIn(ground, gw, p, 1).y : 0;
    const order = flats.order(info);
    return {
      old,
      new: nw,
      fringe: {
        // the old grass ducks under the floor as the bank comes over it; the new comes up with the ground
        old: { y: 0.08 * smooth(span(p, 0, 0.1)), alpha: 1 - smooth(span(p, 0.02, 0.1)) },
        new: { y: gy * 1.3, alpha: smooth(span(p, gw ? gw[0] + 0.7 * (gw[1] - gw[0]) : 0.82, gw ? gw[1] - 0.02 : 0.96)) },
      },
      // the card on the wind and the pair lift a breath mid-way; the pair at the top bows out early (c3)
      held: n === 3 ? { y: 0, alpha: 1 - smooth(span(p, 0.02, 0.22)) } : { y: -0.025 * Math.sin(Math.PI * clamp01(p)), alpha: 1 },
      lanterns: { y: 0, alpha: 1 },
      actors: {
        // the leaving puppets wade into the bank as it comes over them, and are let go inside it
        old: { y: st.duck * smooth(span(p, 0, BANK_COVER)), alpha: 1 - smooth(span(p, LET_GO[0], LET_GO[1])) },
        // the arriving ones come up on their ground, a breath behind its grass (never above the floor before it)
        new: { y: st.lag * (1 - up), alpha: 1 },
      },
      // the hero is the first thing out: flown up as a flat of depth 0.6, its words passing under the header's pen line
      hero: heroOut(p, info.layout === 'tall'),
      // the light turns while the stage stands open (c3: night falls on the standing town)
      hour: hourOf(n, p),
      strips: p <= 0 || p >= 1 ? [] : strips(p, info, st, win, order),
    };
  },
};

/** For the tests: the knobs the change keeps to. */
export const FLATS = { BANK, BANK_COVER, LET_GO, STRIPS, S_BANK, S_HEAP, S_NEAR, S_MIST, S_FOLD, GLINTS, Z, VANISH, OLD_SEA_OUT, stageOf, bankTop, fliers, rising, surfacing, inWindows, climbOf, bottomOf };
