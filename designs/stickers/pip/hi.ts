/**
 * 點點 · 嗨！ Hi! — it peeks over a torn paper strip, looking about; ducks, and pops up waving both tiny arms (brought
 * in front of its paper, or they'd hide behind it), mouth open; a little bounce mid-wave, then it drops back to
 * peeking. Key pose: its curl and eyes over the strip.
 *
 * The body moves on 10 frames (duck, pop, settle ×2, a bounce and back, the drop, its landing and rest); the arms, eyes
 * and mouth carry the rest.
 */
import { blink, defineSticker, fr, step } from '../kit';
import { pick } from './_local';

const K = 1.12;
/** Its feet, hidden behind the strip (peeking), px. */
const FEET = 410;

export default defineSticker({
  duration: 2,
  // the thumb: popped up, both arms up waving, mouth open
  hero: fr(9),
  cast: { pip: { slug: 'dot', x: 216, ground: FEET, k: K, z: 10 } },
  props: { strip: { kind: 'ground', seed: 3, z: 100 } },
  frame(t, { pip }, { strip }) {
    const p = pip.pose;
    // up: rig units of rise (0 peeking)
    p.rise += pick(t, [[0, 0], [fr(5), 106], [fr(6), 88], [fr(7), 92], [fr(12), 100], [fr(13), 92], [fr(19), -2], [fr(20), 2], [fr(21), 0]]);
    // squash and stretch on those frames
    const sq = pick(t, [[0, 0], [fr(4), -1], [fr(5), 0.8], [fr(6), -0.25], [fr(7), 0], [fr(12), 0.35], [fr(13), -0.2], [fr(14), 0], [fr(18), 0.2], [fr(19), -0.7], [fr(20), 0.15], [fr(21), 0]]);
    p.sy *= 1 + 0.09 * sq;
    p.sx *= 1 - 0.05 * sq;
    // the curl lags a beat behind the body
    p.decoR += pick(t, [[0, 0], [fr(4), 2], [fr(5), -7], [fr(6), 6], [fr(7), -2], [fr(12), -4], [fr(13), 4], [fr(14), 0], [fr(19), -6], [fr(20), 5], [fr(21), 0]]);
    // arms: down behind the strip while peeking, flung up on the pop, waving (both, mirrored) while it's up
    const ts = step(t, 1 / 12);
    const out = pick(t, [[0, 0], [fr(5), 1], [fr(19), 0]]);
    const wag = ts > fr(6) && ts < fr(18) ? Math.sin(((ts - fr(6)) / fr(4)) * Math.PI * 2) : 0;
    const lift = 45 + (150 - 45) * out + 14 * wag * out;
    p.liftL = lift;
    p.liftR = lift;
    p.front = out > 0;
    // the face: looking about while peeking, open-mouthed hello while up, a happy squint mid-wave
    if (out === 0 && t < fr(4) - 1e-6) p.faceX += pick(t, [[0, 0], [fr(1), -8], [fr(3), 0]]);
    if (t >= fr(21) - 1e-6) p.faceX += pick(t, [[0, 0], [fr(22), 8]]);
    if (out === 0) p.faceY -= 4;
    if (out > 0) {
      p.mouth = 'mouth-open';
      p.blush = 0.8;
      if (ts >= fr(12) && ts < fr(15)) p.eyes = 'shut';
    } else p.blush = 0.3;
    if (pick(t, [[0, 0], [fr(4), 1], [fr(5), 0]])) p.eyes = 'shut';
    blink(pip, t, fr(2), fr(1));
    strip.at(216, 412, { k: 0.95, anchor: 'base', sx: 0.8, sy: 1.8, rot: -1.5 });
  },
});
