// Small geometry kit for torn-paper shapes (seeded, deterministic).
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// Closed Catmull-Rom through key points, sampled every ~step px.
export function spline(keys, step = 6, closed = true) {
  const out = [];
  const n = keys.length;
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const p0 = keys[(i - 1 + n) % n], p1 = keys[i], p2 = keys[(i + 1) % n], p3 = keys[(i + 2) % n];
    const P0 = !closed && i === 0 ? p1 : p0;
    const P3 = !closed && i === segs - 1 ? p2 : p3;
    const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const m = Math.max(2, Math.round(len / step));
    for (let k = 0; k < m; k++) {
      const t = k / m, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(P0[0], p1[0], p2[0], P3[0]), f(P0[1], p1[1], p2[1], P3[1])]);
    }
  }
  if (!closed) out.push(keys[n - 1]);
  return out;
}
// Polyline through keys with straight edges, resampled.
export function poly(keys, step = 6, closed = true) {
  const out = [];
  const n = keys.length;
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const a = keys[i], b = keys[(i + 1) % n];
    const m = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
    for (let k = 0; k < m; k++) out.push([a[0] + (b[0] - a[0]) * k / m, a[1] + (b[1] - a[1]) * k / m]);
  }
  if (!closed) out.push(keys[n - 1]);
  return out;
}
// Tear: push each sample along its normal by layered noise (a slow wander + a jaggy bite).
export function tear(pts, seed, { amp = 4, jag = 2.2, wander = 9, closed = true } = {}) {
  const r = rng(seed);
  const n = pts.length;
  // slow noise: random walk smoothed
  let w = 0; const slow = [];
  for (let i = 0; i < n; i++) { w += (r() - 0.5) * 0.9; w *= 0.93; slow.push(w); }
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = pts[(i - 1 + n) % n], b = pts[(i + 1) % n];
    let tx = b[0] - a[0], ty = b[1] - a[1];
    if (!closed && (i === 0 || i === n - 1)) { out.push(pts[i]); continue; }
    const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
    const nx = ty, ny = -tx;
    const d = slow[i] * wander * 0.35 + (r() - 0.5) * 2 * jag + (r() < 0.08 ? (r() - 0.6) * amp * 2.2 : 0);
    out.push([pts[i][0] + nx * d, pts[i][1] + ny * d]);
  }
  return out;
}
export const path = (pts, closed = true) =>
  'M' + pts.map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join('L') + (closed ? 'Z' : '');
// Smooth open/closed path (quadratic through midpoints) for pencil strokes.
export function smoothPath(pts, closed = false) {
  if (pts.length < 3) return path(pts, closed);
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2;
    d += `Q${pts[i][0].toFixed(1)},${pts[i][1].toFixed(1)} ${mx.toFixed(1)},${my.toFixed(1)}`;
  }
  const L = pts[pts.length - 1];
  d += `L${L[0].toFixed(1)},${L[1].toFixed(1)}`;
  return d + (closed ? 'Z' : '');
}
// Reflect point p across line a-b.
export function reflect(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy);
  const fx = a[0] + t * dx, fy = a[1] + t * dy;
  return [2 * fx - p[0], 2 * fy - p[1]];
}
// Signed side of p relative to directed line a->b.
export const side = (p, a, b) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
// Pencil: n slightly offset passes of a stroke.
export function pencil(pts, seed, passes = 3, spread = 1.2) {
  const r = rng(seed);
  const out = [];
  for (let k = 0; k < passes; k++) {
    const ox = (r() - 0.5) * spread * 2, oy = (r() - 0.5) * spread * 2;
    const q = pts.map(p => [p[0] + ox + (r() - 0.5) * spread, p[1] + oy + (r() - 0.5) * spread]);
    out.push(smoothPath(q));
  }
  return out;
}
export const ellipse = (cx, cy, rx, ry, n = 28, rot = 0) => {
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    const x = Math.cos(t) * rx, y = Math.sin(t) * ry;
    out.push([cx + x * Math.cos(rot) - y * Math.sin(rot), cy + x * Math.sin(rot) + y * Math.cos(rot)]);
  }
  return out;
};
