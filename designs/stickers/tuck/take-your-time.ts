/**
 * 摺摺 · 慢慢來 Take your time — 點點 is in a fluster (an "o", a few little strokes); 摺摺, eyes shut and smiling, pats the
 * side of its head, three slow pats (beside its curls, never on them), and 點點 calms: eyes shut, content, giving a little
 * under each pat. At the loop's end the fluster comes back, and the pats with it.
 * Key pose: the fluster, 摺摺's mitten coming. Hero: the second pat landing, both content.
 *
 * 摺摺 holds still; only its arm and face move. 點點 gives only as a pat lands, so the frames between change little.
 */
import { defineSticker, fr, keys } from '../kit';

/** One pat, frame by frame: how far the mitten is off 點點's head (0 resting on it), and how much 點點 gives. */
const PAT = [
  { off: 0, give: 1 },
  { off: 0, give: 0.4 },
  { off: 0.55, give: 0 },
  { off: 1, give: 0 },
  { off: 1, give: 0 },
  { off: 0.55, give: 0 },
] as const;
const FIRST = 4;
const PATS = 3;

export default defineSticker({
  duration: 2.5,
  // the thumb: the second pat landing on the side of 點點's head, both content
  hero: fr(10),
  cast: {
    tuck: { slug: 'tuck', x: 124, ground: 408, k: 0.63, z: 10 },
    pip: { slug: 'dot', x: 332, ground: 408, k: 0.63, z: 20 },
  },
  props: { fluster: { kind: 'burst', seed: 9 } },
  frame(t, { tuck, pip }, { fluster }) {
    const tp = tuck.pose;
    const pp = pip.pose;
    const f = Math.round(t * 12);
    const i = f - FIRST;
    // the mitten: coming in (f0–3), three pats (f4–21), resting (f22–26), lifting off again (f27–29)
    let off = keys(f, [[0, 1], [3, 0.3], [4, 0], [26, 0], [29, 1]]);
    let give = 0;
    if (i >= 0 && i < PATS * PAT.length) ({ off, give } = PAT[i % PAT.length]);
    const calm = f >= FIRST && f < 26;
    // 點點 gives under the pat: shorter for a moment, its curls bobbing, its mittens up a little
    pp.sy *= 1 - 0.04 * give;
    pp.decoR -= 5 * give;
    pp.liftL = pip.rest('L') - 8 + 8 * give;
    pp.liftR = pip.rest('R') - 8 + 8 * give;
    // the pat lands on the side of its head at about ten o'clock, beside the curls, and lifts off along the head's normal
    const [nx, ny] = [-0.87, -0.5];
    const [hx, hy] = pip.pagePoint(261 + nx * (16 + 20 * off), 519 + ny * (16 + 20 * off));
    tuck.setLift('R', tuck.aim('R', hx, hy));
    tp.front = true;
    tp.liftL = 2;   // the other arm hangs straight down (out of the way of the canvas edge)
    // 摺摺: eyes shut, smiling, a little blush, looking toward 點點
    tp.eyes = 'shut';
    tp.faceX += 9;
    tp.faceY += 3;
    tp.blush = 1;
    // 點點: flustered at the ends (an "o", eyes open, a few strokes), calm and content while it is patted
    pp.faceX -= 6;
    pp.faceY -= 2;
    if (calm) pp.eyes = 'shut';
    else pp.mouth = f >= 27 || f < 3 ? 'mouth-o' : 'mouth';
    pp.blush = calm ? keys(Math.floor(f / 2) * 2, [[4, 1], [8, 1.4], [22, 1.4], [26, 1]]) : 0.6;
    if (!calm && (f < 3 || f >= 28)) {
      fluster.at(...pip.pagePoint(410, 452), { k: pip.k * 0.5, rot: 30 }).set({ draw: 1 });
    }
  },
});
