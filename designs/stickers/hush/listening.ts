/**
 * 悄悄 · 慢慢說，我在聽 I'm listening — it sits on the top edge of a story card (its favourite seat, legs dangling over
 * the handwriting), its chin on its mittens and its head tipped, and listens: a slow, warm blink; a slow nod
 * (mm-hm) while two of its stars glow softly at what it hears; another slow blink; its feet swing a little, idly.
 * Key pose: sitting, chin on its mittens, head tipped, eyes on you, a small smile.
 *
 * The body moves on 2 frames (it settles a little deeper into its mittens for the nod, and back); the face, the eyes,
 * the feet and two stars do the rest.
 */
import { defineSticker, fr, keys, snap, type StickerPuppet } from '../kit';

/** Where its arms aim, rig units: the mittens land just under the corners of its mouth, holding its chin. */
const CHIN = { L: [296, 474], R: [404, 474] } as const;
/** The head tipped toward its left mitten, degrees. */
const TIP = -4.5;
/** Where it sits: the card's top edge, px. */
const SEAT = 330;
/** The card, stretched wide under it (its drawing is a small card): [sx, sy] on the puppet's k. */
const CARD: [number, number] = [3.05, 1.2];
/** The stars that glow at what it hears: [star, from frame, to frame]. */
const GLOWS: readonly (readonly [number, number, number])[] = [[0, 10, 20], [3, 12, 21]];

function chin(h: StickerPuppet): void {
  for (const side of ['L', 'R'] as const) {
    const [ux, uy] = CHIN[side];
    const [x, y] = h.pagePoint(ux, uy);
    h.setLift(side, h.aim(side, x, y));
  }
  h.pose.front = true;
}

export default defineSticker({
  duration: 2.5,
  // the thumb: eyes on you as the nod begins, two of its stars glowing at what it hears
  hero: fr(14),
  cast: { hush: { slug: 'night', x: 216, ground: SEAT, k: 0.78, stance: 'sit', z: 20 } },
  props: { card: { kind: 'card', seed: 5, z: 10 } },
  frame(t, { hush }, { card }) {
    const p = hush.pose;
    const f = Math.round(t * 12);
    // head tipped; settling a touch deeper for the nod (f15 → f21)
    const tb = snap(t, [0, fr(15), fr(21)]);
    const deep = tb === fr(15) ? 1 : 0;
    p.tilt += TIP - 1.5 * deep;
    p.sy *= 1 - 0.015 * deep;
    chin(hush);
    card.at(216, SEAT - 5, { k: hush.k, anchor: [66, 6], sx: CARD[0], sy: CARD[1] }).set({ lines: 1 });
    // the feet swing a little, idly, one after the other (on fours: only the legs move)
    const g = Math.floor(f / 4) * 4;
    p.legL += 6 * Math.sin((g / 28) * Math.PI * 4);
    p.legR += 6 * Math.sin((g / 28) * Math.PI * 4 + 1.6) - 6 * Math.sin(1.6);
    // the nod: the face dips slowly and comes up again (every frame: only the face moves)
    p.faceY += 3 + keys(f, [[12, 0], [14, 3], [16, 6], [18, 6], [20, 2], [22, 0]]);
    p.faceX -= 3;
    // slow, warm blinks (the happy-shut eyes: never the heavy lids, which would read as bored), and shut for the nod
    if ((f >= 7 && f < 10) || (f >= 15 && f < 19) || (f >= 24 && f < 26)) p.eyes = 'shut';
    p.blush = keys(f, [[0, 0.45], [14, 0.45], [16, 0.8], [20, 0.8], [23, 0.45]]);
    // two stars glow softly at what it hears
    for (const [star, a, b] of GLOWS) {
      const u = (f - a) / (b - a);
      if (u > 0 && u < 1) p.extra[`star-glow-${star}`] = Math.sin(Math.PI * u);
    }
  },
});
