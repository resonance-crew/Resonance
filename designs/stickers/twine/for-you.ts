/**
 * 牽牽 · 這是給你的 This is for you — it holds a paper flower out to you in both mittens, closed round its stem just under
 * the head. It offers it — a little dip toward you, the flower coming closer, the loops perking up — and smiles at you;
 * then it smiles wider, shy (eyes shut, the blush deeper, the loops drooping), and straightens, still holding the flower
 * out: it never takes it back.
 * Key pose: standing, holding the flower out, a small smile.
 *
 * The body moves on 3 frames (the dip down 2, up 1); the flower, the face and the loops carry the rest.
 */
import { blink, defineSticker, env, fr, keys, lerp, snap, step } from '../kit';
import { between, perk } from './_local';

/** Both mittens together before its middle, side by side over the stem. */
const TOGETHER = -37;
/**
 * Where the mittens close on the stem, in the flower's own units (its head is at 48, the stem runs down to 178): just
 * under the head, so the head sits below the face and clear of both brads, and the stem hangs below the mittens.
 */
const STEM: [number, number] = [52, 96];
/** The flower: leaning a touch to its right, how large beside it, and larger as it is offered (toward you). */
const STEM_LEAN = 6;
const FLOWER = 1.04;
const FLOWER_OUT = 1.15;

export default defineSticker({
  duration: 2.5,
  // the thumb: the flower offered, a little dip toward you, smiling, the loops up
  hero: fr(9),
  cast: { tw: { slug: 'tag', x: 200, ground: 411, k: 0.67 } },
  props: {
    // inside 牽牽, just over its paper, so both mittens close over its stem
    flower: { kind: 'flower', seed: 8, inside: { puppet: 'tw', above: 'torso' } },
  },
  frame(t, { tw }, { flower }) {
    const p = tw.pose;
    const k = tw.k;
    // the offer: a little dip toward you (down on f3–4, up on f20)
    const e = env(snap(t, [0, fr(3), fr(4), fr(20)]), fr(2), fr(4), fr(19), fr(20));
    p.bodyUp -= 7 * e;
    p.sy *= 1 - 0.015 * e;
    p.faceY += 4 * e;
    p.decoY -= 3 * e;
    p.liftL = TOGETHER;
    p.liftR = TOGETHER;
    // the stem between the two mittens, in every frame
    const [gx, gy] = between(tw);
    flower.at(gx, gy, { k, scale: lerp(FLOWER, FLOWER_OUT, e), anchor: STEM, rot: STEM_LEAN });
    // the face: smiling at you, eyes open, as it offers; then a wider, shy smile — eyes shut, the blush deeper, the
    // loops down, the face lowered a little
    const ts = step(t, 1 / 6);
    const shy = ts >= fr(13) && ts < fr(20);
    p.eyes = shy ? 'shut' : 'open';
    p.faceX += 3;
    if (shy) p.faceY += 3;
    p.blush = keys(ts, [[0, 0.6], [fr(4), 0.8], [fr(8), 1.2], [fr(12), 1.2], [fr(14), 1.8], [fr(19), 1.8], [fr(24), 0.6]]);
    perk(tw, shy ? -0.8 : keys(ts, [[0, 0], [fr(3), 0], [fr(6), 1], [fr(12), 1], [fr(22), 0]]));
    blink(tw, t, fr(26), fr(1));
  },
});
