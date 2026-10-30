/**
 * 點點 · 謝謝你！ Thank you! — it crouches and jumps for joy, arms flung up and wide, eyes shut in happy arcs, mouth
 * open; terracotta joy strokes pop out round its head while it hangs at the top, and it lands with a squash, still
 * beaming, its mittens giving a happy waggle before they come down. Key pose: standing, smiling, a little blush.
 *
 * The body moves on 7 frames (crouch, launch, top, fall, land, settle, rest); the strokes, arms and face carry the rest.
 */
import { blink, defineSticker, fr, step } from '../kit';
import { pick } from './_local';

const K = 1.16;

export default defineSticker({
  duration: 2,
  // the thumb: at the top of the jump, arms up and wide, eyes shut, the joy strokes out
  hero: fr(7),
  cast: { pip: { slug: 'dot', x: 216, ground: 418, k: K } },
  props: {
    joyL: { kind: 'burst', seed: 21 },
    joyR: { kind: 'burst', seed: 22 },
  },
  frame(t, { pip }, { joyL, joyR }) {
    const p = pip.pose;
    // the jump: crouch (f4), launch (f5), hang at the top (f6–8), fall (f9), land with a squash (f10), settle (f11–12)
    p.rise += pick(t, [[0, 0], [fr(5), 44], [fr(6), 58], [fr(9), 34], [fr(10), 0]]);
    const sq = pick(t, [[0, 0], [fr(4), -1], [fr(5), 0.9], [fr(6), 0.2], [fr(9), 0.35], [fr(10), -1.1], [fr(11), 0.25], [fr(12), 0]]);
    p.sy *= 1 + 0.08 * sq;
    p.sx *= 1 - 0.045 * sq;
    p.legS *= 1 + 0.12 * Math.min(0, sq);
    // the legs tuck up a little in the air
    const air = pick(t, [[0, 0], [fr(5), 1], [fr(10), 0]]);
    p.legL += 14 * air;
    p.legR -= 14 * air;
    // the curl lags the body
    p.decoR += pick(t, [[0, 0], [fr(4), 3], [fr(5), -7], [fr(6), -3], [fr(9), 4], [fr(10), 7], [fr(11), -3], [fr(12), 0]]);
    // arms: back on the crouch, flung up and wide on the launch (in front of the paper, or the short arms would hide
    // behind it), a happy waggle on fours after landing, down again on fours
    const wide = pick(t, [[0, 0], [fr(4), -0.25], [fr(5), 1], [fr(16), 1], [fr(18), 0.45], [fr(20), 0]]);
    const t4 = step(t, 1 / 6);
    const wag = t4 > fr(11) && t4 < fr(16) ? (Math.round((t4 - fr(12)) * 6) % 2 ? -7 : 7) : 0;
    p.liftL = 45 + (156 - 45) * wide + wag;
    p.liftR = 45 + (156 - 45) * wide + wag;
    p.front = wide > 0.3;
    // face: eyes shut in arcs and mouth open from the launch until the waggle ends, the blush full
    const joy = pick(t, [[0, 0], [fr(5), 1], [fr(16), 0]]) > 0;
    if (joy) {
      p.eyes = 'shut';
      p.mouth = 'mouth-open';
    }
    p.blush = pick(t, [[0, 0.35], [fr(5), 1], [fr(6), 1.5], [fr(16), 1], [fr(18), 0.6], [fr(20), 0.35]]);
    p.faceY -= joy ? 3 : 0;
    blink(pip, t, fr(22), fr(1));
    // joy strokes out round the head while it hangs there, gone as it lands (on the body's frames)
    const [hx, hy] = pip.pagePoint(350, 548);
    const pop = pick(t, [[0, 0], [fr(5), 0.5], [fr(6), 1], [fr(10), 0.6], [fr(11), 0]]);
    if (pop > 0) {
      joyL.at(hx - 104 * K, hy - 46 * K, { k: K * 0.85, scale: 0.6 + 0.4 * pop, rot: -50 }).set({ draw: pop });
      joyR.at(hx + 104 * K, hy - 46 * K, { k: K * 0.85, scale: 0.6 + 0.4 * pop, rot: 50 }).set({ draw: pop });
    }
  },
});
