/**
 * Writing on a slip (SPEC §5.2; round 3, the owner: 「他的筆首先沒有接在手上，然後他的這個相對的位置也不太對」): pure
 * helpers over the film's puppet for how a character holds a slip — the tiny card it is writing (kit/props) — by its
 * edge in one mitten, in front of its body at the chest and a little to that side, its face wholly clear; and a pencil
 * in the other mitten, closed over the pencil's body a third of the way from its cap, its point on the line being
 * written. Everything here is in the body's own rig units (before the body's pose): the slip and the pencil are drawn
 * inside a live puppet's body (its hand layer: under its arms, so the mittens close over them), and put on the stage
 * through `pagePoint` when a ghost stands in. `writePose` is memoized per character and hand (its search is a few
 * tens of thousands of rig evaluations, once — a fifth of a second in WebKit, made ahead at a still moment:
 * runtime/director.ts `warmPoses`).
 */
import { clamp, DEG, lerp } from '@/lib/mascots/geometry';
import { aimLift } from '@/lib/mascots/motion';
import { MITTEN_MIDDLE } from '@/lib/mascots/rig';
import type { Point, Rect } from '@/lib/mascots/types';
import { PENCIL_GRIP, PENCIL_POINT, SLIP_H, SLIP_LINES, SLIP_W, SLIP_WAVE } from './props';
import type { ArmSide, StickerPuppet } from './puppet';
import { WRITE_POSES } from './writePoses.generated';

export const other = (side: ArmSide): ArmSide => (side === 'L' ? 'R' : 'L');
/** An arm's angle on the body at a lift (0 = right, 90 = down), the body's own tilt left out. */
export const armAngle = (side: ArmSide, lift: number): number => (side === 'L' ? 90 + lift : 90 - lift);
/** Degrees from b round to a, the short way. */
const turn = (a: number, b: number): number => ((((a - b) % 360) + 540) % 360) - 180;

/** The middle of an arm's mitten at a lift, rig units on the body. */
export function mittenAt(ch: StickerPuppet, side: ArmSide, lift: number): Point {
  const a = ch.rig.arms[side];
  const ang = armAngle(side, lift) * DEG;
  const r = a.len * MITTEN_MIDDLE;
  return [a.pivot[0] + Math.cos(ang) * r, a.pivot[1] + Math.sin(ang) * r];
}

/** Where the pencil's point is on the slip (its drawing's units) once `ink` of its three lines is written. */
export function writingAt(ink: number): Point {
  const n = clamp(ink * 3, 0, 2.999);
  const i = Math.floor(n);
  const [x0, x1, y] = SLIP_LINES[i];
  const x = x0 + (x1 - x0) * (n - i);
  return [x, y - SLIP_WAVE.amp * Math.sin(((x - x0) / SLIP_WAVE.period) * Math.PI)];
}

/** The pencil from its grip to its point, drawing units. */
const GRIP_TO_POINT = PENCIL_POINT[1] - PENCIL_GRIP[1];
/** The pencil's whole length (cap to point), drawing units. */
const PENCIL_LONG = PENCIL_POINT[1] - 2;
/** A pencil leans this far from upright toward its own hand's side as it writes (degrees): the best, and the range. */
const SLANT = { best: 34, min: 6, max: 70 };

export interface WritePose {
  /** The holding arm's lift. */
  hold: number;
  /** Rig units per slip unit. */
  scale: number;
  /** The slip's turn on the body, degrees. */
  rot: number;
  /** The slip's point under the holding mitten (its edge), slip units. */
  anchor: Point;
  /** The slip's box, rig units. */
  box: Rect;
  /** Rig units per pencil unit, and the pencil from its grip to its point (rig units). */
  penScale: number;
  grip: number;
  /** Who holds it. */
  holder: Holder;
  /** A slip point (its units) → rig units on the body, held as posed. */
  on(d: Point): Point;
}

/** A box round the face's eyes and mouth (rig units), the part that must stay in view. */
export function faceBox(ch: StickerPuppet): Rect {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const name of ['eye-l', 'eye-r', 'mouth', 'mouth-open', 'mouth-o']) {
    const p = ch.rig.parts.get(name);
    if (!p || !p.w) continue;
    x0 = Math.min(x0, p.x);
    y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x + p.w);
    y1 = Math.max(y1, p.y + p.h);
  }
  if (!Number.isFinite(x0)) {
    const [fx, fy] = ch.rig.face;
    return { x: fx - 60, y: fy - 40, w: 120, h: 70 };
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
/** How far a point is from a box (0 inside). */
const fromBox = ([x, y]: Point, b: Rect) => Math.hypot(Math.max(0, b.x - x, x - b.x - b.w), Math.max(0, b.y - y, y - b.y - b.h));

/** The lift that puts an arm's mitten on a rig point's direction (the short way round from its rest). */
const liftToward = (ch: StickerPuppet, side: ArmSide, [x, y]: Point): number => {
  const a = ch.rig.arms[side];
  return a.rest + turn(aimLift(side, Math.atan2(y - a.pivot[1], x - a.pivot[0]) / DEG), a.rest);
};

export interface PenAt {
  /** The pen mitten's middle (rig units) and its arm's lift. */
  m: Point;
  lift: number;
  /** The pencil from the mitten to its point (rig units): about its grip, give or take a little slide. */
  d: number;
  /** How far the mitten falls short of holding the pencil there (0 when it does), and the pencil's slant (degrees). */
  miss: number;
  slant: number;
}

/** A pencil may slide this much either way in the mitten (its grip a third from the cap, give or take). */
const SLIDE = 0.16;

/**
 * Where the pen mitten is for the pencil's point at `tip` (rig units), holding it about `grip` from its point: on the
 * circle the mitten can reach, the pencil leaning toward the pen's own side as a hand writes — as near the best slant
 * as the arm allows (a paper arm has no elbow: along a line the slant swings, as a wrist would), the pencil sliding a
 * little in the mitten if it must. Out of reach, as near as the arm gets (and by how much it misses).
 */
export function penAt(ch: StickerPuppet, pen: ArmSide, tip: Point, grip: number): PenAt {
  const a = ch.rig.arms[pen];
  const P = a.pivot;
  const r = a.len * MITTEN_MIDDLE;
  const s = pen === 'R' ? 1 : -1;
  const tx = tip[0] - P[0];
  const ty = tip[1] - P[1];
  const c = tx * tx + ty * ty - r * r;
  const lo = grip * (1 - SLIDE);
  const hi = grip * (1 + SLIDE);
  // for a slant θ the mitten is at tip + d·w(θ), w = (s·sinθ, −cosθ): |tip + d·w − P| = r, a quadratic in d. Of every
  // slant (to a degree) the one that is nearest the best with the pencil nearest its grip: continuous as the point
  // moves along a line (the slant swings as it must, never jumps)
  type Slant = { cost: number; deg: number; d: number };
  let best: Slant | null = null;
  const at = (deg: number) => {
    const th = deg * DEG;
    const wx = s * Math.sin(th);
    const wy = -Math.cos(th);
    const b = wx * tx + wy * ty;
    const disc = b * b - c;
    if (disc < 0) return;
    const q = Math.sqrt(disc);
    for (let r = 0; r < 2; r++) {
      const d = r ? -b + q : -b - q;
      if (d <= 0) continue;
      const slide = (d - grip) / (SLIDE * grip);
      const off = Math.max(0, SLANT.min - deg, deg - SLANT.max);
      const cost = slide * slide + ((deg - SLANT.best) / 40) ** 2 + (Math.abs(slide) > 1 ? 40 * (Math.abs(slide) - 1) : 0) + 0.2 * off * off;
      if (!best || cost < best.cost) best = { cost, deg, d };
    }
  };
  // every 4°, then each degree round the best (a quarter of the evaluations: the search below runs this tens of
  // thousands of times, which took WebKit 0.3–0.5 s — a freeze as a writer starts; the review after round 3)
  for (let deg = SLANT.min - 20; deg <= SLANT.max + 20; deg += 4) at(deg);
  const coarse = best as Slant | null;
  if (coarse) for (let deg = coarse.deg - 3; deg <= coarse.deg + 3; deg++) if (deg !== coarse.deg) at(deg);
  const found = best as Slant | null;
  if (found) {
    const th = found.deg * DEG;
    const m: Point = [tip[0] + found.d * s * Math.sin(th), tip[1] - found.d * Math.cos(th)];
    return { m, lift: liftToward(ch, pen, m), d: Math.min(hi, Math.max(lo, found.d)), miss: Math.max(0, lo - found.d, found.d - hi), slant: found.deg };
  }
  // out of reach: the mitten as near the pencil's grip as it comes
  const D = Math.max(1e-6, Math.hypot(tx, ty));
  const m: Point = [P[0] + (tx / D) * r, P[1] + (ty / D) * r];
  const d = Math.hypot(tip[0] - m[0], tip[1] - m[1]);
  return { m, lift: liftToward(ch, pen, m), d: Math.min(hi, Math.max(lo, d)), miss: d < lo ? lo - d : Math.max(0, d - hi), slant: Math.atan2(s * (m[0] - tip[0]), tip[1] - m[1]) / DEG };
}

const memo = new Map<string, WritePose>();

/**
 * The arm that holds the slip, in the writer's rig units: the writer's own other arm, or a friend's standing beside it
 * (聆聆's arms are too short for its wide body: their mittens never meet in front of it, so 點點 holds its slip up for
 * it). Its mitten at a lift is pivot + reach·(cos, sin)(armAngle(side, lift)) — the same lift as the friend's own while
 * both stand upright.
 */
export interface Holder {
  side: ArmSide;
  pivot: Point;
  reach: number;
  rest: number;
  /** A friend's face (writer's rig units): kept clear of the slip too. */
  face?: Rect;
  /** A friend's body (writer's rig units): the writing mitten keeps off it (the friend stands in front of the writer). */
  body?: Rect;
  /** What tells one friend's stand from another (the memo's key). */
  key: string;
}
const ownHolder = (ch: StickerPuppet, hold: ArmSide): Holder => {
  const a = ch.rig.arms[hold];
  return { side: hold, pivot: a.pivot, reach: a.len * MITTEN_MIDDLE, rest: a.rest, key: 'own' };
};
/** A holder's mitten at a lift, writer's rig units. */
export const holderAt = (h: Holder, lift: number): Point => {
  const ang = armAngle(h.side, lift) * DEG;
  return [h.pivot[0] + Math.cos(ang) * h.reach, h.pivot[1] + Math.sin(ang) * h.reach];
};
/** How far a mitten (a disc of radius r at m) reaches into a box: 0 outside it, up to r + its depth inside. */
const into = (m: Point, r: number, b: Rect) => {
  const out = fromBox(m, b);
  if (out > 0) return Math.max(0, r - out);
  return r + Math.min(m[0] - b.x, b.x + b.w - m[0], m[1] - b.y, b.y + b.h - m[1]);
};
/** How deep two boxes overlap (0 apart). */
const overlap = (a: Rect, b: Rect) => Math.max(0, Math.min(a.x + a.w - b.x, b.x + b.w - a.x, a.y + a.h - b.y, b.y + b.h - a.y));

export interface WriteOpts {
  /** Who holds the slip, when not the writer's other arm. */
  holder?: Holder;
  /** No pencil: the slip only held up to show (牽牽's blank). */
  penless?: boolean;
  /** Scales the slip it aims for. */
  grow?: number;
}

/** A slip point (its units) → rig units, for a slip whose `anchor` is under a mitten at `mh`, `scale` rig units per unit, turned `rot`. */
const place = (mh: Point, scale: number, rot: number, anchor: Point) => {
  const c = Math.cos(rot * DEG);
  const sn = Math.sin(rot * DEG);
  return (d: Point): Point => {
    const x = (d[0] - anchor[0]) * scale;
    const y = (d[1] - anchor[1]) * scale;
    return [mh[0] + x * c - y * sn, mh[1] + x * sn + y * c];
  };
};
const boxOf = (on: (d: Point) => Point): Rect => {
  const pts = ([[0, 0], [SLIP_W, 0], [0, SLIP_H], [SLIP_W, SLIP_H]] as const).map((q) => on(q));
  const xs = pts.map((q) => q[0]);
  const ys = pts.map((q) => q[1]);
  return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
};

/** What the search finds: the holding arm's lift (as searched), the slip's size, turn and anchor, the pencil's size. */
export interface FoundPose {
  hold: number;
  scale: number;
  rot: number;
  anchor: Point;
  pen: number;
}
/** A pose's key: who, which hands, the slip's growth, penless or not, who holds it. */
export const poseKey = (slug: string, hold: ArmSide, pen: ArmSide, grow: number, penless: boolean, holder = 'own') => `${slug}|${hold}|${pen}|${grow}|${penless ? 1 : 0}|${holder}`;

/**
 * The search itself (a few tens of thousands of rig evaluations: 40–130 ms in WebKit). The film never runs it: its
 * own poses are found ahead and kept in `writePoses.generated.ts` (the test beside it makes them again and compares),
 * so no frame — the first of the opening, the one 聆聆 starts writing in — ever waits on it.
 */
export function searchWritePose(ch: StickerPuppet, hold: ArmSide, pen: ArmSide, opts: WriteOpts = {}): FoundPose {
  const H = opts.holder ?? ownHolder(ch, hold);
  const grow = opts.grow ?? 1;
  const own = !opts.holder;
  const R = ch.rig;
  const T = R.torso;
  // the slip's edge toward its holder is the one in the mitten
  const right = H.pivot[0] > R.gx;
  const hs = right ? 1 : -1;
  const face = faceBox(ch);
  const clearY = face.y + face.h + 6;
  const foot = T.y + T.h;
  const lowest = foot + 0.3 * (R.gy - foot);
  const scaleMax = Math.min((lowest - clearY) / SLIP_H, (0.42 * T.w) / SLIP_W) * grow;
  const wantX = R.gx + hs * 0.12 * T.w;
  const mr = 0.16 * Math.max(R.arms.L.len, R.arms.R.len);
  const tests: Point[] = opts.penless ? [] : [writingAt(0.02), writingAt(0.3), writingAt(0.5), writingAt(0.7), writingAt(0.98)];
  let best: (FoundPose & { cost: number }) | null = null;
  // what doesn't depend on the pencil's length (the slip's place and its cost before the pen's tests, the tested points)
  // is made once per size and reused for each length: the same candidates, in the same order, the same sums
  const ROTS = [-9, -5, -1, 3, 7];
  const AYS = [22, 28, 34];
  for (const sf of [1, 0.9, 0.8]) {
    const scale = scaleMax * sf;
    const cands: { cost: number; box: Rect; mh: Point; pts: Point[]; hl: number; rot: number; anchor: Point }[] = [];
    for (const rot of ROTS) {
      for (const ay of AYS) {
        const anchor: Point = [right ? SLIP_W - 1.2 : 1.2, ay];
        for (let hl = -90; hl < 270; hl += 3) {
          const mh = holderAt(H, hl);
          const on = place(mh, scale, rot, anchor);
          const box = boxOf(on);
          const mid = on([SLIP_W / 2, SLIP_H / 2]);
          const cost =
            10 * Math.max(0, clearY - box.y) +
            3 * Math.max(0, box.y + box.h - lowest) +
            1.5 * Math.max(0, box.y - (clearY + 0.05 * T.h)) +
            (own ? 0.5 * Math.abs(mid[0] - wantX) + 2 * Math.max(0, T.x - 0.08 * T.w - box.x) + 2 * Math.max(0, box.x + box.w - (T.x + 1.08 * T.w)) : 0) +
            (H.face ? 10 * overlap(box, H.face) : 0) +
            0.02 * Math.abs(turn(hl, H.rest)) +
            14 * (1 - sf) +
            0.2 * Math.abs(rot) +
            6 * Math.max(0, mr - fromBox(mh, face));
          cands.push({ cost, box, mh, pts: tests.map((d) => on(d)), hl, rot, anchor });
        }
      }
    }
    for (const pf of opts.penless ? [1] : [1, 1.15, 1.3, 1.45]) {
      const penScale = (pf * scale * SLIP_W) / PENCIL_LONG;
      const grip = GRIP_TO_POINT * penScale;
      for (const k of cands) {
        let cost = k.cost;
        if (best && cost >= best.cost) continue;
        const { box, mh } = k;
        for (const pt of k.pts) {
          const p = penAt(ch, pen, pt, grip);
          cost +=
            3 * p.miss +
            // the writing hand beside the slip, not over it: the lines in view as they are written
            0.5 * into(p.m, mr, box) +
            1.2 * Math.max(0, SLANT.min - p.slant, p.slant - SLANT.max) +
            6 * Math.max(0, mr - fromBox(p.m, face)) +
            (H.body ? 4 * into(p.m, mr, H.body) : 0) +
            2 * Math.max(0, 1.6 * mr - Math.hypot(p.m[0] - mh[0], p.m[1] - mh[1]));
          if (best && cost >= best.cost) break;
        }
        if (!best || cost < best.cost) best = { cost, hold: k.hl, scale, rot: k.rot, anchor: k.anchor, pen: penScale };
      }
    }
  }
  const { hold: h, scale, rot, anchor, pen: pn } = best!;
  return { hold: h, scale, rot, anchor, pen: pn };
}

/**
 * How a character holds a slip to write on it: the holding arm's lift, the slip's size, its turn and where along its
 * edge the mitten takes it, and the pencil's length — so that the slip is in front of the body below the face (eyes and
 * mouth wholly clear), at the chest rather than the belly, a little to the holding side, never past the feet; and the
 * pen mitten, holding the pencil a third from its cap, reaches every line with the pencil leaning as a hand writes,
 * never over the face or the other mitten. Found by search — ahead of time for the film's own poses (WRITE_POSES).
 */
export function writePose(ch: StickerPuppet, hold: ArmSide, pen: ArmSide, opts: WriteOpts = {}): WritePose {
  const H = opts.holder ?? ownHolder(ch, hold);
  const key = poseKey(ch.slug, hold, pen, opts.grow ?? 1, !!opts.penless, H.key);
  const hit = memo.get(key);
  if (hit) return hit;
  const b = WRITE_POSES[key] ?? searchWritePose(ch, hold, pen, opts);
  const on = place(holderAt(H, b.hold), b.scale, b.rot, b.anchor);
  const out: WritePose = {
    hold: H.rest + turn(b.hold, H.rest),
    scale: b.scale,
    rot: b.rot,
    anchor: b.anchor,
    box: boxOf(on),
    penScale: b.pen,
    grip: GRIP_TO_POINT * b.pen,
    holder: H,
    on,
  };
  memo.set(key, out);
  return out;
}

/**
 * Sets both arms for writing `ink` of the slip (h: the slip held up 0–1, w: the pencil writing 0–1, give: the holding
 * arm swung toward `toward` 0–1). Call after the body's pose is set (tilt, sy…); read the props with `slipInHand` and `pencilHeld`.
 */
export function writeArms(ch: StickerPuppet, wp: WritePose, hold: ArmSide, pen: ArmSide, ink: number, h: number, w: number, give: number, toward: [number, number] | null): void {
  const ap = ch.rig.arms[hold];
  const aw = ch.rig.arms[pen];
  const giveLift = toward ? ch.aim(hold, toward[0], toward[1]) : wp.hold;
  if (wp.holder.key === 'own') ch.setLift(hold, lerp(ap.rest, lerp(wp.hold, giveLift, give), h));
  if (w > 0) {
    ch.setLift(pen, lerp(aw.rest, penAt(ch, pen, wp.on(writingAt(ink)), wp.grip).lift, w));
    // the writing arm in front of the body and of what it writes on, near its rest or not: the pencil is in its mitten
    if (pen === 'L') ch.pose.keepL = true;
    else ch.pose.keepR = true;
  }
}

/** A held thing on the body: its anchor's rig point, its turn (degrees, on the body) and its rig units per unit. */
export interface Held {
  at: Point;
  rot: number;
  scale: number;
  /** The drawing's point under the mitten (the pencil's grip, as it has slid), drawing units. */
  anchor?: Point;
}

/** How far inside its edge a mitten takes a slip (slip units). */
const GRIP_INSET = 1.2;
/**
 * The point of a slip's edge under a mitten when the slip lies `dir` from it (degrees in the slip's own frame: 0 = the
 * slip to the mitten's right, 90 = under it): the edge point opposite `dir` from the slip's middle.
 */
export function gripAnchor(dir: number): Point {
  const c = Math.cos(dir * DEG);
  const sn = Math.sin(dir * DEG);
  const t = Math.min((SLIP_W / 2 - GRIP_INSET) / Math.max(1e-6, Math.abs(c)), (SLIP_H / 2 - GRIP_INSET) / Math.max(1e-6, Math.abs(sn)));
  return [SLIP_W / 2 - t * c, SLIP_H / 2 - t * sn];
}
/** Where a slip held as `wp` found lies from its holding mitten (degrees on the body), and from that arm's own line. */
const holdDir = (wp: WritePose) => Math.atan2(SLIP_H / 2 - wp.anchor[1], SLIP_W / 2 - wp.anchor[0]) / DEG + wp.rot;
export const holdOffset = (wp: WritePose, hold: ArmSide) => turn(holdDir(wp), armAngle(hold, wp.hold));

/**
 * A slip in a mitten at `at` (rig units on the holder's body) whose arm points `arm` (degrees on the body), come `out`
 * of its hold (0 as `wp` found it, in front of the chest … 1 straight beyond the mitten, on the arm's own line): as an
 * arm goes out to give, to take or to toss, the paper ends beyond the mitten (round 5, the owner: 「那個卡片看起來是
 * 從…這隻臂下穿過去，而且截斷了他的肩膀」) — never left lying back over the sleeve and the shoulder. Two ways there:
 * - `swing` (a toss): the paper comes round the mitten with the arm, on the outside — it leads the mitten up;
 * - `slide` (a card brought in to the chest, or held out from it): the paper keeps upright and goes straight between
 *   the two places, the mitten's grip sliding across it — it never dips round under the arm. A point instead (slip
 *   units) is where the mitten has it at `out` 1, when that is not straight beyond it (a slip taken from a friend's
 *   mitten by whatever edge is in reach).
 * `size` scales it (a slip passed from hand to hand is small; it opens as it is brought in to be written on).
 */
export type GripWay = 'swing' | 'slide' | Point;
export function slipGripped(wp: WritePose, hold: ArmSide, at: Point, arm: number, out: number, size = 1, way: GripWay = 'swing'): Held {
  const rot = wp.rot;
  if (way !== 'swing') {
    const beyond = way === 'slide' ? gripAnchor(arm - rot) : way;
    return { at, rot, scale: wp.scale * size, anchor: [lerp(wp.anchor[0], beyond[0], out), lerp(wp.anchor[1], beyond[1], out)] };
  }
  const dir = arm + holdOffset(wp, hold) * (1 - out);
  return { at, rot, scale: wp.scale * size, anchor: gripAnchor(dir - rot) };
}
/** The slip in the writer's own holding mitten as that arm is now (see `slipGripped`). */
export function slipInHand(ch: StickerPuppet, wp: WritePose, hold: ArmSide, out = 0, size = 1, way: GripWay = 'swing'): Held {
  const lift = ch.lift(hold);
  return slipGripped(wp, hold, mittenAt(ch, hold, lift), armAngle(hold, lift), out, size, way);
}

/** The pencil in the pen mitten as the arm is now, its grip where it has slid to, pointing at the line being written. */
export function pencilHeld(ch: StickerPuppet, wp: WritePose, pen: ArmSide, ink: number): Held {
  const g = mittenAt(ch, pen, ch.lift(pen));
  const tip = wp.on(writingAt(ink));
  const d = clamp(Math.hypot(tip[0] - g[0], tip[1] - g[1]), wp.grip * (1 - SLIDE), wp.grip * (1 + SLIDE));
  return { at: g, rot: Math.atan2(tip[1] - g[1], tip[0] - g[0]) / DEG - 90, scale: wp.penScale, anchor: [PENCIL_POINT[0], PENCIL_POINT[1] - d / wp.penScale] };
}

/** A stage point → the rig point of a puppet's body under it (its pose now; the lean left out). */
export function rigOf(ch: StickerPuppet, x: number, y: number): Point {
  const R = ch.rig;
  const q = ch.pose;
  const rx = (x - ch.x) / ch.k - (R.tp[0] - R.gx);
  const ry = (y - ch.y) / ch.k - (R.tp[1] - R.gy - q.bodyUp - q.rise);
  const c = Math.cos(q.tilt * DEG);
  const sn = Math.sin(q.tilt * DEG);
  return [R.tp[0] + (rx * c + ry * sn) / q.sx, R.tp[1] + (-rx * sn + ry * c) / q.sy];
}

/** A held thing on the stage (px, degrees, px per unit), through the body's pose now. */
export function heldOnStage(ch: StickerPuppet, h: Held): { x: number; y: number; rot: number; k: number } {
  const [x, y] = ch.pagePoint(h.at[0], h.at[1]);
  return { x, y, rot: h.rot + ch.pose.tilt, k: ch.k * h.scale };
}

/** A held thing in the body's own px (its hand layer). */
export function heldInBody(ch: StickerPuppet, h: Held): { x: number; y: number; rot: number; k: number } {
  return { x: (h.at[0] - ch.rig.gx) * ch.k, y: (h.at[1] - ch.rig.gy) * ch.k, rot: h.rot, k: ch.k * h.scale };
}
