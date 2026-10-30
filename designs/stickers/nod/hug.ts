/**
 * 聆聆 · 抱抱 Hug — 點點 stands in front of it; 聆聆 reaches out and scoops 點點 in against its card with its long arms,
 * its mittens round 點點's middle; 點點 reaches back onto the card and turns its face up to 聆聆; both eyes shut and
 * blushing, two squeezes, sparkles; then it lets go and 點點 steps back.
 * Key pose: 聆聆 standing, 點點 in front of its right side, both smiling at you.
 *
 * 點點 is held inside 聆聆 (under its face and its arms brought round), kept below its face. 聆聆's body never moves;
 * 點點 moves on 5 frames (scooped in 3, stepping back 2) and squeezes twice; the arms, faces and sparkles change alone.
 */
import { defineSticker, fr, keys, lerp, snap, SPARKLE_BIG, step } from '../kit';

/** Where 點點 stands at rest (in front of 聆聆's right side), and in the hug (px). */
const APART = 300;
const HELD = 218;
/**
 * 聆聆's arms, frame by frame (lift, both sides): out a little toward 點點 (f2), swept in round it with the scoop (f5–7),
 * held round its middle, let go (f22–24). They never swing out sideways: a mitten would reach the sticker's edge.
 */
const ARMS: readonly (readonly [number, number])[] = [
  [0, 36], [2, 50], [5, 12], [6, -18], [7, -36], [22, -8], [23, 20], [24, 36],
];
/** 點點's arms in the hug: out to its sides, its mittens on 聆聆's card. */
const BACK = 104;
/** The two squeezes while it holds the hug: [from, to) frames. */
const SQUEEZES = [[12, 14], [17, 19]] as const;

export default defineSticker({
  duration: 2.5,
  // the thumb: the hug, squeezing, both eyes shut and blushing, the sparkles up
  hero: fr(17),
  cast: {
    nod: { slug: 'card', x: 216, ground: 384, k: 0.76 },
    pip: { slug: 'dot', x: APART, ground: 412, k: 0.76, inside: { puppet: 'nod', above: 'torso' } },
  },
  props: {
    cluster: { kind: 'sparkles', seed: 31 },
    one: { kind: 'sparkle', seed: 32 },
  },
  frame(t, { nod, pip }, { cluster, one }) {
    const n = nod.pose;
    const d = pip.pose;
    const tb = snap(t, [0, fr(5), fr(6), fr(7), fr(23), fr(24)]);
    // 點點 is scooped in (f5–7) and steps back out (f23–24)
    const inn = keys(tb, [[0, 0], [fr(5), 0.3], [fr(6), 0.75], [fr(7), 1], [fr(22), 1], [fr(23), 0.45], [fr(24), 0]]);
    pip.x = lerp(APART, HELD, inn);
    // held: pressed a little against 聆聆, its mittens out on 聆聆's card; squeezed tighter twice
    const sq = SQUEEZES.some(([a, b]) => t >= fr(a) - 1e-6 && t < fr(b) - 1e-6) ? 1 : 0;
    d.sx *= 1 + 0.03 * inn + 0.03 * sq;
    d.sy *= 1 - 0.04 * inn - 0.04 * sq;
    d.liftL = lerp(pip.rest('L'), BACK, inn);
    d.liftR = lerp(pip.rest('R'), BACK, inn);
    // 聆聆's arms
    let lift = ARMS[0][1];
    for (const [f, v] of ARMS) if (fr(f) <= t + 1e-6) lift = v;
    n.liftL = lift - 5 * sq;
    n.liftR = lift - 5 * sq;
    n.front = lift < 30;
    // faces: both look at each other as it reaches out; held, 點點's face turned up to 聆聆, both eyes shut
    const ts = step(t, 1 / 12);
    if (ts >= fr(2) && ts < fr(5)) {
      n.faceX += 6;
      n.faceY += 4;
      d.faceX -= 5;
      d.faceY -= 5;
    }
    const held = ts >= fr(7) && ts < fr(22);
    if (held) {
      n.eyes = 'shut';
      d.eyes = 'shut';
      d.faceY -= 8;
      n.faceY += 3;
    }
    n.blush = keys(step(t, 1 / 6), [[0, 0.3], [fr(6), 0.5], [fr(12), 2], [fr(20), 2], [fr(25), 0.5], [fr(30), 0.3]]);
    d.blush = keys(step(t, 1 / 6), [[0, 0.4], [fr(6), 0.6], [fr(12), 1.6], [fr(20), 1.6], [fr(25), 0.6], [fr(30), 0.4]]);
    // sparkles while they hold the hug (on fours): a cluster at the upper left, a big one at the right
    const ss = step(t, 1 / 6);
    cluster.at(78, 110, { k: nod.k }).set({ show: keys(ss, [[fr(8), 0], [fr(12), 1], [fr(18), 1], [fr(22), 0]]) });
    one.at(386, 106, { k: nod.k, scale: SPARKLE_BIG * keys(ss, [[fr(10), 0], [fr(14), 1], [fr(20), 1], [fr(24), 0]]) });
  },
});
