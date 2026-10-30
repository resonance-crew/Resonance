/**
 * 摺摺 · 心暖暖 Warms my heart — it hugs a paper heart to its chest, eyes shut; the heart glows warm (paper halos
 * open behind it, a few crayon rays) and beats twice, then settles back to a soft glow.
 * Key pose: holding the heart before its chest with both mittens, smiling, a soft glow.
 *
 * The body moves on 2 frames (the squeeze and its release); the heart, its glow and the face carry the rest.
 */
import { blink, defineSticker, fr, keys, snap, step, type StickerPuppet } from '../kit';

/** The heart's centre on the chest, rig units: its top lobes just under the mouth. */
const HEART: [number, number] = [349, 526];
const SCALE = 0.9;

/** Both mittens at the heart's lower sides, holding it from behind (the heart is in front of them, its glow behind). */
function hug(tk: StickerPuppet, squeeze: number): void {
  const [hx, hy] = tk.pagePoint(HEART[0], HEART[1] + 34);
  const k = tk.k;
  tk.setLift('L', tk.aim('L', hx - (40 - 6 * squeeze) * k, hy));
  tk.setLift('R', tk.aim('R', hx + (40 - 6 * squeeze) * k, hy));
  tk.pose.front = true;
}

export default defineSticker({
  duration: 2.25,
  // the thumb: hugging the heart at its fullest glow, mid-beat
  hero: fr(12),
  cast: { tuck: { slug: 'tuck', x: 216, ground: 410, k: 0.68 } },
  props: {
    glow: { kind: 'heart', seed: 11, inside: { puppet: 'tuck', above: 'torso' } },
    heart: { kind: 'heart', seed: 11, z: 100 },
  },
  frame(t, { tuck }, { glow: halo, heart }) {
    const p = tuck.pose;
    // the squeeze: the body gives once (f4) and comes back (f19)
    const tb = snap(t, [0, fr(4), fr(19)]);
    const squeeze = tb === fr(4) ? 1 : 0;
    p.sy *= 1 - 0.03 * squeeze;
    p.sx *= 1 + 0.02 * squeeze;
    p.faceY += 2 * squeeze;
    hug(tuck, squeeze);
    // the glow: up in three steps, held, down in three; the rays only at its fullest
    const ts = step(t, 1 / 6);
    const glow = keys(snap(t, [0, fr(5), fr(7), fr(9), fr(19), fr(21), fr(23)]), [[0, 0.3], [fr(5), 0.55], [fr(7), 0.8], [fr(9), 1], [fr(18), 1], [fr(19), 0.7], [fr(21), 0.45], [fr(23), 0.3]]);
    // two beats while it glows (the heart swells and settles), squeezed a little while hugged
    const beat = t >= fr(10) && t < fr(18) ? [0, 0.6, 1, 0.3, 0, 0.6, 1, 0.3][Math.floor((t - fr(10)) * 12 + 1e-6)] ?? 0 : 0;
    const [hx, hy] = tuck.pagePoint(...HEART);
    halo.at(hx, hy, { k: tuck.k, scale: SCALE }).set({ glow, heart: 0 });
    heart.at(hx, hy, { k: tuck.k, scale: SCALE * (1 + 0.07 * beat) * (1 - 0.04 * squeeze) }).set({ glow: 0, warm: glow });
    // the face: eyes shut from the squeeze until it lets go, the blush rising with the glow
    if (t >= fr(4) && t < fr(20)) p.eyes = 'shut';
    p.blush = keys(ts, [[0, 0.4], [fr(4), 0.6], [fr(10), 1.6], [fr(18), 1.6], [fr(22), 0.4]]);
    p.faceY -= 2;
    // the fringe stirs in the warmth (a small change while the body holds)
    if (t > fr(10) && t < fr(18)) p.decoR += 2.5 * Math.sin((t - fr(10)) * Math.PI * 3);
    blink(tuck, t, fr(24), fr(2));
  },
});
