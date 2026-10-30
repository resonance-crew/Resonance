/**
 * 聆聆 · 謝謝你願意說 Thank you for telling me — it lays a mitten on its heart and listens: two slow nods, and while you
 * talk its card fills with its handwriting, row by row. Then the mitten comes down and the page rests again.
 * Key pose: standing, a small smile, a little blush, its card with only its own few words.
 *
 * The body moves on 7 frames (two nods: down 2 each, up 2 and 1); the arm, the face and the writing carry the rest.
 */
import { blink, defineSticker, ease, fr, keys, lerp, snap, span, step } from '../kit';
import { written } from './_local';

/** Where the mitten lies on its card: its heart, under the right cheek (rig units). */
const HEART: [number, number] = [432, 556];

export default defineSticker({
  duration: 2.5,
  // the thumb: deep in the second nod, eyes shut, the mitten on its heart, the card written full
  hero: fr(19),
  cast: { nod: { slug: 'card', x: 216, ground: 396, k: 0.8 } },
  frame(t, { nod }) {
    const p = nod.pose;
    // two slow nods: the paper tips toward you (down on f8–9 and f16–17, back up on f12–13 and f20)
    const tb = snap(t, [0, fr(8), fr(9), fr(12), fr(13), fr(16), fr(17), fr(20)]);
    const nodE = keys(tb, [[0, 0], [fr(8), 0.5], [fr(9), 1], [fr(11), 1], [fr(12), 0.45], [fr(13), 0], [fr(16), 0.55], [fr(17), 1], [fr(19), 1], [fr(20), 0]]);
    p.lean += 14 * nodE;
    p.faceY += 6 * nodE;
    p.decoY -= 3 * nodE;
    // the mitten up onto its heart (f3–6), resting there, down again (f23–26)
    const on = keys(t, [[fr(2), 0], [fr(6), 1, ease.out], [fr(23), 1], [fr(26), 0]]);
    p.front = on > 0.05;
    const [hx, hy] = nod.pagePoint(...HEART);
    nod.setLift('R', lerp(nod.rest('R'), nod.aim('R', hx, hy), on));
    // eyes shut at the bottom of each nod; a slow blink before the end
    if (nodE > 0.9) p.eyes = 'shut';
    blink(nod, t, fr(27), fr(2));
    // the blush warms as it listens (stepped: a small change every other frame)
    p.blush = keys(step(t, 1 / 6), [[0, 0.3], [fr(6), 0.4], [fr(14), 0.9], [fr(22), 1.1], [fr(26), 0.6], [fr(30), 0.3]]);
    // the writing: from the mitten on its heart to the bottom of the second nod, every row; it fades as the page rests
    const u = span(t, fr(5), fr(18));
    written(nod, u, keys(t, [[fr(25), 1], [fr(26), 0.4], [fr(27), 0]]));
  },
});
