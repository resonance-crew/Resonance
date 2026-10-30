/**
 * 點點 · 哈哈 Haha — it cracks up: eyes shut in arcs, mouth open, mittens clutching its middle, it bounces with laughter
 * (up and down on twos, rocking side to side), shake marks jumping beside it; then it winds down to a smile.
 * Key pose: standing, smiling.
 *
 * The body moves on 11 frames (the crack-up, eight bounces on twos, settling); the shake marks change on the same
 * frames, so the frames between cost nothing.
 */
import { defineSticker, fr } from '../kit';
import { pick, SHAKE } from './_local';

const K = 1.18;
/** Where the mittens clutch its middle, rig units (just under the brads, toward the centre). */
const TUMMY_L: [number, number] = [318, 640];
const TUMMY_R: [number, number] = [382, 640];

export default defineSticker({
  duration: 2,
  // the thumb: up in a bounce, rocking, laughing, the strokes out
  hero: fr(8),
  cast: { pip: { slug: 'dot', x: 216, ground: 414, k: K } },
  props: {
    hahaL: { kind: SHAKE, seed: 31 },
    hahaR: { kind: SHAKE, seed: 32 },
  },
  frame(t, { pip }, { hahaL, hahaR }) {
    const p = pip.pose;
    // the laugh, frame by frame: rise (rig units), squash (− squash, + stretch), rock (degrees), strokes (0–1)
    const B: [number, number, number, number, number][] = [
      [0, 0, 0, 0, 0],
      [fr(3), 0, -0.6, 0, 0],
      [fr(4), 14, 0.5, -4, 1],
      [fr(6), 0, -0.7, 3, 0.75],
      [fr(8), 16, 0.6, 5, 1],
      [fr(10), 0, -0.7, -3, 0.75],
      [fr(12), 14, 0.5, -5, 1],
      [fr(14), 0, -0.7, 3, 0.75],
      [fr(16), 9, 0.35, 3, 0.85],
      [fr(18), 0, -0.4, 0, 0.4],
      [fr(20), 0, 0, 0, 0],
    ];
    let b = B[0];
    for (const row of B) if (row[0] <= t + 1e-6) b = row;
    const [, rise, sq, rock, marks] = b;
    p.rise += rise;
    p.sy *= 1 + 0.08 * sq;
    p.sx *= 1 - 0.045 * sq;
    p.legS *= 1 + 0.1 * Math.min(0, sq);
    p.tilt += rock;
    p.decoR += -rock * 1.2 + (sq < 0 ? 4 : -3) * (rise || sq ? 1 : 0);
    // laughing from the crack-up until it winds down
    const laugh = pick(t, [[0, 0], [fr(3), 1], [fr(20), 0]]) > 0;
    if (laugh) {
      p.eyes = 'shut';
      p.mouth = 'mouth-open';
      p.faceY -= 2;
      // mittens clutching its middle
      const [lx, ly] = pip.pagePoint(...TUMMY_L);
      const [rx, ry] = pip.pagePoint(...TUMMY_R);
      p.liftL = pip.aim('L', lx, ly);
      p.liftR = pip.aim('R', rx, ry);
      p.front = true;
    }
    p.blush = pick(t, [[0, 0.4], [fr(3), 1.2], [fr(4), 1.6], [fr(18), 1], [fr(20), 0.4]]);
    // shake marks beside it, jumping with the bounce: up a bounce, out by its face; down, lower and closer
    if (marks > 0) {
      const [cx, cy] = pip.pagePoint(350, 567);
      const out = (marks >= 1 ? 112 : 106) * K;
      const dy = (marks >= 1 ? -26 : -10) * K;
      hahaL.at(cx - out, cy + dy, { k: K, anchor: 'inner', rot: 180 + rock }).set({ draw: marks });
      hahaR.at(cx + out, cy + dy, { k: K, anchor: 'inner', rot: rock }).set({ draw: marks });
    }
  },
});
