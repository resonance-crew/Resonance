/**
 * 悄悄 · 我在這裡 I'm here — a star on its side brightens; it reaches up round its side, takes the star's light in its
 * mitten and raises it straight up, a round warm glow, swaying it slowly twice — over here — its eyes on you. Then it
 * brings the light back down to where it lives.
 * Key pose: standing, a small smile, its stars unlit.
 *
 * The body never moves: the arm, the glow, the star and the face do. The arm moves on 15 frames, the glow with it;
 * between them only the glow breathes.
 */
import { defineSticker, fr, hold, keys, snap } from '../kit';
import { GLOW } from './_local';

/** The star on its left side (rig units) the light is taken from and put back: within the left mitten's reach. */
const STAR = 4;
const STAR_AT: [number, number] = [238, 406];
/** The arm raised straight up (a lift: 180 is straight up; a little short of it keeps the glow off its dome). */
const UP = 168;

export default defineSticker({
  duration: 2.5,
  // the thumb: the light raised high at its fullest glow, its eyes on you
  hero: fr(10),
  cast: { hush: { slug: 'night', x: 226, ground: 410, k: 0.8 } },
  props: { glow: { kind: GLOW, seed: 6 } },
  frame(t, { hush }, { glow }) {
    const p = hush.pose;
    const f = Math.round(t * 12);
    const [sx, sy] = hush.pagePoint(...STAR_AT);
    const atStar = hush.aim('L', sx, sy);
    // the arm: up round its side to the star (f4–6), up with the light (f7–9), two slow sways on twos (f11–19), back
    // to the star (f23–24), down to rest (f25–26)
    const ta = snap(t, [0, fr(4), fr(5), fr(6), fr(7), fr(8), fr(9), fr(11), fr(13), fr(15), fr(17), fr(19), fr(23), fr(24), fr(25), fr(26)]);
    const rest = hush.rest('L');
    const SWAY = 9;
    p.liftL = keys(ta, [
      [0, rest], [fr(4), 100], [fr(5), 160], [fr(6), atStar], [fr(7), atStar - 14], [fr(8), UP + 6], [fr(9), UP],
      [fr(10), UP], [fr(11), UP + SWAY], [fr(13), UP - SWAY], [fr(15), UP + SWAY], [fr(17), UP - SWAY], [fr(19), UP],
      [fr(22), UP], [fr(23), atStar - 10], [fr(24), atStar], [fr(25), 110], [fr(26), rest],
    ]);
    p.front = true;
    // the glow: grown out of the star in the mitten (f6–9), open while raised, back into the star (f23–24)
    const size = keys(ta, [[0, 0], [fr(5), 0], [fr(6), 0.3], [fr(7), 0.55], [fr(8), 0.85], [fr(9), 1], [fr(21), 1], [fr(23), 0.5], [fr(24), 0.25], [fr(25), 0]]);
    if (size > 0) {
      const g2 = Math.floor(f / 2) * 2;
      const breath = g2 >= 10 && g2 <= 20 ? 0.1 * Math.sin(((g2 - 10) / 10) * Math.PI * 2) : 0;
      hold(glow, hush, 'L', { scale: size });
      glow.set({ glow: keys(ta, [[fr(6), 0], [fr(7), 0.3], [fr(9), 0.9], [fr(21), 0.9], [fr(23), 0.3]]) + breath });
    }
    // the star itself: brightens to call (f2–3), its light goes into the mitten, comes back with it and settles
    p.extra[`star-glow-${STAR}`] = keys(f, [[1, 0], [2, 0.55], [3, 1], [6, 1], [8, 0], [23, 0], [24, 1], [26, 0.5], [27, 0]]);
    // the face: a glance at the star, up at the light as it rises, then on you, smiling; a slow blink while it sways
    p.faceX += keys(f, [[1, 0], [3, -8], [7, -6], [10, 0], [22, 0], [24, -8], [27, 0]]);
    p.faceY += keys(f, [[1, 0], [3, 0], [7, -6], [10, -1], [22, -1], [24, 1], [27, 0]]);
    p.blush = keys(snap(t, [0, fr(3), fr(9), fr(11), fr(22), fr(26)]), [[0, 0.3], [fr(3), 0.45], [fr(9), 0.8], [fr(11), 1], [fr(22), 1], [fr(26), 0.3]]);
    if (f >= 17 && f < 19) p.eyes = f === 17 ? 'sleepy' : 'shut';
  },
});
