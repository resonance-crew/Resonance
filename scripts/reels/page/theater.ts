/**
 * 小紙團劇場's stage: the landing page's own puppet engine (src/lib/mascots — its Stage, Puppet, props and
 * motion), driven by the reel's time instead of the browser's clock, so a frame is a pure function of t like
 * every other reel frame.
 *
 * - The stage is made with an injected clock and a seeded `random`, autoplay off and no visitors of its own
 *   (no ledges, the first visitor a million seconds away): only the actors a scene puts on it, each with one
 *   task (a generator stepped once per engine step) the scene writes.
 * - `seek(t)` steps the engine at its own rate (24 steps a second, poses drawn on every other one: the
 *   landing's 12 fps cut-paper stop motion) up to t; asked for an earlier t it builds the stage again and steps
 *   from 0. The same t always gives the same picture, in any order of frames (render.ts's workers each start
 *   mid-reel).
 * - The parts are the cast's rig exported at 1.6 px a unit (scripts/reels/assets.ts): the site's 0.66 is for a
 *   120 px puppet, a reel's is about 550.
 *
 * Acts the engine doesn't have — writing a line and giving up on it (crumple, toss), folding a slip, a note
 * floating down and caught — are written here on the engine's own pieces: the write act's grip (copied from
 * acts.ts, which keeps it private), Puppet.mitten / setLift, and the engine's pencil-drawn props.
 */
import { ACTS } from '@/lib/mascots/acts';
import { MASCOT_CAST } from '@/lib/mascots/cast.generated';
import { Stage } from '@/lib/mascots/engine';
import { clamp, DEG, lerp, seeded, smooth } from '@/lib/mascots/geometry';
import { aimLift } from '@/lib/mascots/motion';
import { PAPER_LINES, PENCIL_LEN, PENCIL_TIP, type Prop, type PropKind } from '@/lib/mascots/props';
import { Puppet } from '@/lib/mascots/puppet';
import { MITTEN_MIDDLE } from '@/lib/mascots/rig';
import type { ArmSide, CastEntry, Plan, Point, Rect, StageClock, Task } from '@/lib/mascots/types';
import { html } from '../../promo/page/dom';
import { H, W } from './lib';

export type Slug = 'tuck' | 'tag' | 'card' | 'dot' | 'night';
/** Engine steps a second (its moveFps); poses change on every other one. */
export const STEP = 1 / 24;
/**
 * Steps run before t = 0 (the stage's time starts at -PREROLL × STEP): the first frame already has every puppet
 * and prop drawn — a pose is drawn on every other step, and a prop only then.
 */
const PREROLL = 2;

// ── The cast, at reel size ────────────────────────────────────────────

const CAST = new Map<string, CastEntry>();
/** Decoded part images, held so a rebuilt stage's <img>s draw at once. */
const held: HTMLImageElement[] = [];

interface HiPart {
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  img: string;
}

/** The generated cast (pointer shapes, traits) with the 1.6 px-a-unit parts' boxes and images, every image decoded. */
export async function loadTheaterCast() {
  await Promise.all(
    MASCOT_CAST.map(async (e) => {
      const hi = (await fetch(`/assets/mascots/${e.slug}/manifest.json`).then((r) => r.json())) as { scale: number; parts: HiPart[] };
      const by = new Map(hi.parts.map((p) => [p.name, p]));
      const parts = e.manifest.parts.map((p) => {
        const q = by.get(p.name);
        return q ? { ...p, x: q.x, y: q.y, w: q.w, h: q.h, img: q.img } : p;
      });
      const entry: CastEntry = { ...e, base: `/assets/mascots/${e.slug}/`, manifest: { ...e.manifest, scale: hi.scale, parts } };
      CAST.set(e.slug, entry);
      await Promise.all(
        parts
          .filter((p) => p.w)
          .map((p) => {
            const im = new Image();
            im.src = entry.base + p.img;
            held.push(im);
            return im.decode().catch(() => undefined);
          }),
      );
    }),
  );
}

// ── The stage, stepped by the reel's time ─────────────────────────────

export interface Scene {
  S: Stage;
  /** The stage's own element: things drawn between the puppets (z 10…) and the props (z 40) go in it. */
  root: HTMLElement;
  /** A puppet standing with its feet at (x, y), its task what it does for the whole reel. */
  actor(slug: Slug, x: number, y: number): Puppet;
}

/**
 * A stage over the whole frame. `unitHeight`: px for 摺摺's 420 rig units (the others follow the engine's height
 * curve). `script` puts the actors on and gives each its task; it runs again whenever the stage is rebuilt.
 */
export function theater(o: { unitHeight: number; seed: number; z?: number; script: (scene: Scene) => void }) {
  const layer = html('div', { class: 'abs', style: { left: 0, top: 0, width: W, height: H, zIndex: o.z ?? 5 } });
  let S: Stage | null = null;
  let steps = 0;
  const build = () => {
    if (S) S.api().destroy();
    steps = 0;
    const clock: StageClock = { now: () => steps * STEP * 1000, raf: () => 0, caf: () => {}, timers: { set: () => 0, clear: () => {} } };
    const stage = new Stage(
      { layer, ledges: [], viewport: () => ({ x: 0, y: 0, w: W, h: H }), unitHeight: o.unitHeight, theme: 'light', reducedMotion: false, clock, random: seeded(o.seed) },
      [...CAST.values()],
      { autoplay: false, observe: false, first: [1e6, 1e6], gap: [1e6, 1e6], meetChance: 0, pairChance: 0, greetChance: 0 },
    );
    S = stage;
    stage.time = -PREROLL * STEP;
    let slot = 0;
    const actor = (slug: Slug, x: number, y: number) => {
      const ch = new Puppet(stage, CAST.get(slug)!, slot++);
      ch.x = x;
      ch.y = y;
      ch.surface = () => ch.y;
      ch.mode = 'act';
      ch.noShadow = true; // no shadows, as in the app
      const plan: Plan = { ledge: { id: `${slug}-${slot}`, kind: 'spot', x, y }, how: 'pop', x, y, stance: 'stand', surface: () => ch.y, endAt: Infinity, exitDur: 1, noShadow: true };
      ch.plan = plan;
      ch.base();
      stage.chars.push(ch);
      return ch;
    };
    o.script({ S: stage, root: stage.root, actor });
  };
  build();
  const seek = (t: number) => {
    const n = Math.max(0, Math.floor(t / STEP + 1e-6)) + PREROLL;
    if (n < steps) build();
    while (steps < n) {
      S!.advance(STEP);
      steps++;
    }
  };
  return { el: layer, seek };
}

// ── Choreography ──────────────────────────────────────────────────────

/** Steps until the stage's time reaches `t`, calling `fn` every step (the pose meanwhile). */
export function* until(S: Stage, t: number, fn?: (t: number) => void): Task {
  while (S.time < t - 1e-6) {
    fn?.(S.time);
    yield;
  }
}

/** For ever (an actor's task must never end, or the stage takes it off). */
export function* hold(S: Stage, fn: (t: number) => void): Task {
  for (;;) {
    fn(S.time);
    yield;
  }
}

/** 0 → 1 over [a, b] of the stage's time, smoothed. */
export const ramp = (t: number, a: number, b: number) => smooth(clamp((t - a) / (b - a), 0, 1));

/** One of the engine's acts (ACTS), with the visit plan it reads. */
export function act(S: Stage, ch: Puppet, name: keyof typeof ACTS, target?: Point): Task {
  return ACTS[name](S, ch, { ...ch.plan!, target });
}

/** A prop of the engine's (its pencil, slip, note, waves, book) — or, with `drawing`, one of ours in its place. */
export function prop(S: Stage, ch: Puppet, kind: PropKind, drawing?: string): Prop {
  const p = S.prop(kind, ch, ch);
  if (drawing) p.el.innerHTML = drawing;
  return p;
}

// The props' own drawings, in the engine's pencil (currentColor) and paper.
const PAPER = 'oklch(97% 0.015 86)';
/** A slip crumpled into a ball, on 'burst''s 60 × 60. */
export const BALL = `<svg viewBox="0 0 60 60" width="60" height="60"><path d="M14 22 L22 12 L33 14 L41 10 L48 19 L50 30 L46 40 L49 46 L38 50 L27 49 L18 46 L11 37 L13 30 Z" fill="${PAPER}" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity=".7"><path d="M22 12 L27 25 L18 33"/><path d="M41 10 L36 24 L46 31"/><path d="M27 25 L36 24 L33 36 L38 50"/><path d="M33 36 L22 41"/></g></svg>`;
/** The slip folded in half once, its written side in (on 'paper''s 40 × 30). */
export const FOLDED = `<svg viewBox="0 0 40 30" width="40" height="30"><path d="M11 4 L33 3 L34 27 L10 28 Z" fill="${PAPER}" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M11 4 L13 28" fill="none" stroke="currentColor" stroke-width="1.1" opacity=".55"/><path d="M15 9 q3 -2 5 0 t5 0" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" opacity=".35"/></svg>`;
/** A slip with all three lines written (the note opened). */
export const WRITTEN = `<svg viewBox="0 0 40 30" width="40" height="30"><path d="M3 3 L37 2 L38 27 L2 28 Z" fill="${PAPER}" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><g fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M8 10 q4 -3 7 0 t7 0 t7 0"/><path d="M8 16 q4 -3 7 0 t7 0 t9 0"/><path d="M8 22 q4 -3 7 0 t6 0"/></g><path d="M31 21 c-2 -3 -6 -1 -3 2 l3 3 l3 -3 c3 -3 -1 -5 -3 -2 z" fill="oklch(62% 0.14 45)"/></svg>`;

// ── Writing on a slip (acts.ts's write, opened up) ────────────────────
// The grip is the engine's own (acts.ts: writePose, penLiftFor, gripFor, writingAt), copied because acts.ts keeps it
// private; what the reel adds is the control: how much is written, when the pencil stops, what becomes of the slip.

const other = (side: ArmSide): ArmSide => (side === 'L' ? 'R' : 'L');
const armAngle = (side: ArmSide, lift: number): number => (side === 'L' ? 90 + lift : 90 - lift);
const turn = (a: number, b: number): number => ((((a - b) % 360) + 540) % 360) - 180;
function mittenAt(ch: Puppet, side: ArmSide, lift: number): Point {
  const a = ch.arm(side);
  const ang = armAngle(side, lift) * DEG;
  const r = a.len * MITTEN_MIDDLE;
  return [a.pivot[0] + Math.cos(ang) * r, a.pivot[1] + Math.sin(ang) * r];
}
function writingAt(ink: number): Point {
  const n = clamp(ink * 3, 0, 2.999);
  const i = Math.floor(n);
  const [x0, x1, y] = PAPER_LINES[i];
  const x = x0 + (x1 - x0) * (n - i);
  return [x, y - 1.5 * Math.sin(((x - x0) / 7) * Math.PI)];
}
const SLANT = 35;
const gripFor = (tip: Point, s: number, penLen: number): Point => [tip[0] + s * Math.sin(SLANT * DEG) * 0.5 * penLen, tip[1] - Math.cos(SLANT * DEG) * 0.5 * penLen];
function penLiftFor(ch: Puppet, pen: ArmSide, tip: Point, penLen: number): number {
  const a = ch.arm(pen);
  const [gx, gy] = gripFor(tip, pen === 'R' ? 1 : -1, penLen);
  return a.rest + turn(aimLift(pen, Math.atan2(gy - a.pivot[1], gx - a.pivot[0]) / DEG), a.rest);
}
interface WritePose {
  hold: number;
  paperScale: number;
  paperRot: number;
  anchor: Point;
  box: Rect;
  penScale: number;
  penLen: number;
  on(d: Point): Point;
}
function writePose(ch: Puppet, hold: ArmSide, pen: ArmSide): WritePose {
  const R = ch.rig;
  const s = pen === 'R' ? 1 : -1;
  const usual = clamp((R.torso.w * 0.26) / 40, 1.3, 2.1);
  const penScale = usual * 0.6;
  const penLen = PENCIL_LEN * penScale;
  const anchor: Point = [20 - s * 15, 17];
  const paperRot = -s * 5;
  const c = Math.cos(paperRot * DEG);
  const sn = Math.sin(paperRot * DEG);
  const place = (mh: Point, scale: number) => (d: Point): Point => {
    const x = (d[0] - anchor[0]) * scale;
    const y = (d[1] - anchor[1]) * scale;
    return [mh[0] + x * c - y * sn, mh[1] + x * sn + y * c];
  };
  const boxOf = (on: (d: Point) => Point): Rect => {
    const pts = ([[3, 2], [38, 2], [2, 28], [38, 28]] as const).map((q) => on(q));
    const xs = pts.map((q) => q[0]);
    const ys = pts.map((q) => q[1]);
    return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
  };
  const eyes = Math.max(R.eyes[0][1], R.eyes[1][1]);
  const chest = lerp(R.face[1], R.tp[1], 0.6);
  const foot = R.torso.y + R.torso.h * 0.95;
  const holdRest = ch.arm(hold).rest;
  const arm = ch.arm(pen);
  const reach = arm.len * MITTEN_MIDDLE;
  let best = { cost: Infinity, hold: holdRest, mh: mittenAt(ch, hold, holdRest), scale: usual };
  for (const scale of [usual, usual * 1.25, usual * 1.5, usual * 1.8]) {
    for (let hl = -90; hl < 270; hl += 2) {
      const mh = mittenAt(ch, hold, hl);
      const on = place(mh, scale);
      const box = boxOf(on);
      const mid = on([20, 15]);
      let cost =
        0.5 * Math.abs(mid[0] - R.gx) + 0.5 * Math.max(0, Math.abs(mid[1] - chest) - 12) + 3 * Math.max(0, eyes + 14 - box.y) + 2 * Math.max(0, box.y + box.h - foot) +
        0.03 * Math.abs(turn(hl, holdRest)) + 12 * (scale / usual - 1);
      for (const d of [[8, 10], [30, 16], [21, 22]] as const) {
        const tip = on(d);
        const [gx, gy] = gripFor(tip, s, penLen);
        cost += 1.5 * Math.abs(Math.hypot(gx - arm.pivot[0], gy - arm.pivot[1]) - reach);
        const m = mittenAt(ch, pen, penLiftFor(ch, pen, tip, penLen));
        if (m[0] > box.x && m[0] < box.x + box.w && m[1] > box.y && m[1] < box.y + box.h) cost += 40;
        const lean = Math.atan2(-s * (tip[0] - m[0]), tip[1] - m[1]) / DEG;
        cost += 2 * Math.max(0, 15 - lean, lean - 60);
      }
      if (cost < best.cost) best = { cost, hold: hl, mh, scale };
    }
  }
  const on = place(best.mh, best.scale);
  return { hold: holdRest + turn(best.hold, holdRest), paperScale: best.scale, paperRot, anchor, box: boxOf(on), penScale, penLen, on };
}

/**
 * A puppet's writing hands: the slip in the `toward` mitten, the pencil in the other. `pose(…)` writes one step's
 * arms (h: the slip held up, w: the pencil on it, ink: how much of the three lines is written); `slip()` and
 * `pencil()` place the props where those mittens are.
 */
export function writer(ch: Puppet, toward: ArmSide) {
  const pen = other(toward);
  const wp = writePose(ch, toward, pen);
  const ap = ch.arm(toward);
  const aw = ch.arm(pen);
  const holdAng = armAngle(toward, wp.hold);
  const s = pen === 'R' ? 1 : -1;
  let penLift = aw.rest;
  let tip: Point = wp.on(writingAt(0));
  return {
    toward,
    pen,
    wp,
    /** One step's arms: the slip arm at `h` of the way from rest to holding (`extra` on top), the pen arm at `w`. */
    pose(h: number, w: number, ink: number, t: number, extra = 0) {
      ch.setLift(toward, lerp(ap.rest, wp.hold + 1.5 * Math.sin(t * 1.7), h) + extra);
      tip = wp.on(writingAt(ink));
      penLift = penLiftFor(ch, pen, tip, wp.penLen);
      ch.setLift(pen, lerp(aw.rest, penLift, w));
      ch.pose.front = true;
    },
    /** Where the slip is held: the mitten's point, the slip's turn and scale (× `grow`). */
    slipAt(grow = 1): { x: number; y: number; k: number; rot: number } {
      const p = ch.pose;
      const [mx, my, ang] = ch.mitten(toward, MITTEN_MIDDLE);
      return { x: mx, y: my, k: ch.k * wp.paperScale * grow, rot: wp.paperRot + p.tilt + 0.25 * (ang - p.tilt - holdAng) };
    },
    slip(paper: Prop, alpha: number, ink: number, grow = 1) {
      const a = this.slipAt(grow);
      paper.at(a.x, a.y, a.k, alpha, a.rot, wp.anchor);
      paper.write(ink);
    },
    /** The pencil in its mitten, its point on the line being written (w: how far the arm is raised to it). */
    pencil(pencil: Prop, w: number, alpha = 1) {
      const [qx, qy, qa] = ch.mitten(pen, MITTEN_MIDDLE);
      const lift = lerp(aw.rest, penLift, w);
      const m = mittenAt(ch, pen, lift);
      const slant = clamp(Math.atan2(-s * (tip[0] - m[0]), tip[1] - m[1]) / DEG, 12, 58);
      const toTip = Math.atan2(Math.cos(slant * DEG), -s * Math.sin(slant * DEG)) / DEG;
      const len = clamp(Math.hypot(tip[0] - m[0], tip[1] - m[1]), 0.2 * wp.penLen, 0.85 * wp.penLen) * ch.k;
      const dir = qa + toTip - armAngle(pen, lift);
      pencil.at(qx + Math.cos(dir * DEG) * len, qy + Math.sin(dir * DEG) * len, ch.k * wp.penScale, alpha, dir - 90, PENCIL_TIP);
    },
  };
}

/** A point on a thrown arc from a to b (u 0 → 1), `lift` px above the straight line at its middle. */
export function arc(a: Point, b: Point, u: number, lift: number): Point {
  return [lerp(a[0], b[0], u), lerp(a[1], b[1], u) - lift * 4 * u * (1 - u)];
}
