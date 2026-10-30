/**
 * 聆聆 · 抱抱 Hug — 點點 stands in front of it; 聆聆 opens its long arms wide, scoops 點點 in against its card and hugs
 * it, both with their eyes shut and blushing, squeezing twice; two little sparkles; then it lets go and 點點 steps back.
 * Key pose: 聆聆 standing, 點點 in front of its right side, both smiling at you.
 *
 * 點點 is held inside 聆聆 (under its face and its arms brought round), kept below its face. 聆聆's body never moves;
 * 點點 moves on 5 frames (scooped in 3, stepping back 2) and squeezes twice; the arms, faces and sparkles change alone.
 */
import { bell, defineSticker, fr, keys, lerp, snap, step } from '../kit';

/** Where 點點 stands at rest (in front of 聆聆's right side), and in the hug (px). */
const APART = 296;
const HELD = 218;
/**
 * 聆聆's arms, frame by frame (lift, both sides): thrown open (f1–4), swept round 點點 (f5–8), held, let go (f21–24).
 * They swing past sideways between frames, never on one: straight out, a mitten would reach the sticker's edge.
 */
const ARMS: readonly (readonly [number, number])[] = [
  [0, 36], [1, 60], [2, 120], [3, 150], [6, 118], [7, 15], [8, -50], [22, -12], [23, 18], [24, 36],
];
/** The two squeezes while it holds the hug: [from, to) frames. */
const SQUEEZES = [[12, 14], [17, 19]] as const;

export default defineSticker({
  duration: 2.5,
  // the thumb: the hug, squeezing, both eyes shut and blushing, the sparkles up
  hero: fr(17),
  cast: {
    nod: { slug: 'card', x: 216, ground: 386, k: 0.74 },
    pip: { slug: 'dot', x: APART, ground: 412, k: 0.74, inside: { puppet: 'nod', above: 'torso' } },
  },
  props: {
    s1: { kind: 'sparkle', seed: 31 },
    s2: { kind: 'sparkle', seed: 32 },
  },
  frame(t, { nod, pip }, { s1, s2 }) {
    const n = nod.pose;
    const d = pip.pose;
    const tb = snap(t, [0, fr(6), fr(7), fr(8), fr(23), fr(24)]);
    // 點點 is scooped in (f6–8) and steps back out (f23–24)
    const inn = keys(tb, [[0, 0], [fr(6), 0.35], [fr(7), 0.8], [fr(8), 1], [fr(22), 1], [fr(23), 0.45], [fr(24), 0]]);
    pip.x = lerp(APART, HELD, inn);
    // held: pressed a little against 聆聆, its mittens up holding 聆聆's arms; squeezed tighter twice
    const sq = SQUEEZES.some(([a, b]) => t >= fr(a) - 1e-6 && t < fr(b) - 1e-6) ? 1 : 0;
    d.sx *= 1 + 0.03 * inn + 0.03 * sq;
    d.sy *= 1 - 0.04 * inn - 0.04 * sq;
    d.liftL = lerp(pip.rest('L'), 122, inn);
    d.liftR = lerp(pip.rest('R'), 122, inn);
    // 聆聆's arms
    const ts = step(t, 1 / 12);
    let lift = ARMS[0][1];
    for (const [f, v] of ARMS) if (fr(f) <= t + 1e-6) lift = v;
    n.liftL = lift - 7 * sq;
    n.liftR = lift - 7 * sq;
    n.front = lift < 30;
    // faces: both look up/at each other as the arms open, eyes shut and blushing through the hug
    if (ts >= fr(2) && ts < fr(6)) {
      n.mouth = 'mouth-open';
      d.faceY -= 6;
      d.faceX -= 3;
      d.mouth = 'mouth-o';
    }
    const held = ts >= fr(8) && ts < fr(22);
    if (held) {
      n.eyes = 'shut';
      d.eyes = 'shut';
    }
    n.blush = keys(step(t, 1 / 6), [[0, 0.3], [fr(6), 0.5], [fr(12), 2], [fr(20), 2], [fr(25), 0.5], [fr(30), 0.3]]);
    d.blush = keys(step(t, 1 / 6), [[0, 0.4], [fr(6), 0.6], [fr(12), 1.6], [fr(20), 1.6], [fr(25), 0.6], [fr(30), 0.4]]);
    // two sparkles over them while they hold the hug (grown in and out, on fours)
    const ss = step(t, 1 / 6);
    const [hx, hy] = nod.headPoint();
    s1.at(hx - 150, hy + 18, { k: nod.k * 0.9 }).set({ show: bell(ss, fr(10), fr(20), 0.3, 0.35) });
    s2.at(hx + 128, hy - 6, { k: nod.k * 0.7 }).set({ show: bell(ss, fr(12), fr(22), 0.3, 0.35) });
  },
});
