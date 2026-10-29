/**
 * The longer tasks: coming in and going (walk in from a side, pop up from the page like a pop-up book, climb up from
 * behind an element, rise over its top, slide out past its side), a whole visit, a greeting from afar, a meeting.
 */
import { ACTS } from './acts';
import type { Stage } from './engine';
import { bell, clamp, DEG, easeOut, lerp, smooth } from './geometry';
import { aimLift, all, changeStance, during, follow, mouthOpen, pause, quick, travel, walkTo } from './motion';
import type { Prop } from './props';
import type { Puppet } from './puppet';
import type { ArmSide, Duet, MeetVariant, Plan, Task } from './types';

/** A seat with words or an author row close above it (its ledge's `clear`): climbed to sitting, never standing tall. */
const seatOnly = (pl: Plan): boolean => pl.stance === 'sit' && !!pl.ledge.clear?.length;
/** legS of legs folded up under a sitter climbing from behind a card. */
const FOLDED = 0.15;
/** Seconds to climb up from behind a card and back down, to rise over or slide out past a cover and back. */
const CLIMB = 1.35;
const CLIMB_DOWN = 1.1;
const PEEK_IN = 1.2;
const PEEK_OUT = 1.0;

/** Seconds a paper figure takes to stand up from the page, and to fall back onto it (the owner, round 5: both were too quick). */
const POP_UP = 0.8;
const POP_DOWN = 1.05;

/** Stands up from the page like a pop-up book's figure: up past upright, then settling, eyes opening on the way. */
function* popUp(S: Stage, ch: Puppet): Task {
  yield* during(S, POP_UP, u => {
    const p = ch.pose;
    const e = u < 0.6 ? 1.06 * easeOut(u / 0.6) : lerp(1.06, 1, smooth((u - 0.6) / 0.4));
    p.popY = Math.max(0.02, e);
    p.popX = 0.85 + 0.15 * Math.min(1, e);
    if (u < 0.4) p.eyes = 'shut';
    else if (u < 0.8) p.mouth = 'mouth-o';
    p.liftL += 34 * (1 - smooth(u));
    p.liftR += 34 * (1 - smooth(u));
  });
}

/**
 * Falls back onto the page as a sheet of paper falls over: up on its toes for a moment, then tipping back slowly at
 * first and faster as it goes (its height the cosine of an angle that grows with the square of the time, as a falling
 * card's does), arms flung up; flat on the page it bounces once, a little, and fades.
 */
export function* popDown(S: Stage, ch: Puppet, speed = 1): Task {
  yield* during(S, POP_DOWN / Math.min(speed, 1.4), u => {
    const p = ch.pose;
    let h: number;
    if (u < 0.16) h = 1 + 0.03 * Math.sin(Math.PI * smooth(u / 0.16));
    else if (u < 0.84) {
      const f = (u - 0.16) / 0.68;
      h = Math.cos(90 * f * f * DEG);
    } else {
      const b = (u - 0.84) / 0.16;
      h = Math.cos((90 - 6 * Math.sin(Math.PI * b)) * DEG);
      p.alpha = 1 - smooth(b);
    }
    p.popY = Math.max(0.02, h);
    p.popX = 1 - 0.06 * (1 - h);
    if (u > 0.1) p.eyes = 'shut';
    if (u < 0.3) p.mouth = 'mouth-o';
    p.liftL += 34 * smooth(u / 0.6);
    p.liftR += 34 * smooth(u / 0.6);
    p.tilt += 2.5 * Math.sin(u * Math.PI * 3) * (1 - h);   // a sheet sways a little as it falls
  });
  ch.fallen = true;   // flat on the page from here on, whatever runs after it (a meeting waiting for the other to go)
  ch.pose.popY = 0.02;   // this step's pose was set before it
  ch.pose.alpha = 0;
}

function* enter(S: Stage, ch: Puppet, pl: Plan): Task {
  ch.mode = 'enter';
  if (pl.how === 'walk') {
    ch.x = S.offX(ch, pl.side ?? 'left');
    ch.y = ch.surface(ch.x);
    yield* travel(S, ch, pl.x, pl.speed || 1);
    if (pl.stance === 'floor') yield* changeStance(S, ch, 'floor', 0.6);
  } else if (pl.how === 'pop') {
    ch.x = pl.x;
    ch.y = pl.y;
    yield* popUp(S, ch);
    if (pl.stance === 'floor') yield* changeStance(S, ch, 'floor', 0.6);
  } else if (pl.how === 'climb' && seatOnly(pl)) {
    // words just above the seat (the card over this one, the feed's heading): it comes up already sitting, never
    // taller than its seat (fit() kept the seated body off them), its legs folded behind and unfolding over the front
    const r0 = -(ch.rig.height + ch.decoH + 8);
    if (pl.cover) ch.goBehind(pl.cover, r0);
    ch.sitU = 1;
    ch.base();   // this step's pose too, or its first frame would stand a seat's height out of hiding
    const deep = r0 - ch.seatRise;   // as deep below the seat as a standing climb starts below its feet
    yield* during(S, CLIMB, (u, t) => {
      const p = ch.pose;
      p.rise += deep * (1 - easeOut(u));
      p.legS *= FOLDED;
      p.legL += 16 * Math.sin(t * 16);
      p.legR -= 16 * Math.sin(t * 16);
      p.liftL += 50 * (1 - u);
      p.liftR += 50 * (1 - u);
      p.faceY -= 4 * (1 - u);
    });
    ch.leaveBehind();
    yield* during(S, 0.42, u => {
      ch.pose.legS *= lerp(FOLDED, 1, smooth(u));
      ch.pose.sy *= 1 - 0.06 * Math.sin(Math.PI * u);
    });
    ch.stance = 'sit';
  } else if (pl.how === 'climb') {
    const r0 = -(ch.rig.height + ch.decoH + 8);
    if (pl.cover) ch.goBehind(pl.cover, r0);
    yield* during(S, CLIMB, (u, t) => {
      const p = ch.pose;
      p.rise += r0 * (1 - easeOut(u));
      p.legL += 16 * Math.sin(t * 16);
      p.legR -= 16 * Math.sin(t * 16);
      p.liftL += 50 * (1 - u);
      p.liftR += 50 * (1 - u);
      p.faceY -= 4 * (1 - u);
    });
    if (pl.stance === 'sit') {
      yield* during(S, 0.36, u => {
        ch.pose.rise += 22 * Math.sin(Math.PI * u * 0.5);
        ch.pose.legS *= 0.85;
      });
      ch.leaveBehind();
      yield* during(S, 0.32, u => {
        ch.sitU = smooth(u);
        ch.base();
        ch.pose.rise += 22 * (1 - u);
        ch.pose.sy *= 1 - 0.06 * Math.sin(Math.PI * u);
      });
      ch.sitU = 1;
      ch.stance = 'sit';
    } else ch.leaveBehind();
  } else if (pl.how === 'rise') {
    const r1 = pl.rise1 ?? 0;
    const r0 = pl.rise0 ?? 0;
    if (pl.cover) ch.goBehind(pl.cover, r0);
    yield* during(S, PEEK_IN, u => {
      ch.pose.rise += lerp(r0, r1, easeOut(u));
      ch.pose.faceY -= 3 * (1 - u);
    });
    ch.baseRise = r1;
  } else if (pl.how === 'slide') {
    if (pl.cover) ch.goBehind(pl.cover, 0);
    const x1 = pl.x;
    const x0 = pl.x0 ?? x1;
    ch.x = x0;
    ch.y = pl.ground ?? pl.y;
    yield* during(S, PEEK_IN, u => {
      ch.x = lerp(x0, x1, easeOut(u));
      const dir = Math.sign(x1 - x0);
      ch.pose.tilt += dir * 7 * Math.sin(Math.PI * u * 0.5);
      ch.pose.faceX += dir * 8;
      ch.pose.alpha = smooth(u / 0.3);
    });
    ch.x = x1;
  }
  ch.mode = 'act';
}

export function* leave(S: Stage, ch: Puppet, pl: Plan, speed = 1): Task {
  ch.mode = 'exit';
  if (pl.how === 'walk') {
    if (ch.stance !== 'stand') yield* changeStance(S, ch, 'stand', 0.42 / speed);
    const side = S.exitSide(ch, pl);
    if (side) {
      const x1 = S.offX(ch, side);
      yield* travel(S, ch, x1, speed * quick(ch, Math.abs(x1 - ch.x), S.o.walkLimit));
    } else yield* popDown(S, ch, speed);   // someone stands in the way on both sides: fold back into the page
  } else if (pl.how === 'pop') {
    if (ch.stance !== 'stand') yield* changeStance(S, ch, 'stand', 0.42 / speed);
    yield* popDown(S, ch, speed);
  } else if (pl.how === 'climb' && seatOnly(pl) && ch.stance === 'sit') {
    // back down behind the card as it came, never standing up first (its head would cover the words above)
    yield* during(S, 0.3 / speed, u => {
      ch.pose.legS *= lerp(1, FOLDED, smooth(u));
    });
    const r1 = -(ch.rig.height + ch.decoH + 8);
    if (pl.cover) ch.goBehind(pl.cover, r1);
    const deep = r1 - ch.seatRise;
    yield* during(S, CLIMB_DOWN / speed, (u, t) => {
      ch.pose.rise += deep * smooth(u);
      ch.pose.legS *= FOLDED;
      ch.pose.legL += 14 * Math.sin(t * 16);
      ch.pose.legR -= 14 * Math.sin(t * 16);
    });
  } else if (pl.how === 'climb') {
    if (ch.stance === 'sit') {
      yield* during(S, 0.32 / speed, u => {
        ch.sitU = 1 - smooth(u);
        ch.base();
        ch.pose.rise += 22 * Math.sin(Math.PI * u * 0.5);
      });
      ch.sitU = 0;
      ch.stance = 'stand';
    }
    const r1 = -(ch.rig.height + ch.decoH + 8);
    if (pl.cover) ch.goBehind(pl.cover, r1);
    yield* during(S, CLIMB_DOWN / speed, (u, t) => {
      ch.pose.rise += r1 * smooth(u);
      ch.pose.legL += 14 * Math.sin(t * 16);
      ch.pose.legR -= 14 * Math.sin(t * 16);
    });
  } else if (pl.how === 'rise') {
    const r0 = pl.rise0 ?? 0;
    yield* during(S, PEEK_OUT / speed, u => {
      ch.pose.rise += lerp(ch.baseRise, r0, smooth(u)) - ch.baseRise;
    });
  } else if (pl.how === 'slide') {
    const x0 = ch.x;
    const x1 = pl.x0 ?? x0;
    const dir = Math.sign(x1 - x0);
    yield* during(S, PEEK_OUT / speed, u => {
      ch.x = lerp(x0, x1, smooth(u));
      ch.pose.faceX += dir * 8;
      ch.pose.alpha = 1 - smooth((u - 0.7) / 0.3);
    });
  }
  ch.gone = true;
}

/** Poked twice: mittens over the face, a blush, then off. */
export function* shy(S: Stage, ch: Puppet): Task {
  ch.mode = 'shy';
  yield* during(S, 1.2, u => {
    const e = bell(u, 0.2, 0.1);
    const p = ch.pose;
    for (const side of ['L', 'R'] as const) {
      const [bx, by] = ch.arm(side).pivot;
      const [fx, fy] = ch.rig.face;
      ch.setLift(side, lerp(ch.arm(side).rest, aimLift(side, Math.atan2(fy - 10 - by, fx - bx) / DEG), e));
    }
    p.blush = 1;
    p.eyes = 'shut';
    p.sy *= 1 - 0.04 * e;
    p.faceY += 3 * e;
    p.tilt += 3 * Math.sin(u * 20) * e;
    p.front = e > 0.02;
  });
  ch.blushHold = 1;
}

export function* visit(S: Stage, ch: Puppet, pl: Plan): Task {
  yield* enter(S, ch, pl);
  pl.endAt = Math.max(pl.endAt, S.time + S.o.dwell + pl.exitDur);   // a long way in still leaves time to do something
  S.emit(ch, { type: 'arrive', ledge: pl.ledge.id, label: pl.ledge.label });
  const quiet = () => S.time > pl.endAt - pl.exitDur;
  // a breath on arriving, and a rest between two activities (the owner, round 5: one thing straight after another
  // never let it rest) — the rest's stage business keeps it alive
  yield* pause(S, ch, 0.7 + S.rand() * 0.5);
  let n = 0;
  let last: string | null = null;
  while (!quiet() || n === 0) {
    const act = S.pickAct(ch, pl, last, n);
    S.emit(ch, { type: 'act', act });
    yield* ACTS[act](S, ch, pl);
    last = act;
    n++;
    if (quiet()) break;
    yield* pause(S, ch, 1.3 + S.rand() * 1.4, (S.rand() - 0.5) * 8);
  }
  yield* pause(S, ch, 0.5 + S.rand() * 0.4);
  S.emit(ch, { type: 'leave' });
  yield* leave(S, ch, pl, 1);
}

/** What a greeting's two tasks share; the left one draws the waves. */
export interface GreetShared {
  waves?: Prop;
  at?: [number, number, number];
}

/**
 * Two characters who can see each other but stand apart (the two ends of the headline, either side of a badge):
 * they turn to each other, wave, and the three waves pulse between them — nobody walks.
 */
export function* greetFromAfar(S: Stage, ch: Puppet, other: Puppet, sh: GreetShared, dir: number): Task {
  const lead = dir > 0;
  const w = ch.waveArm(dir > 0 ? 'R' : 'L');
  if (lead) sh.waves = S.prop('waves', ch, ch);
  const dur = 3.6;
  const period = 0.68;
  yield* during(S, dur, (u, t) => {
    const p = ch.pose;
    p.faceX += dir * 11 * smooth(u / 0.08);
    if (u < 0.16) {   // notice: a little hop (the one who saw first), an o
      p.mouth = 'mouth-o';
      if (lead) p.rise += 9 * Math.sin((Math.PI * u) / 0.16);
      if (u > 0.07 && u < 0.11) p.eyes = 'shut';
    }
    const ew = bell(clamp((u - 0.12) / 0.36, 0, 1), 0.25);   // wave to each other
    if (ew > 0) {
      if (w) ch.setLift(w.side, lerp(ch.arm(w.side).rest, w.lift + 16 * Math.sin(t * 12 + (lead ? 0 : 1)), ew));
      p.mouth = mouthOpen(ch);
    }
    const rt = t - 0.44 * dur;   // resonate: the same bob
    const bt = rt / period;
    const ph = ((bt % 1) + 1) % 1;
    const on = rt > 0 && bt < 2;
    if (on) {
      p.rise += 7 * Math.sin(Math.PI * ph);
      if (ph > 0.25 && ph < 0.75) p.eyes = 'shut';
    }
    if (rt > 0) p.blush = Math.max(p.blush, 0.8 * smooth(rt / 0.4));
    if (lead && sh.waves) {
      const at = S.wavesBetween(ch, other) || sh.at;
      if (at) {
        sh.at = at;
        sh.waves.wave(at[0], at[1], at[2], bell(clamp((u - 0.4) / 0.6, 0, 1), 0.15), on ? ph : 0, 85);
      }
    }
  });
  if (lead && sh.waves) sh.waves.remove();
  ch.blushHold = 0.6;
}

/**
 * How large a note is drawn, handed over (its drawing's own size × this), and how much larger once held before the
 * chest (the owner, 2026-10-29: at its drawing's size it was too small to read as a letter).
 */
const NOTE_SIZE = 1.6;
const NOTE_HELD = 0.25;

/** A note held before a taker's chest, in the mitten that took it. */
interface Kept {
  ch: Puppet;
  side: ArmSide;
  note: Prop;
  k: number;
  /** How far it leans, held (its top toward the other mitten). */
  tilt: number;
}

/**
 * The lift that brings this arm's mitten before the chest, under the face, swung in across the body (never up over
 * the head: an inward lift is kept negative).
 */
function chestLift(ch: Puppet, side: ArmSide): number {
  const R = ch.rig;
  const [bx, by] = ch.arm(side).pivot;
  const [fx, fy] = R.face;
  // the held note's top (its drawing is 34 tall) a little under the mouth, so the smile shows (點點's chest is short)
  const mouth = R.parts.get('mouth');
  const hy = Math.max(lerp(fy, R.tp[1], 0.45), mouth ? mouth.y + mouth.h + 17 * NOTE_SIZE * (1 + NOTE_HELD) + 12 : 0);
  const lift = aimLift(side, Math.atan2(hy - by, fx - bx) / DEG);
  return lift > 180 ? lift - 360 : lift;
}

/** The kept note at its mitten, as far as `e` has drawn it in: leaning in, and a little larger, nearer to us. */
function holdAt(h: Kept, e: number, alpha = 1): void {
  const [x, y] = h.ch.mitten(h.side);
  h.note.at(x, y, h.k * (1 + NOTE_HELD * e), alpha, (h.tilt + h.ch.pose.tilt) * e);
}

/**
 * Steps `task` with the note kept before the taker's chest: the other mitten lets go of it as the walk starts, and a
 * taker that falls back onto the page lets the note fade.
 */
function* carrying(S: Stage, h: Kept, task: Task): Task {
  const { ch, side } = h;
  const other: ArmSide = side === 'R' ? 'L' : 'R';
  let fade = 1;
  for (let t = 0; ; t += S.dt) {
    if (task.next().done) return;
    const p = ch.pose;
    if (ch.fallen || Math.abs(p.popY - 1) > 1e-3) fade = Math.max(0, fade - S.dt / 0.3);
    else {
      ch.setLift(side, chestLift(ch, side));
      const cupped = lerp(ch.arm(other).rest, chestLift(ch, other), 0.85);
      ch.setLift(other, lerp(other === 'L' ? p.liftL : p.liftR, cupped, 1 - smooth((t - 0.2) / 0.5)));
      p.front = true;
    }
    holdAt(h, 1, fade);
    yield;
  }
}

/**
 * The meeting. `a` is on the left at the end, `b` on the right; 'host': a guest walks up to someone already there,
 * 'pair': both walk in from the two sides. Then: notice, close in, wave, resonate (the same bob, three pencil waves
 * between them, a blush), maybe a note or a touch of mittens, and part — each its own way, or together.
 */
export function* duet(S: Stage, d: Duet): Task {
  const { a, b } = d;
  const k = (a.k + b.k) / 2;
  const avgW = a.halfW + b.halfW;   // an average body width, in px
  const roomFor = (ch: Puppet, other: Puppet) => ch.halfW + other.halfW;
  // 0 · arrive within sight of each other; they notice each other halfway, and hurry
  const vp = S.vp;
  const inX = (ch: Puppet, x: number) => clamp(x, vp.x + ch.halfW + 8, vp.x + vp.w - ch.halfW - 8);
  const seen: { at: number | null } = { at: null };
  const notice = () => {   // both in view and not far apart: an o, a little hop, quicker steps
    if (seen.at == null && S.inView(a, 0) && S.inView(b, 0) && Math.abs(b.x - a.x) < vp.w * 0.55) seen.at = S.time;
    if (seen.at != null && S.time - seen.at < 0.5) {
      const u = (S.time - seen.at) / 0.5;
      for (const ch of [a, b]) {
        ch.pose.mouth = 'mouth-o';
        ch.pose.rise += 7 * Math.sin(Math.PI * u);
      }
    }
  };
  const pace = (ch: Puppet, dist: number) => {
    const q = quick(ch, dist, 4.0);
    return () => q * (seen.at != null ? 1.2 : 1);
  };
  if (d.mode === 'pair') {
    const va = a.pace();
    const vb = b.pace();
    const gap = roomFor(a, b) + 2.2 * avgW;
    const c = clamp(vp.x + (vp.w * va) / (va + vb), vp.x + gap / 2 + a.halfW + 8, vp.x + vp.w - gap / 2 - b.halfW - 8);
    const xa = inX(a, c - gap / 2);
    const xb = inX(b, c + gap / 2);
    let done = 0;
    yield* all([
      (function* () {
        yield* travel(S, a, xa, pace(a, Math.abs(xa - a.x)));
        done++;
      })(),
      (function* () {
        yield* travel(S, b, xb, pace(b, Math.abs(xb - b.x)));
        done++;
      })(),
      (function* () {
        while (done < 2) {
          notice();
          yield;
        }
      })(),
    ]);
  } else {
    const host = d.host ?? a;
    const guest = host === a ? b : a;
    const dir = guest === b ? 1 : -1;
    const stop = inX(guest, host.x + dir * (roomFor(a, b) + 2.2 * avgW));
    let arrived = false;
    yield* all([
      (function* () {
        yield* travel(S, guest, stop, pace(guest, Math.abs(stop - guest.x)));
        arrived = true;
      })(),
      (function* () {
        while (!arrived) {   // the host turns toward the guest once the guest is in view
          if (guest.x + guest.halfW > vp.x && guest.x - guest.halfW < vp.x + vp.w) host.pose.faceX += dir * 10;
          notice();
          yield;
        }
      })(),
    ]);
  }
  d.met = true;
  a.mode = b.mode = 'duet';
  S.emit(a, { type: 'meet', pair: true, with: b.slug });
  // 1 · notice
  yield* during(S, 1.0, u => {
    for (const [ch, dir] of [[a, 1], [b, -1]] as const) {
      const p = ch.pose;
      p.faceX += dir * 10;
      p.mouth = 'mouth-o';
      p.rise += 12 * Math.sin(Math.PI * clamp(u / 0.4, 0, 1));
      if (u > 0.6 && u < 0.7) p.eyes = 'shut';
    }
  });
  // 2 · close in, to about half a body apart (room for the three waves between them)
  let variant: MeetVariant = d.variant || (['none', 'note', 'five'] as const)[Math.floor(S.rand() * 3)];
  const inner = (ch: Puppet, side: ArmSide) => Math.abs(ch.arm(side).pivot[0] - ch.rig.gx) * ch.k;
  const rA = a.arm('R').len * 0.82 * a.k;   // brad to mitten centre, px
  const rB = b.arm('L').len * 0.82 * b.k;
  const D = roomFor(a, b) + 0.55 * avgW;
  const mid = clamp((a.x + b.x) / 2, vp.x + D / 2 + a.halfW, vp.x + vp.w - D / 2 - b.halfW);
  yield* all([walkTo(S, a, mid - D / 2, 0.8), walkTo(S, b, mid + D / 2, 0.8)]);
  const edges = () => [a.x + (a.rig.torso.x + a.rig.torso.w - a.rig.gx) * a.k, b.x + (b.rig.torso.x - b.rig.gx) * b.k];
  const face = (u = 1) => {
    a.pose.faceX += 10 * u;
    b.pose.faceX -= 10 * u;
  };
  // 3 · wave
  yield* during(S, 1.5, (u, t) => {
    const e = bell(u, 0.2);
    face();
    a.setLift('R', lerp(a.arm('R').rest, 140 + 16 * Math.sin(t * 13), e));
    b.setLift('L', lerp(b.arm('L').rest, 140 + 16 * Math.sin(t * 13 + 1), e));
    a.pose.mouth = b.pose.mouth = 'mouth-o';
  });
  // 4 · resonate: the same rhythm, three wavy lines between them, a blush
  const beats = 2 + (S.rand() < 0.5 ? 1 : 0);
  const period = 0.7;
  const waves = S.prop('waves', d, a);
  S.emit(a, { type: 'act', act: 'resonate', pair: true, with: b.slug });
  yield* during(S, beats * period + 0.3, (u, t) => {
    const bt = Math.max(0, t - 0.15) / period;
    const ph = bt % 1;
    const on = t > 0.15 && bt < beats;
    for (const ch of [a, b]) {
      const p = ch.pose;
      if (on) {
        p.rise += 10 * Math.sin(Math.PI * ph);
        p.sy *= 1 - 0.05 * (1 - Math.sin(Math.PI * ph));
      }
      if (on && ph > 0.2 && ph < 0.8) p.eyes = 'shut';
      p.blush = Math.max(p.blush, smooth(t / period));
      p.mouth = 'mouth';
    }
    face();
    const [, ay] = a.facePage();
    const [, by] = b.facePage();
    const [ex, fx] = edges();
    const span = ((fx - ex) / k) * 0.8;
    const s = clamp(span / 85, 0.85, 1.6);
    const [x, y] = S.clearOf((ex + fx) / 2, (ay + by) / 2, 100 * k * s, 44 * k * s) || [(ex + fx) / 2, (ay + by) / 2];
    waves.wave(x, y, k, bell(u, 0.15), on ? ph : 0, span);
  });
  waves.remove();
  for (const ch of [a, b]) ch.blushHold = 0.8;
  // 5 · a note, or a touch of mittens (碰碰手): step in within mitten reach first
  if (variant !== 'none') {   // the inner brads must come within both mittens' reach
    const dy = Math.abs(a.pagePoint(...a.arm('R').pivot)[1] - b.pagePoint(...b.arm('L').pivot)[1]);
    const span = 0.95 * (rA + rB);
    const dx = span > dy ? Math.sqrt(span * span - dy * dy) : -1;
    const D2 = inner(a, 'R') + inner(b, 'L') + dx;
    if (variant === 'five' && D2 < roomFor(a, b)) variant = 'note';   // arms too short for this pair: a note instead
    const D3 = clamp(D2, roomFor(a, b) + (variant === 'note' ? 0.12 * avgW : 0), D);
    const m2 = (a.x + b.x) / 2;
    if (D3 < D - 2) yield* all([walkTo(S, a, m2 - D3 / 2, 0.6), walkTo(S, b, m2 + D3 / 2, 0.6)]);
  }
  let kept: Kept | null = null;
  if (variant === 'note') {
    const giver = S.rand() < 0.5 ? a : b;
    const taker = giver === a ? b : a;
    const gs: ArmSide = giver === a ? 'R' : 'L';
    const ts: ArmSide = taker === a ? 'R' : 'L';
    const os: ArmSide = ts === 'R' ? 'L' : 'R';
    S.emit(giver, { type: 'act', act: 'note', with: taker.slug });
    const note = S.prop('note', d, giver);
    const aimAt = (ch: Puppet, side: ArmSide, other: Puppet) => {
      const [bx, by] = ch.pagePoint(...ch.arm(side).pivot);
      const [ox, oy] = other.pagePoint(...other.arm(side === 'L' ? 'R' : 'L').pivot);
      return aimLift(side, Math.atan2((oy + by) / 2 - by - 4 * k, ox - bx) / DEG);
    };
    const held = { ch: taker, side: ts, note, k: k * NOTE_SIZE, tilt: ts === 'R' ? -7 : 7 };
    // the hand-over: from the giver's mitten into the taker's, which stays held out once it has it
    yield* during(S, 2.2, u => {
      face();
      giver.setLift(gs, lerp(giver.arm(gs).rest, aimAt(giver, gs, taker), bell(u, 0.14, 0.3)));
      taker.setLift(ts, lerp(taker.arm(ts).rest, aimAt(taker, ts, giver), smooth((u - 0.18) / 0.2)));
      const [gx, gy] = giver.mitten(gs);
      const [tx, ty] = taker.mitten(ts);
      const m = smooth((u - 0.28) / 0.38);
      note.at(lerp(gx, tx, m), lerp(gy, ty, m) - 10 * k * Math.sin(Math.PI * m), k * NOTE_SIZE, smooth(u / 0.14), 0);
      if (u > 0.62) taker.pose.mouth = 'mouth-o';
    });
    // the taker draws it in before its chest, the other mitten cupped over it, looks down at it, and is moved: eyes
    // shut, a full blush, a slow sway, for about a second (the owner, 2026-10-29: it used to go up onto its head at once)
    const out = aimAt(taker, ts, giver);
    yield* during(S, 2.0, (u, t) => {
      face();
      const p = taker.pose;
      const e = smooth(t / 0.5);
      taker.setLift(ts, lerp(out, chestLift(taker, ts), e));
      taker.setLift(os, lerp(taker.arm(os).rest, chestLift(taker, os), 0.85 * smooth((t - 0.1) / 0.5)));
      p.front = true;
      p.blush = Math.max(p.blush, smooth(t / 0.6));
      const moved = smooth((t - 0.6) / 0.3);
      p.faceY += 6 * e - 2 * moved;
      if (t < 0.6) p.mouth = 'mouth-o';
      else {
        p.eyes = 'shut';
        p.blush = 1;
        p.tilt += 3.5 * Math.sin((2 * Math.PI * (t - 0.6)) / 1.4) * moved * smooth((2.0 - t) / 0.3);
        const hug = bell((t - 0.6) / 1.4, 0.3, 0.4);   // hugs it, a little: narrower and shorter for a moment
        p.sx *= 1 - 0.02 * hug;
        p.sy *= 1 - 0.035 * hug;
        p.rise += 4 * Math.sin(Math.PI * clamp((t - 0.6) / 0.4, 0, 1));
      }
      // the giver watches it land, glad: a smile, a blush, its eyes shut for a moment
      const g = giver.pose;
      g.blush = Math.max(g.blush, 0.7);
      if (t > 0.9 && t < 1.5) g.eyes = 'shut';
      holdAt(held, e);
    });
    // a small bow each, the taker first, its note still held: a thank-you and a goodbye
    yield* during(S, 1.2, (u, t) => {
      face();
      taker.setLift(ts, chestLift(taker, ts));
      taker.setLift(os, lerp(taker.arm(os).rest, chestLift(taker, os), 0.85));
      taker.pose.front = true;
      for (const [ch, at] of [[taker, 0], [giver, 0.3]] as const) {
        const bow = bell(clamp((t - at) / 0.7, 0, 1), 0.4, 0.5);
        ch.pose.faceY += 6 * bow;
        ch.pose.sy *= 1 - 0.04 * bow;
        if (bow > 0.6) ch.pose.eyes = 'shut';
      }
      taker.pose.blush = Math.max(taker.pose.blush, 0.9);
      holdAt(held, 1);
    });
    kept = held;
  } else if (variant === 'five') {
    S.emit(a, { type: 'act', act: 'five', pair: true, with: b.slug });
    const burst = S.prop('burst', d, a);
    yield* during(S, 1.7, u => {
      face();
      // where the mittens meet: between the brads (nearer the shorter arm), raised as high as both arms allow
      const [abx, aby] = a.pagePoint(...a.arm('R').pivot);
      const [bbx, bby] = b.pagePoint(...b.arm('L').pivot);
      const f = rA / (rA + rB);
      const cx = lerp(abx, bbx, f);
      const cy = lerp(aby, bby, f);
      const up = 0.85 * Math.sqrt(Math.max(0, Math.min(rA * rA - (cx - abx) ** 2 - (cy - aby) ** 2, rB * rB - (cx - bbx) ** 2 - (cy - bby) ** 2)));
      const mx = cx;
      const my = cy - up;
      const e = bell(u, 0.3, 0.3);
      a.setLift('R', lerp(a.arm('R').rest, aimLift('R', Math.atan2(my - aby, mx - abx) / DEG), e));
      b.setLift('L', lerp(b.arm('L').rest, aimLift('L', Math.atan2(my - bby, mx - bbx) / DEG), e));
      const touch = bell((u - 0.36) / 0.34, 0.2, 0.5);
      a.pose.tilt += 5 * touch;
      b.pose.tilt -= 5 * touch;
      // at the touch both hop together, eyes shut, and the burst flashes in the ink that reads on that background
      const hop = Math.sin(Math.PI * clamp((u - 0.4) / 0.32, 0, 1)) * 16;
      a.pose.rise += hop;
      b.pose.rise += hop;
      if (touch > 0.3) {
        a.pose.eyes = b.pose.eyes = 'shut';
        a.pose.mouth = b.pose.mouth = 'mouth-o';
      }
      burst.at(mx, my - hop * k, k * 1.35, touch, 0);
    });
    burst.remove();
  }
  // 6 · part: each its own way, or together (at the slower one's pace, the follower never closer than a step); the
  // taker of a note walks off holding it
  const parting = function* (): Task {
    yield* during(S, kept ? 0.4 : 0.9, () => face(0.6));
    for (const ch of [a, b]) ch.mode = 'exit';
    d.together = d.together ?? S.rand() < 0.4;
    S.emit(a, { type: 'leave', pair: true, with: b.slug, together: d.together });
    const clearL = S.pathClear(a, a.x, S.offX(a, 'left')) && S.pathClear(b, b.x, S.offX(b, 'left'));
    const clearR = S.pathClear(a, a.x, S.offX(a, 'right')) && S.pathClear(b, b.x, S.offX(b, 'right'));
    if (d.together && !clearL && !clearR) d.together = false;
    if (d.together) {
      const right = clearL && clearR ? (a.x + b.x) / 2 > S.vp.x + S.vp.w / 2 : clearR;
      const dir = right ? 1 : -1;
      const lead = right ? b : a;
      const foll = right ? a : b;
      const gap = a.halfW + b.halfW + 12;
      const end = S.offX(foll, right ? 'right' : 'left');
      const v = Math.min(a.pace(), b.pace());
      const q = quick(lead, Math.abs(end - lead.x), S.o.walkLimit + 0.6);
      yield* all([travel(S, lead, end + dir * gap, (q * v) / lead.pace()),
        (function* () {
          yield* during(S, 0.25);
          yield* follow(S, foll, lead, end, (q * v) / foll.pace(), dir, gap);
        })()]);
    } else {
      const L = S.offX(a, 'left');
      const R = S.offX(b, 'right');
      // one with no way to walk off falls back onto the page and is gone then, not when the other has walked away
      const go = (ch: Puppet, x: number) => S.pathClear(ch, ch.x, x)
        ? travel(S, ch, x, quick(ch, Math.abs(x - ch.x), S.o.walkLimit))
        : (function* () {
          yield* popDown(S, ch);
          ch.gone = true;
        })();
      yield* all([go(a, L), go(b, R)]);
    }
  };
  yield* kept ? carrying(S, kept, parting()) : parting();
  a.gone = b.gone = true;
}
