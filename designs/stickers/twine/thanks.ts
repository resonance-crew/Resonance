/**
 * 牽牽 · 謝謝 Thanks — the way it hands anything over, with both mittens (its proposal: 遞東西一定用雙手): holding a small
 * folded note by its two sides, low before its middle, it bows and holds the note out to you; at the bottom of the bow its eyes close,
 * the blush comes up, two short motion lines fall at its shoulders and the bow's loops perk up; then it straightens.
 * Key pose: standing, the note held low before its middle in both mittens, a small smile.
 *
 * The body moves on 6 frames (down 3, up 3) and holds the bow; while it holds, only the face, blush, loops and the
 * strokes change.
 */
import { blink, bow, bowStrokes, defineSticker, fr, keys, lerp, snap, step } from '../kit';
import { between, perk } from './_local';

/**
 * The note: how large beside it, larger as it is held out to you in the bow; held by its two sides halfway down (its
 * own units: the folded letter is 104 × 78), so it hangs low in the mittens and its top edge stays under the brads its
 * arms are pinned on, through the whole bow (above them it would look as if it cut the shoulders off).
 */
const NOTE = 1.34;
const NOTE_OUT = 1.52;
const CORNERS = 80;
const SIDES: [number, number] = [52, 44];

export default defineSticker({
  duration: 2.25,
  // the thumb: the bottom of the bow, eyes shut, blushing, the note held out, the strokes at its shoulders
  hero: fr(10),
  cast: { tw: { slug: 'tag', x: 216, ground: 414, k: 0.68 } },
  props: {
    // inside 牽牽, just over its paper: the mittens hold it in front, at its sides
    note: { kind: 'note', seed: 7, inside: { puppet: 'tw', above: 'torso' } },
    left: { kind: 'strokes', seed: 3 },
    right: { kind: 'strokes', seed: 5 },
  },
  frame(t, { tw }, { note, left, right }) {
    const p = tw.pose;
    const tb = snap(t, [0, fr(4), fr(5), fr(6), fr(16), fr(17), fr(18)]);
    const e = bow(tw, tb, fr(3), fr(6), fr(15), fr(18));
    // the note, larger as it is held out; the mittens at its sides
    const s = lerp(NOTE, NOTE_OUT, e);
    const arm = tw.rig.arms.L;
    const r = arm.len * 0.67;
    const reach = Math.acos(Math.max(-1, Math.min(1, (350 - (CORNERS / 2) * s - arm.pivot[0]) / r))) * (180 / Math.PI);
    p.liftL = reach - 90;
    p.liftR = reach - 90;
    // (inside the body the note leans with it: placed as if upright)
    const lean = p.lean;
    p.lean = 0;
    const [hx, hy] = between(tw);
    p.lean = lean;
    note.at(hx, hy + 4 * tw.k, { k: tw.k, scale: s, anchor: SIDES });
    // the bow's motion lines on its bottom frames, drawn in over two
    bowStrokes(tw, left, right, e);
    const strokes = keys(t, [[fr(6), 0.5], [fr(7), 1]]);
    left.set({ draw: strokes });
    right.set({ draw: strokes });
    // the blush up while it holds; the loops perk up once it is down (stepped)
    const ts = step(t, 1 / 6);
    p.blush = keys(ts, [[0, 0.3], [fr(6), 0.8], [fr(10), 1.6], [fr(16), 1.6], [fr(22), 0.3]]);
    perk(tw, keys(ts, [[0, 0], [fr(6), 0], [fr(10), 1], [fr(18), 1], [fr(22), 0]]));
    blink(tw, t, fr(23), fr(2));
  },
});
