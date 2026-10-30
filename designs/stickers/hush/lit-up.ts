/**
 * 悄悄 · 心裡亮了一下 That lit me up — something it heard lands in its heart: a warm glow opens at its chest, and from
 * there the light climbs into its sky star by star, slowly at first and then quicker, each pin-prick lighting with a
 * small glint, until all eleven are lit; it draws a small breath, its whole sky blooms and it shuts its eyes, smiling
 * and warm. Then the light settles. The stars are the event: its arms stay down at its sides (folded on its front they
 * would read as good-night's sleep, flung out as 聆聆's so-moved).
 * Key pose: standing, a small smile, its stars unlit.
 *
 * The body moves on 4 frames (the breath in and out); every star is a small change on a frame of its own, and the
 * bloom and the fade ride the body's frames.
 */
import { blink, defineSticker, fr, keys, snap, type Prop, type PropDef, type StickerPuppet } from '../kit';
import { TWINKLE } from './_local';
import night from '../parts/night/manifest.json';

/** Its stars, as the parts' manifest has them: centre and size, rig units. */
const STARS = (night as unknown as { stars: [number, number, number][] }).stars;
/** Which star lights on which frame: from the chest up into its sky, the gaps closing as the light climbs. */
const LIGHT: readonly (readonly [number, number])[] = [
  [9, 5], [10, 6], [7, 8], [8, 9], [4, 10], [5, 11], [2, 12], [3, 13], [0, 14], [6, 15], [1, 15],
];
/** Its chest, where the light starts (rig units): under the mouth, between its two low stars. */
const CHEST: [number, number] = [352, 520];

/** One glint prop per star (`t0` … `t10`). */
type Glint = `t${number}`;
const GLINTS = Object.fromEntries(STARS.map((_, i) => [`t${i}`, { kind: TWINKLE, seed: 20 + i }])) as Record<Glint, PropDef<'hush'>>;

/** Each star's light this frame, with its glint: up from its own frame, held, then the fade (all together). */
function stars(h: StickerPuppet, f: number, fade: number, glints: Record<Glint, Prop>): void {
  for (const [star, at] of LIGHT) {
    if (f < at) continue;
    h.pose.extra[`star-glow-${star}`] = (f === at ? 0.6 : 1) * fade;
    const [ux, uy, r] = STARS[star];
    const pop = f === at ? 1.25 : 1;
    if (fade > 0) glints[`t${star}`].at(...h.pagePoint(ux, uy), { k: h.k * (0.62 + r * 0.09) }).set({ show: pop * Math.min(1, fade * 1.2) });
  }
}

export default defineSticker({
  duration: 2.5,
  // the thumb: all its stars lit and glinting, eyes shut, smiling
  hero: fr(18),
  cast: { hush: { slug: 'night', x: 216, ground: 410, k: 0.87 } },
  props: {
    heart: { kind: 'heart', seed: 9, inside: { puppet: 'hush', above: 'torso' } },
    ...GLINTS,
  },
  frame(t, { hush }, props) {
    const p = hush.pose;
    const f = Math.round(t * 12);
    // the breath: in as the last stars light (f15–16), held through the bloom, out as the light settles (f23–24)
    const tb = snap(t, [0, fr(15), fr(16), fr(23), fr(24)]);
    const up = keys(tb, [[0, 0], [fr(15), 0.6], [fr(16), 1], [fr(22), 1], [fr(23), 0.35], [fr(24), 0]]);
    p.sy *= 1 + 0.03 * up;
    p.sx *= 1 - 0.01 * up;
    p.rise += 2 * up;
    p.decoY += 3 * up;
    p.decoR -= 4 * up;
    // the glow at its heart: opens first (f2–4) and goes as the light climbs out of it into the stars (f5–7)
    const fade = keys(snap(t, [0, fr(23), fr(25), fr(27)]), [[0, 1], [fr(22), 1], [fr(23), 0.6], [fr(25), 0.3], [fr(27), 0]]);
    const warmth = keys(f, [[1, 0], [2, 0.35], [3, 0.65], [4, 0.8], [5, 0.6], [6, 0.3], [7, 0]]);
    if (warmth > 0) props.heart.at(...hush.pagePoint(...CHEST), { k: hush.k, scale: 0.55 }).set({ glow: warmth, heart: 0 });
    // the stars: one by one from the chest up (f5–15), the whole sky blooming over them (f16–22), settling (f23–27)
    stars(hush, f, fade, props);
    p.glow = keys(tb, [[0, 0], [fr(15), 0.4], [fr(16), 0.9], [fr(22), 0.9], [fr(23), 0.4], [fr(24), 0]]);
    // the face: a small "oh" as the glow opens, eyes up after the light as it climbs, then shut and smiling in the
    // bloom; the blush rising with the light
    if (f >= 3 && f < 7) p.mouth = 'mouth-o';
    p.faceY += keys(f, [[2, 0], [4, 2], [8, -2], [14, -6], [16, -2], [24, 0]]);
    p.faceX += keys(f, [[2, 0], [7, -3], [12, 3], [16, 0]]);
    if (f >= 16 && f < 24) p.eyes = 'shut';
    p.blush = keys(snap(t, [0, fr(4), fr(9), fr(13), fr(16), fr(24), fr(27)]), [[0, 0.3], [fr(4), 0.5], [fr(9), 0.7], [fr(13), 0.9], [fr(16), 1.5], [fr(23), 1.5], [fr(24), 0.9], [fr(27), 0.3]]);
    blink(hush, t, fr(27), fr(1));
  },
});
