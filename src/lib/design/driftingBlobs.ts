/**
 * The drifting blobs behind a section (the landing hero, the Paper Pals
 * page's bands): one or two soft coloured shapes, each placed where the page
 * has room for it (where the server drew its still stand-in), that stray a
 * little from their place and change shape as they go — sometimes a small one
 * comes in and melts into the larger — and then come to rest where they began
 * and stay: the page's eye is on its words, not on shapes that keep moving.
 *
 * Each blob is a little cluster of metaballs — a core and four lobes that
 * orbit and sway at their own slow pace, which is what moves its outline. The
 * page draws the union of every lobe's field (one iso-line, traced here by
 * marching squares), so two blobs that come close grow a neck between them on
 * their own; once touching they are drawn together, their colours blend from
 * the point of contact, and when their centres all but meet they become one
 * blob — no larger than the larger was, give or take (`GROW`).
 *
 * Pure and DOM-free: `DriftingBlobs` runs it on a canvas, the tests run it in
 * node. Positions and sizes are CSS pixels, time is seconds.
 */
import { makePrng } from './prng';

/** The field value the outline is drawn at. */
export const ISO = 0.25;
/** How far a lobe's field reaches, in multiples of its own radius (where it alone meets ISO). */
const REACH = 1 / Math.sqrt(1 - Math.sqrt(ISO));
/** Two blobs start to merge once their centres are this close, in multiples of R₁ + R₂. */
const CONTACT = 1.02;
/** …and are one blob once this close. */
const FUSE = 0.1;
/** Seconds the blobs move for before they are at rest where they began (their outlines still too). */
export const SETTLE = 16;
/** Their outlines slow from this fraction of SETTLE on, to stop with it. */
const SLOW_FROM = 0.7;
/** How far a blob strays from its place at most, in multiples of its radius, and how far it sways to the side. */
const STRAY = 0.24;
const SIDE = 0.1;
/** A visitor (a small blob of another colour): when it starts to show, how long it takes to fade in, when it reaches its host. */
const VISIT_AT = 1.2;
const VISIT_FADE = 2.5;
const VISIT_ARRIVE = 8.5;
/** Its size, as a fraction of its host's. */
const VISITOR = 0.42;
/** Seconds a fused blob takes to trade the two's lobes for its own. */
const FUSE_FADE = 5;
/** The most a blob grows by taking in another. */
const GROW = 1.06;
/** Seconds for the hover darkening to come and go. */
const HOVER_EASE = 0.35;

export type Oklab = readonly [number, number, number];

/** A blob's colour: its ink, and how strongly it shows on the paper (the old blobs' opacity). */
export interface Paint {
  ink: Oklab;
  alpha: number;
}

export interface Lobe {
  /** Distance from the blob's centre and the angle it sits at (clock 0). */
  dist: number;
  angle: number;
  /** Radians per second it orbits at. */
  spin: number;
  /** How far, as a fraction of `dist`, it sways in and out, and over how many seconds. */
  sway: number;
  swayPeriod: number;
  phase: number;
  /** Its radius (where its field alone meets ISO). */
  r: number;
  /** 0–1, which way it is fading (+1 in, −1 out, 0 settled), and over how many seconds. */
  w: number;
  fade: number;
  span: number;
  /** An offset from the centre that dies away — a fused blob's lobes start where they were. */
  sx: number;
  sy: number;
}

export interface Blob {
  id: number;
  x: number;
  y: number;
  /** Its size: about the radius it shows, and √(its area / π) for merging. */
  R: number;
  paint: Paint;
  hover: number;
  lobes: Lobe[];
  /** Which seed it is (a blob that took in a visitor keeps its host's); −1 for a visitor. And that seed's size. */
  seed: number;
  seedR: number;
  /** Where it rests, and its way out from there and back: the farthest it strays, and its sway to the side. */
  home: { x: number; y: number };
  stray: { x: number; y: number };
  side: { x: number; y: number };
  /** An offset that dies away (a fused blob starts where the two met, a little off its host's way). */
  ox: number;
  oy: number;
  /** A visitor's route: from where, to whom, between when. */
  visit?: { host: number; x: number; y: number; at: number; arrive: number };
}

interface Pair {
  a: number;
  b: number;
  /** Centre distance when they touched (their colour blend runs from here to FUSE). */
  contact: number;
}

export interface World {
  width: number;
  height: number;
  t: number;
  /** The outlines' own time: it runs with `t`, slows towards SETTLE and stops there. */
  clock: number;
  /** When they are at rest. */
  settle: number;
  blobs: Blob[];
  pairs: Pair[];
  paper: Oklab;
  rand: () => number;
  nextId: number;
  /** A visitor still to come. */
  visitor: Paint | null;
  /** Nothing moves any more but the hover. */
  settled: boolean;
  /** Ids of the blobs the pointer is over (a merging pair counts as one). */
  hovered: Set<number>;
}

export interface SeedBlob {
  x: number;
  y: number;
  R: number;
  paint: Paint;
  /** The way it strays from its place (any length; how far is the world's). */
  drift: readonly [number, number];
}

export interface WorldOptions {
  width: number;
  height: number;
  seed: number;
  paper: Oklab;
  blobs?: SeedBlob[];
  /** A small blob of this colour comes in and melts into the largest. */
  visitor?: Paint;
  /** Seconds until they are at rest (SETTLE by default). */
  settle?: number;
}

const TAU = Math.PI * 2;

function layout(R: number, rand: () => number, span = 0): Lobe[] {
  const w = span ? 0 : 1;
  const fade = span ? 1 : 0;
  const lobes: Lobe[] = [
    { dist: 0, angle: 0, spin: 0, sway: 0, swayPeriod: 20, phase: rand() * TAU, r: 0.81 * R, w, fade, span, sx: 0, sy: 0 },
  ];
  const base = rand() * TAU;
  const turn = (rand() < 0.5 ? -1 : 1) * (0.05 + rand() * 0.04);
  for (let k = 0; k < 4; k++) {
    lobes.push({
      dist: R * (0.39 + rand() * 0.07),
      angle: base + (k * TAU) / 4 + (rand() - 0.5) * 0.6,
      spin: turn * (0.6 + rand() * 0.8),
      sway: 0.12 + rand() * 0.12,
      swayPeriod: 9 + rand() * 8,
      phase: rand() * TAU,
      r: R * (0.53 + rand() * 0.09),
      w,
      fade,
      span,
      sx: 0,
      sy: 0,
    });
  }
  return lobes;
}

function makeBlob(world: World, seed: number, x: number, y: number, R: number, paint: Paint, drift: readonly [number, number]): Blob {
  const r = world.rand;
  const len = Math.hypot(drift[0], drift[1]) || 1;
  const dx = drift[0] / len;
  const dy = drift[1] / len;
  const far = R * STRAY * (0.75 + 0.5 * r());
  const sway = R * SIDE * (r() < 0.5 ? -1 : 1);
  return {
    id: world.nextId++,
    x,
    y,
    R,
    paint,
    hover: 0,
    lobes: layout(R, r),
    seed,
    seedR: R,
    home: { x, y },
    stray: { x: dx * far, y: dy * far },
    side: { x: -dy * sway, y: dx * sway },
    ox: 0,
    oy: 0,
  };
}

export function createWorld(opts: WorldOptions): World {
  const world: World = {
    width: opts.width,
    height: opts.height,
    t: 0,
    clock: 0,
    settle: opts.settle ?? SETTLE,
    blobs: [],
    pairs: [],
    paper: opts.paper,
    rand: makePrng(opts.seed),
    nextId: 1,
    visitor: opts.visitor ?? null,
    settled: false,
    hovered: new Set(),
  };
  (opts.blobs ?? []).forEach((s, i) => world.blobs.push(makeBlob(world, i, s.x, s.y, s.R, s.paint, s.drift)));
  if (!world.blobs.length) world.visitor = null;
  return world;
}

/** Where a lobe is at the outlines' clock, with its radius and weight. */
export function lobeAt(blob: Blob, l: Lobe, clock: number): { x: number; y: number; r: number; w: number } {
  const a = l.angle + l.spin * clock;
  const d = l.dist * (1 + l.sway * Math.sin((TAU * clock) / l.swayPeriod + l.phase));
  const r = l.r * (1 + 0.035 * Math.sin((TAU * clock) / (l.swayPeriod * 1.3) + l.phase * 1.7));
  const w = l.w * l.w * (3 - 2 * l.w);
  return { x: blob.x + l.sx + Math.cos(a) * d, y: blob.y + l.sy + Math.sin(a) * d, r, w };
}

function kernel(dx: number, dy: number, r: number, w: number): number {
  const rho = r * REACH;
  const u = (dx * dx + dy * dy) / (rho * rho);
  if (u >= 1) return 0;
  return w * (1 - u) * (1 - u);
}

function smoothstep(x: number): number {
  const c = Math.min(1, Math.max(0, x));
  return c * c * (3 - 2 * c);
}

function mix(a: Oklab, b: Oklab, t: number): Oklab {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/**
 * Blends colours keeping their chroma: lightness and chroma are averaged,
 * the hue as a direction. A plain Oklab mix of two far-apart hues (lavender
 * and sage) cancels to grey; this one passes round the hue circle instead.
 */
export function blend(colours: readonly Oklab[], weights: readonly number[]): Oklab {
  let sw = 0;
  let L = 0;
  let C = 0;
  let a = 0;
  let b = 0;
  for (let i = 0; i < colours.length; i++) {
    const w = weights[i];
    const [l, ca, cb] = colours[i];
    const c = Math.hypot(ca, cb);
    sw += w;
    L += w * l;
    C += w * c;
    if (c > 1e-6) {
      a += (w * ca) / c;
      b += (w * cb) / c;
    }
  }
  if (sw <= 0) return colours[0];
  const len = Math.hypot(a, b);
  if (len < 1e-9) return [L / sw, 0, 0];
  const chroma = C / sw;
  return [L / sw, (a / len) * chroma, (b / len) * chroma];
}

function mixHue(x: Oklab, y: Oklab, t: number): Oklab {
  return blend([x, y], [1 - t, t]);
}

function mass(b: Blob): number {
  return b.R * b.R;
}

function byId(world: World, id: number): Blob | undefined {
  return world.blobs.find((b) => b.id === id);
}

/** Where a resting blob's way has it at time t: out from its place and back, easing at both ends. */
function wayAt(world: World, b: Blob, t: number): [number, number] {
  const u = Math.min(1, Math.max(0, t / world.settle));
  const out = Math.sin(Math.PI * u) ** 2;
  const sway = Math.sin(TAU * u) * out;
  return [b.home.x + out * b.stray.x + sway * b.side.x, b.home.y + out * b.stray.y + sway * b.side.y];
}

function fuse(world: World, A: Blob, B: Blob): Blob {
  // A is the host (the larger): the one fused keeps its place and its way.
  const mA = mass(A);
  const mB = mass(B);
  const k = mB / (mA + mB);
  const R = Math.max(A.R, Math.min(Math.sqrt(mA + mB), A.R * GROW));
  const x = A.x + (B.x - A.x) * k;
  const y = A.y + (B.y - A.y) * k;
  // The old lobes stay where they are and fade out; a fresh set its size fades in round the new centre.
  const lobes: Lobe[] = [];
  for (const src of [A, B]) {
    for (const l of src.lobes) {
      lobes.push({ ...l, sx: l.sx + src.x - x, sy: l.sy + src.y - y, fade: -1, span: FUSE_FADE });
    }
  }
  lobes.push(...layout(R, world.rand, FUSE_FADE));
  const [wx, wy] = wayAt(world, A, world.t);
  return {
    ...A,
    id: world.nextId++,
    x,
    y,
    R,
    paint: { ink: mixHue(A.paint.ink, B.paint.ink, k), alpha: A.paint.alpha + (B.paint.alpha - A.paint.alpha) * k },
    hover: Math.max(A.hover, B.hover),
    lobes,
    ox: x - wx,
    oy: y - wy,
    visit: undefined,
  };
}

/** The visitor comes in by the largest blob, from the side facing the middle of the area (so it is seen coming). */
function sendVisitor(world: World, paint: Paint): void {
  const r = world.rand;
  const host = world.blobs.reduce((a, b) => (b.R > a.R ? b : a));
  const vR = host.R * VISITOR;
  const cx = world.width / 2 - host.home.x;
  const cy = world.height / 2 - host.home.y;
  const toward = Math.hypot(cx, cy) > 1 ? Math.atan2(cy, cx) : r() * TAU;
  const a = toward + (r() - 0.5) * 1.1;
  const d = host.R * 1.35 + vR * 1.3;
  const m = vR * 0.6;
  const x = Math.min(world.width - m, Math.max(m, host.home.x + Math.cos(a) * d));
  const y = Math.min(world.height - m, Math.max(m, host.home.y + Math.sin(a) * d));
  const v: Blob = {
    id: world.nextId++,
    x,
    y,
    R: vR,
    paint,
    hover: 0,
    lobes: layout(vR, r, VISIT_FADE),
    seed: -1,
    seedR: vR,
    home: { x, y },
    stray: { x: 0, y: 0 },
    side: { x: 0, y: 0 },
    ox: 0,
    oy: 0,
    visit: { host: host.id, x, y, at: world.t, arrive: world.t + (VISIT_ARRIVE - VISIT_AT) },
  };
  world.blobs.push(v);
}

/** Moves the world on by `dt` seconds (a long gap — a tab coming back — counts as a tenth). */
export function step(world: World, dt: number): void {
  dt = Math.min(Math.max(dt, 0), 0.1);
  for (const b of world.blobs) {
    const target = world.hovered.has(b.id) ? 1 : 0;
    b.hover += (target - b.hover) * (1 - Math.exp(-dt / HOVER_EASE));
  }
  if (world.settled) return;
  world.t += dt;
  const t = world.t;
  const u = t / world.settle;
  const rate = u < SLOW_FROM ? 1 : u >= 1 ? 0 : 0.5 * (1 + Math.cos((Math.PI * (u - SLOW_FROM)) / (1 - SLOW_FROM)));
  world.clock += dt * rate;

  if (world.visitor && t >= VISIT_AT) {
    sendVisitor(world, world.visitor);
    world.visitor = null;
  }

  for (const b of world.blobs) {
    for (const l of b.lobes) {
      if (l.fade) l.w = Math.min(1, Math.max(0, l.w + (l.fade * dt) / (l.span || 1)));
      if (l.fade > 0 && l.w >= 1) l.fade = 0;
      const decay = Math.exp(-dt / 2);
      l.sx *= decay;
      l.sy *= decay;
    }
    b.lobes = b.lobes.filter((l) => !(l.fade < 0 && l.w <= 0));
    const decay = Math.exp(-dt / 1.5);
    b.ox *= decay;
    b.oy *= decay;
  }
  for (const b of world.blobs) {
    if (b.visit) continue;
    const [x, y] = wayAt(world, b, t);
    b.x = x + b.ox;
    b.y = y + b.oy;
  }
  for (const b of world.blobs) {
    if (!b.visit) continue;
    const host = byId(world, b.visit.host);
    if (!host) {
      b.visit = undefined;
      continue;
    }
    const s = smoothstep((t - b.visit.at) / (b.visit.arrive - b.visit.at));
    b.x = b.visit.x + (host.x - b.visit.x) * s;
    b.y = b.visit.y + (host.y - b.visit.y) * s;
  }

  // Blobs that touch start to merge: their colours blend, and they become one once their centres all but meet.
  const blobs = world.blobs;
  for (let i = 0; i < blobs.length; i++) {
    for (let j = i + 1; j < blobs.length; j++) {
      const A = blobs[i];
      const B = blobs[j];
      if (world.pairs.some((p) => (p.a === A.id && p.b === B.id) || (p.a === B.id && p.b === A.id))) continue;
      const d = Math.hypot(B.x - A.x, B.y - A.y);
      if (d < CONTACT * (A.R + B.R)) world.pairs.push({ a: A.id, b: B.id, contact: d });
    }
  }
  for (const p of [...world.pairs]) {
    const P = byId(world, p.a);
    const Q = byId(world, p.b);
    if (!P || !Q) continue;
    if (Math.hypot(Q.x - P.x, Q.y - P.y) >= FUSE * (P.R + Q.R)) continue;
    const [A, B] = P.R >= Q.R ? [P, Q] : [Q, P];
    const C = fuse(world, A, B);
    world.blobs = world.blobs.filter((b) => b !== A && b !== B);
    world.blobs.push(C);
    if (world.hovered.has(A.id) || world.hovered.has(B.id)) world.hovered.add(C.id);
    const pairs: Pair[] = [];
    for (const q of world.pairs) {
      if (q === p) continue;
      const a = q.a === A.id || q.a === B.id ? C.id : q.a;
      const b = q.b === A.id || q.b === B.id ? C.id : q.b;
      if (a === b || pairs.some((o) => (o.a === a && o.b === b) || (o.a === b && o.b === a))) continue;
      const other = byId(world, a === C.id ? b : a);
      const d = other ? Math.hypot(other.x - C.x, other.y - C.y) : 0;
      pairs.push({ a, b, contact: Math.max(q.contact, d + 1) });
    }
    world.pairs = pairs;
  }

  // Past its time, and with nothing still coming, fading or merging: at rest, exactly where each began.
  const busy =
    world.visitor !== null ||
    world.blobs.some((b) => b.visit || b.lobes.some((l) => l.fade !== 0) || Math.hypot(b.ox, b.oy) > 0.5);
  if (t >= world.settle && !busy) {
    world.settled = true;
    for (const b of world.blobs) {
      b.ox = b.oy = 0;
      b.x = b.home.x;
      b.y = b.home.y;
      for (const l of b.lobes) l.sx = l.sy = 0;
    }
  }
}

/** Nothing left to draw differently: at rest, and the hover darkening come and gone. */
export function atRest(world: World): boolean {
  return world.settled && world.blobs.every((b) => Math.abs((world.hovered.has(b.id) ? 1 : 0) - b.hover) < 0.004);
}

/** At rest at once (a world made again for a new layout after the first had settled): no visitor, nothing fading. */
export function restNow(world: World): void {
  world.visitor = null;
  world.blobs = world.blobs.filter((b) => !b.visit);
  world.pairs = [];
  world.t = Math.max(world.t, world.settle);
  for (const b of world.blobs) {
    b.lobes = b.lobes.filter((l) => l.fade >= 0);
    for (const l of b.lobes) {
      l.w = 1;
      l.fade = 0;
      l.sx = l.sy = 0;
    }
    b.ox = b.oy = 0;
    b.x = b.home.x;
    b.y = b.home.y;
  }
  world.settled = true;
}

/**
 * The page moved a seed's place (a new width): its blob (or the one that took
 * it in) rests there now, scaled to its new size.
 */
export function placeSeed(world: World, seed: number, x: number, y: number, R: number): void {
  const b = world.blobs.find((o) => o.seed === seed);
  if (!b || !b.seedR) return;
  // A blob that took in a visitor is a little larger than its seed: it keeps that.
  const s = R / b.seedR;
  b.seedR = R;
  const dx = x - b.home.x;
  const dy = y - b.home.y;
  b.home = { x, y };
  b.stray = { x: b.stray.x * s, y: b.stray.y * s };
  b.side = { x: b.side.x * s, y: b.side.y * s };
  b.R *= s;
  for (const l of b.lobes) {
    l.dist *= s;
    l.r *= s;
    l.sx *= s;
    l.sy *= s;
  }
  b.x += dx;
  b.y += dy;
  if (world.settled) {
    b.x = x;
    b.y = y;
  }
}

/** The blob under a point (inside the drawn outline), with the ones it is merging with; empty when none. */
export function blobsAt(world: World, x: number, y: number): Set<number> {
  let total = 0;
  let best: Blob | null = null;
  let bestF = 0;
  for (const b of world.blobs) {
    let f = 0;
    for (const l of b.lobes) {
      const p = lobeAt(b, l, world.clock);
      f += kernel(x - p.x, y - p.y, p.r, p.w);
    }
    total += f;
    if (f > bestF) {
      bestF = f;
      best = b;
    }
  }
  const out = new Set<number>();
  if (!best || total < ISO) return out;
  out.add(best.id);
  // A merging pair reads as one shape, so it darkens as one.
  for (let grew = true; grew; ) {
    grew = false;
    for (const p of world.pairs) {
      if (out.has(p.a) !== out.has(p.b)) {
        out.add(p.a);
        out.add(p.b);
        grew = true;
      }
    }
  }
  return out;
}

// ── the field and its outline ──────────────────────────────────────────

export interface Grid {
  cell: number;
  /** Position of the first sample (one cell outside the page, so every outline closes off-page). */
  x0: number;
  y0: number;
  nx: number;
  ny: number;
  v: Float32Array;
}

export function makeGrid(width: number, height: number, cell: number): Grid {
  const nx = Math.ceil((width + 2 * cell) / cell) + 1;
  const ny = Math.ceil((height + 2 * cell) / cell) + 1;
  return { cell, x0: -cell, y0: -cell, nx, ny, v: new Float32Array(nx * ny) };
}

/** Sums every lobe's field into the grid; the outer ring of samples stays 0. */
export function sampleField(world: World, g: Grid): void {
  const { v, nx, ny, cell, x0, y0 } = g;
  v.fill(0);
  for (const b of world.blobs) {
    for (const l of b.lobes) {
      const p = lobeAt(b, l, world.clock);
      if (p.w <= 0) continue;
      const rho = p.r * REACH;
      const i0 = Math.max(1, Math.ceil((p.x - rho - x0) / cell));
      const i1 = Math.min(nx - 2, Math.floor((p.x + rho - x0) / cell));
      const j0 = Math.max(1, Math.ceil((p.y - rho - y0) / cell));
      const j1 = Math.min(ny - 2, Math.floor((p.y + rho - y0) / cell));
      const inv = 1 / (rho * rho);
      for (let j = j0; j <= j1; j++) {
        const dy = y0 + j * cell - p.y;
        const dy2 = dy * dy;
        const row = j * nx;
        for (let i = i0; i <= i1; i++) {
          const dx = x0 + i * cell - p.x;
          const u = (dx * dx + dy2) * inv;
          if (u < 1) v[row + i] += p.w * (1 - u) * (1 - u);
        }
      }
    }
  }
}

/**
 * The outline at `iso`, as closed loops of points ([x0, y0, x1, y1, …]),
 * by marching squares with each crossing interpolated along its cell edge.
 */
/**
 * traceContours' working arrays, kept between frames (30 a second, half a
 * megabyte apiece on a wide hero) and grown when a grid needs more.
 */
let linksScratch = new Int32Array(0);
let seenScratch = new Uint8Array(0);

export function traceContours(g: Grid, iso = ISO): number[][] {
  const { v, nx, ny, cell, x0, y0 } = g;
  // Edge ids: 2·(j·nx + i) runs right from sample (i, j), +1 runs down from it.
  if (linksScratch.length < nx * ny * 4) linksScratch = new Int32Array(nx * ny * 4);
  const links = linksScratch;
  links.fill(-1, 0, nx * ny * 4);
  const link = (a: number, b: number) => {
    links[a * 2 + (links[a * 2] === -1 ? 0 : 1)] = b;
    links[b * 2 + (links[b * 2] === -1 ? 0 : 1)] = a;
  };
  let any = false;
  for (let j = 0; j < ny - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const tl = v[j * nx + i];
      const tr = v[j * nx + i + 1];
      const br = v[(j + 1) * nx + i + 1];
      const bl = v[(j + 1) * nx + i];
      const code = (tl >= iso ? 1 : 0) | (tr >= iso ? 2 : 0) | (br >= iso ? 4 : 0) | (bl >= iso ? 8 : 0);
      if (code === 0 || code === 15) continue;
      any = true;
      const T = (j * nx + i) * 2;
      const B = ((j + 1) * nx + i) * 2;
      const L = (j * nx + i) * 2 + 1;
      const R = (j * nx + i + 1) * 2 + 1;
      switch (code) {
        case 1: case 14: link(L, T); break;
        case 2: case 13: link(T, R); break;
        case 3: case 12: link(L, R); break;
        case 4: case 11: link(R, B); break;
        case 6: case 9: link(T, B); break;
        case 7: case 8: link(L, B); break;
        case 5:
          if ((tl + tr + br + bl) / 4 >= iso) { link(T, R); link(B, L); } else { link(L, T); link(R, B); }
          break;
        case 10:
          if ((tl + tr + br + bl) / 4 >= iso) { link(L, T); link(R, B); } else { link(T, R); link(B, L); }
          break;
      }
    }
  }
  if (!any) return [];
  const point = (e: number, out: number[]) => {
    const s = e >> 1;
    const i = s % nx;
    const j = (s - i) / nx;
    const a = v[s];
    const down = e & 1;
    const b = down ? v[s + nx] : v[s + 1];
    const f = b === a ? 0.5 : (iso - a) / (b - a);
    out.push(x0 + (i + (down ? 0 : f)) * cell, y0 + (j + (down ? f : 0)) * cell);
  };
  if (seenScratch.length < nx * ny * 2) seenScratch = new Uint8Array(nx * ny * 2);
  const seen = seenScratch;
  seen.fill(0, 0, nx * ny * 2);
  const loops: number[][] = [];
  for (let e = 0; e < nx * ny * 2; e++) {
    if (links[e * 2] === -1 || seen[e]) continue;
    const loop: number[] = [];
    let prev = -1;
    let cur = e;
    while (cur !== -1 && !seen[cur]) {
      seen[cur] = 1;
      point(cur, loop);
      const n0 = links[cur * 2];
      const next = n0 !== prev ? n0 : links[cur * 2 + 1];
      prev = cur;
      cur = next;
    }
    if (loop.length >= 6) loops.push(loop);
  }
  return loops;
}

// ── colour ─────────────────────────────────────────────────────────────

/** `oklch(78% 0.07 140)` (as tokens.css writes them) → Oklab, or null. */
export function parseOklch(css: string): Oklab | null {
  const m = /oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)/.exec(css);
  if (!m) return null;
  const L = Number(m[1]) / (m[2] ? 100 : 1);
  const C = Number(m[3]);
  const h = (Number(m[4]) * Math.PI) / 180;
  return [L, C * Math.cos(h), C * Math.sin(h)];
}

/** Oklab → sRGB, 0–255 each (clamped). */
export function oklabToRgb([L, a, b]: Oklab): [number, number, number] {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const lin = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  return lin.map((c) => {
    const x = Math.min(1, Math.max(0, c));
    return Math.round(255 * (x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055));
  }) as [number, number, number];
}

/**
 * Each blob's colour as drawn now: its ink laid on the paper at its alpha,
 * a little deeper while hovered, and — while merging — already part way to
 * the colour the two will share.
 */
export function blobColours(world: World): Map<number, Oklab> {
  const paints = new Map<number, Paint>();
  for (const b of world.blobs) paints.set(b.id, b.paint);
  for (const p of world.pairs) {
    const A = byId(world, p.a);
    const B = byId(world, p.b);
    if (!A || !B) continue;
    const k = mass(B) / (mass(A) + mass(B));
    const fuseAt = FUSE * (A.R + B.R);
    const s = smoothstep((p.contact - Math.hypot(B.x - A.x, B.y - A.y)) / Math.max(1, p.contact - fuseAt));
    const pa = paints.get(A.id)!;
    const pb = paints.get(B.id)!;
    const ink = mixHue(pa.ink, pb.ink, k);
    const alpha = pa.alpha + (pb.alpha - pa.alpha) * k;
    paints.set(A.id, { ink: mixHue(pa.ink, ink, s), alpha: pa.alpha + (alpha - pa.alpha) * s });
    paints.set(B.id, { ink: mixHue(pb.ink, ink, s), alpha: pb.alpha + (alpha - pb.alpha) * s });
  }
  const out = new Map<number, Oklab>();
  for (const b of world.blobs) {
    const p = paints.get(b.id)!;
    const alpha = Math.min(1, p.alpha * (1 + 0.45 * b.hover));
    const lab = mix(world.paper, p.ink, alpha);
    out.set(b.id, [lab[0] - 0.025 * b.hover, lab[1], lab[2]]);
  }
  return out;
}

/**
 * Paints the colour of the page at each sample of a coarse grid into `rgba`
 * (row-major, `g.nx × g.ny`): every blob's colour, weighted by how near it
 * is, so one blob is one flat colour and two meeting ones blend across the
 * neck between them. Drawn smoothed and clipped to the outline.
 */
export function paintColours(world: World, g: Grid, rgba: Uint8ClampedArray): void {
  const colours = blobColours(world);
  const list = world.blobs.map((b) => ({ x: b.x, y: b.y, R2: b.R * b.R, c: colours.get(b.id)! }));
  const cs = list.map((b) => b.c);
  const ws = list.map(() => 0);
  for (let j = 0; j < g.ny; j++) {
    const y = g.y0 + j * g.cell;
    for (let i = 0; i < g.nx; i++) {
      const x = g.x0 + i * g.cell;
      for (let n = 0; n < list.length; n++) {
        const b = list[n];
        const q = b.R2 / ((x - b.x) ** 2 + (y - b.y) ** 2 + 1e-3 * b.R2);
        ws[n] = q * q * q;
      }
      const o = (j * g.nx + i) * 4;
      if (list.length) {
        const [r, gr, bl] = oklabToRgb(list.length === 1 ? cs[0] : blend(cs, ws));
        rgba[o] = r;
        rgba[o + 1] = gr;
        rgba[o + 2] = bl;
      }
      rgba[o + 3] = 255;
    }
  }
}
