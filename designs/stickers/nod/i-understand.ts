/**
 * 聆聆 · 我懂 I understand — its eyes soften shut, its card tips a little to one side, and it gives two slow, knowing
 * nods, the beret dipping with each; then it straightens and looks at you again.
 * Key pose: standing, eyes open, a small smile.
 *
 * The body moves on 8 frames (each nod: down 2, up 2 — the side tilt comes in with the first and goes with the last);
 * the face and the blush change alone. (Anything changed while the card is tipped toward you redraws all of it, so
 * the beret and the mittens move only with the nods.)
 */
import { blink, defineSticker, fr, keys, snap, step } from '../kit';

/** The knowing tilt, degrees (its top toward its right, our left). */
const TILT = -4.5;

export default defineSticker({
  duration: 2.5,
  // the thumb: deep in the second nod, tipped to one side, eyes shut in arcs, a soft blush
  hero: fr(16),
  cast: { nod: { slug: 'card', x: 216, ground: 396, k: 0.8 } },
  frame(t, { nod }) {
    const p = nod.pose;
    const tb = snap(t, [0, fr(7), fr(8), fr(10), fr(11), fr(14), fr(15), fr(18), fr(19)]);
    // two nods: down f7–8 and f14–15, up f10–11 and f18–19
    const n = keys(tb, [[0, 0], [fr(7), 0.5], [fr(8), 1], [fr(9), 1], [fr(10), 0.45], [fr(11), 0], [fr(14), 0.5], [fr(15), 1], [fr(17), 1], [fr(18), 0.45], [fr(19), 0]]);
    // …tipped to one side from the first nod to the last
    const side = keys(tb, [[0, 0], [fr(7), 0.6], [fr(8), 1], [fr(18), 1], [fr(19), 0]]);
    p.lean += 16 * n;
    p.faceY += 6 * n;
    p.tilt += TILT * side;
    p.faceX -= 3 * side;
    // the beret dips with each nod, a little further than the card (it sits loose)
    p.decoY -= 5 * n;
    p.decoR += 2 * n;
    // the mittens give a little at the bottom of each nod
    p.liftL = nod.rest('L') - 6 * n;
    p.liftR = nod.rest('R') - 6 * n;
    // the eyes soften: half a beat down-turned, then shut in arcs until it looks up again
    const ts = step(t, 1 / 12);
    if (ts >= fr(4) && ts < fr(22)) p.eyes = 'shut';
    if (ts >= fr(3) && ts < fr(4)) p.faceY += 2;
    p.blush = keys(step(t, 1 / 6), [[0, 0.3], [fr(4), 0.4], [fr(10), 0.9], [fr(18), 0.9], [fr(24), 0.4], [fr(30), 0.3]]);
    blink(nod, t, fr(26), fr(2));
  },
});
