/**
 * 聆聆 · 這句好喜歡 Love this line — it looks down at the lines across the middle of its card; a thick terracotta
 * underline draws itself beneath the second; delighted, it points at it with a mitten, eyes shut, and gives a small hop, a little
 * paper heart popping up at the line's end.
 * Key pose: standing, a small smile, two lines written across its card under its face.
 *
 * The body moves on 4 frames (the hop: crouch, up, down, landing); the underline, the arm, the face and the heart change
 * alone.
 */
import { blink, defineSticker, ease, fr, keys, lerp, snap, span, step } from '../kit';
import { handwriting, ink, showInk } from './_local';

/**
 * Two lines written across its card under its own few words (rig units: y, x0, x1), the second the one it loves — about
 * 60% of the card. Two lines, so they read as words and the underline as a mark under them, and well below its face: a
 * single wavy stroke just under a face reads as a mouth.
 */
const LINES = [[588, 200, 474], [609, 200, 436]] as const;
/** The underline: where it starts under the second line, how much larger than the kit's (124 long) it is drawn. */
const UNDER: [number, number] = [196, 621];
const UNDER_SCALE = 1.94;
/** Where the mitten points: the underline's right end (rig units). */
const POINT: [number, number] = [436, 622];
/** The heart, just past the underline's end (rig units). */
const HEART: [number, number] = [486, 616];

export default defineSticker({
  duration: 2.5,
  // the thumb: landed, pointing at the underlined line, eyes shut, the heart up
  hero: fr(19),
  cast: { nod: { slug: 'card', x: 216, ground: 396, k: 0.8 } },
  props: {
    under: { kind: 'underline', seed: 21, inside: { puppet: 'nod', above: 'torso' } },
    heart: { kind: 'heart', seed: 24 },
  },
  frame(t, { nod }, { under, heart }) {
    const p = nod.pose;
    const k = nod.k;
    // the hop: crouch (f13), up (f14–15), down and landing (f16), standing (f17)
    const tb = snap(t, [0, fr(13), fr(14), fr(15), fr(16), fr(17)]);
    const crouch = tb === fr(13) || tb === fr(16) ? 1 : 0;
    const up = tb === fr(14) ? 0.8 : tb === fr(15) ? 1 : 0;
    p.sy *= 1 - 0.05 * crouch + 0.03 * up;
    p.sx *= 1 + 0.03 * crouch;
    p.legS *= 1 - 0.12 * crouch;
    p.rise += 18 * up;
    // the lines, in bold pencil (always on its card)
    showInk(ink(nod, 'lines', handwriting(LINES, 71, { w: 3.4, h: 6.5 })), true);
    // the underline draws itself left to right (f3–8); it fades again as the page rests (f25–27)
    const draw = span(t, fr(3), fr(8));
    const fade = keys(t, [[fr(25), 1], [fr(27), 0]]);
    if (draw > 0 && fade > 0) {
      under.at(...nod.pagePoint(...UNDER), { k, scale: UNDER_SCALE, anchor: 'start', alpha: fade }).set({ draw: ease.out(draw) });
    }
    // the mitten comes to point at it (f9–11), stays, goes down again (f22–25)
    const on = keys(t, [[fr(8), 0], [fr(11), 1, ease.out], [fr(22), 1], [fr(25), 0]]);
    p.front = on > 0.05;
    const [px, py] = nod.pagePoint(...POINT);
    nod.setLift('R', lerp(nod.rest('R'), nod.aim('R', px, py), on));
    // the heart pops up at the line's end with the hop (f14–15), and goes again (f23–24)
    const hs = keys(snap(t, [0, fr(14), fr(15), fr(23), fr(24), fr(25)]), [[0, 0], [fr(14), 0.6], [fr(15), 1], [fr(23), 1], [fr(24), 0.5], [fr(25), 0]]);
    if (hs > 0) heart.at(...nod.pagePoint(...HEART), { k, scale: 0.42 * hs, rot: 12 }).set({ glow: 0 });
    // the face: down at the line (f2–22), a delighted "ah" as it finds it, eyes shut and blushing while it points
    const ts = step(t, 1 / 12);
    const look = ts >= fr(2) && ts < fr(23) ? 1 : 0;
    p.faceY += 8 * look;
    if (ts >= fr(9) && ts < fr(11)) p.mouth = 'mouth-open';
    if (ts >= fr(11) && ts < fr(23)) p.eyes = 'shut';
    p.blush = keys(step(t, 1 / 6), [[0, 0.3], [fr(8), 0.5], [fr(12), 1.5], [fr(22), 1.5], [fr(26), 0.5], [fr(30), 0.3]]);
    blink(nod, t, fr(27), fr(1));
  },
});
