/**
 * 摺摺 · 有你真好 Glad you're here — the two sit side by side, 悄悄 leaning on 摺摺's shoulder. 悄悄 sits up for a moment
 * and they look at each other; then it slowly leans back in, and 摺摺's blush rises until its eyes shut, content.
 * Key pose: sitting, 悄悄 leaning on 摺摺, both eyes shut, 摺摺 blushing.
 *
 * 摺摺 (in front, the protagonist) never moves its body: only its face. 悄悄 sits up on 2 frames and leans back on 4.
 */
import { bell, defineSticker, fr, keys, snap, step } from '../kit';

/** How far 悄悄 leans on 摺摺 (degrees; its top toward 摺摺). */
const LEAN = -7;

export default defineSticker({
  duration: 2.5,
  // the thumb: leaning together, blushing, the two sparkles up
  hero: fr(22),
  cast: {
    hush: { slug: 'night', x: 296, ground: 338, k: 0.6, stance: 'floor', z: 10 },
    tuck: { slug: 'tuck', x: 146, ground: 392, k: 0.74, stance: 'floor', z: 20 },
  },
  props: {
    sparkles: { kind: 'sparkles', seed: 5 },
  },
  frame(t, { tuck, hush }, { sparkles }) {
    const tk = tuck.pose;
    const hs = hush.pose;
    // 悄悄: sits up (f5–6), holds, leans back in slowly (f12–18)
    const tb = snap(t, [0, fr(5), fr(6), fr(12), fr(14), fr(16), fr(18)]);
    const up = keys(tb, [[0, 0], [fr(4), 0], [fr(6), 1], [fr(11), 1], [fr(18), 0, (u: number) => u]]);
    hs.tilt = LEAN * (1 - 0.9 * up);
    // mittens resting in their laps (a sitting arm hanging straight down would go through the floor)
    // 悄悄's own arms rest close beside it, on the floor; its legs tucked under its dome (nothing sticks out)
    hs.liftL = 18;
    hs.liftR = 18;
    hs.legL = 0;
    hs.legR = 0;
    hs.legS = 0.18;
    tk.liftL = -60;
    tk.liftR = -60;
    tk.front = true;
    // faces: shut and content while leaning; sat up, they look at each other and smile
    const ts = step(t, 1 / 12);
    const looking = ts >= fr(5) && ts < fr(16);
    hs.eyes = looking ? 'open' : 'shut';
    tk.eyes = ts >= fr(5) && ts < fr(18) ? 'open' : 'shut';
    hs.faceX += looking ? -9 : 10;
    hs.faceY += looking ? -1 : 2;
    tk.faceX += looking ? 9 : 5;
    tk.faceY += 2;
    if (ts >= fr(8) && ts < fr(11)) hs.mouth = 'mouth-o';
    hs.blush = looking ? 0.6 : 1;
    // 摺摺's blush: down while they look at each other, rising as 悄悄 leans back, fullest once it's settled
    tk.blush = keys(step(t, 1 / 6), [[0, 1.6], [fr(4), 1.6], [fr(6), 0.6], [fr(12), 0.6], [fr(18), 1.3], [fr(22), 1.6]]);
    hs.stars = 1;
    // as it settles back in, sparkles over where they touch (big enough to read at 72; grown in and out, on fours)
    const ss = step(t, 1 / 6);
    sparkles.at(256, 104, { k: tuck.k }).set({ show: bell(ss, fr(18), fr(28), 0.3, 0.35) });
  },
});
