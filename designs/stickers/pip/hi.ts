/**
 * 點點 · 嗨！ Hi! — it rises out from behind a small, low wall (牽牽's wall from 在嗎？ laid down: terracotta paper, its
 * top edge the brand's wave; 點點 is clipped below the wall's top): its curls and eyes peek over the wall, looking about,
 * then it springs up out of it, lands with nearly all its paper above the wall and waves one mitten high, mouth open;
 * then it sinks back to peeking. Key pose: peeking over the wall.
 *
 * The body moves on 8 frames (the dip, the spring, the landing and settle, the sink and its settle); the waving arm,
 * the eyes and the mouth carry the rest.
 */
import { blink, defineSticker, fr } from '../kit';
import { clipBelow, LOW_WALL_KIND, pick } from './_local';

const K = 1.1;
/** The wall's top (its wave's middle) across the sticker, px; standing, 點點's feet are hidden behind the wall. */
const LINE = 352;
const FEET = LINE + 58;
/** The wall's size (px per its unit), and where 點點 is cut off: inside the wall, under its wave's deepest dip. */
const WALL_K = 0.84;
const CLIP = LINE + 14;
/** Peeking, it sinks this many rig units (its eyes just over the wall). */
const PEEK = -100;

export default defineSticker({
  duration: 2,
  // the thumb: up out of the wall, one mitten high waving, mouth open
  hero: fr(10),
  cast: { pip: { slug: 'dot', x: 216, ground: FEET, k: K, z: 10 } },
  props: { wall: { kind: LOW_WALL_KIND, seed: 14, z: 100 } },
  frame(t, { pip }, { wall }) {
    const p = pip.pose;
    // peeking (0) → dips (f3) → springs up out of the wall (f4) → lands (f5), settles (f6–7) … sinks (f18–20)
    p.rise += pick(t, [[0, PEEK], [fr(3), PEEK - 8], [fr(4), 66], [fr(5), 0], [fr(18), -32], [fr(19), PEEK - 6], [fr(20), PEEK]]);
    const sq = pick(t, [[0, 0], [fr(3), -0.8], [fr(4), 0.9], [fr(5), -0.5], [fr(6), 0.12], [fr(7), 0], [fr(18), 0.3], [fr(19), -0.4], [fr(20), 0]]);
    p.sy *= 1 + 0.08 * sq;
    p.sx *= 1 - 0.045 * sq;
    p.legS *= 1 + 0.12 * Math.min(0, sq);
    p.legL += pick(t, [[0, 0], [fr(4), 12], [fr(5), 0]]);
    p.legR -= pick(t, [[0, 0], [fr(4), 12], [fr(5), 0]]);
    p.decoR += pick(t, [[0, 0], [fr(3), 3], [fr(4), -8], [fr(5), 6], [fr(6), -2], [fr(7), 0], [fr(18), -4], [fr(19), 5], [fr(20), 0]]);
    const up = pick(t, [[0, 0], [fr(4), 1], [fr(19), 0]]) > 0;
    if (up) {
      // the right mitten up high and waving (in front of its paper, or the short arm would hide behind it), the left
      // one out a little
      const f = Math.round(t * 12);
      const wag = f >= 6 && f < 18 ? [0, 1, 0, -1][f % 4] : 0;
      p.liftR = pick(t, [[0, 130], [fr(5), 160]]) + 15 * wag;
      p.front = true;
      p.liftL = pick(t, [[0, 80], [fr(5), 58]]);
      p.mouth = 'mouth-open';
      p.blush = 0.8;
    } else {
      // peeking: eyes over the wall, looking about
      p.faceY -= 5;
      p.faceX += pick(t, [[0, -7], [fr(2), 7], [fr(3), 0], [fr(20), 0], [fr(21), -7]]);
      p.blush = 0.4;
    }
    if (pick(t, [[0, 0], [fr(3), 1], [fr(4), 0]])) p.eyes = 'shut';
    blink(pip, t, fr(13), fr(1));
    wall.at(216, LINE, { k: WALL_K, anchor: 'top' });
    clipBelow(pip, CLIP);
  },
});
