/**
 * 點點 · 哈哈 Haha — it cracks up where it stands: mittens clutching its middle, eyes shut in arcs, mouth thrown wide
 * open and flapping with each "ha", it rocks back, doubles forward and rocks back again, laugh marks bouncing beside it;
 * then it winds down to a smile. No hop — it laughs planted. Key pose: standing, smiling.
 *
 * The body moves on 5 frames (the crack-up, back, forward, back, rest); the mouth and the marks change on every frame,
 * which costs little (they are small and close together).
 */
import { defineSticker, fr } from '../kit';
import { LAUGH_MARKS, LAUGH_MOUTH, pick } from './_local';

const K = 1.18;
/** Where the mittens clutch its middle, rig units (just under the brads, toward the centre). */
const TUMMY_L: [number, number] = [318, 642];
const TUMMY_R: [number, number] = [382, 642];

export default defineSticker({
  duration: 2,
  // the thumb: rocked back, mouth wide open, the marks out
  hero: fr(5),
  cast: { pip: { slug: 'dot', x: 216, ground: 414, k: K } },
  props: {
    // inside its face, over its own little open mouth
    mouth: { kind: LAUGH_MOUTH, seed: 1, inside: { puppet: 'pip', above: 'mouth-open' } },
    marksL: { kind: LAUGH_MARKS, seed: 31 },
    marksR: { kind: LAUGH_MARKS, seed: 32 },
  },
  frame(t, { pip }, { mouth, marksL, marksR }) {
    const p = pip.pose;
    const k = pip.k;
    // body: the crack-up (f1), rocked back (f2), doubled forward (f9), back (f15), a smile again (f21)
    const beat = pick(t, [[0, 0], [fr(1), 1], [fr(2), 2], [fr(9), 3], [fr(15), 2], [fr(21), 0]]);
    if (beat === 1) {
      p.sy *= 0.94;
      p.sx *= 1.03;
    } else if (beat === 2) {
      // rocked back: the paper tips away a little, the face up, a touch taller
      p.lean -= 10;
      p.faceY -= 6;
      p.sy *= 1.02;
      p.tilt -= 3;
      p.decoR -= 5;
    } else if (beat === 3) {
      // doubled forward
      p.lean += 14;
      p.faceY += 5;
      p.sy *= 0.97;
      p.tilt += 3;
      p.decoR += 5;
    }
    const laugh = beat > 0;
    if (laugh) {
      p.eyes = 'shut';
      p.mouth = 'mouth-open';
      const [lx, ly] = pip.pagePoint(...TUMMY_L);
      const [rx, ry] = pip.pagePoint(...TUMMY_R);
      p.liftL = pip.aim('L', lx, ly);
      p.liftR = pip.aim('R', rx, ry);
      p.front = true;
      // the wide mouth, flapping on every frame: ha, ha, ha
      const f = Math.round(t * 12);
      const open = beat === 1 ? 0.6 : [1, 0.55, 0.9, 0.5][f % 4];
      const [mx, my] = pip.pagePoint(349, 559);
      mouth.at(mx, my, { k, anchor: [20, 5] }).set({ show: open });
      // the laugh marks bouncing beside its face, one side at a time (each frame changes one side and the mouth, not
      // the whole width)
      const [cx, cy] = pip.pagePoint(350, 548);
      const draw = beat === 1 ? 0.5 : 1;
      marksL.at(cx - 112 * k, cy, { k, anchor: 'inner', sx: -1 }).set({ phase: Math.floor(f / 2) / 3, draw });
      marksR.at(cx + 112 * k, cy, { k, anchor: 'inner' }).set({ phase: Math.floor((f + 1) / 2) / 3 + 0.5, draw });
    }
    p.blush = pick(t, [[0, 0.4], [fr(1), 1.2], [fr(2), 1.6], [fr(19), 1.2], [fr(21), 0.4]]);
  },
});
