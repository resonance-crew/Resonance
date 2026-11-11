/**
 * Walking and hopping as pure functions of time (SPEC §5.2): the engine's walk (src/lib/mascots/motion.ts `walkPose`,
 * gait swing 24, arm 10, stride max(44, legLen × 1.05)) with x read from eased keys instead of integrated, so a scrub, a
 * rewind and a jump land on the same step: the legs' phase is the distance walked over the stride (feet stay planted
 * when the scroll runs it backwards), the swing's amplitude grows over the first steps and settles over the last.
 * Hops are 點點's way (the engine's hopTo: a crouch, the air, a landing that gives).
 */
import { clamp, DEG, lerp, smooth } from '@/lib/mascots/geometry';
import type { StickerPuppet } from './puppet';

/** [time, world x] keys; the way between two keys is eased (smooth). */
export type WalkKeys = readonly (readonly [number, number])[];

/** x at t through the keys (held before the first and after the last). */
export function keyX(t: number, keys: WalkKeys): number {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [t1, x1] = keys[i];
    if (t <= t1) {
      const [t0, x0] = keys[i - 1];
      return lerp(x0, x1, smooth((t - t0) / (t1 - t0)));
    }
  }
  return keys[keys.length - 1][1];
}

/** The rig's stride, rig units. */
export const strideOf = (ch: StickerPuppet) => Math.max(44, ch.rig.legLen * 1.05);

/**
 * The walk's pose at t (after base): legs swinging by the distance covered, arms swinging, a lean and a look the way
 * it walks, a little bob. `u` is px per world unit (the keys are world x). Returns x.
 */
export function walkAt(ch: StickerPuppet, t: number, keys: WalkKeys, u: number): number {
  const x = keyX(t, keys);
  // the leg this key span is on
  let i = 1;
  while (i < keys.length - 1 && t > keys[i][0]) i++;
  const [, xa] = keys[i - 1];
  const [, xb] = keys[i];
  const dir = Math.sign(xb - xa) || 1;
  const stridePx = strideOf(ch) * ch.k;
  const done = Math.abs(x - xa) * u;
  const left = Math.abs(xb - x) * u;
  if (!(t > keys[i - 1][0] && t < keys[i][0]) || Math.abs(xb - xa) < 1e-3) return x;
  const amp = smooth(done / (0.35 * stridePx)) * smooth(left / (0.5 * stridePx));
  const phase = ((Math.abs(x - keys[0][1]) * u) / stridePx) * Math.PI;
  const p = ch.pose;
  const s = Math.sin(phase);
  const a = 24 * amp * s;
  p.legL += -dir * a;
  p.legR += dir * a;
  p.rise -= ch.rig.legLen * (1 - Math.cos(a * DEG));
  p.liftL += dir * 10 * amp * s;
  p.liftR += dir * 10 * amp * s;
  p.tilt += dir * 4 * amp;
  p.faceX += dir * 10 * Math.min(1, amp * 2);
  p.bodyUp += 2.5 * amp * Math.abs(Math.cos(phase));
  return x;
}

/** One hop's pose at u (0…1 of it): a crouch, up `height` rig units, a landing that gives. */
export function hopPose(ch: StickerPuppet, u: number, dir: number, height = 44): void {
  if (u <= 0 || u >= 1) return;
  const q = ch.pose;
  const c0 = 0.17;
  const c1 = 0.78;
  if (u < c0) {
    const c = Math.sin((Math.PI * u) / c0 / 2);
    q.sy *= 1 - 0.1 * c;
    q.sx *= 1 + 0.05 * c;
    q.faceX += dir * 10;
  } else if (u < c1) {
    const v = (u - c0) / (c1 - c0);
    const lift = Math.sin(Math.PI * v);
    q.rise += height * lift;
    q.legS *= 0.82;
    q.legL += -dir * 8;
    q.legR += -dir * 8;
    q.liftL += 28 * lift;
    q.liftR += 28 * lift;
    q.tilt += dir * 6;
    q.faceX += dir * 10;
    q.sy *= 1 + 0.05 * lift;
  } else {
    const c = 1 - (u - c1) / (1 - c1);
    q.sy *= 1 - 0.09 * c;
    q.sx *= 1 + 0.05 * c;
    q.faceX += dir * 10 * c;
  }
}

/** Where a hop's way is at u: x moves only while in the air. */
export const hopX = (u: number, x0: number, x1: number) => lerp(x0, x1, smooth(clamp((u - 0.17) / 0.61, 0, 1)));

/** Hops between keys [a, b, x0, x1]: the pose of whichever is under way, and x. */
export function hopsAt(ch: StickerPuppet, t: number, hops: readonly (readonly [number, number, number, number])[], height = 44): number {
  let x = hops.length ? hops[0][2] : 0;
  for (const [a, b, x0, x1] of hops) {
    if (t < a) break;
    if (t >= b) {
      x = x1;
      continue;
    }
    const u = (t - a) / (b - a);
    hopPose(ch, u, Math.sign(x1 - x0) || 1, height);
    return hopX(u, x0, x1);
  }
  return x;
}

/** Blends the stand into a sit on an edge (e 0 stand → 1 sit): rise, legs, as the sit stance's base. */
export function sitBlend(ch: StickerPuppet, e: number): void {
  const R = ch.rig;
  const q = ch.pose;
  const v = clamp(e, 0, 1);
  q.rise += v * -(R.gy - R.tp[1] + 3);
  q.ground = q.rise;
  q.legL += 7 * v;
  q.legR -= 7 * v;
  q.legS *= 1 - 0.14 * v;
}
