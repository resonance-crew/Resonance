/**
 * 牽牽 · 辛苦了 You worked hard — holding a steaming paper cup in both mittens, it offers it to you with a little bow:
 * the cup comes up and forward to you, its eyes close kindly, the blush comes up; it holds the bow while the steam curls
 * up, and straightens again.
 * Key pose: standing, the cup held before its middle in both mittens, steam rising, a small smile.
 *
 * The body moves on 6 frames (down 3, up 3) and holds the bow; the steam (a small prop change) runs on every frame.
 */
import { blink, bow, defineSticker, fr, keys, lerp, snap, step } from '../kit';
import { between, perk } from './_local';

/** Both mittens on the cup's sides, before its middle. */
const HOLD = -11;
/**
 * The cup: inside 牽牽, just over its paper, so the mittens are in front of it, holding it; its sleeve between them;
 * how large beside it — larger as it is held out to you.
 */
const SLEEVE: [number, number] = [55, 141];
const CUP = 1.42;
const CUP_OUT = 1.66;
/** Offered, the cup rides up in the mittens (they hold it lower down), so it comes up toward you, its steam still clear of the face. */
const RAISED: [number, number] = [55, 147];
/** How tall its steam stands (a fraction of the cup's own: it stays below the face), and once the cup is raised. */
const STEAM = 0.38;
const STEAM_RAISED = 0.28;
/** Steam over blue paper: a warm white. */
const STEAM_INK = 'oklch(97% 0.012 85)';
/** The steam's rise: whole cycles in one play, so the loop closes. */
const PUFFS = 2;

export default defineSticker({
  duration: 2.25,
  // the thumb: the cup held out in the bow, eyes closed kindly, the steam curling up
  hero: fr(12),
  cast: { tw: { slug: 'tag', x: 216, ground: 414, k: 0.68 } },
  props: { cup: { kind: 'cup', seed: 6, inside: { puppet: 'tw', above: 'torso' } } },
  frame(t, { tw }, { cup }) {
    const p = tw.pose;
    const tb = snap(t, [0, fr(5), fr(6), fr(7), fr(18), fr(19), fr(20)]);
    const e = bow(tw, tb, fr(4), fr(7), fr(17), fr(20), 0.8);
    // the mittens round the cup, lifting it a touch as it is offered
    p.liftL = HOLD - 5 * e;
    p.liftR = HOLD - 5 * e;
    // (inside the body the cup leans with it: placed as if upright)
    const lean = p.lean;
    p.lean = 0;
    const [hx, hy] = between(tw);
    p.lean = lean;
    cup.at(hx, hy, { k: tw.k, scale: lerp(CUP, CUP_OUT, e), anchor: [SLEEVE[0], lerp(SLEEVE[1], RAISED[1], e)] })
      .set({ steam: 1, phase: (PUFFS * t) / 2.25 });
    // a shorter steam (the cup's own would reach its eyes), scaled down from where it leaves the cup, and pale: it
    // rises over 牽牽's blue paper, where a graphite wisp would read as a crease
    const steam = cup.svg.querySelector<SVGGElement>('.steam');
    if (steam) {
      steam.style.transformBox = 'view-box';
      steam.style.transformOrigin = '55px 96px';
      steam.style.transform = `scale(1, ${lerp(STEAM, STEAM_RAISED, e).toFixed(3)})`;
      steam.setAttribute('stroke', STEAM_INK);
      steam.setAttribute('stroke-width', '7');
      steam.style.opacity = '1';
    }
    // the face: eyes closed kindly through the bow (bow() shuts them), the blush up, the loops up a little
    const ts = step(t, 1 / 6);
    p.blush = keys(ts, [[0, 0.4], [fr(6), 0.6], [fr(10), 1.4], [fr(17), 1.4], [fr(22), 0.4]]);
    perk(tw, keys(ts, [[0, 0], [fr(7), 0], [fr(10), 0.7], [fr(18), 0.7], [fr(22), 0]]));
    blink(tw, t, fr(24), fr(2));
  },
});
