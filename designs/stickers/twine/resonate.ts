/**
 * 牽牽 · 共振了 We resonate — 牽牽 and 聆聆 face each other. Soft ripples open between them, ")))" from 牽牽 in its blue and
 * "(((" from 聆聆 in its lavender, and meet in the middle. Three beats: 牽牽 bobs on each and a ripple runs out from both
 * sides (牽牽's a moment first); 聆聆 answers the first two with a hop of its beret and, by the third, bobs with it; both
 * blush a little more each time. On the third their eyes close, 牽牽's loops are all the way up and a small heart blooms
 * where the ripples meet. Then the ripples and the heart fold away.
 * Key pose: the two standing face to face, a small smile each.
 *
 * The bodies bob only on the beats (up on its legs on the beat, back on the next frame; the legs stay, so a bob redraws
 * the paper, not the whole puppet): 牽牽 on all three, 聆聆 on the third; between, only the faces, the blushes, 牽牽's
 * loops, 聆聆's beret, the ripples and the heart change.
 */
import { blink, defineSticker, fr, keys, snap, step } from '../kit';
import { perk, RIPPLES_KIND } from './_local';

const K = 0.55;
/** The beats: the frame each one lands on. */
const BEATS = [fr(7), fr(13), fr(19)];
/** Where the ripples meet: in the gap between the two, above 聆聆's card, at 牽牽's eye height. */
const MEET: [number, number] = [180, 210];

/** On a beat (`late` after it): 1 on its frame, else 0. */
function bob(t: number, late = 0): number {
  return BEATS.some(b => Math.abs(t - b - late) < 1e-6) ? 1 : 0;
}

/** The blush: a little more on each beat, held, then back down in steps after the third. */
function blushAt(t: number): number {
  if (t >= fr(24)) return keys(t, [[fr(24), 1.5], [fr(26), 1], [fr(28), 0.3]]);
  return 0.3 + 0.4 * BEATS.filter(x => t >= x - 1e-6).length;
}

export default defineSticker({
  duration: 2.5,
  // the thumb: the third beat — the heart blooming where the ripples meet, both blushing, eyes shut, the loops up
  hero: fr(20),
  cast: {
    tw: { slug: 'tag', x: 68, ground: 412, k: K, z: 20 },
    nod: { slug: 'card', x: 305, ground: 412, k: K, z: 10 },
  },
  props: {
    ripples: { kind: RIPPLES_KIND, seed: 4, z: 90 },
    heart: { kind: 'heart', seed: 13, z: 100 },
  },
  frame(t, { tw, nod }, { ripples, heart }) {
    const a = tw.pose;
    const b = nod.pose;
    // arms in close: 牽牽's mittens together before it, 聆聆's hanging at its sides
    a.liftL = -24;
    a.liftR = -24;
    b.liftL = 4;
    b.liftR = 4;
    // the beats: 牽牽 leads — it bobs on each, and 聆聆 answers the first two with a hop of its beret two frames later;
    // by the third it has caught the rhythm, and the two bob up together
    const v = bob(t);
    const third = Math.abs(t - BEATS[2]) < 1e-6 ? 1 : 0;
    for (const [q, amt] of [[a, v], [b, third]] as const) {
      q.bodyUp += 10 * amt;
      q.sy *= 1 + 0.025 * amt;
      q.sx *= 1 - 0.015 * amt;
    }
    const answer = bob(t, fr(2)) * (t < BEATS[2] ? 1 : 0);
    b.decoY += 9 * answer + 6 * third;
    b.decoR -= 4 * answer;
    // faces: looking at each other (牽牽 down at 聆聆, 聆聆 up at 牽牽)
    a.faceX += 9;
    a.faceY += 4;
    b.faceX -= 9;
    b.faceY -= 5;
    // a little more blush with each beat, eyes shut from the third, 牽牽's loops a little higher each time
    const ts = step(t, 1 / 12);
    a.blush = blushAt(ts);
    b.blush = blushAt(ts);
    if (ts >= fr(19) && ts < fr(24)) {
      a.eyes = 'shut';
      b.eyes = 'shut';
    }
    const loops = ts >= fr(24) ? keys(step(t, 1 / 6), [[fr(24), 1], [fr(27), 0]]) : BEATS.filter(x => ts >= x - 1e-6).length / 3;
    perk(tw, loops + 0.3 * v);
    // the ripples: open from both sides (牽牽's first), a ripple out through them from each beat, folded at the end
    const show = keys(snap(t, [0, fr(3), fr(4), fr(5), fr(24), fr(25), fr(26)]), [[0, 0], [fr(3), 0.35], [fr(4), 0.7], [fr(5), 1], [fr(24), 1], [fr(25), 0.55], [fr(26), 0]]);
    const pulse = BEATS.map(x => (t >= x - 1e-6 && t < x + fr(3) ? (t - x + fr(1)) / fr(4) : 0)).reduce((s, u) => s + u, 0);
    if (show > 0) ripples.at(MEET[0], MEET[1], { k: K, scale: 1.12, rot: 10 }).set({ show, pulse });
    // the heart: blooms where they meet on the third beat, held, folds with the ripples
    const bloom = keys(snap(t, [0, fr(19), fr(20), fr(21), fr(24), fr(25)]), [[0, 0], [fr(19), 0.55], [fr(20), 1.12], [fr(21), 1], [fr(24), 1], [fr(25), 0]]);
    if (bloom > 0) heart.at(MEET[0], MEET[1] + 2, { k: K, scale: 0.54 * bloom }).set({ glow: 0.55, warm: 0.5 });
    blink(tw, t, fr(27), fr(1));
    blink(nod, t, fr(15), fr(1));
  },
});
