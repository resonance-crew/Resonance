/**
 * Motion building blocks. A task is a generator stepped once per update (S.dt is that step in seconds); it writes the
 * frame's pose, which is reset to the stance's baseline before every step, so a task that ends leaves nothing behind.
 */
import type { Stage } from './engine';
import { bell, clamp, DEG, lerp, smooth } from './geometry';
import type { Puppet } from './puppet';
import type { ArmSide, Stance, Task } from './types';

/** A speed factor, or one read afresh every step (a pair hurrying once they notice each other). */
export type Speed = number | (() => number);
const spd = (s: Speed): number => (typeof s === 'function' ? s() : s);

/** Calls fn(u, t) every step for `dur` seconds, u from 0 to 1. */
export function* during(S: Stage, dur: number, fn?: (u: number, t: number) => void): Task {
  for (let t = 0; t < dur; t += S.dt) {
    if (fn) fn(clamp(t / dur, 0, 1), t);
    yield;
  }
}

/** Steps several tasks together until all are done. */
export function* all(gens: Task[]): Task {
  const live = gens.map(g => ({ g, done: false }));
  for (;;) {
    for (const x of live) if (!x.done) x.done = x.g.next().done === true;
    if (live.every(x => x.done)) return;
    yield;
  }
}

/** An absolute screen angle (0 = right, 90 = down) → that arm's lift, in [-90, 270). */
export function aimLift(side: ArmSide, deg: number): number {
  const raw = side === 'L' ? deg - 90 : 90 - deg;
  return ((raw + 450) % 360) - 90;
}

export const mouthOpen = (ch: Puppet): 'mouth-open' | 'mouth-o' => (ch.rig.has('mouth-open') ? 'mouth-open' : 'mouth-o');

function walkPose(ch: Puppet, dir: number, amp: number): void {
  const p = ch.pose;
  const g = ch.gait;
  const s = Math.sin(ch.phase);
  const a = g.swing * amp * s;
  p.legL += -dir * a;
  p.legR += dir * a;
  p.rise -= ch.rig.legLen * (1 - Math.cos(a * DEG));   // spread legs lower the hips: the feet stay down
  p.liftL += dir * g.arm * amp * s;
  p.liftR += dir * g.arm * amp * s;
  p.tilt += dir * 4 * amp;
  p.faceX += dir * 10 * Math.min(1, amp * 2);
  p.bodyUp += 2.5 * amp * Math.abs(Math.cos(ch.phase));
}

/** A speed factor that gets `dist` px walked (or hopped) in about `limit` seconds: a scurry, never more than 2.6×. */
export function quick(ch: Puppet, dist: number, limit: number): number {
  const v = ch.pace() * (1 + 0.35 * smooth((dist - 220) / 360));   // with the trot a long way gets anyway
  return clamp(dist / (v * limit), 1, 2.6);
}

export function* walkTo(S: Stage, ch: Puppet, x1: number, speed: Speed = 1): Task {
  const dir = Math.sign(x1 - ch.x) || 1;
  const k = ch.k;
  const stridePx = ch.gait.stride * k;
  let t = 0;
  for (;;) {
    const rem = Math.abs(x1 - ch.x);
    if (rem < 0.5) {
      ch.x = x1;
      ch.y = ch.surface(ch.x);
      return;
    }
    const hurry = 1 + 0.8 * smooth((rem - 220) / 360);   // trot while far away, so long walks don't eat the visit
    const v = ch.gait.speed * k * spd(speed) * hurry * smooth(0.35 + t / 0.25);
    const step = Math.min(rem, v * S.dt);
    ch.x += dir * step;
    ch.y = ch.surface(ch.x);
    ch.phase += (step / stridePx) * Math.PI;
    walkPose(ch, dir, smooth(t / 0.15) * smooth(rem / (stridePx * 0.5)));
    yield;
    t += S.dt;
  }
}

export function* hopTo(S: Stage, ch: Puppet, x1: number, speed: Speed = 1): Task {
  while (Math.abs(x1 - ch.x) > 0.5) {
    const rem = Math.abs(x1 - ch.x);
    const far = 1 + 0.7 * smooth((rem - 220) / 360);   // longer hops while far away
    const sp = spd(speed);
    const dir = Math.sign(x1 - ch.x);
    const len = Math.min(rem, ch.gait.hopLen * ch.k * far * Math.sqrt(sp));
    const x0 = ch.x;
    const tm = Math.sqrt(sp);   // a hurried hop is both longer and quicker
    yield* during(S, 0.08 / tm, u => {
      const p = ch.pose;
      p.sy *= 1 - 0.1 * u;
      p.sx *= 1 + 0.05 * u;
      p.faceX += dir * 10;
    });
    yield* during(S, 0.32 / tm, u => {
      ch.x = x0 + dir * len * u;
      ch.y = ch.surface(ch.x);
      const q = ch.pose;
      q.rise += ch.gait.hopH * Math.sin(Math.PI * u);
      q.legS *= 0.82;
      q.legL += -dir * 8;
      q.legR += -dir * 8;
      q.liftL += 28 * Math.sin(Math.PI * u);
      q.liftR += 28 * Math.sin(Math.PI * u);
      q.tilt += dir * 6;
      q.faceX += dir * 10;
      q.sy *= 1 + 0.05 * Math.sin(Math.PI * u);
    });
    ch.x = x0 + dir * len;
    ch.y = ch.surface(ch.x);
    yield* during(S, 0.1 / tm, u => {
      const p = ch.pose;
      p.sy *= 1 - 0.09 * (1 - u);
      p.sx *= 1 + 0.05 * (1 - u);
      p.faceX += dir * 10;
    });
  }
}

export const travel = (S: Stage, ch: Puppet, x: number, speed: Speed): Task =>
  (ch.hop ? hopTo : walkTo)(S, ch, x, speed);

/** Walks behind `lead`, never closer than `gap` px: two leaving together, the quick one never walks through the other. */
export function* follow(S: Stage, ch: Puppet, lead: Puppet, x1: number, speed: Speed, dir: number, gap: number): Task {
  const g = travel(S, ch, x1, speed);
  for (;;) {
    const r = g.next();
    const lim = lead.x - dir * gap;
    if (dir > 0 ? ch.x > lim : ch.x < lim) {
      ch.x = lim;
      ch.y = ch.surface(ch.x);
    }
    if (r.done) return;
    yield;
  }
}

export function* idle(S: Stage, ch: Puppet, dur: number, look = 0): Task {
  yield* during(S, dur, u => {
    ch.pose.faceX += look * bell(u, 0.3);
  });
}

/**
 * Between two activities: a greeting from afar may start here (the stage pushes it on top), and a character about to
 * be greeted waits a moment for the other one to finish what it's doing.
 */
export function* pause(S: Stage, ch: Puppet, dur: number, look = 0): Task {
  ch.between = true;
  let t = 0;
  while (t < dur || (S.greetWait(ch) && t < dur + 4)) {
    ch.pose.faceX += look * bell(Math.min(1, t / dur), 0.3);
    yield;
    t += S.dt;
  }
  ch.between = false;
}

export function* changeStance(S: Stage, ch: Puppet, to: Stance, dur = 0.3): Task {
  const from = { sit: ch.sitU, floor: ch.floorU };
  yield* during(S, dur, u => {
    const e = smooth(u);
    ch.sitU = lerp(from.sit, to === 'sit' ? 1 : 0, e);
    ch.floorU = lerp(from.floor, to === 'floor' ? 1 : 0, e);
    ch.base();
    ch.pose.sy *= 1 - 0.06 * Math.sin(Math.PI * u);
  });
  ch.sitU = to === 'sit' ? 1 : 0;
  ch.floorU = to === 'floor' ? 1 : 0;
  ch.stance = to;
}
