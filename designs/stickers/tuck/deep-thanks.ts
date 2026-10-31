/**
 * 摺摺 · 真的很謝謝你 Thank you so much — it brings its mittens together before its chest (合掌, thumbs up, at its mouth), bows (the kit's bow:
 * a little forward, the face dropping, the fringe swinging forward), eyes shut, its blush spreading, a sparkle at each
 * shoulder while it holds; then it rises and lets its mittens down. A closed smile throughout — never mouth-o.
 * Key pose: standing, smiling. Hero: deep in the bow, palms together, blush 2, both sparkles up.
 *
 * The body moves on 6 frames (down 3, up 3); the mittens on 3 frames each way, the face and sparkles while it holds.
 */
import { blink, bow, defineSticker, ease, fr, keys, snap, SPARKLE_BIG, step } from '../kit';

export default defineSticker({
  duration: 2.5,
  // the thumb: deep in the bow, palms together, blush 2, both sparkles up
  hero: fr(16),
  cast: { tuck: { slug: 'tuck', x: 216, ground: 412, k: 0.8 } },
  props: {
    sl: { kind: 'sparkle', seed: 21 },
    sr: { kind: 'sparkle', seed: 22 },
  },
  frame(t, { tuck }, { sl, sr }) {
    const p = tuck.pose;
    const tb = snap(t, [0, fr(8), fr(9), fr(10), fr(21), fr(22), fr(23)]);
    // palms together before the chest (f3–6) and apart again (f24–27): each mitten aimed just under the face
    const join = keys(snap(t, [0, fr(4), fr(5), fr(6), fr(24), fr(25), fr(26)]), [[0, 0], [fr(3), 0], [fr(6), 1, ease.smooth], [fr(23), 1], [fr(26), 0, ease.smooth]]);
    // the bow: down f8–10, held, up f21–23
    const e = bow(tuck, tb, fr(7), fr(10), fr(20), fr(23), 0.85);
    // joined at the mouth, not over it (the owner: lower, at the mouth), thumbs up: arms swung in across the body carry
    // their thumbs underneath, so they are flipped along their length once they have come in
    const [cx, cy] = tuck.pagePoint(349, 524);
    p.liftL = tuck.rest('L') + (tuck.aim('L', cx, cy) - tuck.rest('L')) * join;
    p.liftR = tuck.rest('R') + (tuck.aim('R', cx, cy) - tuck.rest('R')) * join;
    p.front = join > 0;
    p.flipL = p.flipR = join > 0.5;
    p.mouth = 'mouth';
    // the blush spreads while it holds (a small change every other frame)
    p.blush = keys(step(t, 1 / 6), [[0, 0.3], [fr(8), 0.6], [fr(14), 2], [fr(20), 2], [fr(24), 1], [fr(28), 0.3]]);
    if (e > 0.4) p.eyes = 'shut';
    blink(tuck, t, fr(28), fr(1));
    // a sparkle at each shoulder, grown in once it is down and away as it rises (on fours)
    const ss = step(t, 1 / 6);
    const k = tuck.k;
    sl.at(...tuck.pagePoint(150, 410), { k: k * SPARKLE_BIG }).set({ show: keys(ss, [[fr(10), 0], [fr(14), 1], [fr(20), 1], [fr(22), 0]]) });
    sr.at(...tuck.pagePoint(556, 384), { k: k * SPARKLE_BIG * 0.9 }).set({ show: keys(ss, [[fr(12), 0], [fr(16), 1], [fr(20), 1], [fr(22), 0]]) });
  },
});
