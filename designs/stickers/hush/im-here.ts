/**
 * 悄悄 · 我在這裡 I'm here — the big star on its shoulder brightens; it reaches up round its side, takes the star's light
 * in its mitten and holds it up beside its head like a lantern, glowing softly, breathing light, while it looks at you.
 * Then it brings the light back down to where it lives on its shoulder.
 * Key pose: standing, a small smile, its stars unlit.
 *
 * The body never moves: the arm, the lantern, the star's glow and the face do. The arm moves on 9 frames, the lantern
 * with it; while it is held up only its glow breathes, on twos.
 */
import { defineSticker, fr, hold, keys, snap } from '../kit';
import { STAR_LANTERN } from './_local';

/** Its big shoulder star (rig units): where the light is taken from and put back. */
const STAR = 8;
const STAR_AT: [number, number] = [472, 418];
/** The arm held up beside its head with the lantern (a lift: up and out to its right). */
const UP = 142;

export default defineSticker({
  duration: 2.5,
  // the thumb: the lantern held up at its fullest glow, looking at you
  hero: fr(16),
  cast: { hush: { slug: 'night', x: 186, ground: 410, k: 0.72 } },
  props: { lantern: { kind: STAR_LANTERN, seed: 6 } },
  frame(t, { hush }, { lantern }) {
    const p = hush.pose;
    const f = Math.round(t * 12);
    const [sx, sy] = hush.pagePoint(...STAR_AT);
    const atStar = hush.aim('R', sx, sy);
    // the arm: up round its side to the star (f5–7), up and out with the light (f8–10), held, back to the star
    // (f23–25), down to rest (f26–27)
    const ta = snap(t, [0, fr(5), fr(6), fr(7), fr(8), fr(9), fr(10), fr(23), fr(24), fr(25), fr(26), fr(27)]);
    const rest = hush.rest('R');
    p.liftR = keys(ta, [
      [0, rest], [fr(5), 100], [fr(6), 165], [fr(7), atStar], [fr(8), atStar - 18], [fr(9), UP + 12], [fr(10), UP],
      [fr(22), UP], [fr(23), UP + 24], [fr(24), atStar - 6], [fr(25), atStar], [fr(26), 110], [fr(27), rest],
    ]);
    p.front = true;
    // the lantern: grown out of the star in the mitten (f7–10), its glow up as it rises, breathing while held (on
    // twos), shrinking back into the star (f24–25)
    const size = keys(ta, [[0, 0], [fr(6), 0], [fr(7), 0.3], [fr(8), 0.55], [fr(9), 0.85], [fr(10), 1], [fr(22), 1], [fr(23), 0.85], [fr(24), 0.5], [fr(25), 0.25], [fr(26), 0]]);
    if (size > 0) {
      const g2 = Math.floor(f / 2) * 2;
      const breath = g2 >= 12 && g2 <= 22 ? 0.12 * Math.sin(((g2 - 12) / 10) * Math.PI * 2) : 0;
      const glow = keys(ta, [[fr(7), 0], [fr(8), 0.3], [fr(10), 0.85], [fr(22), 0.85], [fr(24), 0.2]]) + breath;
      hold(lantern, hush, 'R', { scale: size });
      lantern.set({ glow });
    }
    // the star itself: brightens to call (f3–4), its light goes into the lantern, comes back with it and settles
    p.extra[`star-glow-${STAR}`] = keys(f, [[2, 0], [3, 0.55], [4, 1], [7, 1], [9, 0], [24, 0], [25, 1], [27, 0.5], [28, 0]]);
    // the face: a glance at the star, up at the lantern as it rises, then to you, smiling; a slow blink while it holds
    p.faceX += keys(f, [[2, 0], [4, 8], [9, 10], [13, 2], [22, 2], [24, 8], [28, 0]]);
    p.faceY += keys(f, [[2, 0], [4, 0], [9, -6], [13, -1], [22, -1], [24, 1], [28, 0]]);
    p.blush = keys(snap(t, [0, fr(4), fr(10), fr(13), fr(23), fr(27)]), [[0, 0.3], [fr(4), 0.45], [fr(10), 0.8], [fr(13), 1], [fr(23), 1], [fr(27), 0.3]]);
    if (f >= 18 && f < 20) p.eyes = f === 18 ? 'sleepy' : 'shut';
  },
});
