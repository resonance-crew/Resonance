/**
 * An SVG path's `d` flattened to points in its own user units, about every `step` units along it — in JS, from the
 * attribute alone. The browser's getPointAtLength walks the path from its start on every call: a card's outline
 * sampled every few px that way took a quarter of a second of the main thread on a desktop's six cards; this takes a
 * fraction of a millisecond. M L H V C S Q T Z, absolute or relative (what the site's hand-drawn paths are written
 * in); a path with anything else (an arc) is null, and the caller asks the browser instead.
 */
export type PathPoint = [number, number];

const ALLOWED = /^[\s,MmLlHhVvCcSsQqTtZz0-9.eE+-]*$/;
const TOKEN = /([MmLlHhVvCcSsQqTtZz])|([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)/g;

type Seg = { pts: PathPoint[]; start?: true };

/** The points of a cubic (or, with three points, a quadratic) Bézier at t. */
function bezier(p: readonly PathPoint[], t: number): PathPoint {
  const u = 1 - t;
  if (p.length === 4) {
    const a = u * u * u;
    const b = 3 * u * u * t;
    const c = 3 * u * t * t;
    const e = t * t * t;
    return [a * p[0][0] + b * p[1][0] + c * p[2][0] + e * p[3][0], a * p[0][1] + b * p[1][1] + c * p[2][1] + e * p[3][1]];
  }
  if (p.length === 3) {
    const a = u * u;
    const b = 2 * u * t;
    const c = t * t;
    return [a * p[0][0] + b * p[1][0] + c * p[2][0], a * p[0][1] + b * p[1][1] + c * p[2][1]];
  }
  return [u * p[0][0] + t * p[1][0], u * p[0][1] + t * p[1][1]];
}

/** A segment's length, about: the mean of its chord and its control polygon (exact for a line). */
function lengthOf(p: readonly PathPoint[]): number {
  let poly = 0;
  for (let i = 1; i < p.length; i++) poly += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
  const chord = Math.hypot(p[p.length - 1][0] - p[0][0], p[p.length - 1][1] - p[0][1]);
  return (poly + chord) / 2;
}

/** The segments of `d` (each its control points, the first of them where the pen is), or null if it can't be read. */
function segments(d: string): Seg[] | null {
  if (!ALLOWED.test(d)) return null;
  const toks: (string | number)[] = [];
  for (const m of d.matchAll(TOKEN)) toks.push(m[1] ?? Number(m[2]));
  if (toks[0] !== 'M' && toks[0] !== 'm') return null;   // a path starts with a moveto, or draws nothing
  const out: Seg[] = [];
  let i = 0;
  let cmd = '';
  let x = 0;
  let y = 0;
  let sx = 0;
  let sy = 0;
  let ctrl: PathPoint | null = null;   // the last cubic's (or quadratic's) last control point, for S and T
  let last = '';
  const num = (): number => {
    const v = toks[i++];
    if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error('number');
    return v;
  };
  try {
    while (i < toks.length) {
      const tok = toks[i];
      if (typeof tok === 'string') {
        cmd = tok;
        i++;
      } else if (!cmd || cmd === 'Z' || cmd === 'z') return null;
      else if (cmd === 'M') cmd = 'L';   // pairs after a moveto are linetos
      else if (cmd === 'm') cmd = 'l';
      const rel = cmd !== cmd.toUpperCase();
      const ox = rel ? x : 0;
      const oy = rel ? y : 0;
      const C = cmd.toUpperCase();
      const from: PathPoint = [x, y];
      if (C === 'Z') {
        if (x !== sx || y !== sy) out.push({ pts: [from, [sx, sy]] });
        x = sx;
        y = sy;
        ctrl = null;
      } else if (C === 'M') {
        x = num() + ox;
        y = num() + oy;
        sx = x;
        sy = y;
        out.push({ pts: [[x, y]], start: true });
        ctrl = null;
      } else if (C === 'L' || C === 'H' || C === 'V') {
        if (C !== 'V') x = num() + ox;
        if (C !== 'H') y = num() + oy;
        out.push({ pts: [from, [x, y]] });
        ctrl = null;
      } else if (C === 'C' || C === 'S') {
        const c1: PathPoint = C === 'S'
          ? (ctrl && (last === 'C' || last === 'S') ? [2 * x - ctrl[0], 2 * y - ctrl[1]] : [x, y])
          : [num() + ox, num() + oy];
        const c2: PathPoint = [num() + ox, num() + oy];
        x = num() + ox;
        y = num() + oy;
        out.push({ pts: [from, c1, c2, [x, y]] });
        ctrl = c2;
      } else if (C === 'Q' || C === 'T') {
        const c1: PathPoint = C === 'T'
          ? (ctrl && (last === 'Q' || last === 'T') ? [2 * x - ctrl[0], 2 * y - ctrl[1]] : [x, y])
          : [num() + ox, num() + oy];
        x = num() + ox;
        y = num() + oy;
        out.push({ pts: [from, c1, [x, y]] });
        ctrl = c1;
      } else return null;
      last = C;
    }
  } catch {
    return null;
  }
  return out;
}

/**
 * `d`'s points about every `step` user units (each subpath's start, then along every segment), at most `cap` of them
 * (a longer path is stepped more coarsely); null for a path this can't read.
 */
export function flattenPath(d: string, step: number, cap = 4000): PathPoint[] | null {
  const segs = segments(d);
  if (!segs) return null;
  const total = segs.reduce((s, g) => s + (g.start ? 0 : lengthOf(g.pts)), 0);
  const every = Math.max(step, total / cap, 1e-3);
  const out: PathPoint[] = [];
  for (const g of segs) {
    if (g.start) {
      out.push(g.pts[0]);
      continue;
    }
    const n = Math.max(1, Math.ceil(lengthOf(g.pts) / every));
    for (let k = 1; k <= n; k++) out.push(bezier(g.pts, k / n));
  }
  return out;
}
