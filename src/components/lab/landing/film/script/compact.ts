/**
 * Path data, shorter where the art doesn't change (SPEC §10: the world's symbols in the server's HTML). Every point is
 * kept to a tenth of a world unit (at most 0.13 px on the largest screen) and written relative to the point before it,
 * from the rounded points — so nothing drifts — in the fewest characters SVG's path grammar allows: no repeated command
 * letters, no leading zeros, no separator before a minus sign. Reads what geom.ts and world.ts write: M L H V Q A Z,
 * absolute or relative (other commands are left as they are, the whole path untouched).
 */

const NUM = /[MmLlHhVvQqAaZz]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g;
const ARGS: Record<string, number> = { M: 2, L: 2, H: 1, V: 1, Q: 4, A: 7, Z: 0 };

/** A number to a tenth, as short as it can be written. */
export function fmt(v: number): string {
  let r = Math.round(v * 10) / 10;
  if (Object.is(r, -0) || r === 0) r = 0;
  let s = String(r);
  if (s.startsWith('0.')) s = s.slice(1);
  else if (s.startsWith('-0.')) s = `-${s.slice(2)}`;
  return s;
}
const r1 = (v: number) => Math.round(v * 10) / 10;

/** Whether `next` can follow `prev` with nothing between them (a minus starts a number; so does a second point). */
const runs = (prev: string, next: string) => next.startsWith('-') || (next.startsWith('.') && prev.includes('.'));

/**
 * `d`, compacted: relative commands from points rounded to a tenth. Answers `d` itself when it holds a command this
 * doesn't read (the art then stays exactly as written).
 */
export function compactPath(d: string): string {
  const tokens = d.match(NUM);
  if (!tokens || /[^MmLlHhVvQqAaZz\s,.\-+\deE]/.test(d)) return d;
  let i = 0;
  let cmd = '';
  // the current point and the subpath's start, absolute and rounded (every delta is taken from these)
  let x = 0;
  let y = 0;
  let sx = 0;
  let sy = 0;
  let first = true;
  let last = '';
  // the last number written ('' right after a command letter)
  let prev = '';
  let out = '';
  const emit = (c: string, nums: string[]) => {
    // a command letter only when it changes (after `m` the next pairs would be read as `l`: always name them)
    if (c !== last || c === 'm' || c === 'z') {
      out += c;
      prev = '';
    }
    for (const n of nums) {
      if (prev && !runs(prev, n)) out += ' ';
      out += n;
      prev = n;
    }
    last = c;
  };
  while (i < tokens.length) {
    const t = tokens[i];
    if (/[A-Za-z]/.test(t)) {
      cmd = t;
      i++;
      if (cmd === 'Z' || cmd === 'z') {
        emit('z', []);
        x = sx;
        y = sy;
        continue;
      }
    }
    const up = cmd.toUpperCase();
    const n = ARGS[up];
    if (n == null || n === 0) return d;
    if (i + n > tokens.length) return d;
    const a = tokens.slice(i, i + n).map(Number);
    if (a.some((v) => !Number.isFinite(v))) return d;
    i += n;
    const rel = cmd !== up;
    if (up === 'M') {
      const nx = r1(rel && !first ? x + a[0] : a[0]);
      const ny = r1(rel && !first ? y + a[1] : a[1]);
      if (first) emit('M', [fmt(nx), fmt(ny)]);
      else emit('m', [fmt(nx - x), fmt(ny - y)]);
      first = false;
      x = sx = nx;
      y = sy = ny;
      // further pairs after a moveto are linetos
      cmd = rel ? 'l' : 'L';
    } else if (up === 'L') {
      const nx = r1(rel ? x + a[0] : a[0]);
      const ny = r1(rel ? y + a[1] : a[1]);
      emit('l', [fmt(nx - x), fmt(ny - y)]);
      x = nx;
      y = ny;
    } else if (up === 'H') {
      const nx = r1(rel ? x + a[0] : a[0]);
      emit('h', [fmt(nx - x)]);
      x = nx;
    } else if (up === 'V') {
      const ny = r1(rel ? y + a[0] : a[0]);
      emit('v', [fmt(ny - y)]);
      y = ny;
    } else if (up === 'Q') {
      const cx = r1(rel ? x + a[0] : a[0]);
      const cy = r1(rel ? y + a[1] : a[1]);
      const nx = r1(rel ? x + a[2] : a[2]);
      const ny = r1(rel ? y + a[3] : a[3]);
      emit('q', [fmt(cx - x), fmt(cy - y), fmt(nx - x), fmt(ny - y)]);
      x = nx;
      y = ny;
    } else if (up === 'A') {
      const nx = r1(rel ? x + a[5] : a[5]);
      const ny = r1(rel ? y + a[6] : a[6]);
      // the flags each a lone digit: written apart, as some readers want them
      emit('a', [fmt(a[0]), fmt(a[1]), fmt(a[2]), a[3] ? '1' : '0', a[4] ? '1' : '0', fmt(nx - x), fmt(ny - y)]);
      x = nx;
      y = ny;
    }
    if (first) return d;
  }
  return out;
}
