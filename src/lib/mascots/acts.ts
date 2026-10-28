/**
 * Activities: what a character does at its place. Each is a task; `pl` is the visit's plan (its ledge, target…).
 */
import type { Stage } from './engine';
import { bell, clamp, DEG, easeOut, lerp, smooth } from './geometry';
import { aimLift, during, mouthOpen } from './motion';
import { PAPER_LINES, PENCIL_LEN, PENCIL_TIP } from './props';
import type { Puppet } from './puppet';
import { MITTEN_MIDDLE } from './rig';
import type { ActName, ArmSide, Plan, Point, Rect, Task } from './types';

type Act = (S: Stage, ch: Puppet, pl: Plan) => Task;

const other = (side: ArmSide): ArmSide => (side === 'L' ? 'R' : 'L');
/** Px a pointing mitten keeps off what its place keeps clear (the store badges ask for clear space around them). */
const POINT_MARGIN = 5;
/** The arm on the side away from what a stand spot keeps clear beside it (null: nothing beside it). */
function awayFrom(ch: Puppet, pl: Plan): ArmSide | null {
  if (pl.ledge.kind !== 'spot') return null;
  const near = (pl.ledge.clear || []).filter(r => Math.abs(r.x + r.w / 2 - ch.x) < r.w / 2 + ch.halfW * 1.6);
  if (!near.length) return null;
  const mid = near.reduce((s, r) => s + r.x + r.w / 2, 0) / near.length;
  return mid < ch.x ? 'R' : 'L';
}

/** An arm's angle on the body at a lift (0 = right, 90 = down), the body's own tilt left out. */
const armAngle = (side: ArmSide, lift: number): number => (side === 'L' ? 90 + lift : 90 - lift);
/** Degrees from b round to a, the short way. */
const turn = (a: number, b: number): number => ((((a - b) % 360) + 540) % 360) - 180;
/** The middle of an arm's mitten at a lift, rig units on the body (Puppet.mitten(side, MITTEN_MIDDLE) on the page). */
function mittenAt(ch: Puppet, side: ArmSide, lift: number): Point {
  const a = ch.arm(side);
  const ang = armAngle(side, lift) * DEG;
  const r = a.len * MITTEN_MIDDLE;
  return [a.pivot[0] + Math.cos(ang) * r, a.pivot[1] + Math.sin(ang) * r];
}

/** Where the pencil's point is on the slip (its drawing's units) once `ink` of its three lines is written. */
function writingAt(ink: number): Point {
  const n = clamp(ink * 3, 0, 2.999);
  const i = Math.floor(n);
  const [x0, x1, y] = PAPER_LINES[i];
  const x = x0 + (x1 - x0) * (n - i);
  return [x, y - 1.5 * Math.sin(((x - x0) / 7) * Math.PI)];
}

/** How a character holds a slip to write on: rig units on its body. */
interface WritePose {
  /** The lift of the arm holding the slip (the pencil arm's follows the pencil: penLiftFor). */
  hold: number;
  /** The slip: rig units per unit of its drawing, its turn on the body, the point of it the mitten holds, its box. */
  paperScale: number;
  paperRot: number;
  anchor: Point;
  box: Rect;
  /** The pencil: rig units per unit of its drawing, and its length. */
  penScale: number;
  penLen: number;
  /** A point of the slip's drawing → rig units on the body. */
  on(d: Point): Point;
}

/** How far off upright a pencil is held, its top out toward its hand's side (degrees). */
const SLANT = 35;

/** Where a pencil whose point is at `tip` is held: half way up it, slanting its top out toward the pen's side `s`. */
const gripFor = (tip: Point, s: number, penLen: number): Point =>
  [tip[0] + s * Math.sin(SLANT * DEG) * 0.5 * penLen, tip[1] - Math.cos(SLANT * DEG) * 0.5 * penLen];

/**
 * The pen arm's lift that brings its mitten nearest that grip (a mitten goes round its brad at one distance: the
 * nearest it gets is straight toward the grip), the short way round from where the arm hangs.
 */
function penLiftFor(ch: Puppet, pen: ArmSide, tip: Point, penLen: number): number {
  const a = ch.arm(pen);
  const [gx, gy] = gripFor(tip, pen === 'R' ? 1 : -1, penLen);
  return a.rest + turn(aimLift(pen, Math.atan2(gy - a.pivot[1], gx - a.pivot[0]) / DEG), a.rest);
}

/**
 * The slip held by the middle of its edge away from the pencil, before the chest and below the eyes, where the pencil
 * arm can hold a pencil writing on it: its mitten reaching the grip, not behind the slip (the slip is drawn over it).
 * The holding arm is tried all the way round (short arms reach across the body).
 */
function writePose(ch: Puppet, hold: ArmSide, pen: ArmSide): WritePose {
  const R = ch.rig;
  const s = pen === 'R' ? 1 : -1;
  // a slip about a quarter of the body across; a bigger one where the two mittens can't come close (a wide body,
  // short arms: the slip bridges the gap)
  const usual = clamp((R.torso.w * 0.26) / 40, 1.3, 2.1);
  const penScale = usual * 0.6;
  const penLen = PENCIL_LEN * penScale;
  const anchor: Point = [20 - s * 15, 17];
  const paperRot = -s * 5;   // its pencil side a little up, as a slip held to be written on is
  const c = Math.cos(paperRot * DEG);
  const sn = Math.sin(paperRot * DEG);
  const place = (mh: Point, scale: number) => (d: Point): Point => {
    const x = (d[0] - anchor[0]) * scale;
    const y = (d[1] - anchor[1]) * scale;
    return [mh[0] + x * c - y * sn, mh[1] + x * sn + y * c];
  };
  const boxOf = (on: (d: Point) => Point): Rect => {
    const pts = ([[3, 2], [38, 2], [2, 28], [38, 28]] as const).map(q => on(q));
    const xs = pts.map(q => q[0]);
    const ys = pts.map(q => q[1]);
    return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
  };
  const eyes = Math.max(R.eyes[0][1], R.eyes[1][1]);
  const chest = lerp(R.face[1], R.tp[1], 0.6);
  const foot = R.torso.y + R.torso.h * 0.95;
  const holdRest = ch.arm(hold).rest;
  const arm = ch.arm(pen);
  const reach = arm.len * MITTEN_MIDDLE;
  let best = { cost: Infinity, hold: holdRest, mh: mittenAt(ch, hold, holdRest), scale: usual };
  for (const scale of [usual, usual * 1.25, usual * 1.5, usual * 1.8]) for (let hl = -90; hl < 270; hl += 2) {
    const mh = mittenAt(ch, hold, hl);
    const on = place(mh, scale);
    const box = boxOf(on);
    const mid = on([20, 15]);
    let cost = 0.5 * Math.abs(mid[0] - R.gx) + 0.5 * Math.max(0, Math.abs(mid[1] - chest) - 12)
      + 3 * Math.max(0, eyes + 14 - box.y) + 2 * Math.max(0, box.y + box.h - foot) + 0.03 * Math.abs(turn(hl, holdRest))
      + 12 * (scale / usual - 1);
    // the pencil at both ends of the lines: the mitten reaching its grip, in front of the slip, the pencil slanting out
    for (const d of [[8, 10], [30, 16], [21, 22]] as const) {
      const tip = on(d);
      const [gx, gy] = gripFor(tip, s, penLen);
      cost += 1.5 * Math.abs(Math.hypot(gx - arm.pivot[0], gy - arm.pivot[1]) - reach);
      const m = mittenAt(ch, pen, penLiftFor(ch, pen, tip, penLen));
      if (m[0] > box.x && m[0] < box.x + box.w && m[1] > box.y && m[1] < box.y + box.h) cost += 40;
      const lean = Math.atan2(-s * (tip[0] - m[0]), tip[1] - m[1]) / DEG;
      cost += 2 * Math.max(0, 15 - lean, lean - 60);
    }
    if (cost < best.cost) best = { cost, hold: hl, mh, scale };
  }
  const on = place(best.mh, best.scale);
  // the lift the short way round from where its arm hangs, so raising it never swings it over the head
  return {
    hold: holdRest + turn(best.hold, holdRest), paperScale: best.scale, paperRot, anchor, box: boxOf(on), penScale, penLen,
    on,
  };
}

export const ACTS: Record<ActName, Act> = {
  *look(S, ch) {
    const a = S.rand() < 0.5 ? -1 : 1;
    yield* during(S, 2.8, u => {
      const p = ch.pose;
      p.faceX += 11 * (u < 0.42 ? a * smooth(u / 0.15) : u < 0.84 ? -a * smooth((u - 0.42) / 0.15) : -a * (1 - smooth((u - 0.84) / 0.16)));
      p.faceY -= 2 * bell(u);
      if (Math.abs(u - 0.42) < 0.03) p.eyes = 'shut';
      p.tilt += a * 2 * Math.sin(u * Math.PI * 2);
    });
  },
  *wave(S, ch, pl) {
    // the arm that shows: never the one behind a card, and over the top of what it peeks from; beside what its place
    // keeps clear (a store badge, a button), the arm away from it
    const any: ArmSide = S.rand() < 0.5 ? 'L' : 'R';
    const w = ch.waveArm(pl.waveSide || (pl.hidden ? other(pl.hidden) : awayFrom(ch, pl) ?? any));
    yield* during(S, 1.9, (u, t) => {
      const e = bell(u, 0.2);
      const p = ch.pose;
      if (w) ch.setLift(w.side, lerp(ch.arm(w.side).rest, w.lift + 18 * Math.sin(t * Math.PI * 2 * 2), e));
      else p.rise += 6 * bell(u, 0.3);   // no arm can show: a little bob instead
      p.mouth = mouthOpen(ch);
      p.tilt += (w && w.side === 'L' ? -3 : 3) * e;
      p.faceY -= 2 * e;
      p.blush = Math.max(p.blush, 0.3 * e);
    });
  },
  *stretch(S, ch) {
    yield* during(S, 2.6, u => {
      const e = bell(u, 0.3, 0.25);
      const p = ch.pose;
      ch.setLift('L', lerp(ch.arm('L').rest, 168, e));
      ch.setLift('R', lerp(ch.arm('R').rest, 168, e));
      p.sy *= 1 + 0.07 * e;
      p.sx *= 1 - 0.03 * e;
      p.bodyUp += 3 * e;
      p.faceY -= 4 * e;
      if (e > 0.6) {
        if (!ch.traits.openStretch) p.eyes = 'shut';
        p.mouth = 'mouth-o';
      }
    });
  },
  *hop(S, ch) {
    for (let i = 0; i < 2; i++) {
      if (i) yield* during(S, 0.16);   // a breath between the two
      yield* during(S, 0.15, u => {
        ch.pose.sy *= 1 - 0.1 * u;
        ch.pose.sx *= 1 + 0.05 * u;
      });
      yield* during(S, 0.46, u => {
        const p = ch.pose;
        p.rise += 34 * Math.sin(Math.PI * u);
        p.legS *= 0.85;
        p.liftL += 40 * Math.sin(Math.PI * u);
        p.liftR += 40 * Math.sin(Math.PI * u);
        if (i === 1) p.eyes = 'shut';
        p.mouth = 'mouth-o';
      });
      yield* during(S, 0.18, u => {
        ch.pose.sy *= 1 - 0.09 * (1 - u);
        ch.pose.sx *= 1 + 0.05 * (1 - u);
      });
    }
  },
  *deco(S, ch) {
    // the arm nearest the decoration's outline (a beret's brim, a bow's loop) and the point it would take hold of
    const R = ch.rig;
    const d = R.deco;
    let best: { side: ArmSide; x: number; y: number; dist: number; len: number } | null = null;
    if (d) {
      for (const side of ['L', 'R'] as const) {
        const a = ch.arm(side);
        const [bx, by] = a.pivot;
        const hx = clamp(bx, d.x + d.w * 0.12, d.x + d.w * 0.88);
        const hy = clamp(by, d.y + d.h * 0.2, d.y + d.h * 0.85);
        const dist = Math.hypot(hx - bx, hy - by);
        if (!best || dist / a.len < best.dist / best.len) best = { side, x: hx, y: hy, dist, len: a.len };
      }
    }
    const tip = !!best && best.dist < best.len * 1.1 && (S.rand() < 0.5 || !!ch.traits.likes?.includes('deco'));
    const nod = !tip && S.rand() < 0.55;
    yield* during(S, 2.3, u => {
      const e = bell(u, 0.25);
      const p = ch.pose;
      if (tip && best) {   // lift it like a hat
        const { side, x: dx, y: dy } = best;
        const [bx, by] = ch.arm(side).pivot;
        ch.setLift(side, lerp(ch.arm(side).rest, aimLift(side, Math.atan2(dy - by, dx - bx) / DEG), e));
        p.front = true;
        p.decoY += 10 * bell(u, 0.35);
        p.decoR += (dx < R.gx ? -14 : 14) * bell(u, 0.35);
      } else if (nod) {   // no hand reaches it: a nod that makes it hop
        const n = bell(clamp(u / 0.45, 0, 1), 0.35);
        const h = clamp((u - 0.28) / 0.42, 0, 1);
        p.sy *= 1 - 0.06 * n;
        p.faceY += 6 * n;
        p.tilt += 2 * n;
        p.decoY += 20 * Math.sin(Math.PI * h);
        p.decoR += 9 * Math.sin(Math.PI * 2 * h);
        if (h > 0 && h < 1) p.mouth = 'mouth-o';
      } else {   // a wiggle
        p.decoR += 12 * Math.sin(u * Math.PI * 6) * e;
      }
      p.faceY -= 2 * e;
      if (e > 0.7 && !nod) p.eyes = 'shut';
    });
  },
  *reveal(S, ch) {
    const R = ch.rig;
    const turn = ch.altHidesFace;   // a back: turn round to it; else the secret shows on the front
    let reach: { side: ArmSide; d: number } | null = null;   // the hand that lifts a small secret (摺摺's dog-ear) open
    const at = R.revealAt;
    if (!turn && at) {
      for (const side of ['L', 'R'] as const) {
        const a = ch.arm(side);
        const d = Math.hypot(at[0] - a.pivot[0], at[1] - a.pivot[1]) / a.len;
        if (d < 1.6 && (!reach || d < reach.d)) reach = { side, d };
      }
    }
    yield* during(S, turn ? 3.5 : 3.3, u => {
      const e = bell(u, 0.15);
      const p = ch.pose;
      if (turn) {   // the body narrows to its edge at each swap, like a card turned in the fingers
        const sw = Math.max(bell(clamp((u - 0.04) / 0.16, 0, 1), 0.5), bell(clamp((u - 0.8) / 0.16, 0, 1), 0.5));
        p.sx *= 1 - 0.85 * sw;
        p.alt = u > 0.12 && u < 0.88;
      } else if (reach && at) {
        const s = reach.side;
        const [bx, by] = ch.arm(s).pivot;
        const [cx, cy] = at;
        const r = smooth(u / 0.16) * (1 - smooth((u - 0.84) / 0.14));
        ch.setLift(s, lerp(ch.arm(s).rest, aimLift(s, Math.atan2(cy - by, cx - bx) / DEG), r));
        p.front = true;
        p.alt = u > 0.17 && u < 0.83;
        p.faceX += (cx < R.gx ? -7 : 7) * e;   // it looks at its own corner
      } else {
        p.alt = u > 0.12 && u < 0.88;
        ch.setLift('R', lerp(ch.arm('R').rest, 40, e * 0.6));
      }
      p.faceY -= 3 * e;
      p.faceX += 4 * e * (reach ? 0 : 1);
      p.mouth = u > 0.3 && u < 0.8 ? mouthOpen(ch) : 'mouth';
      p.blush = Math.max(p.blush, 0.5 * e);
    });
  },
  *twinkle(S, ch) {
    let next = 0;
    let lvl = 1;
    yield* during(S, 3.0, (u, t) => {
      if (t >= next) {
        next = t + 0.16;
        lvl = 0.3 + 0.7 * S.rand();
      }
      const p = ch.pose;
      p.stars = lvl;
      p.faceY -= 5 * bell(u);
      p.faceX += 3 * Math.sin(u * 6);
    });
  },
  *point(S, ch, pl) {
    const target = pl.target;
    if (!target) return yield* ACTS.look(S, ch, pl);
    const [tx, ty] = target;
    const side: ArmSide = pl.hidden ? other(pl.hidden) : tx < ch.x ? 'L' : 'R';
    // what it points at keeps its margin (a store badge must): the mitten stops short of the place's clear rects
    const keepOff = pl.ledge.clear || [];
    yield* during(S, 2.9, (u, t) => {
      const e = bell(u, 0.18);
      const p = ch.pose;
      p.tilt += (side === 'L' ? -3 : 3) * e;
      const [bx, by] = ch.pagePoint(...ch.arm(side).pivot);
      const aim = aimLift(side, Math.atan2(ty - by, tx - bx) / DEG);
      const rest = ch.arm(side).rest;
      const want = lerp(rest, aim + 4 * Math.sin(t * 9) * (u > 0.3 ? 1 : 0), e);
      let reach = 1;   // raised from rest as far as the mitten stays off them: it stops at their edge
      while (reach > 0 && keepOff.length && !ch.mittenClear(side, rest + (want - rest) * reach, keepOff, POINT_MARGIN)) reach -= 0.05;
      ch.setLift(side, rest + (want - rest) * Math.max(0, reach));
      const toward = clamp((tx - ch.x) / (ch.halfW * 2), -1, 1);
      if (u < 0.55) {
        p.faceX += 10 * toward * e;
        p.faceY += 3 * e;
      } else {
        p.mouth = mouthOpen(ch);
        p.faceY -= 2 * e;
      }
    });
  },
  *beckon(S, ch, pl) {
    const want: ArmSide = pl.target && pl.target[0] < ch.x ? 'L' : 'R';
    const w = ch.waveArm(want, [120, 150]);
    yield* during(S, 3.0, (u, t) => {
      const e = bell(u, 0.15);
      const p = ch.pose;
      const side = w ? w.side : want;
      if (w) ch.setLift(side, lerp(ch.arm(side).rest, w.lift - 8 + 22 * Math.sin(t * Math.PI * 2 * 1.7), e));
      p.faceX += (u < 0.5 ? 0 : want === 'L' ? -8 : 8) * e;
      p.faceY -= 2 * e;
      p.mouth = mouthOpen(ch);
      p.tilt += (want === 'L' ? -4 : 4) * e;
    });
  },
  *lean(S, ch, pl) {
    const target = pl.target;
    if (!target) return yield* ACTS.look(S, ch, pl);
    const side: ArmSide = target[0] < ch.x ? 'L' : 'R';
    const dir = side === 'L' ? -1 : 1;
    const [tx, ty] = target;
    yield* during(S, 3.8, u => {
      const e = bell(u, 0.15);
      const p = ch.pose;
      const [bx, by] = ch.pagePoint(...ch.arm(side).pivot);
      p.tilt += dir * 9 * e;
      ch.setLift(side, lerp(ch.arm(side).rest, aimLift(side, Math.atan2(ty - by, tx - bx) / DEG), e));
      ch.setLift(other(side), lerp(ch.arm(other(side)).rest, -18, e));   // a hand on the hip
      if (side === 'R') p.legL -= 12 * e;   // the outer leg crosses
      else p.legR += 12 * e;
      p.faceX -= dir * 5 * e;
      p.faceY -= 1 * e;
      if (u > 0.55 && u < 0.62) p.eyes = 'shut';
    });
  },
  *write(S, ch, pl) {
    // writes three short lines on a slip of paper held by its outer edge in one mitten, the pencil gripped in the
    // other — its point on the line being written, following the words; the hand goes where the pencil's slant puts
    // it (the owner, round 5: the pencil floated, upright, in no hand). Then it holds the slip out toward the button
    // and lets it go
    const target = pl.target;
    if (!target) return yield* ACTS.look(S, ch, pl);
    const toward: ArmSide = target[0] < ch.x ? 'L' : 'R';
    const pen = other(toward);
    const pose = writePose(ch, toward, pen);
    const paper = S.prop('paper', ch, ch);
    const pencil = S.prop('pencil', ch, ch);
    const ap = ch.arm(toward);
    const aw = ch.arm(pen);
    const k = ch.k;
    const holdAng = armAngle(toward, pose.hold);
    const s = pen === 'R' ? 1 : -1;
    const [tx, ty] = target;
    yield* during(S, 4.8, (u, t) => {
      const p = ch.pose;
      const h = smooth(u / 0.12) * (1 - smooth((u - 0.93) / 0.07));   // the slip held up
      const w = smooth(u / 0.12) * (1 - smooth((u - 0.6) / 0.1));   // writing
      const g = smooth((u - 0.62) / 0.14) * (1 - smooth((u - 0.93) / 0.07));   // holding it out
      const ink = clamp((u - 0.12) / 0.46, 0, 1);
      const [bx, by] = ch.pagePoint(...ap.pivot);
      const give = aimLift(toward, Math.atan2(ty - by, tx - bx) / DEG);
      ch.setLift(toward, lerp(ap.rest, lerp(pose.hold + 1.5 * Math.sin(t * 1.7), give, smooth((u - 0.62) / 0.14)), h));
      const tip = pose.on(writingAt(ink));
      const penLift = penLiftFor(ch, pen, tip, pose.penLen);
      ch.setLift(pen, lerp(aw.rest, penLift, w));
      p.front = true;
      p.faceY += 5 * w - 2 * g;
      p.faceX += clamp((pose.on([20, 15])[0] - ch.rig.face[0]) / 5, -8, 8) * Math.max(w, g);
      if (g > 0.4) {
        p.mouth = mouthOpen(ch);
        p.blush = Math.max(p.blush, 0.5 * g);
      }
      // the slip, by the edge its mitten holds
      const [mx, my, ang] = ch.mitten(toward, MITTEN_MIDDLE);
      const fly = smooth((u - 0.84) / 0.16);
      paper.at(lerp(mx, lerp(mx, tx, 0.4), fly), lerp(my, my - 12 * k, fly), k * pose.paperScale, smooth(u / 0.08) * (1 - fly),
        pose.paperRot + p.tilt + 0.25 * (ang - p.tilt - holdAng), pose.anchor);
      paper.write(ink);
      // the pencil, in its mitten, slanting as it does at the pose: its point on the line being written
      const [qx, qy, qa] = ch.mitten(pen, MITTEN_MIDDLE);
      const m = mittenAt(ch, pen, penLift);
      const slant = clamp(Math.atan2(-s * (tip[0] - m[0]), tip[1] - m[1]) / DEG, 12, 58);
      const toTip = Math.atan2(Math.cos(slant * DEG), -s * Math.sin(slant * DEG)) / DEG;   // the mitten to the point
      const len = clamp(Math.hypot(tip[0] - m[0], tip[1] - m[1]), 0.2 * pose.penLen, 0.85 * pose.penLen) * k;
      const dir = qa + toTip - armAngle(pen, penLift);
      pencil.at(qx + Math.cos(dir * DEG) * len, qy + Math.sin(dir * DEG) * len, k * pose.penScale, w, dir - 90, PENCIL_TIP);
    });
    paper.remove();
    pencil.remove();
  },
  *read(S, ch) {
    // reads a little book held in both mittens before its chest, and turns a page
    const R = ch.rig;
    const book = S.prop('book', ch, ch);
    const [fx, fy] = R.face;
    const hy = lerp(fy, R.tp[1], 0.62);
    const size = clamp((R.torso.w * 0.4) / 64, 1.3, 2.1);
    yield* during(S, 4.2 + S.rand(), (u, t) => {
      const e = bell(u, 0.12);
      const p = ch.pose;
      p.faceY += 6 * e;
      p.faceX += (-6 + 12 * ((t * 0.5) % 1)) * e;   // reading across the page
      for (const side of ['L', 'R'] as const) {
        const a = ch.arm(side);
        const hx = fx + (side === 'L' ? -48 : 48);
        ch.setLift(side, lerp(a.rest, aimLift(side, Math.atan2(hy - a.pivot[1], hx - a.pivot[0]) / DEG), e));
      }
      p.tilt += 1.5 * Math.sin(t * 1.3) * e;
      p.front = e > 0.02;
      const [lx, ly] = ch.mitten('L');
      const [rx, ry] = ch.mitten('R');
      book.at((lx + rx) / 2, (ly + ry) / 2 - 3 * ch.k, ch.k * size, smooth((e - 0.45) / 0.3), p.tilt);
      book.turn(clamp((u - 0.55) / 0.12, 0, 1));
      if (u > 0.52 && u < 0.56) p.eyes = 'shut';
    });
    book.remove();
  },
  *swing(S, ch) {
    yield* during(S, 3.6, (u, t) => {
      const e = bell(u, 0.15);
      const p = ch.pose;
      const s = Math.sin(t * Math.PI * 2 * 1.05);
      p.legL += 22 * s * e;
      p.legR += 22 * Math.sin(t * Math.PI * 2 * 1.05 + 2.2) * e;
      p.bodyUp += 2 * Math.abs(s) * e;
      p.faceX += 4 * s * e;
      if (u > 0.4 && u < 0.7) p.eyes = 'shut';
    });
  },
  *nap(S, ch, pl) {
    const zs = S.prop('z', ch, ch);
    const lean = pl.target && pl.target[0] < ch.x ? -1 : 1;
    yield* during(S, 5.5 + S.rand() * 1.5, (u, t) => {
      const e = bell(u, 0.12);
      const p = ch.pose;
      const b = Math.sin(t * Math.PI * 2 * 0.32);
      p.eyes = e > 0.6 ? 'nap' : e > 0.15 ? 'sleepy' : p.eyes;
      p.sy *= 1 + 0.035 * b * e;
      p.tilt += lean * 7 * e;
      p.faceY += 4 * e;
      ch.setLift('L', lerp(ch.arm('L').rest, -14, e));
      ch.setLift('R', lerp(ch.arm('R').rest, -14, e));
      p.front = e > 0.02;
      const [hx, hy] = ch.pagePoint(ch.rig.face[0] + 60 * lean, ch.rig.torso.y - 10);
      const zu = (t * 0.4) % 1;
      zs.at(hx + 10 * lean * zu * ch.k, hy - zu * 50 * ch.k, ch.k * 1.8, e * Math.sin(Math.PI * zu) * 0.95);
    });
    zs.remove();
    yield* ACTS.stretch(S, ch, pl);
  },
  *duck(S, ch, pl) {
    if (pl.how === 'slide') {   // back behind the side for a moment, then out again
      const x1 = ch.x;
      const x0 = pl.x0 ?? x1;
      yield* during(S, 0.45, u => {
        ch.x = lerp(x1, x0, easeOut(u));
      });
      yield* during(S, 0.5 + S.rand() * 0.6, () => {
        ch.x = x0;
      });
      yield* during(S, 0.5, u => {
        ch.x = lerp(x0, x1, easeOut(u));
        ch.pose.mouth = 'mouth-o';
        ch.pose.faceX += (x1 > x0 ? 1 : -1) * 10;
      });
      ch.x = x1;
      return;
    }
    const deep = (pl.show || 0.6) * ch.rig.height + 30;
    yield* during(S, 0.38, u => {
      ch.pose.rise -= deep * easeOut(u);
    });
    yield* during(S, 0.6 + S.rand() * 0.6, () => {
      ch.pose.rise -= deep;
    });
    yield* during(S, 0.42, u => {
      ch.pose.rise -= deep * (1 - easeOut(u));
      ch.pose.mouth = 'mouth-o';
      ch.pose.liftL += 30 * u;
      ch.pose.liftR += 30 * u;
    });
    yield* during(S, 0.5, u => {
      ch.pose.mouth = 'mouth-o';
      ch.pose.liftL += 30 * (1 - u);
      ch.pose.liftR += 30 * (1 - u);
    });
  },
};

export const isActName = (a: string): a is ActName => Object.prototype.hasOwnProperty.call(ACTS, a);

/** What each stance allows. */
export const ACT_STANCE: Record<'stand' | 'sit' | 'floor' | 'peek', readonly ActName[]> = {
  stand: ['look', 'wave', 'stretch', 'hop', 'deco', 'reveal', 'twinkle', 'point', 'beckon', 'lean', 'write', 'read'],
  sit: ['read', 'swing', 'look', 'wave', 'reveal', 'deco', 'nap', 'twinkle'],
  floor: ['nap', 'look', 'wave', 'twinkle', 'swing'],
  peek: ['look', 'wave', 'duck', 'point', 'beckon'],
};
