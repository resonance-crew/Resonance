/**
 * 聆聆 · 這句好喜歡 Love this line — it looks down at a line on its card, a terracotta underline draws itself beneath
 * it, and it lights up and hugs itself, eyes shut, with a happy wiggle.
 * Key pose: standing, a small smile, two lines written low on its card.
 *
 * The body moves on 5 frames (a squeeze, a wiggle each way and home); the underline, the arms and the face change alone.
 */
import { blink, defineSticker, ease, fr, keys, lerp, snap, span, step } from '../kit';

/**
 * Two lines written low on its card, under where its mittens meet in the hug (rig units: the first line's left end);
 * the second is the one it loves.
 */
const WORDS: [number, number] = [194, 596];
const SCALE = 0.9;
/** Where the underline starts, under the second line. */
const UNDER: [number, number] = [191, 617];
/** The self-hug: both arms across its card (the rig's hug-yourself lift), the mittens just above the words. */
const HUG = -72;

export default defineSticker({
  duration: 2.5,
  // the thumb: hugging itself, eyes shut, the underline under its line
  hero: fr(17),
  cast: { nod: { slug: 'card', x: 216, ground: 396, k: 0.8 } },
  props: {
    words: { kind: 'scribble', seed: 23, inside: { puppet: 'nod', above: 'torso' } },
    under: { kind: 'underline', seed: 21, inside: { puppet: 'nod', above: 'torso' } },
  },
  frame(t, { nod }, { words, under }) {
    const p = nod.pose;
    const k = nod.k;
    // the squeeze (f13), and a happy wiggle: one way (f16), the other (f18), home (f20)
    const tb = snap(t, [0, fr(13), fr(14), fr(16), fr(18), fr(20)]);
    const sq = tb === fr(13) ? 1 : 0;
    p.sx *= 1 + 0.025 * sq;
    p.sy *= 1 - 0.035 * sq;
    p.tilt += tb === fr(16) ? 2.5 : tb === fr(18) ? -2.5 : 0;
    // the two lines, in pencil
    const [wx, wy] = nod.pagePoint(...WORDS);
    words.at(wx, wy, { k, scale: SCALE, anchor: [8, 14] }).set({ lines: 0.5 });
    // the underline draws itself left to right (f4–10); it fades again as the page rests (f25–28)
    const [ux, uy] = nod.pagePoint(...UNDER);
    const draw = span(t, fr(4), fr(10));
    const fade = keys(t, [[fr(25), 1], [fr(28), 0]]);
    if (draw > 0 && fade > 0) under.at(ux, uy, { k, scale: 0.9, sy: 1.25, anchor: 'start', alpha: fade }).set({ draw: ease.out(draw) });
    // the arms come round into the hug (f11–13), hold it, let go (f22–25)
    const hug = keys(t, [[fr(10), 0], [fr(13), 1, ease.out], [fr(22), 1], [fr(25), 0]]);
    p.front = hug > 0.1;
    p.liftL = lerp(nod.rest('L'), HUG, hug);
    p.liftR = lerp(nod.rest('R'), HUG, hug);
    // the face: down at the line while it is underlined, a delighted "ah", then eyes shut through the hug
    const ts = step(t, 1 / 12);
    const look = keys(ts, [[fr(2), 0], [fr(4), 1], [fr(10), 1], [fr(12), 0]]);
    p.faceY += 8 * look;
    p.faceX -= 2 * look;
    if (ts >= fr(10) && ts < fr(12)) p.mouth = 'mouth-open';
    if (ts >= fr(12) && ts < fr(23)) p.eyes = 'shut';
    p.blush = keys(step(t, 1 / 6), [[0, 0.3], [fr(8), 0.5], [fr(12), 1.7], [fr(22), 1.7], [fr(26), 0.5], [fr(30), 0.3]]);
    blink(nod, t, fr(27), fr(2));
  },
});
