/**
 * 點點 · 嗨！ Hi! — it rises out of a wavy line (the brand's, a thin strip of terracotta paper; 點點 is clipped below
 * it): its curls and eyes peek over the line, looking about, then it springs up out of it, lands with nearly all its
 * paper above the line and waves one mitten high, mouth open; then it sinks back to peeking. Key pose: peeking over the
 * line.
 *
 * The body moves on 8 frames (the dip, the spring, the landing and settle, the sink and its settle); the waving arm,
 * the eyes and the mouth carry the rest.
 */
import { blink, defineSticker, fr } from '../kit';
import { clipBelow, pick, WAVE_LINE } from './_local';

const K = 1.1;
/** The line across the sticker, px; standing, 點點's feet are hidden below it, the line across the foot of its paper. */
const LINE = 340;
const FEET = LINE + 58;
/** Peeking, it sinks this many rig units (its eyes just over the line). */
const PEEK = -100;

export default defineSticker({
  duration: 2,
  // the thumb: up out of the line, one mitten high waving, mouth open
  hero: fr(10),
  cast: { pip: { slug: 'dot', x: 216, ground: FEET, k: K, z: 10 } },
  props: { line: { kind: WAVE_LINE, seed: 5, z: 100 } },
  frame(t, { pip }, { line }) {
    const p = pip.pose;
    // peeking (0) → dips (f3) → springs up out of the line (f4) → lands (f5), settles (f6–7) … sinks (f18–20)
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
      // peeking: eyes over the line, looking about
      p.faceY -= 5;
      p.faceX += pick(t, [[0, -7], [fr(2), 7], [fr(3), 0], [fr(20), 0], [fr(21), -7]]);
      p.blush = 0.4;
    }
    if (pick(t, [[0, 0], [fr(3), 1], [fr(4), 0]])) p.eyes = 'shut';
    blink(pip, t, fr(13), fr(1));
    line.at(216, LINE, { k: 1.04, rot: -1 });
    clipBelow(pip, LINE);
  },
});
