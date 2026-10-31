/**
 * 牽牽 · 好喔 Okay — it holds a slip of paper against its front with one mitten, a little red seal stamp in the other,
 * the mitten round the stamp's handle and the stamp upright. Its arm comes down and presses the stamp onto the slip,
 * firmly; lifts it: a neat red ○. It looks up at you, pleased, the loops perked, and nods; then it turns the slip over
 * to a clean side, ready for the next.
 * Key pose: holding the blank slip, the stamp held up over it.
 *
 * The body moves only on the press (2 frames); the stamping arm, the stamp, the slip and the face carry the rest.
 */
import { blink, defineSticker, fr, keys, snap, step, taps, type StickerPuppet } from '../kit';
import { mittenAt, perk } from './_local';

/**
 * The stamping arm's angle on the paper (degrees, 0 = pointing right, 90 = straight down): held up over the slip, on
 * its way down, pressed (the arm hanging nearly straight down, a little in toward the middle), on its way up.
 */
const OVER = 150;
const DOWN = 126;
const PRESS = 104;
const UP = 130;
/** The slip and the stamp: how large; and the mitten pinning the slip's top left corner. */
const SLIP = 1.3;
const STAMP = 1.4;
const PIN = -3;
/** The stamp is held by its handle (its own units): the mitten round it, the face 46 under it. */
const HANDLE: [number, number] = [22, 24];
const FACE_DROP = 46;

export default defineSticker({
  duration: 2.5,
  // the thumb: the stamp lifted, the fresh ○ on the slip, pleased, the loops up
  hero: fr(12),
  cast: { tw: { slug: 'tag', x: 206, ground: 412, k: 0.68 } },
  props: {
    // both inside 牽牽, just over its paper, so its mittens are in front of them: one pinning the slip, one round the
    // stamp's handle (the stamp is listed first: an inside prop goes in right over the torso, so the later one lies
    // under the earlier — the stamp over the slip)
    stamp: { kind: 'stamp', seed: 9, inside: { puppet: 'tw', above: 'torso' } },
    slip: { kind: 'slip', seed: 5, inside: { puppet: 'tw', above: 'torso' } },
  },
  frame(t, { tw }, { slip, stamp }) {
    const p = tw.pose;
    // the arm: held up over the slip, down, pressed (held), up again — and it stays up while it shows the ○
    const ta = snap(t, [0, fr(4), fr(5), fr(7), fr(8)]);
    const ang = keys(ta, [[0, OVER], [fr(4), DOWN], [fr(5), PRESS], [fr(6), PRESS], [fr(7), UP], [fr(8), OVER]]);
    p.liftR = 90 - ang;
    p.liftL = PIN;
    // pressing firmly: the paper gives a little on the two pressed frames
    const pressed = t >= fr(5) && t < fr(7);
    if (pressed) {
      p.sy *= 0.985;
      p.faceY += 2;
    }
    // the slip, pinned by the left mitten, its ○ showing once the stamp lifts; turned over (narrowing to its edge and back) after the show — the clean side
    const flip = keys(snap(t, [0, fr(22), fr(23), fr(24), fr(25)]), [[0, 1], [fr(22), 0.5], [fr(23), 0.08], [fr(24), 0.55], [fr(25), 1]]);
    const [cx, cy] = slipCentre(tw);
    slip.at(cx, cy, { k: tw.k, scale: SLIP, sx: flip, rot: -3 }).set({ seal: t >= fr(7) && t < fr(23) ? 1 : 0 });
    // the stamp, upright, its handle in the right mitten; squashed a touch while pressed
    const [mx, my] = mittenAt(tw, 'R');
    stamp.at(mx, my, { k: tw.k, scale: STAMP, anchor: HANDLE, sy: pressed ? 0.93 : 1 });
    // the face: on the slip while stamping; then up at you, pleased — eyes shut happily, a blush, two small nods
    const ts = step(t, 1 / 12);
    const showing = ts >= fr(9) && ts < fr(20);
    p.faceX += showing ? 3 : 2;
    p.faceY += showing ? 0 : 6;
    if (showing && ts >= fr(10) && ts < fr(18)) p.eyes = 'shut';
    p.faceY += 3 * taps(ts, fr(13), fr(17), 2);
    p.blush = keys(step(t, 1 / 6), [[0, 0.3], [fr(8), 0.4], [fr(11), 1.3], [fr(18), 1.3], [fr(22), 0.3]]);
    perk(tw, keys(step(t, 1 / 6), [[0, 0], [fr(8), 0], [fr(10), 1], [fr(19), 1], [fr(22), 0]]));
    blink(tw, t, fr(27), fr(2));
  },
});

/**
 * The slip's middle, px: placed so its ○ (its `seal` point, 28 right and 2 under its middle, in its own units) lies
 * right under the stamp's face at the press.
 */
function slipCentre(tw: StickerPuppet): [number, number] {
  const arm = tw.rig.arms.R;
  const a = (PRESS * Math.PI) / 180;
  const r = arm.len * 0.67;
  const sealX = arm.pivot[0] + Math.cos(a) * r;
  const sealY = arm.pivot[1] + Math.sin(a) * r + FACE_DROP * STAMP;
  return tw.pagePoint(sealX - 28 * SLIP, sealY - 2 * SLIP);
}
