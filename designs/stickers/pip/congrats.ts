/**
 * 點點 · 恭喜 Congratulations — it crouches and flings paper confetti up with both mittens, hopping; the whole family
 * pops in behind it to cheer — 牽牽 at the left edge, 摺摺 and 悄悄 over its shoulders, 聆聆 at the right — arms up,
 * small and behind, while the confetti tumbles down; then they duck away again. Key pose: 點點 alone, smiling.
 *
 * Stop motion, about four a second: the confetti, the four popping in and out, and 點點's own moves all land on the same
 * frames (f3, f4, f6, f9, f12, f15, f18, f21, f22, f24), and nothing changes between them but a blink — five puppets
 * moving on every frame would be far past the size budget.
 */
import { defineSticker, fr, type StickerPuppet } from '../kit';
import { pick } from './_local';

const K = 0.95;

/** Arms up and a happy face, for a puppet of the family cheering. */
function cheer(c: StickerPuppet, lift: number, open: boolean): void {
  c.pose.liftL = lift;
  c.pose.liftR = lift;
  c.pose.eyes = 'shut';
  c.pose.mouth = open ? 'mouth-open' : 'mouth-o';
  c.pose.blush = 1;
}

export default defineSticker({
  duration: 2.25,
  // the thumb: the confetti arching overhead, everyone in and cheering
  hero: fr(9),
  cast: {
    tag: { slug: 'tag', x: 56, ground: 350, k: 0.3, z: 4 },
    tuck: { slug: 'tuck', x: 132, ground: 288, k: 0.32, z: 6 },
    night: { slug: 'night', x: 302, ground: 286, k: 0.32, z: 6 },
    card: { slug: 'card', x: 342, ground: 352, k: 0.26, z: 4 },
    pip: { slug: 'dot', x: 216, ground: 424, k: K, z: 20 },
  },
  props: {
    confettiL: { kind: 'confetti', seed: 12, z: 110 },
    confettiR: { kind: 'confetti', seed: 17, z: 110 },
  },
  frame(t, { pip, tag, tuck, night, card }, { confettiL, confettiR }) {
    const p = pip.pose;
    // 點點: crouch (f3), fling and hop (f4), land (f6), arms up cheering, arms down (f22), rest (f24)
    p.rise += pick(t, [[0, 0], [fr(4), 30], [fr(6), 0]]);
    const sq = pick(t, [[0, 0], [fr(3), -1], [fr(4), 0.8], [fr(6), -0.7], [fr(9), 0], [fr(22), 0.15], [fr(24), 0]]);
    p.sy *= 1 + 0.08 * sq;
    p.sx *= 1 - 0.045 * sq;
    p.legS *= 1 + 0.1 * Math.min(0, sq);
    p.decoR += pick(t, [[0, 0], [fr(3), 3], [fr(4), -7], [fr(6), 6], [fr(9), 0]]);
    const up = pick(t, [[0, 0], [fr(3), -0.2], [fr(4), 1], [fr(22), 0.45], [fr(24), 0]]);
    p.liftL = 45 + (158 - 45) * up;
    p.liftR = 45 + (158 - 45) * up;
    p.front = up > 0.3;
    const joy = pick(t, [[0, 0], [fr(4), 1], [fr(22), 0]]) > 0;
    if (joy) {
      p.eyes = 'shut';
      p.mouth = 'mouth-open';
      p.faceY -= 3;
    }
    p.blush = pick(t, [[0, 0.45], [fr(4), 1.2], [fr(6), 1.5], [fr(22), 0.9], [fr(24), 0.45]]);
    if (t >= fr(1) && t < fr(2)) p.eyes = 'shut';
    // the confetti: flung up and out from both mittens, on fours
    const ct = pick(t, [[0, -1], [fr(4), 0.06], [fr(6), 0.2], [fr(9), 0.38], [fr(12), 0.47], [fr(15), 0.6], [fr(18), 0.74], [fr(21), 0.9], [fr(22), -1]]);
    if (ct >= 0) {
      confettiL.at(194, 120, { k: 0.96, rot: -22 }).set({ t: ct });
      confettiR.at(238, 120, { k: 0.96, rot: 22 }).set({ t: ct });
    }
    // the family pops in (scaled up from its feet: a pop, never a fade) and ducks away again
    const popA = pick(t, [[0, 0], [fr(6), 1.1], [fr(9), 1], [fr(21), 0.55], [fr(22), 0]]);
    const popB = pick(t, [[0, 0], [fr(9), 1.1], [fr(12), 1], [fr(21), 0.55], [fr(22), 0]]);
    for (const [c, pop] of [[tuck, popA], [night, popA], [tag, popB], [card, popB]] as const) {
      c.pose.popX = Math.max(0.001, pop);
      c.pose.popY = Math.max(0.001, pop);
      c.pose.alpha = pop > 0 ? 1 : 0;
    }
    cheer(tuck, 148, true);
    cheer(night, 150, false);
    cheer(tag, 150, false);
    cheer(card, 136, true);
    tuck.pose.faceX += 6;
    night.pose.faceX -= 6;
    tag.pose.faceX += 8;
    card.pose.faceX -= 8;
    night.pose.glow = 0;
  },
});
