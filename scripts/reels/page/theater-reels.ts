/**
 * 小紙團劇場 (Resonance-marketing: instagram/plans.md, C): three short reels in which the paper puppets act one small moment
 * that happens on 共振 — no product features, one line of words, the last second held on a face.
 *
 * - `theater-1` 寫不出來的晚上，也算數: 摺摺 at a desk at night writes a line, gives up on it, crumples it and
 *   throws it at the basket; again (a miss); the third time one line stays, and it folds the slip and holds it.
 * - `theater-2` 有人讀到你了: a folded note floats down to 聆聆, who catches it, opens it, reads it, and slowly sits.
 * - `theater-3` 原來你也被這段話留住: 牽牽 and 悄悄 read at the two ends of a page; one passage of it lights up,
 *   both turn to it at once, then to each other, and the three waves pass between them.
 *
 * The puppets are the landing page's own engine, stepped by the reel's time (theater.ts); the rest is the reels'
 * kit (lib.ts). Each ends on a short sign-off: the wave mark, 共振, resonance.channel.
 */
import { wavyLine } from '@/lib/design/wavyPath';
import { drawable, html, place, svg } from '../../promo/page/dom';
import { autoRect, C, face, family, icon, measure } from '../../promo/page/kit';
import type { Puppet } from '@/lib/mascots/puppet';
import { aimLift, mouthOpen } from '@/lib/mascots/motion';
import { MITTEN_MIDDLE } from '@/lib/mascots/rig';
import type { ArmSide, Point } from '@/lib/mascots/types';
import { ease, H, lerp, paper, prog, tornSheet, W, words, type Cue, type Reel } from './lib';
import { arc, BALL, FOLDED, hold, prop, ramp, theater, WRITTEN, writer, type Scene } from './theater';

const DEG = Math.PI / 180;
const bell = (u: number, a = 0.2) => ramp(u, 0, a) * (1 - ramp(u, 1 - a, 1));

// ── Shared pieces ─────────────────────────────────────────────────────

/** The episode's one line, centred, big serif, rising in line by line. */
function line(text: string, top: number, size: number) {
  const w = words(text, { size, align: 'center', weight: 800, lineHeight: 1.3 });
  const box = html('div', { class: 'abs', style: { left: 0, top, width: W, display: 'flex', justifyContent: 'center', zIndex: 30 } }, [w.el]);
  return { el: box, update: w.update };
}

/** A pen line along the floor the scene stands on. */
function floor(x0: number, x1: number, y: number, seed: number) {
  const w = x1 - x0;
  const path = svg('path', { d: wavyLine(w, seed, 2.4, Math.round(w / 90)), fill: 'none', stroke: C.pen, 'stroke-width': 4, 'stroke-linecap': 'round' });
  const el = svg('svg', { width: w, height: 16, viewBox: `0 0 ${w} 16`, class: 'abs', style: `left:${x0}px;top:${y - 8}px;overflow:visible` }, [svg('g', { transform: 'translate(0,8)' }, [path])]);
  return el;
}

/** A cut-paper shape (a wobbly rect) at (x, y), w × h. */
function sheet(x: number, y: number, w: number, h: number, fill: string, seed: number, z: number, o: { stroke?: string; r?: number } = {}) {
  const f = face(autoRect(w, h, o.r ?? 10, seed), w, h, { fill, chalkSeed: seed % 7, stroke: o.stroke ?? C.pen, strokeWidth: 3 });
  return html('div', { class: 'abs', style: { left: x, top: y, width: w, height: h, zIndex: z } }, [f.el]);
}

/**
 * The sign-off (≤ 1.8 s): a cream sheet tears up over the scene, the wave mark is drawn on, 共振 and the address
 * come in, and the series' name under them.
 */
function signOff(episode: number) {
  const sheetIn = tornSheet(C.cream, 300 + episode, 50);
  const mark = icon('wave', 132, C.terracotta);
  const draw = mark.paths.map((p) => drawable(p));
  const name = html('div', { text: '共振', style: { font: '800 120px/1.1 var(--font-heading)', letterSpacing: '0.12em', color: C.text, marginRight: '-0.12em' } });
  const where = html('div', { class: 'end-small', text: 'resonance.channel' });
  const series = html('div', { text: `小紙團劇場・第 ${episode} 集`, style: { font: '600 34px/1.4 var(--font-body)', letterSpacing: '0.12em', color: C.muted } });
  const col = html('div', { class: 'abs', style: { left: 0, top: 640, width: W, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 30, zIndex: 51 } }, [
    mark.el,
    name,
    where,
    html('div', { style: { height: 24 } }),
    series,
  ]);
  const update = (t: number) => {
    sheetIn.set(ease.inOutCubic(prog(t, 0, 0.45)));
    place(col, { opacity: t < 0.3 ? 0 : 1 });
    draw.forEach((d, i) => d(ease.inOutCubic(prog(t, 0.3 + i * 0.08, 0.9 + i * 0.08))));
    place(name, { opacity: ease.outCubic(prog(t, 0.55, 0.95)), y: lerp(16, 0, ease.outCubic(prog(t, 0.55, 0.95))) });
    place(where, { opacity: ease.outCubic(prog(t, 0.8, 1.2)) });
    place(series, { opacity: ease.outCubic(prog(t, 1.0, 1.4)) });
  };
  return { els: [sheetIn.el, col], update };
}

/** A reel of the series: a paper background, the stage, the one line, the sign-off. */
function episode(o: {
  id: string;
  n: number;
  duration: number;
  endAt: number;
  coverAt: number;
  background: string;
  text: string;
  /** Other characters the scene shows (their glyphs are loaded with the line's). */
  glyphs?: string;
  lineTop: number;
  lineSize: number;
  lineAt: number;
  cues: Cue[];
  unitHeight: number;
  seed: number;
  /** Drawn behind the stage (made when the reel is built: there is no document in make.ts). */
  scenery?: () => Element[];
  script: (scene: Scene) => void;
}): Reel {
  return {
    id: o.id,
    duration: o.duration,
    endAt: o.endAt,
    coverAt: o.coverAt,
    text: o.text + (o.glyphs ?? '') + '共振小紙團劇場第集・resonance.channel0123456789',
    cues: o.cues,
    build() {
      const th = theater({ unitHeight: o.unitHeight, seed: o.seed, z: 10, script: o.script });
      const words1 = line(o.text, o.lineTop, o.lineSize);
      const end = signOff(o.n);
      const root = html('div', { class: 'abs', style: { left: 0, top: 0, width: W, height: H } }, [paper(o.background), ...(o.scenery?.() ?? []), th.el, words1.el, ...end.els]);
      const update = (t: number) => {
        th.seek(Math.min(t, o.endAt + 0.5));
        words1.update(t - o.lineAt);
        end.update(t - o.endAt);
      };
      return { root, update };
    },
  };
}

/** Lifts that aim both mittens at a page point (or each at its own). */
function reachFor(ch: Puppet, side: ArmSide, x: number, y: number): number {
  const [bx, by] = ch.pagePoint(...ch.arm(side).pivot);
  return aimLift(side, Math.atan2(y - by, x - bx) / DEG);
}
/** The point midway between the two mittens. */
function between(ch: Puppet): Point {
  const [lx, ly] = ch.mitten('L', MITTEN_MIDDLE);
  const [rx, ry] = ch.mitten('R', MITTEN_MIDDLE);
  return [(lx + rx) / 2, (ly + ry) / 2];
}

// ── 1 · 寫不出來的晚上，也算數 ─────────────────────────────────────────

const EP1 = {
  text: '寫不出來的晚上，\n也算數',
  x: 590,
  feet: 1262,
  deskTop: 1146,
  floor: 1318,
  basket: { x: 168, w: 132, h: 150 },
};
/** The three tries: when the slip comes, the writing, the look, the crumple, the throw (s), and how much is written. */
const TRIES = [
  { appear: -1, w0: 0, w1: 1.3, ink: 0.36, c0: 1.85, c1: 2.3, c2: 2.75, mood: 'shake' },
  { appear: 2.75, w0: 3.0, w1: 4.1, ink: 0.68, c0: 4.55, c1: 4.95, c2: 5.35, mood: 'sigh' },
  { appear: 5.35, w0: 5.65, w1: 7.45, ink: 0.31, c0: 99, c1: 99, c2: 99, mood: 'keep' },
] as const;
const RELEASE = 0.55;
const FLIGHT = 0.36;
const FOLD = { look: 7.45, nod: 7.75, fold0: 8.05, fold1: 8.45, hug0: 8.45, hug1: 8.95 };

function deskScenery() {
  const { deskTop, floor: fy, basket: b } = EP1;
  const wood = family(3);
  const desk = [
    sheet(352, deskTop, 572, 34, wood.tag, 41, 20, { r: 6 }),
    sheet(372, deskTop + 30, 532, fy - deskTop - 30, wood.fill, 43, 19, { r: 6 }),
  ];
  // a drawer and its knob
  const drawer = html('div', { class: 'abs', style: { left: 0, top: 0, zIndex: 21 } }, [
    svg('svg', { width: W, height: H, class: 'abs', style: 'left:0;top:0;overflow:visible' }, [
      svg('path', { d: autoRect(200, 64, 6, 47), transform: `translate(${638 - 100},${deskTop + 62})`, fill: 'none', stroke: C.pen, 'stroke-width': 3 }),
      svg('circle', { cx: 638, cy: deskTop + 94, r: 7, fill: C.pen }),
    ]),
  ]);
  // the night lamp: a small paper shade on a bent stem, clear of the puppet
  const lampX = 872;
  const shade = `M${lampX - 44} ${deskTop - 172} L${lampX + 24} ${deskTop - 184} L${lampX + 40} ${deskTop - 126} L${lampX - 52} ${deskTop - 112} Z`;
  const lamp = html('div', { class: 'abs', style: { left: 0, top: 0, zIndex: 9 } }, [
    svg('svg', { width: W, height: H, class: 'abs', style: 'left:0;top:0;overflow:visible' }, [
      svg('path', { d: `M${lampX + 18} ${deskTop} L${lampX + 24} ${deskTop - 96} L${lampX - 2} ${deskTop - 146}`, fill: 'none', stroke: C.pen, 'stroke-width': 6, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }),
      svg('path', { d: autoRect(64, 16, 6, 51), transform: `translate(${lampX - 12},${deskTop - 14})`, fill: wood.border, stroke: C.pen, 'stroke-width': 3 }),
      svg('path', { d: shade, fill: family(0).fill, stroke: C.pen, 'stroke-width': 3, 'stroke-linejoin': 'round' }),
    ]),
  ]);
  // the basket, in front of whatever lands in it
  const bx = b.x;
  const by = fy - b.h;
  const basketPath = `M${bx} ${by} L${bx + b.w} ${by + 2} L${bx + b.w - 14} ${fy} L${bx + 12} ${fy - 1} Z`;
  const weave = [0.25, 0.5, 0.75].map((f) => `M${bx + b.w * f} ${by + 6} L${bx + 12 + (b.w - 26) * f} ${fy - 6}`).join(' ');
  const basket = html('div', { class: 'abs', style: { left: 0, top: 0, zIndex: 45 } }, [
    svg('svg', { width: W, height: H, class: 'abs', style: 'left:0;top:0;overflow:visible' }, [
      svg('path', { d: basketPath, fill: family(4).tag, stroke: C.pen, 'stroke-width': 3, 'stroke-linejoin': 'round' }),
      svg('path', { d: weave, fill: 'none', stroke: C.pen, 'stroke-width': 2, opacity: 0.6, 'stroke-linecap': 'round' }),
      svg('path', { d: `M${bx - 4} ${by} L${bx + b.w + 4} ${by + 2}`, fill: 'none', stroke: C.pen, 'stroke-width': 5, 'stroke-linecap': 'round' }),
    ]),
  ]);
  return { inStage: [...desk, drawer, lamp, basket], below: [floor(110, 970, fy, 61)] };
}

function ep1Script({ S, root, actor }: Scene) {
  const { inStage } = deskScenery();
  root.append(...inStage);
  const ch = actor('tuck', EP1.x, EP1.feet);
  const wr = writer(ch, 'L');
  const R = ch.rig;
  const slips = TRIES.map(() => prop(S, ch, 'paper'));
  const folded = prop(S, ch, 'paper', FOLDED);
  const pencil = prop(S, ch, 'pencil');
  const balls = TRIES.slice(0, 2).map(() => prop(S, ch, 'burst', BALL));
  const b = EP1.basket;
  const rim = EP1.floor - b.h;
  // what the night already threw away: two in the basket, one beside it
  const kept: [number, number, number][] = [
    [b.x + 44, rim + 10, -20],
    [b.x + 92, rim + 6, 35],
    [b.x + b.w + 46, EP1.floor - 26, 10],
  ];
  const ballK = ch.k * wr.wp.paperScale * 0.42;
  for (const [x, y, r] of kept) prop(S, ch, 'burst', BALL).at(x, y, ballK, 1, r);
  // where the two throws land: in, then a miss that flies past the basket's far side, the way the arm threw it
  const lands: [number, number][] = [
    [b.x + 66, rim + 14],
    [b.x - 38, EP1.floor - 26],
  ];
  const slipCentre = (g: number): Point => {
    const a = wr.slipAt(g);
    const c = Math.cos(a.rot * DEG);
    const s = Math.sin(a.rot * DEG);
    const dx = 15 * a.k;
    const dy = -2 * a.k;
    return [a.x + dx * c - dy * s, a.y + dx * s + dy * c];
  };
  const desk: Point = [EP1.x + 150, EP1.deskTop - 6];
  const releaseAt: (Point | null)[] = [null, null];

  ch.push(
    hold(S, (t) => {
      const p = ch.pose;
      let i = 0;
      while (i < TRIES.length - 1 && t >= TRIES[i + 1].appear) i++;
      const tr = TRIES[i];
      // the slip arm: up and holding, or swinging the ball over its shoulder
      const appear = tr.appear < 0 ? 1 : ramp(t, tr.appear, tr.appear + 0.28);
      const toss = prog(t, tr.c1, tr.c2);
      const swing = toss <= 0 ? 0 : toss < RELEASE ? ease.inOutCubic(toss / RELEASE) : 1 - ease.inOutCubic((toss - RELEASE) / (1 - RELEASE));
      const hug = ramp(t, FOLD.hug0, FOLD.hug1);
      // the pencil: in its mitten all along, where the line stopped; put down on the desk at the end
      const writing = prog(t, tr.w0, tr.w1);
      const ink = tr.ink * writing;
      const putDown = ramp(t, FOLD.fold0, FOLD.fold0 + 0.3);
      const w = 1 - putDown;
      wr.pose(appear, w, ink, t, swing * (160 - wr.wp.hold));
      if (hug > 0) {
        // both mittens bring the folded slip to its chest
        const cx = ch.x + (R.face[0] - R.gx) * ch.k;
        const cy = ch.pagePoint(R.face[0], lerp(R.face[1], R.tp[1], 0.75))[1];
        for (const side of ['L', 'R'] as const) {
          const now = side === 'L' ? p.liftL : p.liftR;
          ch.setLift(side, lerp(now, reachFor(ch, side, cx + (side === 'L' ? -10 : 10) * ch.k, cy), hug));
        }
      }
      // the face: down at the slip while writing; a shake, a sigh; after the throw, a look at the basket
      const mid = wr.wp.on([20, 15])[0];
      const atSlip = Math.max(-8, Math.min(8, (mid - R.face[0]) / 5));
      if (t < (tr.c0 === 99 ? FOLD.fold1 : tr.c1)) {
        p.faceY += 6;
        p.faceX += atSlip;
      }
      const look = prog(t, tr.w1, tr.c0);
      if (look > 0 && look < 1 && tr.mood === 'shake') {
        p.tilt += 3.5 * Math.sin(look * Math.PI * 4) * bell(look, 0.2);
        p.faceX += 4 * Math.sin(look * Math.PI * 4) * bell(look, 0.2);
      }
      if (look > 0 && look < 1 && tr.mood === 'sigh') {
        const e = bell(look, 0.3);
        p.sy *= 1 - 0.045 * e;
        p.faceY += 3 * e;
        if (look > 0.3 && look < 0.75) p.eyes = 'shut';
      }
      if (toss > 0 && toss < 1) {
        p.tilt -= 5 * Math.sin(Math.PI * toss);
        p.faceX -= 10 * ramp(toss, RELEASE - 0.1, RELEASE + 0.2);
        p.faceY -= 2;
        if (i === 1 && toss > RELEASE + 0.2) p.mouth = 'mouth-o';
      }
      // the third: it reads its one line, nods, smiles, folds it and holds it
      const nod = prog(t, FOLD.nod, FOLD.nod + 0.4);
      if (nod > 0 && nod < 1) p.faceY += 4 * Math.sin(Math.PI * nod);
      if (t > FOLD.nod + 0.3) {
        p.blush = Math.max(p.blush, 0.75 * ramp(t, FOLD.nod + 0.3, FOLD.hug1));
      }
      if (hug > 0) {
        p.faceY += lerp(6, 1, hug);
        p.faceX = lerp(p.faceX, 0, hug);
        p.tilt += 2.5 * hug * Math.sin((t - FOLD.hug0) * 1.6);
        if (t > FOLD.hug1 - 0.05) p.eyes = 'shut';
      }

      // the slips
      TRIES.forEach((tq, j) => {
        const slip = slips[j];
        if (j !== i) {
          slip.at(0, 0, 0.01, 0);
          return;
        }
        const crumple = prog(t, tq.c0, tq.c0 + 0.45);
        const grow = (tq.appear < 0 ? 1 : lerp(0.7, 1, ramp(t, tq.appear, tq.appear + 0.25))) * (1 - 0.55 * ease.inCubic(crumple));
        const fold = prog(t, FOLD.fold0, FOLD.fold1);
        const alpha = appear * (crumple > 0.55 ? 0 : 1) * (fold > 0.5 ? 0 : 1);
        const a = wr.slipAt(grow);
        slip.at(a.x, a.y, a.k, alpha, a.rot + 40 * crumple + (fold > 0 ? -8 * fold : 0), wr.wp.anchor);
        slip.write(ink);
      });
      // the balls: crumpled in the mitten, thrown on their arc, then lying where they fell
      balls.forEach((ball, j) => {
        const tq = TRIES[j];
        const crumple = prog(t, tq.c0, tq.c0 + 0.45);
        if (crumple <= 0.5) {
          ball.at(0, 0, 0.01, 0);
          return;
        }
        // Let go just past the top of the swing, as the arm starts forward toward the basket.
        const rel = tq.c1 + (RELEASE + 0.06) * (tq.c2 - tq.c1);
        if (t < rel) {
          // Crumpled where the slip was, then carried in the mitten through the whole wind-up.
          const [sx, sy] = slipCentre(0.45);
          const [mx, my] = ch.mitten('L', 0.67);
          const inHand = ramp(t, tq.c0 + 0.2, tq.c1);
          const x = lerp(sx, mx, inHand);
          const y = lerp(sy, my, inHand);
          ball.at(x, y, ballK * lerp(0.75, 1, ramp(crumple, 0.5, 1)), 1, 30 * crumple + 200 * prog(t, tq.c1, rel));
          releaseAt[j] = [x, y];
          return;
        }
        const from = releaseAt[j] ?? slipCentre(0.45);
        const u = prog(t, rel, rel + FLIGHT);
        const to = lands[j];
        // A real toss: a quadratic arc at an even pace is a thrown thing's parabola; a short rise from the hand, then down.
        const [x, y] = u < 1 ? arc(from, to, u, j === 0 ? 90 : 120) : to;
        // the miss bounces once on the floor
        const bounce = j === 1 ? 26 * Math.sin(Math.PI * prog(t, rel + FLIGHT, rel + FLIGHT + 0.3)) : 0;
        ball.at(x, y - bounce, ballK, 1, 200 + 420 * u + (j === 1 ? 90 * prog(t, rel + FLIGHT, rel + FLIGHT + 0.3) : 0));
      });
      // the folded slip, then in both mittens at its chest
      const fold = prog(t, FOLD.fold0, FOLD.fold1);
      if (fold > 0.5) {
        const a = wr.slipAt(1);
        const [hx, hy] = between(ch);
        const k = a.k * lerp(0.85, 1, ramp(fold, 0.5, 1));
        folded.at(lerp(slipCentre(1)[0], hx, hug), lerp(slipCentre(1)[1], hy - 4 * ch.k, hug), k, 1, lerp(a.rot, -4, hug));
      } else folded.at(0, 0, 0.01, 0);
      // the pencil: in its mitten, then laid on the desk
      if (putDown < 1) wr.pencil(pencil, Math.max(w, 0.35), 1);
      if (putDown > 0) {
        const k = ch.k * wr.wp.penScale;
        if (putDown >= 1) pencil.at(desk[0], desk[1], k, 1, 96);
        else {
          const [qx, qy] = ch.mitten(wr.pen, MITTEN_MIDDLE);
          pencil.at(lerp(qx, desk[0], putDown), lerp(qy, desk[1], putDown), k, 1, lerp(20, 96, putDown));
        }
      }
    }),
  );
}

const theater1 = episode({
  id: 'theater-1',
  n: 1,
  duration: 11.4,
  endAt: 9.7,
  coverAt: 9.4,
  background: family(1).tag,
  text: EP1.text,
  lineTop: 388,
  lineSize: 88,
  lineAt: 8.55,
  unitHeight: 540,
  seed: 11,
  cues: [
    { t: 0.05, sfx: 'scribble', gain: -6 },
    { t: 1.9, sfx: 'paper' },
    { t: 2.55, sfx: 'whoosh', gain: -12 },
    { t: 2.97, sfx: 'tap', gain: -8 },
    { t: 3.0, sfx: 'scribble', gain: -6 },
    { t: 4.6, sfx: 'paper' },
    { t: 5.15, sfx: 'whoosh', gain: -12 },
    { t: 5.57, sfx: 'tap', gain: -6 },
    { t: 5.7, sfx: 'scribble', gain: -8 },
    { t: 8.1, sfx: 'paper', gain: -4 },
    { t: 8.6, sfx: 'chime', gain: -6 },
    { t: 9.7, sfx: 'whoosh', gain: -8 },
  ],
  scenery: () => deskScenery().below,
  script: ep1Script,
});

// ── 2 · 有人讀到你了 ───────────────────────────────────────────────────

const EP2 = { text: '有人讀到你了', x: 540, feet: 1200, floor: 1200 };
const NOTE = { from: [884, 330] as Point, start: 0.0, caught: 2.55, notice: 1.35, raise0: 1.75, down1: 3.05, open0: 2.95, open1: 3.35, read1: 5.25, sit0: 5.55, sit1: 6.85 };

function ep2Script({ S, actor }: Scene) {
  const ch = actor('card', EP2.x, EP2.feet);
  const R = ch.rig;
  const note = prop(S, ch, 'note');
  const slip = prop(S, ch, 'paper', WRITTEN);
  let caughtAt: Point | null = null;
  ch.push(
    hold(S, (t) => {
      const p = ch.pose;
      const N = NOTE;
      // sitting down slowly at the end
      const sit = ramp(t, N.sit0, N.sit1);
      if (sit > 0) {
        ch.floorU = sit;
        ch.base();
      }
      // arms: hanging, then up to the note, then down to read it, then hugging it
      // both mittens come up before its chest to meet the note, and keep it there to read
      const readHold = ramp(t, N.raise0, N.caught);
      const hug = ramp(t, N.read1 + 0.2, N.sit1 - 0.3);
      const [fx, fy] = R.face;
      const hy = lerp(fy, R.tp[1], 0.62);
      for (const side of ['L', 'R'] as const) {
        const a = ch.arm(side);
        const read = aimLift(side, Math.atan2(hy - a.pivot[1], fx + (side === 'L' ? -48 : 48) - a.pivot[0]) / DEG);
        const hugAt = aimLift(side, Math.atan2(lerp(fy, R.tp[1], 0.8) - a.pivot[1], fx + (side === 'L' ? -14 : 14) - a.pivot[0]) / DEG);
        let lift = lerp(a.rest, read, readHold);
        lift = lerp(lift, hugAt, hug);
        ch.setLift(side, lift + 3 * Math.sin(t * 1.3 + (side === 'L' ? 0 : 2)));
      }
      p.front = readHold > 0.02;
      // the face: a little low to begin with; it notices the note and looks up; reads; is moved
      const seen = ramp(t, N.notice, N.notice + 0.3);
      const noteU = prog(t, N.start, N.caught);
      if (t < N.caught) {
        p.faceY += lerp(4, -7, seen);
        p.faceX += lerp(-3, 8 * (1 - noteU) + 2, seen);
        if (seen > 0 && t < N.caught) p.mouth = 'mouth-o';
      }
      const reading = prog(t, N.open1, N.read1);
      if (t >= N.caught && t < N.read1 + 0.2) {
        p.faceY += 6 * readHold;
        if (reading > 0) p.faceX += (-6 + 12 * ((reading * 2.2) % 1)) * bell(reading, 0.1);
        if (reading > 0.55 && reading < 0.6) p.eyes = 'shut';
      }
      const moved = ramp(t, N.read1, N.read1 + 0.4);
      if (moved > 0) {
        p.blush = Math.max(p.blush, 0.85 * moved);
        if (t < N.sit0) p.mouth = 'mouth-o';
        p.faceY += lerp(6, 2, moved);
        if (t > N.sit1 - 0.35) p.eyes = 'shut';
        p.tilt += 2 * Math.sin((t - N.read1) * 1.4) * hug;
      }
      // the catch: a little give in the knees
      const give = prog(t, N.caught - 0.05, N.caught + 0.3);
      if (give > 0 && give < 1) p.sy *= 1 - 0.05 * Math.sin(Math.PI * give);

      // the note, falling like a leaf, then in its mittens
      const hands = between(ch);
      if (t < N.caught) {
        const u = noteU;
        const sway = Math.sin(u * Math.PI * 3.2) * (1 - u);
        // down the right side first, then in to the hands at the last: never across its face
        const x = lerp(N.from[0], hands[0], ease.inCubic(u)) + 60 * sway;
        const y = lerp(N.from[1], hands[1] - 8 * ch.k, ease.outQuad(u));
        note.at(x, y, ch.k * 2.4, 1, 28 * sway - 6);
      } else {
        caughtAt ??= hands;
        const open = prog(t, N.open0, N.open1);
        note.at(hands[0], hands[1] - 8 * ch.k, ch.k * 2.4 * (1 - 0.3 * open), open < 0.5 ? 1 : 0, -6 + 6 * open);
        const g = ch.k * 2.6 * lerp(0.55, 1, ease.outBack(ramp(open, 0.4, 1)));
        slip.at(hands[0], hands[1] - 6 * ch.k - 4 * ch.k * hug, g, open >= 0.5 ? 1 : 0, lerp(-2, -6, hug) + p.tilt);
      }
    }),
  );
}

const theater2 = episode({
  id: 'theater-2',
  n: 2,
  duration: 10.4,
  endAt: 8.7,
  coverAt: 8.4,
  background: family(3).fill,
  text: EP2.text,
  lineTop: 470,
  lineSize: 108,
  lineAt: 6.7,
  unitHeight: 680,
  seed: 23,
  cues: [
    { t: 0.1, sfx: 'whoosh', gain: -14 },
    { t: 2.55, sfx: 'tap', gain: -4 },
    { t: 3.0, sfx: 'flip', gain: -2 },
    { t: 5.6, sfx: 'paper', gain: -12 },
    { t: 6.7, sfx: 'chime', gain: -6 },
    { t: 8.7, sfx: 'whoosh', gain: -8 },
  ],
  scenery: () => [floor(250, 830, EP2.floor, 72)],
  script: ep2Script,
});

// ── 3 · 原來你也被這段話留住 ───────────────────────────────────────────

const EP3 = {
  text: '原來你也被這段話留住',
  feet: 1200,
  left: 206,
  right: 842,
  card: { x: 298, y: 400, w: 500 },
  title: '回家的路上',
  before: '下班的公車上，我把耳機拿下來，聽窗外的雨慢慢停掉。',
  passage: '今天就算什麼都沒做好，也可以慢慢走回家。',
};
const LIGHT = { wash0: 1.3, wash1: 2.3, turn: 2.6, each: 3.5, waves0: 3.9, waves1: 8.4 };

/** The page between them: a title and a paragraph, one passage of it lit by a wash that sweeps in. */
function storyPage() {
  const fam = family(0);
  const c = EP3.card;
  const passage = html('span', { text: EP3.passage, style: { borderRadius: 6, padding: '2px 0', boxDecorationBreak: 'clone', webkitBoxDecorationBreak: 'clone', backgroundRepeat: 'no-repeat', backgroundImage: 'linear-gradient(color-mix(in oklch, var(--color-terracotta-light) 56%, transparent), color-mix(in oklch, var(--color-terracotta-light) 56%, transparent))', backgroundSize: '0% 100%' } });
  const body = html('div', { style: { font: '500 32px/1.8 var(--font-body)', letterSpacing: '0.02em', color: C.text, marginTop: 20, textSpacingTrim: 'trim-both' } }, [EP3.before, passage]);
  const title = html('div', { text: EP3.title, style: { font: '800 42px/1.3 var(--font-heading)', letterSpacing: '0.04em', color: C.text } });
  const inner = html('div', { style: { position: 'relative', padding: '44px 52px 48px', width: c.w, boxSizing: 'border-box' } }, [title, body]);
  const el = html('div', { class: 'abs', style: { left: c.x, top: c.y, width: c.w, zIndex: 8 } }, [inner]);
  const { h } = measure(el);
  el.prepend(face(autoRect(c.w, h, 22, 91), c.w, h, { fill: fam.interior, stroke: fam.border, strokeWidth: 3, chalkSeed: 2 }).el);
  const update = (t: number) => {
    passage.style.backgroundSize = `${(ease.inOutCubic(prog(t, LIGHT.wash0, LIGHT.wash1)) * 100).toFixed(1)}% 100%`;
  };
  return { el, update, h };
}

function ep3Script({ S, actor }: Scene) {
  const tag = actor('tag', EP3.left, EP3.feet);
  const night = actor('night', EP3.right, EP3.feet);
  const books = [prop(S, tag, 'book'), prop(S, night, 'book')];
  const waves = prop(S, tag, 'waves');
  [tag, night].forEach((ch, i) => {
    const R = ch.rig;
    const dir = i === 0 ? 1 : -1; // toward the middle
    const book = books[i];
    const size = Math.max(1.3, Math.min(2.1, (R.torso.w * 0.4) / 64)) * 1.15;
    ch.push(
      hold(S, (t) => {
        const p = ch.pose;
        const L = LIGHT;
        // reading its own book, until the page lights; it lowers the book as it turns
        const reading = 1 - ramp(t, L.turn - 0.05, L.turn + 0.45);
        const [fx, fy] = R.face;
        const hy = lerp(fy, R.tp[1], 0.62);
        for (const side of ['L', 'R'] as const) {
          const a = ch.arm(side);
          const hx = fx + (side === 'L' ? -48 : 48);
          ch.setLift(side, lerp(a.rest, aimLift(side, Math.atan2(hy - a.pivot[1], hx - a.pivot[0]) / DEG), reading));
        }
        p.front = reading > 0.02;
        const off = i === 0 ? 0 : 1.3; // they don't read in step
        if (reading > 0) {
          p.faceY += 6 * reading;
          p.faceX += (-6 + 12 * (((t + off) * 0.5) % 1)) * reading;
          p.tilt += 1.5 * Math.sin((t + off) * 1.3) * reading;
        }
        const [lx, ly] = ch.mitten('L');
        const [rx, ry] = ch.mitten('R');
        book.at((lx + rx) / 2, (ly + ry) / 2 - 3 * ch.k, ch.k * size, reading > 0.25 ? 1 : 0, p.tilt);
        book.turn(i === 0 ? prog(t, 0.6, 0.85) : prog(t, 1.4, 1.65));
        // both turn to the page at once — up at the lit passage — then to each other
        const turned = ramp(t, L.turn, L.turn + 0.18);
        const toEach = ramp(t, L.each, L.each + 0.25);
        if (turned > 0) {
          p.faceX += dir * 11 * turned;
          p.tilt += dir * 4 * turned * (1 - toEach);
          p.faceY += lerp(-8, -1, toEach) * turned;
          if (t < L.each) p.mouth = 'mouth-o';
        }
        // the look across: a small hop of recognition, then the same bob as the waves pass
        const hop = prog(t, L.each, L.each + 0.35);
        if (hop > 0 && hop < 1) p.rise += 12 * Math.sin(Math.PI * hop);
        const rt = t - L.waves0;
        if (rt > 0) {
          const ph = ((rt / 0.7) % 1 + 1) % 1;
          if (rt < 0.7 * 3) {
            p.rise += 6 * Math.sin(Math.PI * ph);
            if (ph > 0.3 && ph < 0.7) p.eyes = 'shut';
          } else p.eyes = 'shut';
          p.mouth = mouthOpen(ch);
          p.blush = Math.max(p.blush, 0.85 * ramp(rt, 0, 0.5));
        }
        if (i === 0) {
          // the three waves between their faces
          const [ax, ay] = tag.facePage();
          const [bx, by] = night.facePage();
          const ph = rt > 0 ? (((rt / 0.7) % 1) + 1) % 1 : 0;
          const alpha = rt > 0 ? ramp(rt, 0, 0.3) * (1 - ramp(t, L.waves1 - 0.3, L.waves1)) : 0;
          waves.wave((ax + bx) / 2, (ay + by) / 2 - 8 * tag.k, tag.k * 1.9, alpha, rt > 0 && rt < 0.7 * 3 ? ph : 0, 85);
        }
      }),
    );
  });
}

const theater3: Reel = (() => {
  const base = episode({
    id: 'theater-3',
    n: 3,
    duration: 9.8,
    endAt: 8.1,
    coverAt: 7.8,
    background: C.cream,
    text: EP3.text,
    glyphs: EP3.title + EP3.before + EP3.passage,
    lineTop: 1282,
    lineSize: 80,
    lineAt: 4.6,
    unitHeight: 330,
    seed: 37,
    cues: [
      { t: 0.6, sfx: 'flip', gain: -10 },
      { t: 1.35, sfx: 'chime', gain: -8 },
      { t: 2.6, sfx: 'tap', gain: -6 },
      { t: 3.9, sfx: 'chime', gain: -4 },
      { t: 8.1, sfx: 'whoosh', gain: -8 },
    ],
    scenery: () => [floor(110, 970, EP3.feet, 83)],
    script: ep3Script,
  });
  return {
    ...base,
    build() {
      const built = base.build();
      const pg = storyPage();
      built.root.insertBefore(pg.el, built.root.children[2]);
      return {
        root: built.root,
        update(t: number) {
          pg.update(t);
          built.update(t);
        },
      };
    },
  };
})();

export const THEATER: Record<string, Reel> = { [theater1.id]: theater1, [theater2.id]: theater2, [theater3.id]: theater3 };
