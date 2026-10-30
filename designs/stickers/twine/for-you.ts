/**
 * 牽牽 · 這是給你的 This is for you — it stands turned round, showing you its back: 「給：」 and the line left blank after
 * it. It turns to face you, and in both mittens it holds out a paper flower, with a small bow; its loops perk up, then it
 * goes shy (eyes shut, a little 'o', the loops drooping) — and it turns round again to its 「給：」.
 * Key pose: turned round, its back to you, 「給：」 showing.
 *
 * The body moves on 11 frames (each turn 4, the bow 2, up again 1), the turning ones narrow; between, it holds.
 */
import { blink, bow, defineSticker, fr, keys, lerp, snap, step } from '../kit';
import { between, perk } from './_local';

/** Both mittens together before its middle, the flower's stem between them. */
const TOGETHER = -37;
/**
 * The flower: held by the middle of its stem (so its head stays below the face), how large beside it — larger as it is
 * held out to you — and how far it leans out.
 */
const STEM: [number, number] = [52, 112];
const FLOWER = 1.02;
const FLOWER_OUT = 1.16;
const FLOWER_ROT = 24;

/** The turn, frame by frame: how wide the paper is (it turns about its middle) and which side shows. */
const TURN_IN = [[fr(4), 0.55, 'back'], [fr(5), 0.12, 'front'], [fr(6), 0.6, 'front'], [fr(7), 1.04, 'front'], [fr(8), 1, 'front']] as const;
const TURN_OUT = [[fr(22), 0.6, 'front'], [fr(23), 0.12, 'back'], [fr(24), 0.55, 'back'], [fr(25), 1.04, 'back'], [fr(26), 1, 'back']] as const;

export default defineSticker({
  duration: 2.5,
  // the thumb: facing you, holding the flower out to you in the small bow, smiling, the loops up
  hero: fr(12),
  cast: { tw: { slug: 'tag', x: 216, ground: 414, k: 0.66 } },
  props: { flower: { kind: 'flower', seed: 8, z: 100 } },
  frame(t, { tw }, { flower }) {
    const p = tw.pose;
    // which side shows, and how wide, on this frame
    let sx = 1;
    let front = t >= fr(5) && t < fr(23);
    for (const [at, w, side] of [...TURN_IN, ...TURN_OUT]) {
      if (t >= at - 1e-6) {
        sx = w;
        front = side === 'front';
      }
    }
    p.alt = !front;
    p.sx *= sx;
    // as it narrows, its feet come in under it (the hips are pinned to the paper's middle)
    p.legL -= 10 * (1 - Math.min(sx, 1));
    p.legR += 10 * (1 - Math.min(sx, 1));
    // the small bow as it offers (down on f9–10, up on f20)
    const tb = snap(t, [0, fr(9), fr(10), fr(20)]);
    const e = bow(tw, tb, fr(8), fr(10), fr(19), fr(20), 0.32);
    // the mittens together, holding the flower out
    p.liftL = TOGETHER;
    p.liftR = TOGETHER;
    if (front) {
      const [hx, hy] = between(tw);
      const held = lerp(FLOWER, FLOWER_OUT, e);
      flower.at(hx, hy + 2 * tw.k, { k: tw.k, scale: held, sx, anchor: STEM, rot: FLOWER_ROT * sx });
    }
    // the face: smiling, blushing, the loops perked as it offers; then shy — eyes shut, a little 'o', the loops down
    const ts = step(t, 1 / 6);
    const shy = ts >= fr(15) && ts < fr(21);
    p.blush = keys(ts, [[0, 0.3], [fr(6), 0.6], [fr(10), 1.2], [fr(14), 1.2], [fr(16), 1.8], [fr(20), 1.8], [fr(24), 0.3]]);
    perk(tw, shy ? -0.8 : keys(ts, [[0, 0], [fr(8), 0], [fr(10), 1], [fr(14), 1], [fr(22), 0]]));
    if (shy) p.eyes = 'shut';
    if (shy && ts >= fr(16)) p.mouth = 'mouth-o';
    p.faceX += 2;
    if (shy) p.faceY += 2;
    blink(tw, t, fr(7), fr(1));
  },
});
