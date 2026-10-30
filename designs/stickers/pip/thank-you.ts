/**
 * 點點 · 謝謝你！ Thank you! — a little hop, and it lands straight into a bow, both mittens pressed to its blushing
 * cheeks (its shy pose), eyes shut, a closed smile; a paper heart pops up above its curls while it holds the bow, and
 * it straightens up again. Key pose: standing, smiling, a little blush.
 *
 * The body moves on 10 frames (crouch, up, land, the bow down on three, up on three); the heart and the face ride
 * those frames.
 */
import { blink, bow, bowStrokes, defineSticker, fr, type StickerPuppet } from '../kit';
import { pick } from './_local';

const K = 1.14;
/** Its cheeks (the blush), rig units. */
const CHEEK_L: [number, number] = [307, 566];
const CHEEK_R: [number, number] = [391, 564];

/** Both mittens pressed to its cheeks (in front of its paper), wherever its face has slid to. */
function shy(pip: StickerPuppet): void {
  const q = pip.pose;
  const [lx, ly] = pip.pagePoint(CHEEK_L[0] + q.faceX, CHEEK_L[1] + q.faceY);
  const [rx, ry] = pip.pagePoint(CHEEK_R[0] + q.faceX, CHEEK_R[1] + q.faceY);
  q.liftL = pip.aim('L', lx, ly);
  q.liftR = pip.aim('R', rx, ry);
  q.front = true;
}

export default defineSticker({
  duration: 2.25,
  // the thumb: deep in the bow, mittens on its cheeks, the heart up
  hero: fr(14),
  cast: { pip: { slug: 'dot', x: 216, ground: 418, k: K } },
  props: {
    heart: { kind: 'heart', seed: 14 },
    strokeL: { kind: 'strokes', seed: 4 },
    strokeR: { kind: 'strokes', seed: 5 },
  },
  frame(t, { pip }, { heart, strokeL, strokeR }) {
    const p = pip.pose;
    // the hop: crouch (f3), up (f4), land (f6)
    p.rise += pick(t, [[0, 0], [fr(4), 34], [fr(6), 0]]);
    const sq = pick(t, [[0, 0], [fr(3), -1], [fr(4), 0.8], [fr(6), -0.6], [fr(7), 0]]);
    p.sy *= 1 + 0.08 * sq;
    p.sx *= 1 - 0.045 * sq;
    p.legS *= 1 + 0.12 * Math.min(0, sq);
    p.legL += pick(t, [[0, 0], [fr(4), 12], [fr(6), 0]]);
    p.legR -= pick(t, [[0, 0], [fr(4), 12], [fr(6), 0]]);
    p.decoR += pick(t, [[0, 0], [fr(3), 3], [fr(4), -6], [fr(6), 5], [fr(7), 0]]);
    // the bow: down over f7–9, held, up over f19–21 (stepped, so the body moves on those frames only)
    const tb = pick(t, [[0, 0], [fr(7), fr(7)], [fr(8), fr(8)], [fr(9), fr(9)], [fr(19), fr(19)], [fr(20), fr(20)], [fr(21), fr(21)], [fr(22), fr(22)]]);
    const e = bow(pip, tb, fr(6), fr(9), fr(18), fr(21), 1);
    bowStrokes(pip, strokeL, strokeR, e);
    // mittens on its cheeks from the landing until it has straightened up
    if (pick(t, [[0, 0], [fr(6), 1], [fr(21), 0]])) shy(pip);
    p.blush = pick(t, [[0, 0.4], [fr(6), 1], [fr(8), 1.6], [fr(20), 1], [fr(22), 0.4]]);
    if (pick(t, [[0, 0], [fr(4), 1], [fr(6), 0]])) p.mouth = 'mouth-open';
    blink(pip, t, fr(24), fr(1));
    // the heart pops up above its curls as it bows, beats once, and goes as it rises
    const grow = pick(t, [[0, 0], [fr(8), 0.55], [fr(9), 1.12], [fr(10), 1], [fr(14), 1.08], [fr(15), 1], [fr(19), 0.55], [fr(20), 0]]);
    if (grow > 0) heart.at(216, 92, { k: K * 0.5, scale: grow, rot: -4 }).set({ glow: 0 });
  },
});
