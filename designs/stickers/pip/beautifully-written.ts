/**
 * 點點 · 寫得真好 Beautifully written — it reads a small story card held before its belly; a teacher's red double
 * circle draws itself round the best line; it looks up, delighted, hops, and lifts the card up high behind its head in
 * both mittens, eyes shut, mouth open, big sparkles round the card; then brings it down to read again. Key pose: reading
 * the card, the circle not yet drawn.
 *
 * The body moves on 8 frames (the hop, and the card going up and down); the circle, the sparkles and the face ride
 * along on small frames.
 */
import { blink, defineSticker, fr, MITTEN_MIDDLE, SPARKLE_BIG } from '../kit';
import { pick, PRAISE_CARD } from './_local';

const K = 1.08;
/** Where the mittens hold the card while reading: its lower corners, rig units. */
const HOLD_L: [number, number] = [312, 648];
const HOLD_R: [number, number] = [388, 648];
/** The card up high: how large, and how much further up than the mittens it rises on a hop's top. */
const HIGH = 1.62;

export default defineSticker({
  duration: 2.5,
  // the thumb: the card up high, circled, the sparkles out, eyes shut and beaming
  hero: fr(13),
  cast: { pip: { slug: 'dot', x: 216, ground: 418, k: K } },
  props: {
    // reading: in front of it; held up: behind its head (its face and curls in front, its mittens at the lower corners)
    card: { kind: PRAISE_CARD, seed: 9, z: 100 },
    high: { kind: PRAISE_CARD, seed: 9, z: 5 },
    s1: { kind: 'sparkles', seed: 3, z: 110 },
    s2: { kind: 'sparkle', seed: 6, z: 110 },
  },
  frame(t, { pip }, { card, high, s1, s2 }) {
    const p = pip.pose;
    const k = pip.k;
    // the hop: crouch (f9), up (f10), top (f11), land (f12), settle (f13); the card down again at f24–25
    p.rise += pick(t, [[0, 0], [fr(10), 30], [fr(11), 36], [fr(12), 0]]);
    const sq = pick(t, [[0, 0], [fr(9), -1], [fr(10), 0.8], [fr(11), 0.2], [fr(12), -0.9], [fr(13), 0.2], [fr(14), 0]]);
    p.sy *= 1 + 0.08 * sq;
    p.sx *= 1 - 0.045 * sq;
    p.legS *= 1 + 0.12 * Math.min(0, sq);
    p.decoR += pick(t, [[0, 0], [fr(9), 3], [fr(10), -6], [fr(12), 6], [fr(13), -2], [fr(14), 0]]);
    p.front = true;
    const up = pick(t, [[0, 0], [fr(10), 1], [fr(24), 0]]) > 0;
    // the red circle: drawn round the line while it reads (f4–7), there until the card is back down
    const circle = pick(t, [[0, 0], [fr(4), 0.25], [fr(5), 0.5], [fr(6), 0.75], [fr(7), 1], [fr(25), 0]]);
    if (!up) {
      const [lx, ly] = pip.pagePoint(...HOLD_L);
      const [rx, ry] = pip.pagePoint(...HOLD_R);
      const dip = pick(t, [[0, 0], [fr(8), 1], [fr(25), 0]]) * 6 * k;
      p.liftL = pip.aim('L', lx, ly + dip);
      p.liftR = pip.aim('R', rx, ry + dip);
      const [ml, mly] = pip.mitten('L', MITTEN_MIDDLE);
      const [mr, mry] = pip.mitten('R', MITTEN_MIDDLE);
      card.at((ml + mr) / 2, (mly + mry) / 2 + 4 * k, { k, scale: 0.86, anchor: 'bottom', rot: -2 }).set({ draw: circle });
    } else {
      // both mittens up at its sides, the card's lower edge resting on them, the card behind its head
      p.liftL = 166;
      p.liftR = 166;
      const [ml, mly] = pip.mitten('L', MITTEN_MIDDLE);
      const [mr, mry] = pip.mitten('R', MITTEN_MIDDLE);
      const tilt = Math.atan2(mry - mly, mr - ml) * (180 / Math.PI);
      high.at((ml + mr) / 2, (mly + mry) / 2 - 10 * k, { k, scale: HIGH, anchor: 'bottom', rot: tilt }).set({ draw: 1 });
      // big sparkles round the card, grown in on the hop's frames
      const show = pick(t, [[0, 0], [fr(11), 0.6], [fr(12), 1.1], [fr(13), 1], [fr(23), 0.5]]);
      const [cx, cy] = [(ml + mr) / 2, (mly + mry) / 2 - 10 * k - 100 * HIGH * k];
      s1.at(cx + 128 * k, cy + 6 * k, { k, scale: 0.9 * show }).set({ show: 1 });
      s2.at(cx - 128 * k, cy + 20 * k, { k, scale: SPARKLE_BIG * show }).set({ show: 1 });
    }
    // the face: down on the card, its eyes running along the line; up and open at f8 ("oh"); shut and beaming up high
    if (!up && t < fr(8) - 1e-6) {
      p.faceY += 6;
      p.faceX += pick(t, [[0, -4], [fr(2), -1], [fr(4), 2], [fr(6), 4]]);
    } else if (!up && t < fr(10) - 1e-6) {
      p.faceY -= 2;
      p.mouth = 'mouth-open';
    } else if (up) {
      p.eyes = 'shut';
      p.mouth = 'mouth-open';
      p.faceY -= 2;
    } else {
      p.faceY += 6;
      p.faceX -= 4;
    }
    p.blush = pick(t, [[0, 0.4], [fr(7), 0.8], [fr(10), 1.5], [fr(24), 0.8], [fr(26), 0.4]]);
    blink(pip, t, fr(27), fr(1));
  },
});
