/**
 * 悄悄 · 慢慢說，我在聽 I'm listening — it sits on the top edge of a kraft story card (its favourite seat, legs dangling),
 * and leans in to listen: its whole sheet tipped to one side, its face slid that way, a mitten cupped at the side of its
 * dome at ear height (level with its eyes, just past its outline — its arms are too short to reach the outline itself
 * there) with two small sound arcs round it, the other mitten in its lap. Two slow nods (mm-hm), its eyes closing at the
 * bottom of each, two of its stars glowing softly at what it hears; its feet swing a little. Then it sits back up.
 * Key pose: sitting upright, mittens in its lap, a small smile.
 *
 * The body moves on 6 frames (leaning in, and back); the nods are the face's, so the frames between change only the
 * face, the feet and two stars.
 */
import { defineSticker, fr, keys, MITTEN_MIDDLE, snap } from '../kit';
import { SEAT, SOUND } from './_local';

/** Where it sits: the card's top edge, px. */
const SEAT_Y = 326;
/**
 * The lean: the sheet tipped this far toward the side it listens on (degrees, − to its left, away from its moon, so
 * the cupped mitten has the sky to itself), the face slid that way.
 */
const TIP = -6;
const FACE = -8;
/**
 * The cupped mitten's lift: up and out, so the mitten stands at the side of its dome level with its eyes (the face slid
 * down a little and toward it); and the lift both rest at in its lap.
 */
const CUP = 147;
const LAP = -34;
/** The face slid down a little, so its eyes sit level with the cupped mitten. */
const FACE_DOWN = 5;
/** The stars that glow at what it hears: [star, from frame, to frame]. */
const GLOWS: readonly (readonly [number, number, number])[] = [[0, 14, 22], [3, 16, 23]];

export default defineSticker({
  duration: 2.5,
  // the thumb: leaning in, a mitten cupped beside its head, eyes on you
  hero: fr(8),
  cast: { hush: { slug: 'night', x: 226, ground: SEAT_Y, k: 0.82, stance: 'sit', z: 20 } },
  props: { seat: { kind: SEAT, seed: 5, z: 10 }, sound: { kind: SOUND, seed: 8 } },
  frame(t, { hush }, { seat, sound }) {
    const p = hush.pose;
    const f = Math.round(t * 12);
    seat.at(216, SEAT_Y - 4, { k: hush.k, anchor: 'top', sy: 0.85 });
    // leaning in (f3–5) and sitting back up (f25–27): the sheet tips, the face slides toward the cupped mitten
    const tb = snap(t, [0, fr(3), fr(4), fr(5), fr(25), fr(26), fr(27)]);
    const lean = keys(tb, [[0, 0], [fr(3), 0.35], [fr(4), 0.8], [fr(5), 1], [fr(24), 1], [fr(25), 0.65], [fr(26), 0.25], [fr(27), 0]]);
    p.tilt += TIP * lean;
    p.faceX += FACE * lean;
    p.faceY += FACE_DOWN * lean;
    p.liftR = LAP;
    // the cupped mitten comes up round its side to its ear height (never out flat on the way: that would reach past the
    // sticker's edge), and goes back down to its lap
    p.liftL = keys(tb, [[0, LAP], [fr(3), 20], [fr(4), 120], [fr(5), CUP], [fr(24), CUP], [fr(25), 120], [fr(26), 20], [fr(27), LAP]]);
    p.front = true;
    // the sound it listens to: two small arcs round the cupped mitten (f6–24)
    const heard = keys(f, [[5, 0], [6, 0.5], [7, 1], [23, 1], [24, 0.45], [25, 0]]);
    if (heard > 0) {
      const [mx, my] = hush.mitten('L', MITTEN_MIDDLE);
      sound.at(mx, my, { k: hush.k, rot: p.tilt }).set({ show: heard });
    }
    // the feet swing a little, idly, one after the other (on fours: only the legs move)
    const g = Math.floor(f / 4) * 4;
    p.legL += 6 * Math.sin((g / 28) * Math.PI * 4);
    p.legR += 6 * Math.sin((g / 28) * Math.PI * 4 + 1.6) - 6 * Math.sin(1.6);
    // two slow nods (the face dips and comes up, on twos: only the face moves), eyes closing at the bottom of each
    p.faceY += keys(Math.floor(f / 2) * 2, [[8, 0], [10, 6], [12, 4], [14, 0], [16, 6], [18, 4], [20, 0]]);
    if ((f >= 10 && f < 12) || (f >= 16 && f < 18)) p.eyes = 'shut';
    p.blush = keys(f, [[0, 0.35], [5, 0.5], [16, 0.5], [17, 0.8], [21, 0.8], [26, 0.35]]);
    // two stars glow softly at what it hears
    for (const [star, a, b] of GLOWS) {
      const u = (f - a) / (b - a);
      if (u > 0 && u < 1) p.extra[`star-glow-${star}`] = Math.sin(Math.PI * u);
    }
  },
});
