/**
 * 摺摺 · 收到了 Got it, I'll keep it — it lifts its dog-ear, slips the note it was holding deep under it (nothing was
 * there before: the owner), lets the corner fall shut over it and pats it twice; then another note flutters down into its
 * mitten (keep them coming). Key pose: standing, a note held out at its side, smiling.
 *
 * The body never moves: the arm, the corner, the notes and the face do, so every frame stays small.
 */
import { blink, defineSticker, ease, fr, keys, lerp, span } from '../kit';

/**
 * Deep under the shut dog-ear, rig units: the triangle the flap covers has its right angle at about (377, 407), its legs
 * running up and right; a note of TUCKED fits wholly inside it there, so once the corner shuts nothing shows — and the
 * loop ends as it began, with nothing under the corner.
 */
const POCKET: [number, number] = [411, 381];
/** The note as held (large enough to read), and as it lies slid deep into the corner. */
const NOTE = 1.1;
const TUCKED = 0.58;
/** The arm held a little out, showing the note. */
const OUT = 40;

export default defineSticker({
  duration: 2.5,
  // the thumb: the corner just lifted, the note held up beside it on its way in, a glad open mouth (from f8 the lifted
  // corner and the mitten cover the note)
  hero: fr(6),
  cast: { tuck: { slug: 'tuck', x: 179, ground: 414, k: 0.72 } },
  props: {
    held: { kind: 'note', seed: 7, z: 100 },
    // inside, just above torso-alt and under the flap: the note going in
    tucked: { kind: 'note', seed: 7, inside: { puppet: 'tuck', above: 'torso-alt' } },
    next: { kind: 'note', seed: 7, z: 100 },
  },
  frame(t, { tuck }, { held, tucked, next }) {
    const p = tuck.pose;
    const k = tuck.k;
    p.front = true;
    const [px, py] = tuck.pagePoint(...POCKET);
    // where the mitten works: at the note's lower right while it lays it down, a little off while the corner falls,
    // on the shut corner for two pats
    const at = tuck.pagePoint(POCKET[0] + 30, POCKET[1] + 14);
    const off = tuck.pagePoint(POCKET[0] + 52, POCKET[1] + 40);
    const pat = t > fr(12) && t < fr(17) ? Math.sin(span(t, fr(12), fr(17)) * Math.PI * 2) ** 2 : 0;
    const top = tuck.aim('R', at[0], at[1]);
    if (t < fr(7)) p.liftR = lerp(OUT, top, keys(t, [[fr(3), 0], [fr(7), 1, ease.smooth]]));   // up round the outside
    else if (t < fr(9)) p.liftR = top;
    else if (t < fr(12)) {
      const u = ease.smooth(span(t, fr(9), fr(11)));
      p.liftR = tuck.aim('R', lerp(at[0], off[0], u), lerp(at[1], off[1], u));
    } else if (t < fr(17)) p.liftR = tuck.aim('R', at[0], at[1] - (8 + 14 * pat) * k);
    else p.liftR = lerp(tuck.aim('R', at[0], at[1] - 8 * k), OUT, keys(t, [[fr(17), 0], [fr(21), 1, ease.smooth]]));
    // the corner: lifted while the note goes in (f6–11), shut over the notes the rest of the time
    p.alt = t >= fr(6) && t < fr(12);
    if (p.alt) p.extra['flap-alt'] = 1;
    else p.extra.flap = 1;
    const [mx, my] = tuck.mitten('R', 0.67);
    if (t < fr(7)) held.at(mx, my, { k, scale: NOTE, anchor: 'grip', rot: -6 + 10 * span(t, fr(3), fr(7)) });
    else if (t < fr(12)) {
      // slid deep in under the lifted corner (smaller as it goes in), where the shut corner will hide all of it
      const u = ease.out(span(t, fr(7), fr(9)));
      tucked.at(lerp(mx - 10 * k, px, u), lerp(my - 22 * k, py, u), { k, scale: lerp(NOTE, TUCKED, u), rot: lerp(4, 0, u) });
    }
    // the next note: pops up high on the right and rocks down into the mitten (f17–25), held from then on
    const fly = span(t, fr(17), fr(25));
    if (t >= fr(17) && t < fr(25)) {
      const e = ease.out(fly);
      next.at(lerp(352, mx + 22 * k * NOTE, e), lerp(46, my - 18 * k * NOTE, e), {
        k, scale: NOTE * ease.out(span(t, fr(17), fr(19))), rot: 18 * Math.sin(fly * Math.PI * 2.5) * (1 - fly) - 6 * fly,
      });
    } else if (t >= fr(25)) next.at(mx, my, { k, scale: NOTE, anchor: 'grip', rot: -6 });
    // the face: on the note at its side, up with it to the corner, shut and blushing for the pats, up at the new
    // note, down with it into the mitten
    p.faceX += keys(t, [[0, 5], [fr(3), 5], [fr(8), 7], [fr(12), 6], [fr(18), 5]]);
    p.faceY += keys(t, [[0, 3], [fr(3), 3], [fr(8), -3], [fr(11), -1], [fr(12), 0], [fr(18), 0], [fr(21), -6], [fr(23), -6], [fr(26), 3]]);
    if (t >= fr(12) && t < fr(18)) p.eyes = 'shut';
    if (t >= fr(22) && t < fr(25)) p.mouth = 'mouth-o';
    if (t >= fr(5) && t < fr(11)) p.mouth = 'mouth-open';
    p.blush = keys(t, [[0, 0.3], [fr(11), 0.5], [fr(14), 1.3], [fr(19), 1.1], [fr(28), 0.3]]);
    blink(tuck, t, fr(2), fr(1));
  },
});
