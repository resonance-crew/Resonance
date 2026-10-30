/**
 * Every prop on one canvas, at rest (frame 0) and in its state (frame 1): a review aid, not a sticker.
 *
 *   npm run stickers -- designs/stickers/review/props.ts --out <dir> --frames <dir>
 */
import { defineSticker, PROP_KINDS, type PropKind, type PropState } from '../kit';

const KINDS = Object.keys(PROP_KINDS) as PropKind[];
const COLS = 5;
const CELL = 432 / COLS;

/** What each prop shows in frame 1. */
const STATE: Partial<Record<PropKind, PropState>> = {
  heart: { glow: 1 }, cup: { steam: 1, phase: 0.3 }, slip: { seal: 1 }, pennant: { wave: 0.3 }, star: { shine: 1 },
  card: { lines: 1, underline: 1 }, confetti: { t: 0.35 }, wave: { pulse: 0.5 }, tear: { glint: 1 }, lantern: { glow: 1 },
  sun: { rays: 1 }, burst: { draw: 1 }, sparkle: { show: 1 }, zz: { draw: 1 }, scribble: { lines: 1 }, underline: { draw: 1 },
};

export default defineSticker({
  duration: 2 / 12,
  hero: 1 / 12,
  cast: {},
  props: Object.fromEntries(KINDS.map((k, i) => [k, { kind: k, seed: 3 + i }])) as Record<PropKind, { kind: PropKind; seed: number }>,
  frame(t, _cast, props) {
    const on = Math.abs(t - 1 / 12) < 1e-6;
    KINDS.forEach((kind, i) => {
      const [w, h] = PROP_KINDS[kind].size;
      const big = kind === 'confetti';
      const s = big ? 0.2 : Math.min((CELL - 18) / w, (CELL - 18) / h);
      const x = (i % COLS) * CELL + CELL / 2;
      const y = Math.floor(i / COLS) * CELL + CELL / 2;
      props[kind].at(x, y, { k: s, anchor: [w / 2, h / 2] }).set(on ? STATE[kind] ?? {} : {});
    });
  },
});
