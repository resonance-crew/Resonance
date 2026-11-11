/**
 * The paper geometry the film's world is cut with — a port of the art mock's (designs/landing-lab/film/mocks/palettes.html,
 * itself a port of designs/stickers/kit/paper.ts): seeded, so the same seed cuts the same paper on the server and in a
 * test. Pure, no DOM.
 */
export type Pt = [number, number];

/** mulberry32: the kit's seeded random (the same sequence as the mock's `rng`). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A Catmull-Rom spline through `keys`, sampled about every `step` units. */
export function spline(keys: Pt[], step = 6, closed = true): Pt[] {
  const out: Pt[] = [];
  const n = keys.length;
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const p0 = keys[(i - 1 + n) % n];
    const p1 = keys[i];
    const p2 = keys[(i + 1) % n];
    const p3 = keys[(i + 2) % n];
    const P0 = !closed && i === 0 ? p1 : p0;
    const P3 = !closed && i === segs - 1 ? p2 : p3;
    const m = Math.max(2, Math.round(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / step));
    for (let k = 0; k < m; k++) {
      const t = k / m;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) =>
        0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(P0[0], p1[0], p2[0], P3[0]), f(P0[1], p1[1], p2[1], P3[1])]);
    }
  }
  if (!closed) out.push(keys[n - 1]);
  return out;
}

/** Straight segments through `keys`, sampled about every `step` units. */
export function poly(keys: Pt[], step = 6, closed = true): Pt[] {
  const out: Pt[] = [];
  const n = keys.length;
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const a = keys[i];
    const b = keys[(i + 1) % n];
    const m = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
    for (let k = 0; k < m; k++) out.push([a[0] + ((b[0] - a[0]) * k) / m, a[1] + ((b[1] - a[1]) * k) / m]);
  }
  if (!closed) out.push(keys[n - 1]);
  return out;
}

export interface TearOpts {
  amp?: number;
  jag?: number;
  wander?: number;
  closed?: boolean;
}

/** A torn edge: each point pushed along its normal by a slow wander, a jag, and now and then a bite. */
export function tear(pts: Pt[], seed: number, { amp = 4, jag = 2.2, wander = 9, closed = true }: TearOpts = {}): Pt[] {
  const r = rng(seed);
  const n = pts.length;
  let w = 0;
  const slow: number[] = [];
  for (let i = 0; i < n; i++) {
    w += (r() - 0.5) * 0.9;
    w *= 0.93;
    slow.push(w);
  }
  return pts.map((p, i) => {
    if (!closed && (i === 0 || i === n - 1)) return p;
    const a = pts[(i - 1 + n) % n];
    const b = pts[(i + 1) % n];
    let tx = b[0] - a[0];
    let ty = b[1] - a[1];
    const l = Math.hypot(tx, ty) || 1;
    tx /= l;
    ty /= l;
    const d = slow[i] * wander * 0.35 + (r() - 0.5) * 2 * jag + (r() < 0.08 ? (r() - 0.6) * amp * 2.2 : 0);
    return [p[0] + ty * d, p[1] - tx * d];
  });
}

export function ellipse(cx: number, cy: number, rx: number, ry: number, n = 28, rot = 0): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    const x = Math.cos(t) * rx;
    const y = Math.sin(t) * ry;
    out.push([cx + x * Math.cos(rot) - y * Math.sin(rot), cy + x * Math.sin(rot) + y * Math.cos(rot)]);
  }
  return out;
}

/** A tapered ribbon along `line`, `w` wide at its middle. */
export function ribbon(line: Pt[], w: number, taperPow = 0.5): Pt[] {
  const left: Pt[] = [];
  const right: Pt[] = [];
  line.forEach((p, i) => {
    const a = line[Math.max(0, i - 1)];
    const b = line[Math.min(line.length - 1, i + 1)];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const taper = Math.sin(Math.PI * (i / (line.length - 1))) ** taperPow;
    const nx = -(b[1] - a[1]) / l;
    const ny = (b[0] - a[0]) / l;
    const ww = (w * (0.2 + 0.8 * taper)) / 2;
    left.push([p[0] + nx * ww, p[1] + ny * ww]);
    right.push([p[0] - nx * ww, p[1] - ny * ww]);
  });
  return [...left, ...right.reverse()];
}

/** The y of an x-ascending edge at `x` (linear between its samples; its ends held beyond them). */
export function yAt(edge: readonly Pt[], x: number): number {
  if (!edge.length) return 0;
  if (x <= edge[0][0]) return edge[0][1];
  for (let i = 1; i < edge.length; i++) {
    if (edge[i][0] >= x) {
      const a = edge[i - 1];
      const b = edge[i];
      const t = (x - a[0]) / (b[0] - a[0] || 1);
      return a[1] + (b[1] - a[1]) * t;
    }
  }
  return edge[edge.length - 1][1];
}

/** Numbers as the paths write them: whole units far away, one decimal near. */
const fmt = (n: number, d: number) => (d === 0 ? String(Math.round(n)) : n.toFixed(d).replace(/\.0$/, ''));

export function path(pts: readonly Pt[], closed = true, d = 1): string {
  if (!pts.length) return '';
  let s = `M${fmt(pts[0][0], d)},${fmt(pts[0][1], d)}`;
  for (let i = 1; i < pts.length; i++) s += `L${fmt(pts[i][0], d)},${fmt(pts[i][1], d)}`;
  return s + (closed ? 'Z' : '');
}

export function smoothPath(pts: readonly Pt[], d = 1): string {
  if (pts.length < 3) return path(pts, false, d);
  let s = `M${fmt(pts[0][0], d)},${fmt(pts[0][1], d)}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i][0] + pts[i + 1][0]) / 2;
    const my = (pts[i][1] + pts[i + 1][1]) / 2;
    s += `Q${fmt(pts[i][0], d)},${fmt(pts[i][1], d)} ${fmt(mx, d)},${fmt(my, d)}`;
  }
  const L = pts[pts.length - 1];
  return s + `L${fmt(L[0], d)},${fmt(L[1], d)}`;
}

/** A pencil line drawn over `pts` a few times, each pass a little off. */
export function pencil(pts: Pt[], seed: number, passes = 3, spread = 1.2): string[] {
  const r = rng(seed);
  const out: string[] = [];
  for (let k = 0; k < passes; k++) {
    const ox = (r() - 0.5) * spread * 2;
    const oy = (r() - 0.5) * spread * 2;
    out.push(smoothPath(pts.map((p): Pt => [p[0] + ox + (r() - 0.5) * spread, p[1] + oy + (r() - 0.5) * spread])));
  }
  return out;
}

export interface Peak {
  cx: number;
  h: number;
  hw: number;
  top: Pt;
  pts: Pt[];
  seed: number;
}

/** A range of low-poly peaks standing on `base`, the tallest drawn first. */
export function peaks(seed: number, x0: number, x1: number, base: number, hMin: number, hMax: number, n: number): Peak[] {
  const r = rng(seed);
  const list: Peak[] = [];
  for (let i = 0; i < n; i++) {
    const cx = x0 + ((x1 - x0) * (i + 0.5)) / n + (r() - 0.5) * ((x1 - x0) / n) * 0.9;
    const h = hMin + (hMax - hMin) * r() ** 1.2;
    const hw = h * (1.25 + r() * 1.3);
    const sk = (r() - 0.5) * 0.5;
    const top: Pt = [cx + sk * hw * 0.5, base - h];
    const L: Pt = [cx - hw, base];
    const R: Pt = [cx + hw, base];
    const ls: Pt = [L[0] + (top[0] - L[0]) * (0.45 + r() * 0.2), L[1] + (top[1] - L[1]) * (0.45 + r() * 0.2) - h * (r() * 0.12)];
    const rs: Pt = [R[0] + (top[0] - R[0]) * (0.45 + r() * 0.2), R[1] + (top[1] - R[1]) * (0.45 + r() * 0.2) - h * (r() * 0.12)];
    list.push({ cx, h, hw, top, pts: [L, ls, top, rs, R], seed: seed * 10 + i });
  }
  return list.sort((a, b) => b.h - a.h);
}

/** An open edge closed down to `y` (the paper continuing below its drawn edge: the plane's apron). */
export const closeDown = (edge: Pt[], y: number): Pt[] => [...edge, [edge[edge.length - 1][0], y], [edge[0][0], y]];

/** Points shifted and/or mirrored: x → mirror − x (then sorted back to x-ascending for an edge). */
export const shift = (pts: Pt[], dx: number, dy = 0): Pt[] => pts.map(([x, y]): Pt => [x + dx, y + dy]);
export const mirror = (pts: Pt[], about: number): Pt[] => pts.map(([x, y]): Pt => [about - x, y]).reverse();

/** A point on a quadratic Bézier. */
export function quad(a: Pt, c: Pt, b: Pt, u: number): Pt {
  const v = 1 - u;
  return [v * v * a[0] + 2 * v * u * c[0] + u * u * b[0], v * v * a[1] + 2 * v * u * c[1] + u * u * b[1]];
}
