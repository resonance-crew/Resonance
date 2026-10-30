/**
 * 摺摺 · 早安 Good morning — it gathers itself, stretches tall with a big "ahh", and squashes back; a paper sun rises
 * behind it as it stretches. Key pose: standing, smiling, the sun half behind its dog-ear.
 *
 * The body moves on 8 frames (gather 2, stretch 3, back 3) and holds between; the arms, face and sun ride those frames.
 */
import { blink, defineSticker, fr, keys, snap } from '../kit';

export default defineSticker({
  duration: 2,
  cast: { tuck: { slug: 'tuck', x: 214, ground: 414, k: 0.66 } },
  props: { sun: { kind: 'sun', seed: 4, z: 0 } },
  frame(t, { tuck }, { sun }) {
    const p = tuck.pose;
    const tb = snap(t, [0, fr(5), fr(6), fr(7), fr(8), fr(9), fr(16), fr(17), fr(18)]);
    // gather (squash), stretch tall, hold, squash back past rest, settle
    const s = keys(tb, [[0, 0], [fr(4), 0], [fr(6), -0.6], [fr(7), 0.45], [fr(9), 1], [fr(15), 1], [fr(16), -0.4], [fr(17), 0.1], [fr(18), 0]]);
    const up = Math.max(0, s);
    const down = Math.max(0, -s);
    p.sy *= 1 + 0.14 * up - 0.08 * down;
    p.sx *= 1 - 0.05 * up + 0.04 * down;
    p.legS *= 1 + 0.06 * up - 0.14 * down;
    p.rise += 8 * up;
    p.decoY += 10 * up - 3 * down;
    p.decoR -= 5 * up;
    // arms up and out with the stretch (its happy pose), down with the body
    const arms = keys(tb, [[0, 0], [fr(5), 0], [fr(6), -0.12], [fr(9), 1], [fr(15), 1], [fr(16), 0.28], [fr(17), 0.06], [fr(18), 0]]);
    p.liftL = tuck.rest('L') + (148 - tuck.rest('L')) * arms;
    p.liftR = tuck.rest('R') + (142 - tuck.rest('R')) * arms;
    // at the top of the stretch the fringe flutters (a small change: the body holds)
    if (t > fr(10) && t < fr(15)) p.decoR += 3 * Math.sin(((t - fr(10)) / (fr(15) - fr(10))) * Math.PI * 2);
    // eyes shut and a wide "ahh" while it stretches; the smile back after, and a blink
    if (up > 0.4) {
      p.eyes = 'shut';
      p.mouth = 'mouth-open';
    }
    p.faceY -= 3 * up;
    p.blush = 0.25 + 0.4 * up;
    blink(tuck, t, fr(21), fr(2));
    // the sun: up with the stretch, its rays out, back down behind the corner
    const rise = keys(tb, [[0, 0], [fr(6), 0], [fr(9), 1], [fr(15), 1], [fr(18), 0]]);
    sun.at(322, 134 - 26 * rise, { k: tuck.k * 0.9 }).set({ rays: 0.5 + 0.5 * rise });
  },
});
