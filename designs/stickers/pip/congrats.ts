/**
 * 點點 · 恭喜 Congratulations — the whole family is there round 點點: 牽牽 at the left edge, 摺摺 and 悄悄 over its
 * shoulders, 聆聆 at the right, all small and behind it. 點點 crouches, hops and flings paper confetti up from both
 * mittens, eyes open and beaming; the four cheer, arms going up and down, while the confetti tumbles over them. Key
 * pose: the five of them, 點點 smiling in front.
 *
 * Stop motion, about three a second: the confetti, the four's arms and 點點's own moves all land on the same frames
 * (f3, f4, f6, f9, f13, f17, f21, f22, f24), and nothing changes between them but a blink — five puppets moving on
 * every frame would be far past the size budget.
 */
import { blink, defineSticker, fr, type StickerPuppet } from '../kit';
import { pick } from './_local';

const K = 0.95;

/** A friend cheering: arms between `low` and `high` by u, eyes on 點點 while they're lower, shut and beaming up high. */
function cheer(c: StickerPuppet, u: number, low: number, high: number, open: boolean): void {
  const lift = low + (high - low) * u;
  c.pose.liftL = lift;
  c.pose.liftR = lift;
  if (u > 0.5) c.pose.eyes = 'shut';
  c.pose.mouth = open ? 'mouth-open' : 'mouth-o';
  c.pose.blush = 0.6 + 0.4 * u;
}

export default defineSticker({
  duration: 2.25,
  // the thumb: the confetti arching overhead, everyone cheering
  hero: fr(9),
  cast: {
    tag: { slug: 'tag', x: 60, ground: 346, k: 0.3, z: 4 },
    tuck: { slug: 'tuck', x: 132, ground: 284, k: 0.32, z: 6 },
    night: { slug: 'night', x: 302, ground: 282, k: 0.32, z: 6 },
    card: { slug: 'card', x: 338, ground: 344, k: 0.3, z: 4 },
    pip: { slug: 'dot', x: 216, ground: 418, k: K, z: 20 },
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
    // eyes open and beaming the whole time (its other stickers shut them): an open-mouthed "congratulations!"
    if (pick(t, [[0, 0], [fr(4), 1], [fr(22), 0]])) {
      p.mouth = 'mouth-open';
      p.faceY -= 3;
    }
    p.blush = pick(t, [[0, 0.5], [fr(4), 1.1], [fr(6), 1.4], [fr(22), 0.9], [fr(24), 0.5]]);
    blink(pip, t, fr(1), fr(1));
    // the confetti: flung up and out from both mittens, on the same frames
    const ct = pick(t, [[0, -1], [fr(4), 0.06], [fr(6), 0.2], [fr(9), 0.38], [fr(13), 0.52], [fr(17), 0.7], [fr(21), 0.9], [fr(22), -1]]);
    if (ct >= 0) {
      confettiL.at(194, 116, { k: 0.96, rot: -22 }).set({ t: ct });
      confettiR.at(238, 116, { k: 0.96, rot: 22 }).set({ t: ct });
    }
    // the four cheer the whole time: arms up as the confetti goes up, a wave of them on the same frames, down at the end
    const arms = pick(t, [[0, 0], [fr(4), 1], [fr(13), 0.82], [fr(17), 1], [fr(22), 0]]);
    cheer(tuck, arms, 70, 150, true);
    cheer(night, arms, 70, 152, false);
    cheer(tag, arms, 30, 160, false);
    cheer(card, arms, 40, 146, true);
    tuck.pose.faceX += 7;
    night.pose.faceX -= 7;
    tag.pose.faceX += 9;
    card.pose.faceX -= 9;
    night.pose.glow = 0;
  },
});
