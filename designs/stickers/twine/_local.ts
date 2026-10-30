/**
 * 牽牽's own helpers for its pack (the kit stays shared: four packs are drawn at once).
 *
 * `perk`: its bow is an emotion meter (designs/mascots/round3/tag/proposal.md) — the two loops perk up when it is happy
 * and droop when it is shy, the knot staying put in the middle. The rig has one bow picture, so this cuts it in three
 * along its knot (the left loop with its tail, the right loop with its tail, and the knot with the string through it),
 * each a copy of the bow's own <img> clipped to its piece: the loops turn about the knot, the knot never moves, so the
 * bow stays centred and level whatever it feels (the proposal: it must never come to rest leaning to one side).
 */
import { clamp, type StickerPuppet } from '../kit';

/** How far a loop turns at perk ±1, degrees. */
const PERK_DEG = 16;
/**
 * The bow picture (parts/tag deco: rig box x 276.25–428.75, y 127.5–206.25, its knot at 350, 152), in % of its box:
 * the knot's split, and the knot with the string running up out of it and down to the eyelet.
 */
const SPLIT = (((350 - 276.25) / 152.5) * 100).toFixed(2);
const KNOT = 'polygon(40.5% 0%, 56% 0%, 56% 47%, 51.5% 47%, 51.5% 100%, 44.5% 100%, 44.5% 47%, 40.5% 47%)';
/**
 * Each loop with its tail: its side of the knot, reaching in under the knot (which covers the cut) but leaving out the
 * string above the knot and the strand below it, which would otherwise swing out from under the knot as the loops turn.
 */
const LEFT = `polygon(0% 0%, 44% 0%, 44% 14%, ${SPLIT}% 14%, ${SPLIT}% 47%, 44% 47%, 44% 100%, 0% 100%)`;
const RIGHT = `polygon(53% 0%, 100% 0%, 100% 100%, 52% 100%, 52% 47%, ${SPLIT}% 47%, ${SPLIT}% 14%, 53% 14%)`;

interface Bow {
  deco: HTMLImageElement;
  left: HTMLImageElement;
  right: HTMLImageElement;
  knot: HTMLImageElement;
  v: number;
}
const bows = new WeakMap<StickerPuppet, Bow>();

/**
 * The bow's loops this frame: +1 perked up (happy), −1 drooping (shy), 0 as drawn. Call it every frame of a sticker
 * that uses it (each call adds; the frame after starts again from 0) — from the first frame, so the key pose is drawn
 * the same way at t = 0 and t = duration.
 */
export function perk(p: StickerPuppet, v: number): void {
  let bow = bows.get(p);
  if (!bow) {
    const deco = p.partImg('deco');
    if (!deco) throw new Error(`${p.slug} has no deco to perk`);
    const copy = (clip: string) => {
      const im = deco.cloneNode() as HTMLImageElement;
      im.style.clipPath = clip;
      return im;
    };
    const left = copy(LEFT);
    const right = copy(RIGHT);
    const knot = copy(KNOT);
    // the loops, then the knot over where they meet
    deco.after(left, right, knot);
    const made: Bow = { deco, left, right, knot, v: 0 };
    bow = made;
    bows.set(p, made);
    const draw = p.render.bind(p);
    p.render = () => {
      draw();
      const tf = made.deco.style.transform;
      const vis = made.deco.style.visibility;
      const a = PERK_DEG * clamp(made.v, -1.3, 1.3);
      made.left.style.transform = `${tf} rotate(${a.toFixed(2)}deg)`;
      made.right.style.transform = `${tf} rotate(${(-a).toFixed(2)}deg)`;
      made.knot.style.transform = tf;
      for (const im of [made.left, made.right, made.knot]) im.style.visibility = vis;
      made.deco.style.visibility = 'hidden';
      made.v = 0;
    };
  }
  bow.v += v;
}

/**
 * Where a mitten is drawn, px — `at` of the way along the arm (MITTEN_MIDDLE, where it holds things) — through the
 * body's whole pose, its lean too (the kit's `mitten()` leaves the lean's foreshortening out, so in a bow a prop held
 * there would drop below the mittens).
 */
export function mittenAt(p: StickerPuppet, side: 'L' | 'R', at = 0.67): [number, number] {
  const arm = p.rig.arms[side];
  const lift = p.lift(side);
  const a = ((side === 'L' ? 90 + lift : 90 - lift) * Math.PI) / 180;
  const r = arm.len * at;
  return p.pagePoint(arm.pivot[0] + Math.cos(a) * r, arm.pivot[1] + Math.sin(a) * r);
}

/** Between both mittens (a cup or a stem held in the two), px. */
export function between(p: StickerPuppet, at = 0.67): [number, number] {
  const [lx, ly] = mittenAt(p, 'L', at);
  const [rx, ry] = mittenAt(p, 'R', at);
  return [(lx + rx) / 2, (ly + ry) / 2];
}
