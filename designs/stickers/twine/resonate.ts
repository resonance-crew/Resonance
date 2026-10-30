/**
 * 牽牽 · 共振了 We resonate — 牽牽 and 聆聆 face each other. 牽牽 leans in and the brand's wave ≋ opens between them;
 * it pulses three times — 牽牽's loops flicking up on each beat, 聆聆's beret hopping in answer — and both blush a little
 * more each time; on the third 牽牽 bobs up, their eyes close and its loops are all the way up. Then the wave folds away and 牽牽 straightens.
 * Key pose: the two standing face to face, a small smile each.
 *
 * Only 牽牽's body moves (the lean in and out, the bob on the third beat: 4 frames); on the other beats its loops
 * flick, and 聆聆 answers with its beret, its face and its blush, so the wide card never has to be drawn again.
 */
import { blink, defineSticker, fr, keys, snap, step } from '../kit';
import { perk } from './_local';

const K = 0.6;
/** The beats: the frame each one lands on (the wave's pulse runs from there, on twos: 2 frames and back). */
const BEATS = [fr(7), fr(13), fr(19)];

/** On a beat (`late` after it, for the one answering): up on its frame, still from the next. */
function bob(t: number, late: number): number {
  return BEATS.some(b => Math.abs(t - b - late) < 1e-6) ? 1 : 0;
}

/** The blush: a little more on each beat, held, then back down in steps after the third. */
function blushAt(t: number): number {
  if (t >= fr(24)) return keys(t, [[fr(24), 1.5], [fr(26), 1], [fr(28), 0.3]]);
  return 0.3 + 0.4 * BEATS.filter(x => t >= x - 1e-6).length;
}

export default defineSticker({
  duration: 2.5,
  // the thumb: the third beat — the wave at its fullest, both blushing, eyes shut, the loops up
  hero: fr(19),
  cast: {
    tw: { slug: 'tag', x: 76, ground: 412, k: K, z: 20 },
    nod: { slug: 'card', x: 288, ground: 412, k: K, z: 10 },
  },
  props: { wave: { kind: 'wave', seed: 2, z: 100 } },
  frame(t, { tw, nod }, { wave }) {
    const a = tw.pose;
    const b = nod.pose;
    // 牽牽 leans in toward 聆聆 (f3) and straightens at the end (f26)
    a.tilt = t >= fr(3) && t < fr(26) ? 5 : 0;
    // arms in close: 牽牽's mittens together before it, 聆聆's hanging near its sides
    a.liftL = -24;
    a.liftR = -24;
    b.liftL = 4;
    b.liftR = 4;
    // the beats: on each, 牽牽's loops flick up (and on the third, the last and fullest, it bobs up too); 聆聆 answers
    // two frames later, its beret hopping — never on the same frame as 牽牽's body, so no frame redraws the whole width
    const v = bob(t, 0);
    const big = Math.abs(t - BEATS[2]) < 1e-6 ? 1 : 0;
    a.rise += 10 * big;
    a.sy *= 1 + 0.03 * big;
    a.sx *= 1 - 0.015 * big;
    const w = bob(t, fr(2));
    b.decoY += 10 * w;
    b.decoR -= 5 * w;
    // faces: looking at each other (牽牽 down at 聆聆, 聆聆 up at 牽牽)
    a.faceX += 9;
    a.faceY += 4;
    b.faceX -= 9;
    b.faceY -= 5;
    // each a little more blush with its own beat (聆聆's with its answer), eyes shut from the third, and 牽牽's loops a
    // little higher each time
    const ts = step(t, 1 / 12);
    a.blush = blushAt(ts);
    b.blush = blushAt(ts - fr(2));
    if (ts >= fr(19) && ts < fr(24)) a.eyes = 'shut';
    if (ts >= fr(21) && ts < fr(25)) b.eyes = 'shut';
    const loops = ts >= fr(24) ? keys(step(t, 1 / 6), [[fr(24), 1], [fr(27), 0]]) : BEATS.filter(x => ts >= x - 1e-6).length / 3;
    perk(tw, loops + 0.35 * v);
    // the wave: opens as they lean in, a pulse from each beat, folds away at the end
    const show = keys(snap(t, [0, fr(4), fr(5), fr(6), fr(24), fr(25), fr(26)]), [[0, 0], [fr(4), 0.4], [fr(5), 0.8], [fr(6), 1], [fr(24), 1], [fr(25), 0.6], [fr(26), 0]]);
    const pulse = BEATS.map(x => (t >= x - 1e-6 && t < x + fr(2) ? (t - x + fr(1)) / fr(3) : 0)).reduce((s, u) => s + u, 0);
    // on each beat the whole wave swells a little too, and settles over the next frame
    const swell = 1 + 0.12 * v + 0.05 * bob(t, fr(1));
    if (show > 0) wave.at(186, 192, { k: K, scale: 1.12 * swell, rot: 14 }).set({ show, pulse });
    blink(tw, t, fr(27), fr(1));
    blink(nod, t, fr(15), fr(1));
  },
});
