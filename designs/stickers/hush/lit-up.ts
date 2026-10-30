/**
 * 悄悄 · 心裡亮了一下 That lit me up — something it heard lands: one pin-prick star in the middle of its sky lights,
 * then the next, and the light spreads star by star, slowly at first and then quicker, until all eleven are lit; it
 * draws a small breath, its whole sky blooms (a few sparkles spill past its edge), and it shuts its eyes, smiling and
 * warm. Then the light settles.
 * Key pose: standing, a small smile, its stars unlit.
 *
 * The body moves on 4 frames (the breath in and out); every star is a small change on a frame of its own, and the
 * bloom and the fade ride the body's frames.
 */
import { blink, defineSticker, fr, keys, snap, type StickerPuppet } from '../kit';

/**
 * Which star lights on which frame: from the middle of its sky outward, the gaps closing as the light spreads. (Star 9's
 * glow carries a copy of star 0's cross — the parts share an x — so star 0 always lights first.)
 */
const LIGHT: readonly (readonly [number, number])[] = [
  [5, 3], [0, 5], [3, 7], [1, 8], [2, 9], [6, 10], [4, 11], [8, 12], [7, 13], [9, 14], [10, 15],
];

/** One star's light this frame: up over two frames from its own, held, then the fade (f23–27, all together). */
function stars(h: StickerPuppet, f: number, fade: number): void {
  for (const [star, at] of LIGHT) {
    const on = f < at ? 0 : f === at ? 0.55 : 1;
    if (on > 0) h.pose.extra[`star-glow-${star}`] = on * fade;
  }
}

export default defineSticker({
  duration: 2.5,
  // the thumb: all its stars lit and blooming, eyes shut, smiling
  hero: fr(18),
  cast: { hush: { slug: 'night', x: 216, ground: 404, k: 0.8 } },
  props: {
    s1: { kind: 'sparkle', seed: 3 },
    s2: { kind: 'sparkle', seed: 4 },
    s3: { kind: 'sparkle', seed: 5 },
  },
  frame(t, { hush }, { s1, s2, s3 }) {
    const p = hush.pose;
    const f = Math.round(t * 12);
    // the breath: up as the last star lights (f15–16), held through the bloom, down as the light settles (f23–24)
    const tb = snap(t, [0, fr(15), fr(16), fr(23), fr(24)]);
    const up = keys(tb, [[0, 0], [fr(15), 0.6], [fr(16), 1], [fr(22), 1], [fr(23), 0.35], [fr(24), 0]]);
    p.sy *= 1 + 0.035 * up;
    p.sx *= 1 - 0.012 * up;
    p.rise += 3 * up;
    p.decoY += 3 * up;
    p.decoR -= 4 * up;
    p.liftL = hush.rest('L') + 34 * up;
    p.liftR = hush.rest('R') + 34 * up;
    // the light: star by star (f3–15), the whole sky blooming over them (f16–22), settling in steps (f23, 25, 27)
    const fade = keys(snap(t, [0, fr(23), fr(25), fr(27)]), [[0, 1], [fr(22), 1], [fr(23), 0.6], [fr(25), 0.3], [fr(27), 0]]);
    stars(hush, f, fade);
    p.glow = keys(tb, [[0, 0], [fr(15), 0.4], [fr(16), 0.9], [fr(22), 0.9], [fr(23), 0.4], [fr(24), 0]]);
    // in the bloom the light spills past its edge: three paper sparkles round its dome, grown in and out on the
    // breath's frames (they lie far apart: on a frame of their own they would store the whole width between them)
    const spill = keys(tb, [[0, 0], [fr(15), 0.55], [fr(16), 1], [fr(22), 1], [fr(23), 0.45], [fr(24), 0]]);
    for (const [sp, ux, uy, size] of [[s1, 166, 326, 1.35], [s2, 352, 250, 1.1], [s3, 548, 372, 1.25]] as const) {
      if (spill > 0) sp.at(...hush.pagePoint(ux, uy), { k: hush.k * size }).set({ show: spill });
    }
    // the face: a small "oh" at the first star, eyes up toward the light as it spreads, then shut and smiling in the
    // bloom; the blush rising with the light
    if (f >= 4 && f < 9) p.mouth = 'mouth-o';
    p.faceY += keys(f, [[3, 0], [5, -4], [14, -6], [16, -2], [24, 0]]);
    p.faceX += keys(f, [[3, 0], [6, -3], [12, 3], [16, 0]]);
    if (f >= 16 && f < 24) p.eyes = 'shut';
    p.blush = keys(snap(t, [0, fr(5), fr(9), fr(13), fr(16), fr(24), fr(27)]), [[0, 0.3], [fr(5), 0.5], [fr(9), 0.7], [fr(13), 0.9], [fr(16), 1.5], [fr(23), 1.5], [fr(24), 0.9], [fr(27), 0.3]]);
    blink(hush, t, fr(27), fr(1));
  },
});
