/**
 * 牽牽 · 在嗎？ Are you there? — it is hiding behind a page standing on its edge, only its bow and the tip of the tag
 * showing over the top. It peeks out round the page's top corner — the bow first, then its eyes — looks at you, and
 * gives a small wave; then it ducks back until only the bow shows again.
 * Key pose: the page, 牽牽's bow and tip just over its top edge.
 *
 * The body moves on 6 frames (out 3, back 3) and holds the peek; while it holds, only the arm, the face and the loops
 * move.
 */
import { blink, cycles, defineSticker, env, fr, keys, snap } from '../kit';
import { perk } from './_local';

const K = 0.6;
/** Where 牽牽 stands behind the page, and the page: the middle of its foot, its size (it hides the whole tag). */
const X = 170;
const PAGE: [number, number] = [172, 410];
const PAGE_SCALE = 1.06;
const PAGE_SX = 1.26;
/** The peek at its fullest: leaning out (degrees), up (px) and along (px) past the page's top right corner. */
const LEAN = 22;
const UP = 52;
const OUT = 34;
/** The arms' lifts: tucked in before it while it hides, and the waving mitten up beside its face. */
const TUCKED = -14;
const WAVE = 140;

export default defineSticker({
  duration: 2.5,
  // the thumb: peeking round the corner, looking at you with a little 'o', the mitten up mid-wave
  hero: fr(15),
  cast: { tw: { slug: 'tag', x: X, ground: 408, k: K, z: 10 } },
  props: { page: { kind: 'panel', seed: 3, z: 100 } },
  frame(t, { tw }, { page }) {
    const p = tw.pose;
    page.at(PAGE[0], PAGE[1], { k: K, scale: PAGE_SCALE, sx: PAGE_SX, anchor: 'base', rot: -1 });
    // out round the corner in three steps (the bow, one eye, both), held, back in three
    const tb = snap(t, [0, fr(3), fr(5), fr(7), fr(21), fr(23), fr(25)]);
    const out = keys(tb, [[0, 0], [fr(3), 0.35], [fr(5), 0.72], [fr(7), 1], [fr(20), 1], [fr(21), 0.72], [fr(23), 0.35], [fr(25), 0]]);
    p.tilt = LEAN * out;
    p.rise += (UP * out) / K;
    tw.x = X + OUT * out;
    // its feet stay put behind the page while it leans out
    p.legL += 7 * out;
    p.legR += 7 * out;
    // the face slides to the open side as it peeks, and toward you
    p.faceX += 10 * out;
    p.faceY -= 3 * out;
    // hiding, the mittens are tucked in before it (inside the page's edges); out, the free one waves (the arm only)
    p.liftL = TUCKED;
    const w = env(t, fr(8), fr(10), fr(18), fr(20));
    p.liftR = TUCKED + (WAVE - TUCKED) * w + 13 * cycles(t, fr(10), fr(18), 2) * w;
    p.blush = 0.3 + 0.4 * out;
    // its loops perk up when it sees you
    perk(tw, keys(snap(t, [0, fr(9), fr(11), fr(19), fr(21)]), [[0, 0], [fr(9), 0.5], [fr(11), 1], [fr(19), 1], [fr(21), 0]]));
    // a little 'o': are you there?
    if (t >= fr(13) && t < fr(18)) p.mouth = 'mouth-o';
    blink(tw, t, fr(10), fr(2));
  },
});
