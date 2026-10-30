/**
 * 牽牽 · 在嗎？ Are you there? — it is crouched behind a sheet of kraft paper standing on its edge, only its bow showing over
 * the top. It comes up and leans out round the sheet's top corner — the bow first, then its eyes — its whole face out,
 * looks at you with a little 'o' and waves twice; then it ducks back down until only the bow shows again.
 * Key pose: the kraft sheet, 牽牽's bow just over its top edge (it lasts three frames of the loop).
 *
 * The body moves on 6 frames (out 3, back 3) and holds the peek; while it holds, only the arm, the face and the loops
 * move.
 */
import { blink, cycles, defineSticker, env, fr, keys, snap } from '../kit';
import { perk } from './_local';

const K = 0.6;
/** Where 牽牽 stands behind the sheet, and the sheet: the middle of its foot, its size (three quarters of a page's height). */
const X = 172;
const PAGE: [number, number] = [176, 410];
const PAGE_SCALE = 0.8;
const PAGE_SX = 1.62;
/** Kraft paper: a mid tone, so the sheet is a page edge on either paper, not a pale slab. */
const KRAFT = 'oklch(76% 0.055 72)';
/**
 * Crouched behind the sheet: lowered (px) on legs folded out of sight. Out, it stands at its full height and leans out
 * (degrees) and along (px) past the sheet's top right corner.
 */
const CROUCH = 100;
const LEAN = 18;
const OUT = 34;
/** The arms' lifts: tucked in before it while it hides, and the waving mitten up beside its face. */
const TUCKED = -14;
const WAVE = 140;

export default defineSticker({
  duration: 2.25,
  // the thumb: out round the corner, its whole face showing, a little 'o', the mitten up mid-wave
  hero: fr(13),
  cast: { tw: { slug: 'tag', x: X, ground: 408, k: K, z: 10 } },
  props: { page: { kind: 'panel', seed: 3, z: 100 } },
  frame(t, { tw }, { page }) {
    const p = tw.pose;
    page.at(PAGE[0], PAGE[1], { k: K, scale: PAGE_SCALE, sx: PAGE_SX, anchor: 'base', rot: -1 });
    page.svg.querySelector('path')?.setAttribute('fill', KRAFT);
    // up and out round the corner in three steps (the bow, one eye, the whole face), held, back down in three; hidden
    // only from f25 to f0 (three frames)
    const tb = snap(t, [0, fr(1), fr(3), fr(5), fr(20), fr(22), fr(25)]);
    const out = keys(tb, [[0, 0], [fr(1), 0.4], [fr(3), 0.75], [fr(5), 1], [fr(19), 1], [fr(20), 0.75], [fr(22), 0.4], [fr(25), 0]]);
    // crouched, the legs fold away behind the sheet (lowered by as much as they are shortened, so the feet stay put)
    const down = CROUCH * (1 - out);
    const legPx = tw.rig.legLen * K;
    p.rise -= down / K;
    p.legS *= Math.max(0.12, 1 - down / legPx);
    p.tilt = LEAN * out;
    tw.x = X + OUT * out;
    p.legL += 7 * out;
    p.legR += 7 * out;
    // the face slides to the open side as it peeks, and toward you
    p.faceX += 12 * out;
    p.faceY -= 3 * out;
    // hiding, the mittens are tucked in before it; out, the free one waves twice
    p.liftL = TUCKED;
    const w = env(t, fr(6), fr(8), fr(16), fr(18));
    p.liftR = TUCKED + (WAVE - TUCKED) * w + 14 * cycles(t, fr(8), fr(16), 2) * w;
    p.blush = 0.3 + 0.4 * out;
    // its loops perk up when it sees you
    perk(tw, keys(snap(t, [0, fr(7), fr(9), fr(18), fr(20)]), [[0, 0], [fr(7), 0.5], [fr(9), 1], [fr(18), 1], [fr(20), 0]]));
    // a little 'o': are you there?
    if (t >= fr(11) && t < fr(16)) p.mouth = 'mouth-o';
    blink(tw, t, fr(8), fr(1));
  },
});
