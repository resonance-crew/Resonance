/**
 * 點點's pack icon: its head and shoulders, cropped above its mittens (the kit's default head crop reaches down to
 * them, and the canvas edge cut them into two cream lumps). Eyes open, a little blush, arms hanging straight down
 * behind its paper, out of the crop.
 */
import { defineSticker, SIZE } from '../kit';

/** The crop, rig units: from just over the curls to just above where the mittens rest. */
const TOP = 452;
const BOTTOM = 618;
const CX = 349;

const half = (BOTTOM - TOP) / 2;
const k = (SIZE / 2 - 8) / half;

export default defineSticker({
  duration: 1 / 12,
  hero: 0,
  cast: { pip: { slug: 'dot', x: SIZE / 2 - (CX - 350) * k, ground: SIZE / 2 + (700 - (TOP + half)) * k, k } },
  frame(_t, { pip }) {
    pip.pose.blush = 0.35;
    pip.pose.liftL = 0;
    pip.pose.liftR = 0;
  },
});
