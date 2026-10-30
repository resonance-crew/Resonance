/**
 * 悄悄 · 眼眶濕濕的 Teary-eyed — something it read reached it: it brings its mittens up to its cheeks, its eyes go
 * wet and shining, and one tear wells at the corner of an eye, rolls down its cheek past its mitten and glints like one
 * of its stars (its big star glints with it). It shuts its eyes, warm and blushing — touched, not sad — and
 * lets its mittens down again.
 * Key pose: standing, a small smile, a little blush.
 *
 * The body moves on 4 frames (a small tilt in, a squeeze and its release, the tilt out); the arms on 6; the eyes, the
 * tear and the stars carry the rest.
 */
import { blink, defineSticker, fr, keys, snap, type StickerPuppet } from '../kit';
import { GLISTEN } from './_local';

/** Where each mitten rests on its cheek: the point its arm aims through (rig units; the mitten lands just inside). */
const CHEEK = { L: [250, 473], R: [450, 473] } as const;
/** The tear: from the right eye's outer corner down the cheek, just outside the mitten, rig units (before the face's slide). */
const TEAR_FROM: [number, number] = [433, 422];
const TEAR_TO: [number, number] = [443, 440];

function cheeks(h: StickerPuppet, e: number): void {
  for (const side of ['L', 'R'] as const) {
    const [ux, uy] = CHEEK[side];
    const [x, y] = h.pagePoint(ux, uy);
    const to = h.aim(side, x, y);
    h.setLift(side, h.rest(side) + (to - h.rest(side)) * e);
  }
  if (e > 0) h.pose.front = true;
}

export default defineSticker({
  duration: 2.5,
  // the thumb: mittens on its cheeks, eyes wet and shining, the tear on its cheek glinting like a star
  hero: fr(14),
  cast: { hush: { slug: 'night', x: 216, ground: 402, k: 0.8 } },
  props: {
    tear: { kind: 'tear', seed: 4 },
    wetL: { kind: GLISTEN, seed: 1 },
    wetR: { kind: GLISTEN, seed: 2 },
  },
  frame(t, { hush }, { tear, wetL, wetR }) {
    const p = hush.pose;
    const k = hush.k;
    const f = Math.round(t * 12);
    // the body: tips in a little as the mittens arrive (f5), gives once when it shuts its eyes (f16 → f21), tips back (f24)
    const tb = snap(t, [0, fr(5), fr(16), fr(21), fr(24)]);
    const tip = keys(tb, [[0, 0], [fr(5), 1], [fr(23), 1], [fr(24), 0]]);
    const squeeze = tb === fr(16) ? 1 : 0;
    p.tilt -= 3.5 * tip;
    p.sy *= 1 - 0.025 * squeeze;
    p.sx *= 1 + 0.015 * squeeze;
    // the mittens: up on 3–5, on its cheeks until 22, down on 22–24
    const up = keys(snap(t, [0, fr(3), fr(4), fr(5), fr(22), fr(23), fr(24)]), [[0, 0], [fr(3), 0.35], [fr(4), 0.75], [fr(5), 1], [fr(21), 1], [fr(22), 0.7], [fr(23), 0.3], [fr(24), 0]]);
    cheeks(hush, up);
    // the face: looking at us; wet and shining from f6; shut and warm from the squeeze until f21
    p.faceY -= 5 * tip;
    const shut = f >= 16 && f < 21;
    if (shut) p.eyes = 'shut';
    p.blush = keys(snap(t, [0, fr(4), fr(8), fr(12), fr(16), fr(21), fr(24), fr(27)]), [[0, 0.35], [fr(4), 0.6], [fr(8), 0.9], [fr(12), 1.2], [fr(16), 1.6], [fr(21), 1.2], [fr(24), 0.7], [fr(27), 0.35]]);
    blink(hush, t, fr(27), fr(1));
    const wet = shut ? 0 : keys(f, [[5, 0], [6, 0.7], [7, 1], [21, 1], [22, 0.6], [23, 0]]);
    for (const [prop, eye] of [[wetL, 'eye-l'], [wetR, 'eye-r']] as const) {
      const pv = hush.part(eye)!.pivot;
      const [ex, ey] = hush.pagePoint(pv[0] + p.faceX, pv[1] + p.faceY);
      if (wet > 0) prop.at(ex, ey, { k, rot: p.tilt }).set({ show: wet });
    }
    // the tear: wells at the corner (f7–9), rolls down its cheek on twos (f9–15), glints (f11–16), and goes (f21–22)
    if (f >= 7 && f < 23) {
      const roll = keys(Math.floor((f + 1) / 2) * 2 - 1, [[9, 0], [11, 0.45], [13, 0.8], [15, 1]]);
      const [x, y] = hush.pagePoint(
        TEAR_FROM[0] + (TEAR_TO[0] - TEAR_FROM[0]) * roll + p.faceX,
        TEAR_FROM[1] + (TEAR_TO[1] - TEAR_FROM[1]) * roll + p.faceY,
      );
      const grow = keys(f, [[7, 0.4], [8, 0.75], [9, 1], [20, 1], [21, 0.6], [22, 0.25]]);
      const glint = keys(f, [[11, 0], [12, 0.6], [13, 1.15], [14, 1], [15, 0.8], [16, 0.4], [17, 0]]);
      tear.at(x, y, { k, scale: 2 * grow, rot: p.tilt }).set({ glint });
      // its big star, up on the other side, glints with it
      p.extra['star-glow-0'] = keys(f, [[11, 0], [13, 1], [15, 0.8], [17, 0]]);
    }
  },
});
