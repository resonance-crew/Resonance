/**
 * 點點 · 寫得真好 Beautifully written — it reads a small story card held in both mittens, its eyes running along the
 * lines; it looks up, "oh!", hops, and holds up a paper star (shining) in one mitten, the card in the other, eyes shut
 * and beaming; then the star goes and it reads on. Key pose: reading the card, held before its belly.
 *
 * The body moves on 6 frames (the hop); the card, the star, the arms and the face carry the rest.
 */
import { blink, defineSticker, fr, MITTEN_MIDDLE, step } from '../kit';
import { pick, STAR_WAND } from './_local';

const K = 1.1;
/** The card's scale (on K), and where the mittens hold it while reading: its lower corners, rig units. */
const CARD = 0.86;
const HOLD_L: [number, number] = [314, 646];
const HOLD_R: [number, number] = [386, 646];

export default defineSticker({
  duration: 2.5,
  // the thumb: the star held up shining, the card in the other mitten, eyes shut and beaming
  hero: fr(17),
  cast: { pip: { slug: 'dot', x: 216, ground: 418, k: K } },
  props: {
    card: { kind: 'card', seed: 9 },
    // inside 點點, just above its paper: its mitten (brought to the front) closes over the stick
    star: { kind: STAR_WAND, seed: 5, inside: { puppet: 'pip', above: 'torso' } },
  },
  frame(t, { pip }, { card, star }) {
    const p = pip.pose;
    const k = pip.k;
    // the hop: crouch (f10), up (f11), top (f12), land (f13), settle (f14), rest (f15)
    p.rise += pick(t, [[0, 0], [fr(11), 26], [fr(12), 32], [fr(13), 0]]);
    const sq = pick(t, [[0, 0], [fr(10), -1], [fr(11), 0.8], [fr(12), 0.2], [fr(13), -1], [fr(14), 0.25], [fr(15), 0]]);
    p.sy *= 1 + 0.08 * sq;
    p.sx *= 1 - 0.045 * sq;
    p.legS *= 1 + 0.12 * Math.min(0, sq);
    p.decoR += pick(t, [[0, 0], [fr(10), 3], [fr(11), -6], [fr(12), -2], [fr(13), 6], [fr(14), -2], [fr(15), 0]]);
    // reading (both mittens on the card) until f10 and again from f25; between, the star up and the card at its side
    const two = pick(t, [[0, 1], [fr(10), 0], [fr(25), 1]]) > 0;
    p.front = true;
    if (two) {
      const [lx, ly] = pip.pagePoint(...HOLD_L);
      const [rx, ry] = pip.pagePoint(...HOLD_R);
      // looking up at f8–9, the card dips a little with the mittens
      const dip = pick(t, [[0, 0], [fr(8), 1], [fr(25), 0]]) * 8 * k;
      p.liftL = pip.aim('L', lx, ly + dip);
      p.liftR = pip.aim('R', rx, ry + dip);
      const [ml, mly] = pip.mitten('L', MITTEN_MIDDLE);
      const [mr, mry] = pip.mitten('R', MITTEN_MIDDLE);
      card.at((ml + mr) / 2, (mly + mry) / 2 - 30 * k * CARD, { k, scale: CARD, rot: -3 }).set({ lines: 1 });
    } else {
      // the card in the left mitten at its side, by its corner; the right arm up with the star
      p.liftL = 84;
      const [ml, mly] = pip.mitten('L', MITTEN_MIDDLE);
      card.at(ml, mly, { k, scale: CARD * 0.92, anchor: 'grip', rot: -14 }).set({ lines: 1 });
      const t4 = step(t, 1 / 6);
      const up = pick(t, [[0, 0], [fr(11), 1], [fr(24), 0.55]]);
      p.liftR = 45 + (162 - 45) * up + (t4 > fr(14) && t4 < fr(24) ? (Math.round((t4 - fr(14)) * 6) % 2 ? 0 : -5) : 0);
      const grow = pick(t, [[0, 0], [fr(11), 0.6], [fr(12), 1.08], [fr(13), 1], [fr(24), 0.45]]);
      const shine = pick(t, [[0, 0], [fr(12), 0.5], [fr(13), 1], [fr(24), 0]]);
      const [sx, sy] = pip.mitten('R', MITTEN_MIDDLE);
      const wob = t4 > fr(14) && t4 < fr(24) ? (Math.round((t4 - fr(14)) * 6) % 2 ? 6 : -4) : 0;
      star.at(sx, sy, { k, scale: 0.88 * grow, anchor: 'grip', rot: 10 + wob }).set({ shine });
    }
    // the face: down on the card, its eyes running along a line (and back to the next); up at f8, "oh"; shut and
    // beaming from the hop until the star goes
    const read = two && t < fr(8) - 1e-6 || t >= fr(25) - 1e-6;
    const ts = step(t, 1 / 12);
    if (read) {
      p.faceY += 6;
      p.faceX += t < fr(8) ? pick(t, [[0, -5], [fr(2), -2], [fr(4), 1], [fr(6), 4]]) : -5;
    } else if (t < fr(10) - 1e-6) {
      p.faceY -= 3;
      p.mouth = 'mouth-o';
    } else if (ts < fr(24)) {
      p.eyes = 'shut';
      p.mouth = 'mouth-open';
      p.faceY -= 2;
    }
    p.blush = pick(t, [[0, 0.4], [fr(8), 0.7], [fr(11), 1.4], [fr(24), 0.8], [fr(25), 0.4]]);
    blink(pip, t, fr(27), fr(1));
  },
});
