/**
 * 悄悄 · 我在這裡 I'm here — I'm here with you: its pin-prick stars begin to glow, warm and soft, a mitten comes to rest
 * on its front over its heart and the other comes up beside its head in a small, slow wave, its face tipped a little
 * toward you, smiling and blushing, a slow blink; its stars twinkle one by one as it waves. Then the light settles
 * and its mittens come down.
 * Key pose: standing, a small smile, its stars unlit.
 *
 * The body moves on 4 frames (a small tip toward you, and back); the arms on 11 (up, the wave on threes, down), and
 * the glow and the twinkles change on the arms' frames.
 */
import { defineSticker, fr, keys, snap } from '../kit';

/**
 * The waving arm's lift (its right, under its moon: up and out beside its head, as high as its short arms go — the left
 * is listening's cupped mitten), and how far each waggle swings.
 */
const WAVE = 150;
const SWING = 11;
/** The other mitten resting on its front, over its heart (a lift past straight down, toward the middle). */
const HEART = -42;
/** Its stars twinkling one at a time while it waves: [star, from frame, to frame]. */
const TWINKLES: readonly (readonly [number, number][])[] = [[[0, 1]], [[0, 0.4], [8, 1]], [[8, 0.4], [3, 1]], [[3, 0.4], [7, 1]], [[7, 0.4]]];
/** The frames the wave and the twinkles change on (slow, on threes); the arm holds between. */
const BEATS = [7, 10, 13, 16, 19];

export default defineSticker({
  duration: 2.5,
  // the thumb: mid-wave, a mitten on its heart, its stars aglow, smiling at you
  hero: fr(9),
  cast: { hush: { slug: 'night', x: 212, ground: 410, k: 0.8 } },
  frame(t, { hush }) {
    const p = hush.pose;
    const f = Math.round(t * 12);
    // tipped a little toward you (f4–5) while it waves, and back (f22–23)
    const tb = snap(t, [0, fr(4), fr(5), fr(22), fr(23)]);
    const tip = keys(tb, [[0, 0], [fr(4), 0.5], [fr(5), 1], [fr(21), 1], [fr(22), 0.5], [fr(23), 0]]);
    p.tilt += 3 * tip;
    p.lean += 7 * tip;
    p.faceY += 2 * tip;
    // the arms: up (f3–5), a small slow wave on threes (f7–19), down (f20–22)
    const ta = snap(t, [0, fr(3), fr(4), fr(5), ...BEATS.map(fr), fr(20), fr(21), fr(22)]);
    const restL = hush.rest('L');
    const restR = hush.rest('R');
    p.liftR = keys(ta, [
      [0, restR], [fr(3), 74], [fr(4), 128], [fr(5), WAVE],
      [fr(7), WAVE + SWING], [fr(10), WAVE - SWING], [fr(13), WAVE + SWING], [fr(16), WAVE - SWING],
      [fr(19), WAVE], [fr(20), 120], [fr(21), 64], [fr(22), restR],
    ]);
    p.liftL = keys(ta, [[0, restL], [fr(3), 12], [fr(4), -24], [fr(5), HEART], [fr(19), HEART], [fr(20), -24], [fr(21), 12], [fr(22), restL]]);
    p.front = true;
    // its stars: a warm, soft glow (up with the arms f3–5, down with them f20–22), and a few twinkling on their own
    // in time with the wave
    p.glow = keys(ta, [[0, 0], [fr(3), 0.25], [fr(4), 0.5], [fr(5), 0.7], [fr(19), 0.7], [fr(20), 0.45], [fr(21), 0.2], [fr(22), 0]]);
    const beat = BEATS.filter(b => b <= f).length - 1;
    if (beat >= 0 && f < 22) for (const [star, v] of TWINKLES[beat]) p.extra[`star-glow-${star}`] = v;
    // the face: toward you, smiling, blushing; a slow blink
    p.faceX += 3 * tip;
    p.blush = keys(ta, [[0, 0.3], [fr(3), 0.6], [fr(5), 1], [fr(19), 1], [fr(21), 0.6], [fr(22), 0.3]]);
    if (f >= 13 && f < 16) p.eyes = 'shut';
  },
});
