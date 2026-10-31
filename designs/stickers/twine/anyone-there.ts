/**
 * 牽牽 · 在嗎？ Are you there? — a long, thin wall stands at the sticker's left, its edge the brand's wave. 牽牽 is behind
 * it, only the tip of its tag and a loop of its bow showing past the edge; it leans out from the wall's right side, its
 * whole face out, looks at you with a little 'o' and waves twice; then it slips back behind the wall.
 * Key pose: the wall, the tip of the tag and a loop of the bow just past its edge (it lasts three frames of the loop).
 *
 * The body moves on 6 frames (out 3, back 3) and holds the peek; while it holds, only the arm, the face and the loops
 * move.
 */
import { blink, cycles, defineSticker, env, fr, keys, lerp, snap } from '../kit';
import { cutLeftOf, perk, WALL_KIND } from './_local';

const K = 0.7;
/** The wall: where its top is (px), how large (px per its unit), where its far side and its foot are (px). */
const WALL_TOP: [number, number] = [36, 14];
const WALL_K = 0.627;
const BEHIND = 26;
const WALL_FOOT = { y: 414, right: 70 };
/** Behind the wall (its middle, px; leaning a little) and out round its edge: along, and leaning out (degrees). */
const HIDDEN_X = -18;
const OUT_X = 38;
const HIDDEN_LEAN = 6;
const OUT_LEAN = 24;
/** The arms' lifts: tucked in before it, and the waving mitten up beside its face. */
const TUCKED = -14;
const WAVE = 140;

export default defineSticker({
  duration: 2.25,
  // the thumb: out round the wall's edge, its whole face showing, a little 'o', the mitten up mid-wave
  hero: fr(13),
  cast: { tw: { slug: 'tag', x: HIDDEN_X, ground: 410, k: K, z: 10 } },
  props: { wall: { kind: WALL_KIND, seed: 14, z: 100 } },
  frame(t, { tw }, { wall }) {
    const p = tw.pose;
    wall.at(WALL_TOP[0], WALL_TOP[1], { k: WALL_K, anchor: 'top' });
    // out round the edge in three steps (the bow and tip, one eye, the whole face), held, back in three; behind the
    // wall only from f25 to f0 (three frames)
    const tb = snap(t, [0, fr(1), fr(3), fr(5), fr(20), fr(22), fr(25)]);
    const out = keys(tb, [[0, 0], [fr(1), 0.4], [fr(3), 0.75], [fr(5), 1], [fr(19), 1], [fr(20), 0.75], [fr(22), 0.4], [fr(25), 0]]);
    tw.x = lerp(HIDDEN_X, OUT_X, out);
    p.tilt = lerp(HIDDEN_LEAN, OUT_LEAN, out);
    // its feet stay behind the wall as it leans out
    p.legL += 28 * out;
    p.legR += 28 * out;
    // the face slides to the open side as it peeks, and toward you
    p.faceX += 12 * out;
    p.faceY -= 3 * out;
    // tucked in behind the wall; out, the free mitten waves twice
    p.liftL = TUCKED;
    const w = env(t, fr(6), fr(8), fr(16), fr(18));
    p.liftR = TUCKED + (WAVE - TUCKED) * w + 14 * cycles(t, fr(8), fr(16), 2) * w;
    p.blush = 0.3 + 0.4 * out;
    // its loops perk up when it sees you
    perk(tw, keys(snap(t, [0, fr(7), fr(9), fr(18), fr(20)]), [[0, 0], [fr(7), 0.5], [fr(9), 1], [fr(18), 1], [fr(20), 0]]));
    // a little 'o': are you there?
    if (t >= fr(11) && t < fr(16)) p.mouth = 'mouth-o';
    blink(tw, t, fr(8), fr(1));
    // whatever of it is behind the wall doesn't reach past the wall's far side, nor under its foot
    cutLeftOf(tw, BEHIND, WALL_FOOT);
  },
});
