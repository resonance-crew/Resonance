/**
 * 摺摺 · 真的很謝謝你 Thank you so much — a deep, slow bow: down, held while its blush rises, and up again.
 * Key pose: standing, a small smile, a little blush.
 *
 * The body moves on 7 frames (down 3, up 4) and holds the bow; only the face changes while it holds.
 */
import { blink, bow, defineSticker, fr, keys, snap, step } from '../kit';

export default defineSticker({
  duration: 2.5,
  cast: { tuck: { slug: 'tuck', x: 214, ground: 410, k: 0.7 } },
  frame(t, { tuck }) {
    const p = tuck.pose;
    const tb = snap(t, [0, fr(6), fr(7), fr(8), fr(20), fr(21), fr(22), fr(23)]);
    // the bow: down over frames 6–8, held, up over 20–22, a touch past upright at 22, settled by 23
    const e = bow(tuck, tb, fr(5), fr(8), fr(19), fr(22), 1);
    if (tb === fr(22)) p.lean -= 4;
    // the mittens come in to its sides as it bows (polite), out again as it rises
    p.liftL = tuck.rest('L') - 22 * e;
    p.liftR = tuck.rest('R') - 22 * e;
    p.front = false;
    // eyes shut through the bow; the blush rises while it holds (stepped: a small change every other frame)
    if (e > 0.5) p.eyes = 'shut';
    const ts = step(t, 1 / 6);
    p.blush = keys(ts, [[0, 0.3], [fr(8), 0.5], [fr(16), 1.6], [fr(20), 1.6], [fr(23), 1], [fr(28), 0.3]]);
    p.mouth = e > 0.5 && ts > fr(12) && ts < fr(20) ? 'mouth-o' : 'mouth';
    blink(tuck, t, fr(26), fr(2));
  },
});
