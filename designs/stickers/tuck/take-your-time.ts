/**
 * 摺摺 · 慢慢來 Take your time — it gently pats 點點's head, three slow pats; 點點 shuts its eyes, content, and gives a
 * little under each one. Key pose: 摺摺's mitten resting on 點點's head, both smiling.
 *
 * 摺摺 leans a little toward 點點 and holds still; only its arm and face move. 點點, small and behind 摺摺's edge, gives
 * a little as each pat lands — and only then, so the frames between change nothing but the arm.
 */
import { blink, defineSticker, fr, keys } from '../kit';

/** One pat, frame by frame: the mitten's lift (0 resting on 點點's head) and how much 點點 gives under it. */
const PAT = [
  { lift: 0, give: 1 },
  { lift: 0, give: 0.4 },
  { lift: 0.55, give: 0 },
  { lift: 1, give: 0 },
  { lift: 1, give: 0 },
  { lift: 0.55, give: 0 },
] as const;
const FIRST = 4;
const PATS = 3;

export default defineSticker({
  duration: 2.5,
  // the thumb: a pat landing on 點點, who gives under it, content
  hero: fr(13),
  cast: {
    pip: { slug: 'dot', x: 334, ground: 410, k: 0.69, z: 10 },
    tuck: { slug: 'tuck', x: 172, ground: 410, k: 0.69, z: 20 },
  },
  frame(t, { tuck, pip }) {
    const tp = tuck.pose;
    const pp = pip.pose;
    const f = Math.round(t * 12) - FIRST;
    // a pat lands first after a lift: the cycle starts at its top so the first frame of motion is the mitten rising
    const phase = f >= 0 && f < PATS * PAT.length ? PAT[(f + 3) % PAT.length] : { lift: 0, give: 0 };
    const landed = f >= 0 && f < PATS * PAT.length + 3 && phase.lift === 0 && f > 1 ? phase.give : 0;
    // 點點 gives under the mitten as it lands: shorter for a moment, its curl and mittens bob
    pp.sy *= 1 - 0.04 * landed;
    pp.decoR += 6 * landed;
    pp.liftL = pip.rest('L') + 10 * landed;
    pp.liftR = pip.rest('R') + 10 * landed;
    const [hx, hy] = pip.headPoint();
    tp.tilt = 3;
    tuck.setLift('R', tuck.aim('R', hx - 4 * tuck.k, hy - (24 + 18 * phase.lift) * tuck.k));
    tp.front = true;
    // 摺摺 watches it, smiling; a slow blink
    tp.faceX += 9;
    tp.faceY += 4;
    tp.blush = 0.5;
    blink(tuck, t, fr(26), fr(2));
    // 點點: eyes shut, content, looking up toward 摺摺, its blush a little fuller while it's patted
    pp.eyes = 'shut';
    pp.faceX -= 6;
    pp.faceY -= 2;
    pp.blush = keys(Math.round(t * 6) / 6, [[0, 1], [fr(8), 1.4], [fr(22), 1.4], [fr(26), 1]]);
  },
});
