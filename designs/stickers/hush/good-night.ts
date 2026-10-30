/**
 * 悄悄 · 晚安 Good night — heavy-lidded, it gathers itself into a slow yawn (taller, mittens out, its little "o"),
 * rubs one eye, and nods off where it stands: eyes in naps, mittens folded on its front, its pin-prick stars glowing
 * and a few pencil z's. Then it stirs, half awake again.
 * Key pose: standing, sleepy eyes, a small smile.
 *
 * The body moves on 9 frames (up 2, down 2, nodding off 2, stirring 3) and every big change — the stars' glow, the
 * arms — rides those frames; between them only a mitten, the eyes, a star or the z's change.
 */
import { defineSticker, fr, keys, snap } from '../kit';

/** The arms folded on its front while it sleeps (a lift past straight down, toward the middle). */
const FOLD = -46;
/** Its stars twinkling one at a time while it sleeps: [star, from frame, to frame]. */
const TWINKLES: readonly (readonly [number, number, number])[] = [[0, 21, 25], [8, 23, 27], [3, 22, 25], [7, 24, 27]];

export default defineSticker({
  duration: 2.5,
  // the thumb: asleep where it stands, its stars aglow, its z's up
  hero: fr(24),
  cast: { hush: { slug: 'night', x: 214, ground: 410, k: 0.83 } },
  props: { zz: { kind: 'zz', seed: 3 } },
  frame(t, { hush }, { zz }) {
    const p = hush.pose;
    const k = hush.k;
    const tb = snap(t, [0, fr(5), fr(6), fr(12), fr(13), fr(19), fr(20), fr(26), fr(27), fr(28)]);
    // the yawn: up on 5–6, held, down on 12–13 (a touch below its rest at 12)
    const up = keys(tb, [[0, 0], [fr(5), 0.6], [fr(6), 1], [fr(11), 1], [fr(12), -0.25], [fr(13), 0]]);
    const tall = Math.max(0, up);
    p.sy *= 1 + 0.06 * tall - 0.03 * Math.max(0, -up);
    p.sx *= 1 - 0.025 * tall + 0.015 * Math.max(0, -up);
    p.rise += 5 * tall;
    p.legS *= 1 + 0.04 * tall;
    p.decoY += 4 * tall;
    p.faceY -= 4 * tall;
    // nodding off: the body droops toward its moon on 19–20, holds, and comes slowly up again on 26–28
    const sleep = keys(tb, [[0, 0], [fr(18), 0], [fr(19), 0.55], [fr(20), 1], [fr(25), 1], [fr(26), 0.7], [fr(27), 0.35], [fr(28), 0]]);
    p.tilt += 6 * sleep;
    p.faceY += 6 * sleep;
    p.sy *= 1 - 0.02 * sleep;
    // the arms: up and out with the yawn, then the left mitten rubs its eye (14–18, on twos: only the arm moves), then
    // both fold on its front while it sleeps
    const rest = hush.rest('L');
    // (the arms lead the body up, so on the way they never stand out flat, past the sticker's edge)
    const reach = Math.min(1, tall * 1.4);
    let lL = rest + (138 - rest) * reach;
    let lR = rest + (138 - rest) * reach;
    const ts = Math.round(t * 12);
    if (ts >= 14 && ts <= 18) {
      const [ex, ey] = hush.pagePoint(286, 426);
      const wob = [[4, -2], [4, -2], [-3, -6], [-3, -6], [0, 0]][ts - 14];
      lL = hush.aim('L', ex + wob[0] * k, ey + wob[1] * k);
      p.front = true;
    }
    lL += (FOLD - lL) * sleep;
    lR += (FOLD - lR) * sleep;
    p.liftL = lL;
    p.liftR = lR;
    if (sleep > 0) p.front = true;
    // the face: heavy lids; shut tight for the yawn's "o"; asleep in naps (the mouth a small smile)
    p.eyes = 'sleepy';
    if (tall > 0.5) {
      p.eyes = 'nap';
      p.mouth = 'mouth-o';
    }
    if (sleep > 0.5) p.eyes = 'nap';
    p.blush = 0.3 + 0.3 * sleep;
    // the stars glow as it falls asleep (on the body's frames), and a few twinkle on their own while it sleeps
    p.glow = keys(tb, [[0, 0], [fr(6), 0.25], [fr(13), 0.5], [fr(20), 1], [fr(25), 1], [fr(26), 0.65], [fr(27), 0.3], [fr(28), 0]]);
    for (const [star, a, b] of TWINKLES) {
      const u = (ts - a) / (b - a);
      if (u > 0 && u < 1) p.extra[`star-glow-${star}`] = Math.sin(Math.PI * u);
    }
    // the z's: grown in beside its head while it sleeps, drifting up a little (on twos), gone by scale as it stirs
    if (ts >= 20 && ts < 28) {
      const [hx, hy] = hush.pagePoint(214, 320);
      const grow = keys(ts, [[20, 0.4], [21, 0.8], [22, 1], [25, 1], [26, 0.65], [27, 0.3]]);
      zz.at(hx, hy - 3 * Math.floor((ts - 20) / 2) * k, { k, scale: 1.5 * grow }).set({ draw: 1 });
    }
  },
});
