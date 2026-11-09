import { makePrng } from './prng';

export type SegValue = number | [number, number];

export interface WobRectOpts {
  curve?: number;
  cornerJitter?: number;
  cornerOffset?: number;
  segmentsH?: SegValue;
  segmentsV?: SegValue;
  /**
   * Each corner's own radius, clockwise from the top left — a bubble in a stack keeps its outer
   * corners round and tucks the ones facing its neighbours. Each is jittered and capped the way
   * `R` is; without it all four are `R`. The twin of the Kotlin and Swift `cornerRadii`.
   */
  cornerRadii?: [number, number, number, number];
  /**
   * A shape that grows taller from a resting height (the chat composer's capsule, round 23): its corners and its
   * top and bottom edges drawn as at that height whatever its height — the horizontal edges' swing `ampX` (px, in
   * place of the one worked out from `mag` and `curve`), and the right edge taking `draws` of the stream however
   * long it is (what it takes at the resting height: {@link edgeDraws}), so nothing drawn after it depends on its
   * length. Growing then moves the sides alone: the bottom edge and its corners stay put, the top edge only rises.
   * At the resting height the path is the plain one's, point for point.
   */
  steady?: { draws: number; ampX: number };
}

/**
 * How far an edge's anchors swing off its line (px) for a `W` × `H` shape of wobble `mag` and bow `curve` — what
 * {@link wobRect} works out for every edge.
 */
export function wobAmp(W: number, H: number, mag: number, curve = 1): number {
  return Math.min(mag * 0.95 * curve, Math.min(W, H) * 0.032 * Math.max(1, curve));
}

/** How many of the stream's numbers an edge `len` long in `segs` segments of swing `amp` takes (none when straight). */
export function edgeDraws(len: number, segs: number, amp: number): number {
  return segs < 2 || len < amp * 4 ? 0 : 2 * (segs - 1);
}

// Corners: bezier quarter-circles with slightly jittered radius.
// Edges: configurable number of cubics joined by seeded wobble anchors.
export function wobRect(
  W: number,
  H: number,
  R: number,
  seed: number,
  mag?: number,
  opts?: WobRectOpts
): string {
  const stream = makePrng(seed);
  // Counted, so a steady shape's right edge can be drawn from a copy of the stream at the same place.
  let drawn = 0;
  const rnd = () => {
    drawn++;
    return stream();
  };
  const m = mag != null ? mag : Math.min(W, H) * 0.025;
  const K = 0.552;

  const curve        = opts?.curve        ?? 1;
  const cornerJitter = opts?.cornerJitter ?? 1;
  const cornerOffset = opts?.cornerOffset ?? 0;

  const resolveSegs = (val: SegValue | undefined, fallback: number): number => {
    if (val == null) return fallback;
    if (Array.isArray(val)) {
      const [lo, hi] = val;
      return lo + Math.floor(rnd() * (hi - lo + 1));
    }
    return val | 0;
  };
  const segH = resolveSegs(opts?.segmentsH, 3);
  const segV = resolveSegs(opts?.segmentsV, 3);

  // The jitter follows each corner's own radius (all four are R unless the options say otherwise);
  // the PRNG is consumed in the same order either way, so a rect with equal radii is unchanged.
  const radii = opts?.cornerRadii;
  const corner = (r: number) => r + (rnd() - 0.5) * 2 * (Math.min(r * 0.07, Math.max(0, Math.min(W, H) / 2 - r) * 0.4) * cornerJitter);
  const Rtl = corner(radii?.[0] ?? R);
  const Rtr = corner(radii?.[1] ?? R);
  const Rbr = corner(radii?.[2] ?? R);
  const Rbl = corner(radii?.[3] ?? R);

  const oCap = Math.max(0, Math.min(W, H) * 0.5 - Math.max(Rtl, Rtr, Rbr, Rbl)) * 0.6;
  const oMag = Math.min(cornerOffset, oCap);
  const ox = () => (rnd() - 0.5) * 2 * oMag;
  const oy = () => (rnd() - 0.5) * 2 * oMag;
  const tlX = ox(), tlY = oy();
  const trX = ox(), trY = oy();
  const brX = ox(), brY = oy();
  const blX = ox(), blY = oy();

  const steady = opts?.steady;
  const perpAmp = wobAmp(W, H, m, curve);
  const ampX = steady ? steady.ampX : perpAmp;

  const f = (n: number) => +n.toFixed(2);
  const C = (x1: number, y1: number, x2: number, y2: number, x: number, y: number) =>
    `C ${f(x1)},${f(y1)} ${f(x2)},${f(y2)} ${f(x)},${f(y)}`;

  const cubicH = (P0: [number, number], P1: [number, number]) => {
    const h = Math.abs(P1[0] - P0[0]) / 3;
    const dir = P1[0] >= P0[0] ? 1 : -1;
    return C(P0[0] + dir * h, P0[1], P1[0] - dir * h, P1[1], P1[0], P1[1]);
  };
  const cubicV = (P0: [number, number], P1: [number, number]) => {
    const h = Math.abs(P1[1] - P0[1]) / 3;
    const dir = P1[1] >= P0[1] ? 1 : -1;
    return C(P0[0], P0[1] + dir * h, P1[0], P1[1] - dir * h, P1[0], P1[1]);
  };

  const buildEdge = (
    P0: [number, number],
    P1: [number, number],
    axis: 'x' | 'y',
    segs: number,
    r: () => number = rnd
  ): string[] => {
    const emit = axis === 'x' ? cubicH : cubicV;
    const len = axis === 'x' ? Math.abs(P1[0] - P0[0]) : Math.abs(P1[1] - P0[1]);
    const amp = axis === 'x' ? ampX : perpAmp;
    if (edgeDraws(len, segs, amp) === 0) return [emit(P0, P1)];
    const anchors: [number, number][] = [];
    const anchorJitter = Math.min(0.08, 0.4 / segs);
    for (let i = 1; i < segs; i++) {
      const t = i / segs + (r() - 0.5) * anchorJitter;
      const x = P0[0] + (P1[0] - P0[0]) * t;
      const y = P0[1] + (P1[1] - P0[1]) * t;
      anchors.push(
        axis === 'x'
          ? [x, y + (r() - 0.5) * 2 * amp]
          : [x + (r() - 0.5) * 2 * amp, y]
      );
    }
    const result: string[] = [];
    let prev = P0;
    for (const a of anchors) {
      result.push(emit(prev, a));
      prev = a;
    }
    result.push(emit(prev, P1));
    return result;
  };

  const TLa: [number, number] = [0,              Rtl + tlY];
  const TLb: [number, number] = [Rtl + tlX,      0];
  const TRa: [number, number] = [W - Rtr + trX,  0];
  const TRb: [number, number] = [W,              Rtr + trY];
  const BRa: [number, number] = [W,              H - Rbr + brY];
  const BRb: [number, number] = [W - Rbr + brX,  H];
  const BLa: [number, number] = [Rbl + blX,      H];
  const BLb: [number, number] = [0,              H - Rbl + blY];

  const parts: string[] = [`M ${f(TLa[0])},${f(TLa[1])}`];

  parts.push(C(0, TLa[1] * (1 - K) + TLb[1] * K,
               TLb[0] * (1 - K) + TLa[0] * K, 0,
               TLb[0], TLb[1]));
  parts.push(...buildEdge(TLb, TRa, 'x', segH));

  parts.push(C(TRa[0] + (W - TRa[0]) * K, 0,
               W, TRb[1] * (1 - K),
               TRb[0], TRb[1]));
  if (steady) {
    // The right edge from a copy of the stream where it stands; the stream itself moves on by what the edge takes
    // at the resting height, so the bottom and left edges draw the same numbers at any height.
    const at = drawn;
    const copy = makePrng(seed);
    for (let i = 0; i < at; i++) copy();
    parts.push(...buildEdge(TRb, BRa, 'y', segV, copy));
    for (let i = 0; i < steady.draws; i++) rnd();
  } else {
    parts.push(...buildEdge(TRb, BRa, 'y', segV));
  }

  parts.push(C(W, BRa[1] + (H - BRa[1]) * K,
               BRb[0] + (W - BRb[0]) * K, H,
               BRb[0], BRb[1]));
  parts.push(...buildEdge(BRb, BLa, 'x', segH));

  parts.push(C(BLa[0] * (1 - K), H,
               0, BLb[1] + (H - BLb[1]) * K,
               BLb[0], BLb[1]));
  parts.push(...buildEdge(BLb, TLa, 'y', segV));

  parts.push('Z');
  return parts.join(' ');
}
