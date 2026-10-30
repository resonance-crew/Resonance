/**
 * 聆聆 · 謝謝你願意說 Thank you for telling me — it lays a mitten on its chest, and its card turns over to the side
 * your words filled; a small nod, then a deep, slow one, eyes shut and the blush full. Then the mitten comes down and the
 * card turns back.
 * Key pose: standing, a small smile, a little blush, its card with only its own few words.
 *
 * The body moves on 7 frames (the card turning over and back: 2 each; the deep nod: down 2, up 1); the first, small
 * nod is the face's alone; the arm and the blush change alone. The deep nod is the kit's bow.
 */
import { blink, defineSticker, ease, fr, keys, lerp, snap, step } from '../kit';
import { bowBy, ink, showInk, turned, WRITTEN } from './_local';

/** Where the mitten lies: its chest, under the left of its face (rig units). */
const CHEST: [number, number] = [281, 529];

export default defineSticker({
  duration: 2.5,
  // the thumb: deep in the second nod, eyes shut, blush full, the mitten on its chest, the card written full
  hero: fr(19),
  cast: { nod: { slug: 'card', x: 216, ground: 396, k: 0.8 } },
  frame(t, { nod }) {
    const p = nod.pose;
    // the card turns over to the written side (f7–8) and back (f26–27)
    const side = turned(t, 7, 26);
    p.sx *= side.sx;
    showInk(ink(nod, 'written', WRITTEN), side.written);
    // a small nod of the face alone (f11–13: the card holds), then a deep one, the card tipping toward you (down
    // f16–17, held, up f22)
    const small = t >= fr(11) - 1e-6 && t < fr(14) - 1e-6 ? 1 : 0;
    p.faceY += 7 * small;
    p.decoY -= 3 * small;
    if (small) p.eyes = 'shut';
    const tb = snap(t, [0, fr(16), fr(17), fr(22)]);
    const n = keys(tb, [[0, 0], [fr(16), 0.5], [fr(17), 1], [fr(21), 1], [fr(22), 0]]);
    bowBy(nod, n, 0.95);
    // the mitten up onto its chest (f2–5), resting there, down again (f22–25)
    const on = keys(t, [[fr(1), 0], [fr(5), 1, ease.out], [fr(22), 1], [fr(25), 0]]);
    p.front = on > 0.05;
    const [cx, cy] = nod.pagePoint(...CHEST);
    nod.setLift('L', lerp(nod.rest('L'), nod.aim('L', cx, cy), on));
    blink(nod, t, fr(28), fr(1));
    // the blush warms as it listens (stepped: a small change every other frame), full in the second nod
    p.blush = keys(step(t, 1 / 6), [[0, 0.3], [fr(6), 0.6], [fr(12), 1.1], [fr(16), 1.6], [fr(22), 1.6], [fr(26), 0.6], [fr(30), 0.3]]);
  },
});
