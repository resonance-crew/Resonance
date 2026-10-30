/**
 * 牽牽 · 謝謝 Thanks — mittens together in front, it makes a small, polite bow; holding it, its eyes close happily, the
 * blush comes up and the bow's two loops perk up; it straightens, and the loops settle last.
 * Key pose: standing straight, both mittens together before its middle, a small smile.
 *
 * The body moves on 6 frames (down 3, up 3) and holds the bow; while it holds, only the face, blush and loops change.
 */
import { blink, bow, defineSticker, fr, keys, snap, step } from '../kit';
import { perk } from './_local';

/** Both mittens together before its middle (the polite stance: they meet over the tag's lower half). */
const TOGETHER = -37;

export default defineSticker({
  duration: 2,
  // the thumb: held in the bow, eyes shut, blushing, the loops up
  hero: fr(12),
  cast: { tw: { slug: 'tag', x: 216, ground: 414, k: 0.68 } },
  frame(t, { tw }) {
    const p = tw.pose;
    const tb = snap(t, [0, fr(4), fr(5), fr(6), fr(15), fr(16), fr(17)]);
    const e = bow(tw, tb, fr(3), fr(6), fr(14), fr(17), 0.78);
    // the mittens press together a touch as it bows
    p.liftL = TOGETHER - 4 * e;
    p.liftR = TOGETHER - 4 * e;
    // eyes shut (happy arcs) through the bow; the blush and the loops come up while it holds (stepped)
    if (e > 0.5) p.eyes = 'shut';
    const ts = step(t, 1 / 6);
    p.blush = keys(ts, [[0, 0.3], [fr(6), 0.5], [fr(10), 1.6], [fr(16), 1.6], [fr(22), 0.3]]);
    perk(tw, keys(ts, [[0, 0], [fr(6), 0], [fr(10), 1], [fr(18), 1], [fr(22), 0]]));
    blink(tw, t, fr(21), fr(2));
  },
});
