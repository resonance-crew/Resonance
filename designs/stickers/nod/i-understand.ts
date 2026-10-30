/**
 * 聆聆 · 我懂 I understand — its eyes soften shut, a mitten comes to its heart, and it gives two slow, deep nods, the
 * card tipping toward you, the beret swinging forward, two pencil strokes at its shoulders as each nod lands; then it
 * straightens and looks at you again.
 * Key pose: standing, eyes open, a small smile.
 *
 * The body moves on 8 frames (each nod: down 2, up 2; the kit's bow at a nod's depth); the arm, the face, the blush and
 * the strokes change alone. (While the card is tipped toward you anything else that changes redraws all of it, so the
 * mitten settles before the first nod and the strokes come with the nods' own frames.)
 */
import { blink, bowStrokes, defineSticker, ease, fr, keys, lerp, snap, step } from '../kit';
import { bowBy } from './_local';

/** Where the mitten lies: its heart, under the right of its face (rig units). */
const HEART: [number, number] = [428, 552];

export default defineSticker({
  duration: 2.5,
  // the thumb: the bottom of the second nod, eyes shut, the mitten on its heart, the strokes at its shoulders
  hero: fr(17),
  cast: { nod: { slug: 'card', x: 216, ground: 398, k: 0.76 } },
  props: {
    sl: { kind: 'strokes', seed: 51 },
    sr: { kind: 'strokes', seed: 52 },
  },
  frame(t, { nod }, { sl, sr }) {
    const p = nod.pose;
    // the mitten to its heart (f2–5), held, down again (f22–25)
    const on = keys(t, [[fr(1), 0], [fr(5), 1, ease.out], [fr(22), 1], [fr(25), 0]]);
    p.front = on > 0.05;
    const [hx, hy] = nod.pagePoint(...HEART);
    nod.setLift('R', lerp(nod.rest('R'), nod.aim('R', hx, hy), on));
    // two nods: down f7–8 and f15–16, up f11–12 and f20–21
    const tb = snap(t, [0, fr(7), fr(8), fr(11), fr(12), fr(15), fr(16), fr(20), fr(21)]);
    const n = keys(tb, [[0, 0], [fr(7), 0.5], [fr(8), 1], [fr(10), 1], [fr(11), 0.45], [fr(12), 0], [fr(15), 0.5], [fr(16), 1], [fr(19), 1], [fr(20), 0.45], [fr(21), 0]]);
    const e = bowBy(nod, n, 0.9);
    bowStrokes(nod, sl, sr, e);
    // the eyes soften shut before the first nod and stay shut until it straightens
    const ts = step(t, 1 / 12);
    if (ts >= fr(4) && ts < fr(22)) p.eyes = 'shut';
    p.blush = keys(step(t, 1 / 6), [[0, 0.3], [fr(4), 0.5], [fr(10), 1], [fr(18), 1], [fr(24), 0.4], [fr(30), 0.3]]);
    blink(nod, t, fr(27), fr(1));
  },
});
