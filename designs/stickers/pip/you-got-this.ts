/**
 * 點點 · 加油 You've got this — it cheers with a small paper pennant held high: two hops, the pennant swinging and its
 * flag rippling, the other mitten pumping up on every hop, mouth open, eyes open on whoever it's cheering on. Key pose:
 * standing, the pennant up, smiling.
 *
 * The body moves on 8 frames (two hops: crouch, up, land, stand); the pennant swings on twos, on the same frames
 * where it can, and the face and the free mitten ride along.
 */
import { blink, defineSticker, fr, MITTEN_MIDDLE, step } from '../kit';
import { pick } from './_local';

const K = 1.08;

export default defineSticker({
  duration: 2,
  // the thumb: up in the second hop, pennant swung out, mitten up, cheering
  hero: fr(13),
  cast: { pip: { slug: 'dot', x: 184, ground: 418, k: K } },
  props: {
    // inside 點點, just above its paper: its mitten (brought to the front) closes over the stick
    flag: { kind: 'pennant', seed: 8, inside: { puppet: 'pip', above: 'torso' } },
  },
  frame(t, { pip }, { flag }) {
    const p = pip.pose;
    const k = pip.k;
    // two hops: crouch, up, land (squash), stand
    p.rise += pick(t, [[0, 0], [fr(5), 40], [fr(7), 0], [fr(13), 46], [fr(15), 0]]);
    const sq = pick(t, [[0, 0], [fr(4), -1], [fr(5), 0.8], [fr(7), -1], [fr(8), 0], [fr(12), -1], [fr(13), 0.8], [fr(15), -1], [fr(16), 0]]);
    p.sy *= 1 + 0.08 * sq;
    p.sx *= 1 - 0.045 * sq;
    p.legS *= 1 + 0.12 * Math.min(0, sq);
    const air = pick(t, [[0, 0], [fr(5), 1], [fr(7), 0], [fr(13), 1], [fr(15), 0]]);
    p.legL += 12 * air;
    p.legR -= 12 * air;
    p.decoR += pick(t, [[0, 0], [fr(4), 3], [fr(5), -6], [fr(7), 6], [fr(8), 0], [fr(12), 3], [fr(13), -6], [fr(15), 6], [fr(16), 0]]);
    p.front = true;
    // the pennant: held up in the right mitten, swinging out and back (on twos), its flag rippling
    const t2 = step(t, 1 / 6);
    const swing = pick(t2, [[0, 0], [fr(4), -14], [fr(6), 8], [fr(8), -12], [fr(10), 4], [fr(12), -14], [fr(14), 10], [fr(16), -12], [fr(18), 4], [fr(20), 0]]);
    p.liftR = 150 + swing * 0.5;
    // the free mitten pumps up on each hop
    p.liftL = 45 + 95 * pick(t, [[0, 0], [fr(5), 1], [fr(7), 0], [fr(13), 1], [fr(15), 0]]);
    const [mx, my] = pip.mitten('R', MITTEN_MIDDLE);
    flag.at(mx, my, { k, scale: 0.98, anchor: 'grip', rot: swing }).set({ wave: t2 * 1.5 });
    // the face: cheering (mouth open) through the hops, eyes open on whoever it's cheering on, a fuller blush
    const cheer = pick(t, [[0, 0], [fr(4), 1], [fr(18), 0]]) > 0;
    if (cheer) p.mouth = 'mouth-open';
    p.faceY -= cheer ? 3 : 0;
    p.faceX += 3;
    p.blush = pick(t, [[0, 0.45], [fr(5), 1], [fr(18), 0.45]]);
    blink(pip, t, fr(21), fr(1));
  },
});
