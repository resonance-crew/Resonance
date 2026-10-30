/**
 * 聆聆 · 謝謝你讀到最後 Thanks for reading to the end — it takes its beret off by the soft brim and holds it to its chest
 * with both mittens, dome up, then makes a small bow (the kit's bow, its pencil strokes at the shoulders), eyes shut and
 * the blush rising; it straightens up and puts the beret back on.
 * Key pose: standing, beret on, a small smile.
 *
 * The body moves on 5 frames (the bow: down 3, up 2); the arms and the beret travel on frames of their own (a beret
 * held in a mitten goes where the mitten goes), the face rides.
 */
import { blink, bow, bowStrokes, defineSticker, fr, keys, lerp, snap, step } from '../kit';
import { HAT, hatAt, hatByGrip, hatPoint, mittenOnBody } from './_local';

/** Where the left mitten holds the beret at its chest: the brim's lower left, as the beret rests on its head (rig units). */
const BRIM_LEFT: [number, number] = [318, 404];

/**
 * The right arm and the beret, frame by frame: the arm's lift, and the beret on its head ('on'), a hair above it as it
 * lands ('landing'), or held by the brim in the mitten [turn, scale]. Held from the last entry until the next.
 */
const MOVES: readonly { f: number; lift: number; hat: 'on' | 'landing' | readonly [number, number] }[] = [
  { f: 0, lift: 36, hat: 'on' },
  { f: 2, lift: 70, hat: 'on' }, // up round the outside
  { f: 3, lift: 125, hat: 'on' },
  { f: 4, lift: 160, hat: 'on' },
  { f: 5, lift: 167, hat: 'on' }, // on the brim
  { f: 6, lift: 162, hat: [-9, 1] }, // tipped up
  { f: 7, lift: 112, hat: [-40, 0.92] }, // off, out to the side, hanging clear of its face
  { f: 8, lift: 18, hat: [-10, 0.82] }, // swung down in front
  { f: 9, lift: -64, hat: [-8, 0.8] }, // at its chest, dome up
  { f: 22, lift: 18, hat: [-10, 0.82] },
  { f: 23, lift: 112, hat: [-40, 0.92] },
  { f: 24, lift: 165, hat: 'landing' },
  { f: 25, lift: 150, hat: 'on' },
  { f: 26, lift: 104, hat: 'on' },
  { f: 27, lift: 58, hat: 'on' },
  { f: 28, lift: 36, hat: 'on' },
];

function move(t: number): (typeof MOVES)[number] {
  let m = MOVES[0];
  for (const x of MOVES) if (fr(x.f) <= t + 1e-6) m = x;
  return m;
}

export default defineSticker({
  duration: 2.5,
  // the thumb: the bottom of the bow, eyes shut, the beret held dome up at its chest, the strokes at its shoulders
  hero: fr(16),
  cast: { nod: { slug: 'card', x: 204, ground: 400, k: 0.72 } },
  props: {
    sl: { kind: 'strokes', seed: 81 },
    sr: { kind: 'strokes', seed: 82 },
  },
  frame(t, { nod }, { sl, sr }) {
    const p = nod.pose;
    // a happy "ah" as the beret comes off (before the bow, which keeps the closed smile)
    if (t >= fr(7) - 1e-6 && t < fr(10) - 1e-6) p.mouth = 'mouth-open';
    // the bow (the kit's): down over f11–13, held, up over f20–21
    const tb = snap(t, [0, fr(11), fr(12), fr(13), fr(20), fr(21)]);
    const e = bow(nod, tb, fr(10), fr(13), fr(19), fr(21), 1);
    bowStrokes(nod, sl, sr, e);
    // the right arm and the beret
    const m = move(t);
    p.liftR = m.lift;
    p.front = m.lift !== 36;
    if (m.hat === 'landing') hatAt(nod, HAT.middle[0], HAT.middle[1] - 4, -1);
    else if (m.hat !== 'on') hatByGrip(nod, ...mittenOnBody(nod, 'R', m.lift), m.hat[0], m.hat[1]);
    // the left mitten comes to hold the beret's brim at its chest (f9–10) until it goes back up (f22)
    const both = keys(t, [[fr(8), 0], [fr(10), 1], [fr(21), 1], [fr(22), 0]]);
    if (both > 0) {
      const [bx, by] = nod.pagePoint(...hatPoint(nod, ...BRIM_LEFT));
      p.liftL = lerp(nod.rest('L'), nod.aim('L', bx, by), both);
    }
    p.blush = keys(step(t, 1 / 6), [[0, 0.3], [fr(10), 0.5], [fr(16), 1.5], [fr(20), 1.2], [fr(26), 0.4], [fr(30), 0.3]]);
    blink(nod, t, fr(1), fr(1));
  },
});
