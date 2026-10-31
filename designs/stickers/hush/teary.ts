/**
 * 悄悄 · 眼眶濕濕的 Teary-eyed — something it read reached it: it brings its mittens up to its cheeks, its eyes grow a
 * little and fill with water — the 🥹 look: big, glossy, the water standing in them up to a bright brimming line,
 * a sliver of it along the lower lids, the catch-lights shimmering — and its small smile wobbles, blushing. Nothing
 * runs out (a tear sliding down read as sweat, as embarrassment). Then the water settles and its mittens come down.
 * Key pose: standing, a small smile, a little blush.
 *
 * The body moves on 4 frames (a small tilt in, a squeeze and its release, the tilt out); the arms on 6; the eyes and
 * the mouth carry the rest, on twos.
 */
import { blink, defineSticker, fr, keys, snap, type StickerPuppet } from '../kit';
import { mouth, MOVED_EYE } from './_local';

/** Where each mitten rests on its cheek: the point its arm aims through (rig units; the mitten lands just inside). */
const CHEEK = { L: [250, 480], R: [450, 480] } as const;

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
  // the thumb: the 🥹 look — eyes full of water, shining, mittens on its cheeks, a wobbly smile, blushing
  hero: fr(16),
  cast: { hush: { slug: 'night', x: 216, ground: 410, k: 0.87 } },
  props: {
    eyeL: { kind: MOVED_EYE, seed: 1 },
    eyeR: { kind: MOVED_EYE, seed: 2 },
  },
  frame(t, { hush }, { eyeL, eyeR }) {
    const p = hush.pose;
    const k = hush.k;
    const f = Math.round(t * 12);
    // the body: tips in a little as the mittens arrive (f5), gives once as the water stands full (f12 → f20), tips
    // back (f24)
    const tb = snap(t, [0, fr(5), fr(12), fr(20), fr(24)]);
    const tip = keys(tb, [[0, 0], [fr(5), 1], [fr(23), 1], [fr(24), 0]]);
    const squeeze = tb === fr(12) ? 1 : 0;
    p.tilt -= 3.5 * tip;
    p.sy *= 1 - 0.02 * squeeze;
    p.sx *= 1 + 0.012 * squeeze;
    // the mittens: up on 3–5, on its cheeks until 22, down on 22–24
    const up = keys(snap(t, [0, fr(3), fr(4), fr(5), fr(22), fr(23), fr(24)]), [[0, 0], [fr(3), 0.35], [fr(4), 0.75], [fr(5), 1], [fr(21), 1], [fr(22), 0.7], [fr(23), 0.3], [fr(24), 0]]);
    cheeks(hush, up);
    // the face: a touch up, looking at us
    p.faceY -= 7 * tip;
    p.blush = keys(snap(t, [0, fr(4), fr(8), fr(12), fr(21), fr(24), fr(27)]), [[0, 0.35], [fr(4), 0.6], [fr(8), 1], [fr(12), 1.4], [fr(21), 1.4], [fr(24), 0.7], [fr(27), 0.35]]);
    blink(hush, t, fr(27), fr(1));
    // the eyes: the moved ones from f5 to f24, the water welling (f6–9), standing full, settling (f22–24); the
    // catch-lights and the water's edge shimmer on twos
    const moved = f >= 5 && f < 25;
    const water = keys(f, [[5, 0], [6, 0.3], [7, 0.55], [8, 0.8], [9, 1], [21, 1], [22, 0.75], [23, 0.45], [24, 0.2]]);
    const g2 = Math.floor(f / 2) * 2;
    const phase = (g2 - 6) / 8;
    if (moved) {
      for (const [prop, eye] of [[eyeL, 'eye-l'], [eyeR, 'eye-r']] as const) {
        const pv = hush.part(eye)!.pivot;
        prop.at(...hush.pagePoint(pv[0] + p.faceX, pv[1] + p.faceY), { k, rot: p.tilt }).set({ show: water, phase });
      }
    }
    // the mouth: a small pressed smile that wobbles while its eyes are full (on twos), its own smile otherwise
    if (water > 0.5) mouth(hush, 0.84, 0.8, (g2 / 2) % 2 ? 4 : -3);
    else mouth(hush);
  },
});
