/**
 * 點點 · 嗨！ Hi! — standing behind a low kraft strip it ducks down until only its eyes and curls are over the edge,
 * looks about, and springs up: lands standing tall and waves one mitten high, mouth open. Key pose: ducked behind the
 * strip, peeking.
 *
 * The body moves on 8 frames (the crouch, the spring, the landing and settle, the duck and its settle); the waving
 * arm, the eyes and the mouth carry the rest.
 */
import { blink, defineSticker, fr } from '../kit';
import { KRAFT_STRIP, pick } from './_local';

const K = 1.08;
/** Its feet behind the strip, ducked; standing it rises STAND rig units. */
const FEET = 406;
const STAND = 34;

export default defineSticker({
  duration: 2,
  // the thumb: standing tall, one mitten up waving, mouth open
  hero: fr(10),
  cast: { pip: { slug: 'dot', x: 214, ground: FEET, k: K, z: 10 } },
  props: { strip: { kind: KRAFT_STRIP, seed: 3, z: 100 } },
  frame(t, { pip }, { strip }) {
    const p = pip.pose;
    // ducked (0) → crouch (f4) → spring up (f5) → land standing (f6), settle (f7–8) … duck (f18–20)
    p.rise += pick(t, [[0, 0], [fr(5), 66], [fr(6), STAND], [fr(18), STAND - 4], [fr(19), 0]]);
    const sq = pick(t, [[0, -1], [fr(4), -1.4], [fr(5), 0.9], [fr(6), -0.3], [fr(7), 0.12], [fr(8), 0], [fr(18), -0.3], [fr(19), -1.2], [fr(20), -1]]);
    p.sy *= 1 + 0.13 * Math.min(0, sq) + 0.07 * Math.max(0, sq);
    p.sx *= 1 - 0.06 * Math.min(0, sq) - 0.04 * Math.max(0, sq);
    p.legS *= 1 + 0.12 * Math.min(0, sq);
    p.decoR += pick(t, [[0, 0], [fr(4), 3], [fr(5), -8], [fr(6), 6], [fr(7), -2], [fr(8), 0], [fr(19), 5], [fr(20), 0]]);
    const up = pick(t, [[0, 0], [fr(5), 1], [fr(19), 0]]) > 0;
    // the wave: the right mitten up high and waving (in front of its paper, or the short arm would hide behind it),
    // the left one resting at its side
    if (up) {
      const f = Math.round(t * 12);
      const wag = f >= 7 && f < 18 ? [0, 1, 0, -1][f % 4] : 0;
      p.liftR = pick(t, [[0, 130], [fr(6), 160]]) + 15 * wag;
      p.front = true;
      p.liftL = pick(t, [[0, 75], [fr(6), 52]]);
      p.mouth = 'mouth-open';
      p.blush = 0.8;
    } else {
      // peeking: eyes over the edge, looking about
      p.faceY -= 4;
      p.faceX += pick(t, [[0, -7], [fr(2), 7], [fr(4), 0], [fr(21), -7]]);
      p.blush = 0.4;
    }
    if (pick(t, [[0, 0], [fr(4), 1], [fr(5), 0]])) p.eyes = 'shut';
    blink(pip, t, fr(13), fr(1));
    strip.at(214, 411, { k: 0.95, anchor: 'base', sx: 0.8, rot: -1.5 });
  },
});
