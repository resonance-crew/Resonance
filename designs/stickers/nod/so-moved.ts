/**
 * 聆聆 · 好感動 So moved — a story reaches it: its eyes close, the blush spreads full, its arms open a little, and it
 * sways slowly, one way and the other, its face and its beret lifting a little as if the warmth raised them; little
 * sparkles come and go round it.
 * Key pose: standing, a small smile, a little blush.
 *
 * The body moves on 6 frames (the sway: over 2, back across 2, home 2) and holds between; the arms, the face, the
 * blush and the beret ride those frames or change alone.
 */
import { bell, blink, defineSticker, ease, fr, keys, lerp, snap, step } from '../kit';

/** How far its arms open, lift (rest is 36): out and a little up, as if the feeling lifted them. */
const OPEN = 56;
/** How far it sways, degrees. */
const SWAY = 3;

export default defineSticker({
  duration: 2.5,
  // the thumb: swayed over, eyes shut, the blush full, arms open, the beret lifted
  hero: fr(12),
  cast: { nod: { slug: 'card', x: 216, ground: 402, k: 0.74 } },
  props: {
    s1: { kind: 'sparkle', seed: 41 },
    s2: { kind: 'sparkle', seed: 42 },
    s3: { kind: 'sparkle', seed: 43 },
  },
  frame(t, { nod }, { s1, s2, s3 }) {
    const p = nod.pose;
    // the sway: over to its left (f6–7), across (f13–14), home (f21–22)
    const tb = snap(t, [0, fr(6), fr(7), fr(13), fr(14), fr(21), fr(22)]);
    p.tilt = SWAY * keys(tb, [[0, 0], [fr(6), -0.5], [fr(7), -1], [fr(12), -1], [fr(13), 0], [fr(14), 1], [fr(20), 1], [fr(21), 0.45], [fr(22), 0]]);
    // the beret lifts off the card with the feeling (on the body's frames), and settles a beat after it comes home
    const lift = keys(snap(t, [0, fr(6), fr(7), fr(14), fr(22), fr(23), fr(24)]), [[0, 0], [fr(6), 0.5], [fr(7), 1], [fr(14), 1.15], [fr(22), 0.6], [fr(23), -0.15], [fr(24), 0]]);
    p.decoY += 20 * lift;
    p.decoR -= 5 * lift;
    // the arms open a little (f3–6) and stay open through the sway, down again (f22–25)
    const up = keys(t, [[fr(2), 0], [fr(6), 1, ease.out], [fr(22), 1], [fr(25), 0]]);
    p.liftL = lerp(nod.rest('L'), OPEN, up);
    p.liftR = lerp(nod.rest('R'), OPEN, up);
    // the face: an "oh" as it is touched, then eyes shut, a smile, the blush spreading full
    const ts = step(t, 1 / 12);
    if (ts >= fr(3) && ts < fr(5)) p.mouth = 'mouth-o';
    if (ts >= fr(5) && ts < fr(24)) p.eyes = 'shut';
    p.blush = keys(step(t, 1 / 6), [[0, 0.3], [fr(4), 0.6], [fr(10), 2], [fr(20), 2], [fr(26), 0.6], [fr(30), 0.3]]);
    p.faceY -= 3 * up;
    blink(nod, t, fr(1), fr(1));
    // three little sparkles come and go round its head while it sways (grown in and out, on fours)
    const ss = step(t, 1 / 6);
    s1.at(50, 140, { k: nod.k * 1.25 }).set({ show: bell(ss, fr(6), fr(16), 0.3, 0.35) });
    s2.at(388, 80, { k: nod.k * 1.05 }).set({ show: bell(ss, fr(10), fr(20), 0.3, 0.35) });
    s3.at(108, 84, { k: nod.k * 0.85 }).set({ show: bell(ss, fr(14), fr(24), 0.3, 0.35) });
  },
});
