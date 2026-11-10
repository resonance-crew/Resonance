/**
 * mist — "through the clouds" (`?change=mist`).
 *
 * One upward roll through a sea of tissue clouds. A bank of cloud layers in the hour's colours (each a long tissue
 * band with a row of torn puffs along its top, lit on top, the bank's underside deeper) rises from below the stage
 * faster than the land: it swallows the old scene from its foot up while the old flats lift a little, the near ones
 * more — and since the bank always rises faster than the ground, the ground's paper body is never seen. Whatever of
 * the old land still stands above the bank's surface (the far range, the lone tree) dissolves into the sky as the bank
 * comes up to it, behind thin high veils. Big near clouds sweep up in front, faster still.
 * Mid-change it is the sky over a sea of cloud layers rolling up and thinning away at the surface while the hour
 * turns. Then the bank's flat underside lifts off the stage's foot and the new scene is underneath it, rising into
 * place (the near flats last), its far peaks already come up through the surface; low mists between its flats linger
 * and clear. Nothing of the old scene is left when anything of the new one shows. Pure in (p, info): transforms and
 * opacity only; the clouds' paper is drawn once (`paper`), in square units, and each strip is sized to keep them so.
 */
import { rng } from '../geom';
import { clamp01, easeOut, smooth, span } from '../timeline';
import { cloudPaper, streakPaper } from './paper';
import type { ChangeFrame, ChangeInfo, ChangeN, ChangeOrder, ChangePlane, ChangeStyle, PlaneMove, StripMove, StripPaint } from './types';

export { cloudPaper, streakPaper };

/* ───────────── the clouds' paper (a 1000 × 100 box in square units: a strip is ASPECT times wider than tall) ───────────── */

const ASPECT = 10;
/** No strip narrower than this (stage widths): on a very wide screen its puffs widen a little rather than end on screen. */
const MIN_W = 1.5;

/* ───────────── the clouds ───────────── */

/** How far the clouds roll up across the change at speed 1 (stage heights); linear in p: a steady flow. */
const RISE = 2.0;
/** A cloud layer's paper surely covers its box from this far above its centre to this far below (fractions of h). */
const SURE_UP = 0.05;
const SURE_DOWN = 0.31;

interface Cloud {
  /** Its centre at p 0 (stage heights) and its speed (× RISE per p). */
  y0: number;
  v: number;
  /** Its centre across (stage widths) and its drift across the change. */
  x: number;
  dx: number;
  h: number;
  rot: number;
  /** Which tone of its class it wears, and how opaque it is at most. */
  tone: number;
  a: number;
}

/**
 * The bank (it alone covers: its layers overlap, top to bottom): the far ones a hair slower, the near ones a hair
 * faster, so it closes up and never parts. Its top layers thinner (far), its underside's deeper (near).
 */
const BANK: Cloud[] = (() => {
  const r = rng(7301);
  const out: Cloud[] = [];
  let y = 1.2;
  const n = 8;
  for (let j = 0; j < n; j++) {
    const k = j / (n - 1);
    const h = 0.27 + 0.13 * k + r() * 0.03;
    const side = j % 2 ? 1 : -1;
    out.push({ y0: y, v: 0.9 + 0.1 * k, x: 0.5 + side * (0.03 + r() * 0.06), dx: side * (0.03 + r() * 0.03), h, rot: side * (0.2 + r() * 0.5), tone: j, a: 1 });
    y += 0.074 + 0.036 * k + r() * 0.012;
  }
  return out;
})();
/** The near clouds: big, faster, in front, passing up through the bank (never below its underside while it shows). */
const NEAR: Cloud[] = [
  { y0: 1.44, v: 1.3, x: 0.42, dx: -0.06, h: 0.42, rot: -0.8, tone: 0, a: 0.92 },
  { y0: 1.7, v: 1.26, x: 0.6, dx: 0.05, h: 0.38, rot: 0.9, tone: 1, a: 0.88 },
  { y0: 1.93, v: 1.32, x: 0.46, dx: 0.05, h: 0.44, rot: 0.6, tone: 0, a: 0.92 },
];
/**
 * The high mists: broad, thin tissue veils, behind the bank. Three come up over the old land's top as the bank arrives
 * (whatever of it the bank can't reach, the far range, a tall tree, dissolves behind them, never in the open), three
 * lie over the new land's top as it comes up through the bank's surface and clear last. Each is placed by its set's
 * highest drawn top (`d` under it), so a tall screen's taller land is veiled as a wide one's is.
 */
interface Veil {
  d: number;
  h: number;
  x: number;
  dx: number;
  rot: number;
  tone: number;
  a: number;
}
const VEIL: Veil[] = [
  { d: 0.03, h: 0.22, x: 0.34, dx: 0.06, rot: -0.5, tone: 0, a: 0.65 },
  { d: 0.1, h: 0.2, x: 0.7, dx: -0.05, rot: 0.6, tone: 1, a: 0.6 },
  { d: 0.17, h: 0.24, x: 0.52, dx: 0.04, rot: 0.3, tone: 0, a: 0.6 },
];
/** The veils among the strips: the old land's three, then the new land's. */
const FAR = 2 * VEIL.length;
/** The low mists: two in the old land's folds, two in the new land's. */
const LOW = 4;

/** Strip i's paper, in the order `strips()` answers them: the veils, the bank and the near clouds (each layer its body, then its crest), the low mists. */
function paperOf(i: number): string {
  if (i < FAR) return streakPaper(8100 + i * 7, 42);
  i -= FAR;
  if (i < 2 * BANK.length) return cloudPaper(8200 + (i >> 1) * 13, 38, 84, 6, 15, i % 2 === 1);
  i -= 2 * BANK.length;
  if (i < 2 * NEAR.length) return cloudPaper(8300 + (i >> 1) * 17, 36, 86, 11, 28, i % 2 === 1);
  i -= 2 * NEAR.length;
  return streakPaper(8400 + i * 7, 46);
}

/** Where the clouds thin away: fully there with their centre below `SURFACE`, gone `THIN` above it. */
const SURFACE = 0.53;
const THIN = 0.13;

/** When the hour turns (p): the dawn's rose holds through the clouds; the golden hour turns rose as the bank comes up; night falls through them. */
const HOUR: Record<ChangeN, [number, number]> = { 1: [0.35, 0.85], 2: [0.12, 0.6], 3: [0.15, 0.8] };

/**
 * The hour's tissue, by change: each bank layer's crest and body (its lit top to its underside), the near clouds' the
 * same, the far streaks, the low mists.
 */
type Pair = [StripPaint, StripPaint];
const TONES: Record<ChangeN, { bank: Pair[]; near: Pair[]; far: StripPaint[]; low: StripPaint[] }> = {
  1: {
    bank: [['halo', 'streak'], ['cloud-front', 'mist'], ['streak', 'cloud-back'], ['sky-3', 'mist'], ['mist', 'cloud-back'], ['cloud-front', 'mist'], ['cloud-back', 'sky-1'], ['streak', 'cloud-back']],
    near: [['cloud-front', 'streak'], ['halo', 'mist']],
    far: ['halo', 'cloud-front'],
    low: ['sky-3', 'cloud-front'],
  },
  2: {
    bank: [['cloud-front', 'sky-3'], ['halo', 'mist'], ['streak', 'cloud-back'], ['cloud-front', 'mist'], ['mist', 'cloud-back'], ['sky-3', 'mist'], ['cloud-back', 'sky-1'], ['streak', 'cloud-back']],
    near: [['cloud-front', 'halo'], ['halo', 'mist']],
    far: ['halo', 'streak'],
    low: ['halo', 'sky-3'],
  },
  3: {
    bank: [['cloud-front', 'halo'], ['streak', 'mist'], ['halo', 'cloud-back'], ['cloud-front', 'sky-3'], ['sky-3', 'cloud-back'], ['streak', 'mist'], ['mist', 'sky-1'], ['halo', 'cloud-back']],
    near: [['streak', 'halo'], ['cloud-front', 'streak']],
    far: ['streak', 'halo'],
    low: ['halo', 'streak'],
  },
};

const at = (c: Cloud, p: number) => c.y0 - c.v * RISE * p;
/** A cloud layer's size by where it is on the stage: smaller up toward the surface, bigger down at the stage's foot. */
const depthScale = (y: number) => Math.min(1.3, Math.max(0.82, 0.62 + 0.62 * y));
const thin = (y: number) => smooth(span(y, SURFACE - THIN, SURFACE));

/* ───────────── the land ───────────── */

/** How far an old flat lifts before the bank has it (stage heights): the near ones more. */
const oldLift = (pl: ChangePlane) => 0.04 + 0.2 * pl.depth;
/** How far below its place a new flat waits (stage heights): the near ones deeper. */
const newDrop = (pl: ChangePlane) => 0.34 + 0.3 * pl.depth;

function oldMove(pl: ChangePlane, p: number): PlaneMove {
  // it starts to lift once the bank is coming up under the stage's foot
  const u = span(p, 0.06, 0.5);
  // gone (into the bank, or into the haze above its surface) before anything of the new scene shows: the far flats
  // first, so a near one never shows the land behind it through itself
  const fade = 0.16 + 0.14 * pl.depth;
  return { y: -oldLift(pl) * u * u, alpha: 1 - smooth(span(p, fade, fade + 0.1)), foot: 'paper' };
}

function newMove(pl: ChangePlane, p: number): PlaneMove {
  // the far flats settle first, the ground last
  const end = 0.88 + 0.12 * pl.depth;
  // there behind the bank before it parts (a ramp while it is wholly covered)
  return { y: newDrop(pl) * (1 - easeOut(span(p, 0.42, end))), alpha: smooth(span(p, 0.4, 0.43)), foot: 'paper' };
}

/* ───────────── the frame ───────────── */

const Z_OLD = 10;
const Z_NEW = 40;
const Z_FAR = 64;
const Z_BANK = 70;
const Z_NEAR = 90;

function strips(p: number, info: ChangeInfo): StripMove[] {
  const t = TONES[info.n];
  const out: StripMove[] = [];
  const wOf = (h: number) => Math.max(MIN_W, (ASPECT * h * info.h) / info.w);
  const put = (c: Cloud, y: number, alpha: number, paint: StripPaint, z: number, near = 0) => {
    // nearer (lower on the stage) a layer is bigger, its puffs and all: the same paper in perspective
    const h = c.h * (near ? depthScale(y) : 1);
    out.push({ x: c.x + c.dx * p, y, w: wOf(h), h, rot: c.rot, alpha: y - 0.5 * h > 1.01 ? 0 : clamp01(alpha), paint, z });
  };
  // the high mists: the old land's while the bank comes up over it, the new land's while it comes up through the surface
  const topOf = (set: ChangePlane[]) => Math.max(0.22, Math.min(...set.map((pl) => pl.top)));
  const veil = (v: Veil, top: number, y: number, a: number, z: number) =>
    out.push({ x: v.x + v.dx * p, y: top + v.d + y, w: wOf(v.h), h: v.h, rot: v.rot, alpha: clamp01(v.a * a), paint: t.far[v.tone % t.far.length], z });
  const oldA = smooth(span(p, 0.05, 0.18)) * (1 - smooth(span(p, 0.38, 0.52)));
  const newA = smooth(span(p, 0.42, 0.55)) * (1 - smooth(span(p, 0.84, 0.97)));
  VEIL.forEach((v, i) => veil(v, topOf(info.old), 0.02 - 0.14 * smooth(span(p, 0, 0.5)), oldA, Z_FAR + i));
  VEIL.forEach((v, i) => veil(v, topOf(info.new), 0.12 - 0.12 * smooth(span(p, 0.4, 1)), newA, Z_FAR + i));
  // each layer its body, then its crest over it
  const layer = (c: Cloud, [crest, body]: Pair, z: number, tissue = 1) => {
    const y = at(c, p);
    const a = c.a * thin(y);
    put(c, y, a * tissue * tissue, body, z, 1);
    put(c, y, a * tissue, crest, z + 1, 1);
  };
  BANK.forEach((c, j) => layer(c, t.bank[c.tone % t.bank.length], Z_BANK + 2 * j));
  // the near clouds are thin tissue: the bank's layers show through them
  NEAR.forEach((c, k) => layer(c, t.near[c.tone % t.near.length], Z_NEAR + 2 * k, 0.8));
  // the low mists: the old ones welling up in the old land's folds, the new ones lingering in the new land's
  const low = (set: ChangePlane[], zBase: number, rise: (pl: ChangePlane) => number, a: number, k: number) => {
    const hills = set.find((pl) => pl.id === 'hills');
    const town = set.find((pl) => pl.id === 'town');
    const head = set.find((pl) => pl.id === 'headland');
    const h1 = 0.13;
    const h2 = 0.1;
    out.push({
      x: 0.5 + (k ? 0.12 : -0.1),
      y: hills && town ? (town.top + hills.top) / 2 + 0.03 + rise(hills) : 0.7,
      w: wOf(h1),
      h: h1,
      rot: k ? -0.6 : 0.6,
      alpha: hills && town ? a : 0,
      paint: t.low[0],
      z: zBase + 2 * (hills?.index ?? 0) - 1,
    });
    out.push({
      x: 0.5 + (k ? -0.15 : 0.14),
      y: head && town ? (head.top + town.top) / 2 + 0.07 + rise(town) : 0.65,
      w: wOf(h2),
      h: h2,
      rot: k ? 0.4 : -0.4,
      alpha: head && town ? a * 0.7 : 0,
      paint: t.low[1],
      z: zBase + 2 * (town?.index ?? 0) - 1,
    });
  };
  low(info.old, Z_OLD, (pl) => oldMove(pl, p).y, 0.8 * smooth(span(p, 0.02, 0.14)) * (1 - smooth(span(p, 0.25, 0.4))), 0);
  low(info.new, Z_NEW, (pl) => newMove(pl, p).y, 0.85 * smooth(span(p, 0.4, 0.5)) * (1 - smooth(span(p, 0.8, 0.98))), 1);
  return out;
}

export const mist: ChangeStyle = {
  name: 'mist',
  strips: FAR + 2 * (BANK.length + NEAR.length) + LOW,
  paper: paperOf,

  order(info: ChangeInfo): ChangeOrder {
    return {
      old: info.old.map((pl) => (pl.backdrop ? 1 : Z_OLD + 2 * pl.index)),
      new: info.new.map((pl) => (pl.backdrop ? 2 : Z_NEW + 2 * pl.index)),
      fringe: { old: 98, new: 99 },
    };
  },

  frame(p: number, info: ChangeInfo): ChangeFrame {
    const held = info.n === 3 ? { y: 0, alpha: 1 - smooth(span(p, 0, 0.2)) } : { y: -0.035 * Math.sin(Math.PI * clamp01(p)), alpha: 1 };
    return {
      old: info.old.map((pl) => oldMove(pl, p)),
      new: info.new.map((pl) => newMove(pl, p)),
      fringe: {
        old: { y: 0.12 * smooth(span(p, 0, 0.2)), alpha: 1 - smooth(span(p, 0, 0.18)) },
        new: { y: 0.06 * (1 - smooth(span(p, 0.82, 1))), alpha: smooth(span(p, 0.82, 1)) },
      },
      held,
      lanterns: { y: 0, alpha: 1 },
      // the leaving puppets are swallowed by the bank (it covers them first), then let go
      actors: { old: { y: 0, alpha: 1 - smooth(span(p, 0.2, 0.28)) }, new: { y: 0, alpha: 1 } },
      hero: { y: -0.05 * smooth(span(p, 0, 0.3)), alpha: 1 - smooth(span(p, 0.02, 0.18)) },
      hour: smooth(span(p, ...HOUR[info.n])),
      strips: p <= 0 || p >= 1 ? [] : strips(p, info),
    };
  },
};

/** For the tests: the clouds and how much of its box a cloud layer's paper surely covers. */
export const MIST_CLOUDS = { BANK, NEAR, FAR, SURE_UP, SURE_DOWN };
