/**
 * 聆聆's tab icon. Its "head" is its whole card, and the card is wider than it is tall, so the kit's head crop (sized to
 * the face) cut its sides and clipped the beret flat along the top and the right (round 22 review). This one shows the
 * whole card with its rounded corners and the whole beret, the face in the middle, a little blush: no legs (as a head
 * crop has none), the arms hanging behind the card.
 */
import { defineSticker, SIZE } from '../kit';

/** The card and the beret in rig units: the card's sides, the beret's top and right end, the card's foot. */
const LEFT = 154;
const RIGHT = 567;
const TOP = 340;
const FOOT = 645;
/** Room left round it on the 432 canvas (the icon's die-cut margin, 7 there, inside it). */
const PAD = 12;

const k = (SIZE - 2 * PAD) / (RIGHT - LEFT);
const middleX = (LEFT + RIGHT) / 2;
const middleY = (TOP + FOOT) / 2;

export default defineSticker({
  duration: 1 / 12,
  hero: 0,
  cast: { hero: { slug: 'card', x: SIZE / 2 - (middleX - 350) * k, ground: SIZE / 2 + (700 - middleY) * k, k } },
  frame(_t, { hero }) {
    const p = hero.pose;
    p.blush = 0.35;
    p.liftL = 0;
    p.liftR = 0;
    // no legs in a head's crop
    p.legS = 0.0001;
  },
});
