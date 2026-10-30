/**
 * 牽牽 · 好喔 Okay — it holds a slip of paper against its front with one mitten, a little red seal stamp ready in the
 * other. It presses the stamp down, firmly, lifts it: a neat red ○ on the slip. It looks up at you, pleased, the loops
 * perked, and nods; then it turns the slip over to a clean side, ready for the next.
 * Key pose: holding the blank slip, the stamp held over it.
 *
 * The body moves only on the press (2 frames); the stamping arm, the stamp, the slip and the face carry the rest.
 */
import { blink, defineSticker, fr, keys, snap, step, taps, type StickerPuppet } from '../kit';
import { mittenAt, perk } from './_local';

/** The stamping arm's angle on the paper (degrees, 0 = pointing right, 90 = down): held over, pressed, lifted. */
const OVER = 146;
const PRESS = 126;
const LIFTED = 168;
/** The slip and the stamp: how large; and the mitten pinning the slip's left side. */
const SLIP = 1.3;
const STAMP = 1.4;
const PIN = -6;

export default defineSticker({
  duration: 2.5,
  // the thumb: the stamp lifted, the fresh ○ on the slip, pleased, the loops up
  hero: fr(12),
  cast: { tw: { slug: 'tag', x: 212, ground: 414, k: 0.68 } },
  props: {
    // inside 牽牽, just over its paper: the pinning mitten is in front of it
    slip: { kind: 'slip', seed: 5, inside: { puppet: 'tw', above: 'torso' } },
    stamp: { kind: 'stamp', seed: 9, z: 100 },
  },
  frame(t, { tw }, { slip, stamp }) {
    const p = tw.pose;
    // the arm: over the slip, down, pressed (held), up and away to show it, back over
    const ta = snap(t, [0, fr(4), fr(5), fr(7), fr(8), fr(20), fr(21)]);
    const ang = keys(ta, [[0, OVER], [fr(4), 136], [fr(5), PRESS], [fr(6), PRESS], [fr(7), 146], [fr(8), LIFTED], [fr(20), LIFTED], [fr(21), OVER]]);
    p.liftR = 90 - ang;
    p.liftL = PIN;
    // pressing firmly: the paper gives a little on the two pressed frames
    const pressed = t >= fr(5) && t < fr(7);
    if (pressed) {
      p.sy *= 0.985;
      p.faceY += 2;
    }
    // the slip, pinned by the left mitten; turned over (narrowing to its edge and back) after the show — the clean side
    const flip = keys(snap(t, [0, fr(22), fr(23), fr(24), fr(25)]), [[0, 1], [fr(22), 0.5], [fr(23), 0.08], [fr(24), 0.55], [fr(25), 1]]);
    const [sealX, sealY] = slipSeal(tw);
    slip.at(sealX, sealY, { k: tw.k, scale: SLIP, sx: flip, anchor: 'seal', rot: -3 })
      .set({ seal: t >= fr(6) && t < fr(23) ? 1 : 0 });
    // the stamp in the right mitten, upright; squashed a touch while pressed
    const [mx, my] = mittenAt(tw, 'R');
    stamp.at(mx, my, { k: tw.k, scale: STAMP, anchor: 'grip', sy: pressed ? 0.94 : 1, rot: pressed ? 0 : -4 });
    // the face: on the slip while stamping; then up at you, pleased — eyes shut happily, a blush, two small nods
    const ts = step(t, 1 / 12);
    const showing = ts >= fr(9) && ts < fr(20);
    p.faceX += showing ? 3 : -2;
    p.faceY += showing ? 0 : 5;
    if (showing && ts >= fr(10) && ts < fr(18)) p.eyes = 'shut';
    p.faceY += 3 * taps(ts, fr(13), fr(17), 2);
    p.blush = keys(step(t, 1 / 6), [[0, 0.3], [fr(8), 0.4], [fr(11), 1.3], [fr(18), 1.3], [fr(22), 0.3]]);
    perk(tw, keys(step(t, 1 / 6), [[0, 0], [fr(8), 0], [fr(10), 1], [fr(19), 1], [fr(22), 0]]));
    blink(tw, t, fr(27), fr(2));
  },
});

/** Where the slip's ○ goes: right under the stamp's face at its press (on 牽牽's lower front), px. */
function slipSeal(tw: StickerPuppet): [number, number] {
  const arm = tw.rig.arms.R;
  const a = (PRESS * Math.PI) / 180;
  const r = arm.len * 0.67;
  // the stamp's face is 44 of its units under its grip
  return tw.pagePoint(arm.pivot[0] + Math.cos(a) * r, arm.pivot[1] + Math.sin(a) * r + 44 * STAMP);
}
