/**
 * 聆聆 · 謝謝你讀到最後 Thanks for reading to the end — it takes its beret off by the soft brim, brings it down to its
 * heart, makes a small bow with its eyes shut and its blush rising, straightens up and puts the beret back on.
 * Key pose: standing, beret on, a small smile.
 *
 * The body moves on 5 frames (the bow: down 3, up 2); the arm and the beret travel on frames of their own (a beret
 * held in a mitten goes where the mitten goes), the face rides.
 */
import { blink, defineSticker, fr, keys, snap, step } from '../kit';
import { HAT, hatAt, hatByGrip, mittenOnBody } from './_local';

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
  { f: 9, lift: -44, hat: [-18, 0.8] }, // at its heart
  { f: 22, lift: 18, hat: [-10, 0.82] },
  { f: 23, lift: 112, hat: [-40, 0.92] },
  { f: 24, lift: 165, hat: 'landing' },
  { f: 25, lift: 150, hat: 'on' },
  { f: 26, lift: 100, hat: 'on' },
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
  // the thumb: deep in the bow, eyes shut, the beret held to its heart
  hero: fr(16),
  cast: { nod: { slug: 'card', x: 208, ground: 400, k: 0.74 } },
  frame(t, { nod }) {
    const p = nod.pose;
    // the bow: down over f11–13, held, up over f20–21
    const tb = snap(t, [0, fr(11), fr(12), fr(13), fr(20), fr(21)]);
    const e = keys(tb, [[0, 0], [fr(11), 0.4], [fr(12), 0.8], [fr(13), 1], [fr(19), 1], [fr(20), 0.45], [fr(21), 0]]);
    p.lean += 24 * e;
    p.faceY += 8 * e;
    p.bodyUp -= 6 * e;
    p.legS *= 1 - 0.06 * e;
    // the other mitten comes in to its side as it bows (polite)
    p.liftL = nod.rest('L') - 20 * e;
    // the right arm and the beret
    const m = move(t);
    p.liftR = m.lift;
    p.front = m.lift !== 36;
    if (m.hat === 'landing') hatAt(nod, HAT.middle[0], HAT.middle[1] - 4, -1);
    else if (m.hat !== 'on') hatByGrip(nod, ...mittenOnBody(nod, 'R', m.lift), m.hat[0], m.hat[1]);
    // the face: a happy "ah" as the beret comes off, eyes shut through the bow, a smile on the way up
    if (t >= fr(7) && t < fr(10)) p.mouth = 'mouth-open';
    if (e > 0.3) p.eyes = 'shut';
    if (t >= fr(21) && t < fr(23)) p.mouth = 'mouth-open';
    p.blush = keys(step(t, 1 / 6), [[0, 0.3], [fr(10), 0.5], [fr(16), 1.5], [fr(20), 1.2], [fr(26), 0.4], [fr(30), 0.3]]);
    blink(nod, t, fr(1), fr(1));
  },
});
