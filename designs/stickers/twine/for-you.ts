/**
 * 牽牽 · 這是給你的 This is for you — it stands with its mittens together, innocent, a paper flower peeking out from behind
 * its back. It reaches round with one mitten and brings the flower out in front, takes it in both mittens and holds it
 * out to you with a small bow, smiling, its loops perked up — then goes shy (eyes shut, the blush deeper, the loops
 * drooping). It tucks the flower back behind it, ready to bring it out again.
 * Key pose: mittens together, the flower peeking from behind its right side.
 *
 * The body moves on 3 frames (the bow down 2, up 1); the arm, the flower, the face and the loops carry the rest.
 */
import { blink, bow, defineSticker, fr, keys, lerp, snap, step } from '../kit';
import { between, mittenAt, perk } from './_local';

/**
 * Both mittens together before its middle; the right one out to its side, reaching round behind; on its way back; and
 * the two holding the flower out to you, a little to its right (the left mitten across, the right one low).
 */
const TOGETHER = -37;
const ROUND = 78;
const COMING = 24;
const OFFER_L = -50;
const OFFER_R = -14;
/**
 * The flower: held by the middle of its stem (so its head stays below the face), how large beside it — larger as it is
 * held out to you — and how far it leans out.
 */
const STEM: [number, number] = [52, 112];
const FLOWER = 1.04;
const FLOWER_OUT = 1.24;
const FLOWER_ROT = 38;
/** Hidden behind it: the head showing past its right side at shoulder height (rig units), leaning out. */
const PEEK: [number, number] = [478, 352];

/** Where the right mitten is on each frame of the reach (the rest of the time the mittens are together). */
function rightArm(t: number): number {
  if (t >= fr(3) && t < fr(4)) return ROUND;
  if (t >= fr(4) && t < fr(5)) return COMING;
  if (t >= fr(22) && t < fr(23)) return COMING;
  if (t >= fr(23) && t < fr(24)) return ROUND;
  return TOGETHER;
}

export default defineSticker({
  duration: 2.5,
  // the thumb: the flower held out to you in both mittens, the small bow, smiling, the loops up
  hero: fr(10),
  cast: { tw: { slug: 'tag', x: 206, ground: 411, k: 0.67, z: 10 } },
  props: {
    hidden: { kind: 'flower', seed: 8, z: 5 },
    flower: { kind: 'flower', seed: 8, z: 100 },
  },
  frame(t, { tw }, { hidden, flower }) {
    const p = tw.pose;
    const k = tw.k;
    // the small bow as it holds the flower out (down on f6–7, up on f21)
    const tb = snap(t, [0, fr(6), fr(7), fr(21)]);
    const e = bow(tw, tb, fr(5), fr(7), fr(20), fr(21), 0.6);
    const out = t >= fr(4) && t < fr(23);
    const offering = t >= fr(5) && t < fr(22);
    p.liftL = offering ? OFFER_L : TOGETHER;
    p.liftR = offering ? OFFER_R : rightArm(t);
    if (!out) {
      // behind its back: peeking past its side, or in the mitten reaching round (still behind it)
      if (p.liftR === ROUND) {
        const [mx, my] = mittenAt(tw, 'R');
        hidden.at(mx, my, { k, scale: FLOWER, anchor: STEM, rot: 14 });
      } else {
        const [px, py] = tw.pagePoint(...PEEK);
        hidden.at(px, py, { k, scale: FLOWER, anchor: 'head', rot: 24 });
      }
    } else if (p.liftR === COMING) {
      // on its way round to the front, in the right mitten
      const [mx, my] = mittenAt(tw, 'R');
      flower.at(mx, my, { k, scale: FLOWER, anchor: STEM, rot: 22 });
    } else {
      // in both mittens, held out to you
      const [hx, hy] = between(tw);
      flower.at(hx, hy + 2 * k, { k, scale: lerp(FLOWER, FLOWER_OUT, e), anchor: STEM, rot: FLOWER_ROT });
    }
    // the face: an innocent glance while it hides it; smiling at you as it offers (eyes open through the bow); then shy —
    // eyes shut, the blush deeper, the loops down, the face lowered
    const ts = step(t, 1 / 6);
    const shy = ts >= fr(14) && ts < fr(20);
    p.eyes = shy ? 'shut' : 'open';
    if (!out) p.faceX -= 4;
    else p.faceX += 2;
    if (shy) p.faceY += 3;
    p.blush = keys(ts, [[0, 0.5], [fr(4), 0.5], [fr(8), 1.2], [fr(12), 1.2], [fr(14), 1.8], [fr(20), 1.8], [fr(24), 0.5]]);
    perk(tw, shy ? -0.9 : keys(ts, [[0, 0], [fr(6), 0], [fr(8), 1], [fr(12), 1], [fr(22), 0]]));
    blink(tw, t, fr(27), fr(1));
  },
});
