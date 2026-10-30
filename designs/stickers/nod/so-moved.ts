/**
 * 聆聆 · 好感動 So moved — the proposal's own "moved by a story": it hugs itself, eyes shut, and its card turns over to
 * the side the story filled; the blush spreads full, its beret slides a little off to the side and lifts, and it sways
 * slowly, one way and the other, while sparkles come and go. Then the card turns back and it lets go.
 * Key pose: standing, a small smile, a little blush.
 *
 * The body moves on 8 frames (the card turning over and back: 2 each; the sway: over 2, across 1, home 1) and holds
 * between; the arms (2 frames each way), the face, the blush and the sparkles change alone.
 */
import { blink, defineSticker, fr, keys, lerp, snap, SPARKLE_BIG, step } from '../kit';
import { ink, showInk, turned, WRITTEN } from './_local';

/** The self-hug: both arms across its card, the mittens at its chest. */
const HUG = -72;
/** How far it sways, degrees. */
const SWAY = 3;

export default defineSticker({
  duration: 2.5,
  // the thumb: hugging itself, swayed over, eyes shut, the card written full, the blush full, sparkles up
  hero: fr(13),
  cast: { nod: { slug: 'card', x: 216, ground: 402, k: 0.78 } },
  props: {
    cluster: { kind: 'sparkles', seed: 41 },
    one: { kind: 'sparkle', seed: 43 },
  },
  frame(t, { nod }, { cluster, one }) {
    const p = nod.pose;
    // the arms come round into the hug (f1–2), hold it, let go (f25–26)
    const hug = keys(snap(t, [0, fr(1), fr(2), fr(25), fr(26)]), [[0, 0], [fr(1), 0.55], [fr(2), 1], [fr(24), 1], [fr(25), 0.45], [fr(26), 0]]);
    p.front = hug > 0.05;
    p.liftL = lerp(nod.rest('L'), HUG, hug);
    p.liftR = lerp(nod.rest('R'), HUG, hug);
    // the card turns over to the written side (f5–6) and back (f23–24)
    const side = turned(t, 5, 23);
    p.sx *= side.sx;
    showInk(ink(nod, 'written', WRITTEN), side.written);
    // the sway, held between its moves: over to its left (f9–10), across (f16), home (f21)
    const tb = snap(t, [0, fr(9), fr(10), fr(16), fr(21)]);
    p.tilt += SWAY * keys(tb, [[0, 0], [fr(9), -0.5], [fr(10), -1], [fr(15), -1], [fr(16), 1], [fr(20), 1], [fr(21), 0]]);
    // the beret slides a little to the side and lifts while the card is written (it moves with the card's own frames)
    if (side.written) {
      p.decoX += 6;
      p.decoY += 7;
      p.decoR -= 3;
    }
    // eyes shut from the hug until it lets go; the blush full
    const ts = step(t, 1 / 12);
    if (ts >= fr(2) && ts < fr(26)) p.eyes = 'shut';
    p.blush = keys(step(t, 1 / 6), [[0, 0.3], [fr(4), 0.8], [fr(8), 2], [fr(22), 2], [fr(26), 0.8], [fr(30), 0.3]]);
    blink(nod, t, fr(28), fr(1));
    // sparkles: a cluster at the upper left and a big one at the right, coming and going on fours
    const ss = step(t, 1 / 6);
    cluster.at(86, 104, { k: nod.k }).set({ show: keys(ss, [[fr(6), 0], [fr(10), 1], [fr(18), 1], [fr(22), 0]]) });
    one.at(384, 92, { k: nod.k, scale: SPARKLE_BIG * keys(ss, [[fr(10), 0], [fr(12), 1], [fr(20), 1], [fr(24), 0]]) });
  },
});
