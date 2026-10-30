/**
 * The props' paper: the cast generators' torn-paper geometry (designs/mascots/round3/tuck/gen/lib.mjs, typed) and their
 * filter recipes (tk.mjs `defs()`) under the stickers' own `sk-` ids — torn edge with the white fibre rim, the glue
 * shadow down-right, mottle and specks; graphite pencil; crayon. Everything is seeded: the same seed, the same paper.
 *
 * Props are drawn in rig units (the cast's: 摺摺 is 420 tall) and placed at their puppet's px-per-unit, so their grain,
 * rims and pencil are the same size as the characters'.
 */
export type Pt = readonly [number, number];

/** mulberry32, as the generators. */
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

/** Catmull-Rom through key points, sampled every ~step units. */
export function spline(keys: readonly Pt[], step = 6, closed = true): Pt[] {
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

/** Straight edges through key points, resampled every ~step units (cut paper: a slip, a flag). */
export function poly(keys: readonly Pt[], step = 6, closed = true): Pt[] {
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

/** A torn edge: every sample pushed along its normal by a slow wander and a jaggy bite. */
export function tear(pts: readonly Pt[], seed: number, { amp = 4, jag = 2.2, wander = 9, closed = true } = {}): Pt[] {
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
    return [p[0] + ty * d, p[1] - tx * d] as const;
  });
}

const f1 = (n: number) => n.toFixed(1);
export const path = (pts: readonly Pt[], closed = true): string =>
  'M' + pts.map(p => `${f1(p[0])},${f1(p[1])}`).join('L') + (closed ? 'Z' : '');

/** A smooth stroke through points (quadratics through the midpoints). */
export function smoothPath(pts: readonly Pt[], closed = false): string {
  if (pts.length < 3) return path(pts, closed);
  let d = `M${f1(pts[0][0])},${f1(pts[0][1])}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i][0] + pts[i + 1][0]) / 2;
    const my = (pts[i][1] + pts[i + 1][1]) / 2;
    d += `Q${f1(pts[i][0])},${f1(pts[i][1])} ${f1(mx)},${f1(my)}`;
  }
  const L = pts[pts.length - 1];
  return d + `L${f1(L[0])},${f1(L[1])}` + (closed ? 'Z' : '');
}

/** A pencil stroke: a few slightly offset passes. */
export function pencil(pts: readonly Pt[], seed: number, passes = 3, spread = 1.2): string[] {
  const r = rng(seed);
  const out: string[] = [];
  for (let k = 0; k < passes; k++) {
    const ox = (r() - 0.5) * spread * 2;
    const oy = (r() - 0.5) * spread * 2;
    out.push(smoothPath(pts.map(p => [p[0] + ox + (r() - 0.5) * spread, p[1] + oy + (r() - 0.5) * spread] as const)));
  }
  return out;
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

/** A handwriting line (the cast's scribbles): little loops along a baseline, a gap now and then. */
export function scribble(x0: number, y0: number, w: number, seed: number, h = 4.2): string[] {
  const r = rng(seed);
  const pts: (Pt | null)[] = [];
  let x = x0;
  let t = 0;
  while (x < x0 + w) {
    const loop = r() < 0.25 ? 1.9 : 1;
    pts.push([x + Math.cos(t) * 2.2, y0 - Math.abs(Math.sin(t)) * h * loop + (r() - 0.5) * 1.2]);
    t += 0.9 + r() * 0.5;
    x += 2.2 + r() * 1.6;
    if (r() < 0.13) {
      x += 7;
      pts.push(null);
    }
  }
  const runs: Pt[][] = [];
  let cur: Pt[] = [];
  for (const p of pts) {
    if (p) cur.push(p);
    else {
      if (cur.length > 2) runs.push(cur);
      cur = [];
    }
  }
  if (cur.length > 2) runs.push(cur);
  return runs.map(run => smoothPath(run));
}

/** The series' colours (OKLCH), as the generators write them: low chroma, terracotta only as an accent. */
export const INK = {
  graphite: 'oklch(29% 0.018 60)',
  /** The torn fibre rim, and the die-cut margin's cream. */
  rim: 'oklch(97.5% 0.012 85)',
  /** The family's mitten paper. */
  cream: 'oklch(93% 0.026 86)',
  paper: 'oklch(96% 0.018 86)',
  terracotta: 'oklch(62% 0.14 45)',
  terracottaDeep: 'oklch(52% 0.13 40)',
  red: 'oklch(56% 0.17 30)',
  redDeep: 'oklch(46% 0.15 28)',
  blush: 'oklch(69% 0.1 38)',
  gold: 'oklch(80% 0.12 85)',
  goldLight: 'oklch(90% 0.09 92)',
  goldPale: 'oklch(95% 0.05 95)',
  butter: 'oklch(89% 0.1 95)',
  sun: 'oklch(80% 0.14 72)',
  sunLight: 'oklch(88% 0.11 88)',
  sage: 'oklch(80% 0.044 140)',
  sageDeep: 'oklch(62% 0.06 142)',
  mist: 'oklch(78% 0.06 215)',
  lavender: 'oklch(80% 0.07 290)',
  midnight: 'oklch(40% 0.06 260)',
  wood: 'oklch(58% 0.07 62)',
  shadow: 'oklch(28% 0.03 55)',
} as const;

export const F = 'sk-';

/** The filters every prop references (one copy in the page). */
export function paperFilters(): string {
  const U = 'filterUnits="userSpaceOnUse" x="-400" y="-400" width="1600" height="1600"';
  return `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
  <filter id="${F}paper" ${U} color-interpolation-filters="sRGB">
    <feTurbulence type="fractalNoise" baseFrequency="0.11" numOctaves="2" seed="7" result="n"/>
    <feDisplacementMap in="SourceGraphic" in2="n" scale="3.2" xChannelSelector="R" yChannelSelector="G" result="torn"/>
    <feMorphology in="torn" operator="dilate" radius="1.7" result="fat"/>
    <feTurbulence type="fractalNoise" baseFrequency="0.7" numOctaves="1" seed="3" result="fn"/>
    <feDisplacementMap in="fat" in2="fn" scale="3" result="fibre"/>
    <feFlood flood-color="${INK.rim}"/><feComposite in2="fibre" operator="in" result="rim"/>
    <feGaussianBlur in="fat" stdDeviation="3" result="blur"/><feOffset dx="2.5" dy="4.5" result="off"/>
    <feFlood flood-color="${INK.shadow}" flood-opacity="0.22"/><feComposite in2="off" operator="in" result="shadow"/>
    <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="11" result="g"/>
    <feColorMatrix in="g" type="matrix" values="0 0 0 0 0.3  0 0 0 0 0.33  0 0 0 0 0.27  4 0 0 0 -2.86" result="speck"/>
    <feComposite in="speck" in2="torn" operator="in" result="specks"/>
    <feTurbulence type="fractalNoise" baseFrequency="0.05 0.09" numOctaves="3" seed="5" result="m"/>
    <feColorMatrix in="m" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 0.96  0.36 0 0 0 -0.15" result="mottle"/>
    <feComposite in="mottle" in2="torn" operator="in" result="mottles"/>
    <feMerge><feMergeNode in="shadow"/><feMergeNode in="rim"/><feMergeNode in="torn"/><feMergeNode in="mottles"/><feMergeNode in="specks"/></feMerge>
  </filter>
  <filter id="${F}thin" ${U} color-interpolation-filters="sRGB">
    <feTurbulence type="fractalNoise" baseFrequency="0.13" numOctaves="2" seed="9" result="n"/>
    <feDisplacementMap in="SourceGraphic" in2="n" scale="2.6" xChannelSelector="R" yChannelSelector="G" result="torn"/>
    <feMorphology in="torn" operator="dilate" radius="1.3" result="fat"/>
    <feTurbulence type="fractalNoise" baseFrequency="0.7" numOctaves="1" seed="4" result="fn"/>
    <feDisplacementMap in="fat" in2="fn" scale="2.4" result="fibre"/>
    <feFlood flood-color="${INK.rim}"/><feComposite in2="fibre" operator="in" result="rim"/>
    <feGaussianBlur in="fat" stdDeviation="1.8" result="blur"/><feOffset dx="1" dy="2.2" result="off"/>
    <feFlood flood-color="${INK.shadow}" flood-opacity="0.2"/><feComposite in2="off" operator="in" result="shadow"/>
    <feTurbulence type="fractalNoise" baseFrequency="0.05 0.09" numOctaves="3" seed="15" result="m"/>
    <feColorMatrix in="m" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 0.97  0.45 0 0 0 -0.2" result="mottle"/>
    <feComposite in="mottle" in2="torn" operator="in" result="mottles"/>
    <feMerge><feMergeNode in="shadow"/><feMergeNode in="rim"/><feMergeNode in="torn"/><feMergeNode in="mottles"/></feMerge>
  </filter>
  <filter id="${F}cut" ${U} color-interpolation-filters="sRGB">
    <feTurbulence type="fractalNoise" baseFrequency="0.11" numOctaves="2" seed="27" result="n"/>
    <feDisplacementMap in="SourceGraphic" in2="n" scale="1.2" xChannelSelector="R" yChannelSelector="G" result="torn"/>
    <feMorphology in="torn" operator="dilate" radius="1" result="fat"/>
    <feFlood flood-color="${INK.rim}"/><feComposite in2="fat" operator="in" result="rim"/>
    <feGaussianBlur in="fat" stdDeviation="2.2" result="blur"/><feOffset dx="1.5" dy="3" result="off"/>
    <feFlood flood-color="${INK.shadow}" flood-opacity="0.2"/><feComposite in2="off" operator="in" result="shadow"/>
    <feTurbulence type="fractalNoise" baseFrequency="0.05 0.09" numOctaves="3" seed="35" result="m"/>
    <feColorMatrix in="m" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 0.96  0.32 0 0 0 -0.14" result="mottle"/>
    <feComposite in="mottle" in2="torn" operator="in" result="mottles"/>
    <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="31" result="g"/>
    <feColorMatrix in="g" type="matrix" values="0 0 0 0 0.3  0 0 0 0 0.33  0 0 0 0 0.27  4 0 0 0 -2.9" result="speck"/>
    <feComposite in="speck" in2="torn" operator="in" result="specks"/>
    <feMerge><feMergeNode in="shadow"/><feMergeNode in="rim"/><feMergeNode in="torn"/><feMergeNode in="mottles"/><feMergeNode in="specks"/></feMerge>
  </filter>
  <filter id="${F}graphite" ${U}>
    <feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="2" seed="2" result="w"/>
    <feDisplacementMap in="SourceGraphic" in2="w" scale="1.6" result="d"/>
    <feTurbulence type="fractalNoise" baseFrequency="1.1" numOctaves="1" seed="6" result="t"/>
    <feColorMatrix in="t" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -2.4 0 0 0 2.15" result="tooth"/>
    <feComposite in="d" in2="tooth" operator="in"/>
  </filter>
  <filter id="${F}crayon" ${U}>
    <feTurbulence type="fractalNoise" baseFrequency="0.06" numOctaves="2" seed="13" result="w"/>
    <feDisplacementMap in="SourceGraphic" in2="w" scale="4" result="d"/>
    <feTurbulence type="fractalNoise" baseFrequency="0.55 0.9" numOctaves="2" seed="14" result="t"/>
    <feColorMatrix in="t" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -2 0 0 0 1.75" result="gaps"/>
    <feComposite in="d" in2="gaps" operator="in"/>
  </filter>
  <filter id="${F}crayon-soft" ${U}>
    <feGaussianBlur stdDeviation="1.2" result="b"/>
    <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="1" seed="19" result="t"/>
    <feColorMatrix in="t" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -1.6 0 0 0 1.5" result="gaps"/>
    <feComposite in="b" in2="gaps" operator="in"/>
  </filter>
</defs></svg>`;
}
