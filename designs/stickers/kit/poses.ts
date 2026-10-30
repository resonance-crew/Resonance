/**
 * Small moves a choreography adds to a pose, each a function of t alone (so any frame stands on its own) that is 0
 * outside its span — they add up, and a sticker built from them returns to its key pose by itself. Units are the
 * engine's: rig units for faceX/faceY/rise/bodyUp/decoY, degrees for tilt/lean/lifts, factors for sx/sy/legS.
 */
import { clamp, DEG } from '../../../src/lib/mascots/geometry';
import type { Prop, PropAt } from './props';
import { MITTEN_MIDDLE, type ArmSide, type StickerPuppet } from './puppet';
import { bell, cycles, env, span, taps } from './timeline';

/** Slow breathing: `n` whole breaths across [0, duration] (a breath starts and ends level, so the loop closes). */
export function breathe(p: StickerPuppet, t: number, duration: number, n = 1, amt = 0.014): void {
  p.pose.sy *= 1 + amt * cycles(t, 0, duration, n);
}

/** A blink at `at` seconds. */
export function blink(p: StickerPuppet, t: number, at: number, len = 0.17): void {
  if (t >= at && t < at + len) p.pose.eyes = 'shut';
}

/** The face slides toward a point on the sticker (px), as the engine's does: no head turns, the face moves on the paper. */
export function lookAt(p: StickerPuppet, x: number, y: number, amt = 1): void {
  const [fx, fy] = p.pagePoint(p.rig.face[0], p.rig.face[1]);
  p.pose.faceX += clamp((x - fx) / p.k / 6, -12, 12) * amt;
  p.pose.faceY += clamp((y - fy) / p.k / 9, -8, 10) * amt;
}

/** `n` nods across [a, b]: the face dips, the paper gives a little. */
export function nod(p: StickerPuppet, t: number, a: number, b: number, n = 1, depth = 6): void {
  const v = taps(t, a, b, n);
  p.pose.faceY += depth * v;
  p.pose.sy *= 1 - 0.025 * v * (depth / 6);
}

/**
 * A bow toward the viewer: down over [a, b], held to c, up by d. The paper tips toward us about its foot (lean), the
 * face slides down it, the deco tips forward, the knees give a little; depth 1 is a deep, polite bow.
 */
export function bow(p: StickerPuppet, t: number, a: number, b: number, c: number, d: number, depth = 1): number {
  const e = env(t, a, b, c, d);
  const q = p.pose;
  q.lean += 52 * depth * e;
  q.faceY += 12 * depth * e;
  q.sy *= 1 - 0.02 * depth * e;
  q.bodyUp -= 14 * depth * e;
  q.legS *= 1 - 0.1 * depth * e;
  q.decoY -= 12 * depth * e;
  q.decoS *= 1 + 0.07 * depth * e;
  return e;
}

/** A hop over [a, b]: a crouch, up `height` rig units (eyes free), a landing that gives. */
export function hop(p: StickerPuppet, t: number, a: number, b: number, height = 34): void {
  const u = span(t, a, b);
  if (u <= 0 || u >= 1) return;
  const q = p.pose;
  if (u < 0.22) {
    const c = Math.sin((Math.PI * u) / 0.22);
    q.sy *= 1 - 0.08 * c;
    q.sx *= 1 + 0.04 * c;
    q.legS *= 1 - 0.1 * c;
  } else if (u < 0.78) {
    const v = Math.sin((Math.PI * (u - 0.22)) / 0.56);
    q.rise += height * v;
    q.sy *= 1 + 0.05 * v;
    q.legS *= 1 - 0.1 * v;
    q.liftL += 18 * v;
    q.liftR += 18 * v;
  } else {
    const c = Math.sin((Math.PI * (u - 0.78)) / 0.22);
    q.sy *= 1 - 0.07 * c;
    q.sx *= 1 + 0.035 * c;
  }
}

/** A wave hello: the arm up to `lift` over [a, a + 0.25 s], `n` waggles, down by b. */
export function wave(p: StickerPuppet, side: ArmSide, t: number, a: number, b: number, n = 2, lift = 150): void {
  const e = env(t, a, a + 0.25, b - 0.25, b);
  const rest = p.rest(side);
  p.setLift(side, rest + (lift - rest) * e + 12 * cycles(t, a + 0.25, b - 0.25, n) * e);
}

/** The arm swung from its rest toward `to` (a lift) by e (0–1). */
export function reachTo(p: StickerPuppet, side: ArmSide, to: number, e: number): void {
  const rest = p.rest(side);
  p.setLift(side, rest + (to - rest) * clamp(e, 0, 1));
}

/** A happy squeeze: eyes shut in arcs, a fuller blush, the paper a touch shorter and wider (the engine's "moved"). */
export function moved(p: StickerPuppet, e: number): void {
  const q = p.pose;
  if (e > 0.35) q.eyes = 'shut';
  q.blush = Math.max(q.blush, e);
  q.sx *= 1 + 0.015 * e;
  q.sy *= 1 - 0.03 * e;
}

/**
 * A prop held in a mitten: its `grip` anchor (or the one given) at the mitten's middle. `turn` turns it with the arm
 * (0: it stays as drawn, upright; 1: it turns as the arm does from hanging down).
 */
export function hold(prop: Prop, p: StickerPuppet, side: ArmSide, o: Partial<PropAt> & { turn?: number; at?: number } = {}): [number, number] {
  const [x, y, ang] = p.mitten(side, o.at ?? MITTEN_MIDDLE);
  const rot = (o.rot ?? 0) + (o.turn ?? 0) * (ang - 90);
  prop.at(x, y, { k: p.k, anchor: 'grip', ...o, rot });
  return [x, y];
}

/** A point `d` px from (x, y) at `deg` (0 = right, 90 = down). */
export function polar(x: number, y: number, d: number, deg: number): [number, number] {
  return [x + Math.cos(deg * DEG) * d, y + Math.sin(deg * DEG) * d];
}

export { bell, env, span, taps };
