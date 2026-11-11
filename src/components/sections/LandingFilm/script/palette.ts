/**
 * The film's light: the art mock's six times of day (mocks/palettes.html `TIMES`, its layer formula `layerColour`,
 * `paletteOf`) plus the two the opening needs — the blue hour and sunrise, dark enough above for the cream h1 — laid
 * along the film by hour (`hourAt`), and turned into the stage's CSS variables (`paletteAt`). OKLCH throughout;
 * interpolation the short way round the hue, so dusk never passes through grey. Pure, no DOM.
 *
 * One change from the mock: the day's and the golden hour's zenith (sky-0) are kept at L ≤ 0.54, so the chrome's
 * cream (the header, the pen ≋) reads on the sky's top at every hour of the film (a sky top between L 0.55 and 0.63
 * would leave neither cream nor graphite at 4.5:1).
 */
import { FILM_END, SEG } from './timeline';

export type LCH = [number, number, number];

/* ───────────── colour: OKLCH ↔ sRGB, contrast (the mock's) ───────────── */
const D2R = Math.PI / 180;
export const lchToLab = ([L, C, h]: LCH): LCH => [L, C * Math.cos(h * D2R), C * Math.sin(h * D2R)];
export function labToLch([L, a, b]: LCH): LCH {
  let h = Math.atan2(b, a) / D2R;
  if (h < 0) h += 360;
  return [L, Math.hypot(a, b), h];
}
function labToLin([L, a, b]: LCH): LCH {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}
const inGamut = (v: LCH) => v.every((c) => c >= -0.0005 && c <= 1.0005);
/** The colour with its chroma pulled in until it fits sRGB. */
export function fit([L, C, h]: LCH): LCH {
  if (inGamut(labToLin(lchToLab([L, C, h])))) return [L, C, h];
  let lo = 0;
  let hi = C;
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2;
    if (inGamut(labToLin(lchToLab([L, mid, h])))) lo = mid;
    else hi = mid;
  }
  return [L, lo, h];
}
const enc = (c: number) => {
  c = Math.min(1, Math.max(0, c));
  return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
};
const dec = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
export const srgb = (lch: LCH): LCH => labToLin(lchToLab(fit(lch))).map(enc) as LCH;
export const luminance = (lch: LCH) => {
  const [r, g, b] = srgb(lch).map(dec);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
export const contrast = (a: LCH, b: LCH) => {
  const y1 = luminance(a);
  const y2 = luminance(b);
  return (Math.max(y1, y2) + 0.05) / (Math.min(y1, y2) + 0.05);
};
export function mixLab(c1: LCH, c2: LCH, t: number): LCH {
  const a = lchToLab(c1);
  const b = lchToLab(c2);
  return labToLch(a.map((v, i) => v + (b[i] - v) * t) as LCH);
}
/** OKLCH interpolation: lightness and chroma linear, hue the short way round — no grey in the middle. */
export function mixLch([L1, C1, h1]: LCH, [L2, C2, h2]: LCH, t: number): LCH {
  let dh = ((h2 - h1 + 540) % 360) - 180;
  if (C1 < 0.005) {
    dh = 0;
    h1 = h2;
  }
  if (C2 < 0.005) dh = 0;
  return [L1 + (L2 - L1) * t, C1 + (C2 - C1) * t, (h1 + dh * t + 360) % 360];
}
/** A CSS colour (fitted to sRGB, so every browser draws the mock's colour). */
export function css(lch: LCH, a = 1): string {
  const [L, C, h] = fit(lch);
  const body = `${(L * 100).toFixed(1)}% ${C.toFixed(4)} ${h.toFixed(1)}`;
  return a >= 1 ? `oklch(${body})` : `oklch(${body} / ${+a.toFixed(3)})`;
}

/* ───────────── the times of day ───────────── */
export interface Time {
  name: string;
  /** The sky wash's four colours, top (zenith) to the horizon (stops 0, .55, .8 and 1 of the horizon's height). */
  sky: [LCH, LCH, LCH, LCH];
  /** The air at the horizon (what the farthest paper fades into) and the nearest paper (the time's darkest). */
  haze: LCH;
  ink: LCH;
  gamma: number;
  kappa: number;
  disc: { c: LCH; halo: LCH };
  rim: LCH;
  accent: LCH;
  sea: LCH;
  mist: number;
  windows: number;
  stars: number;
  clouds: 'puff' | 'streak' | null;
  beam: number;
  /**
   * The haze a flat flown into the sky pales into (a scene change's `haze`), when the wash between the sky's middle
   * stops is no colour to pale into: the golden hour's blue-to-gold mixes to a khaki there, so its flats (and the
   * sunset's, c2) pale toward the warm low sky instead. Absent: the wash at 0.68 of the horizon's height.
   */
  fly?: LCH;
  /**
   * Under the site's dark scheme: how much the sky and the paper keep of their lightness and chroma (SPEC §3.5's 0.92
   * and 0.9 when absent). The bright hours dim further, so a dark room keeps the hour legible without the glare of a
   * noon sky filling the phone.
   */
  dark?: [number, number];
  /**
   * How much quieter than the mock the scenery is painted (`softened`): the chroma it keeps, and how far the paper's
   * lightness is pulled toward the haze. Absent: the mock's colours.
   */
  soft?: [number, number];
}

const sky4 = (s: number[][]): Time['sky'] => s.map(([, L, C, h]) => [L, C, h] as LCH) as Time['sky'];

export const TIMES: Record<string, Time> = {
  blueHour: {
    name: 'blue hour',
    sky: sky4([[0, 0.36, 0.065, 272], [0.55, 0.47, 0.085, 300], [0.8, 0.64, 0.095, 338], [1, 0.8, 0.075, 40]]),
    haze: [0.66, 0.06, 318], ink: [0.26, 0.05, 285], gamma: 0.9, kappa: 0.6,
    disc: { c: [0.94, 0.07, 80], halo: [0.86, 0.08, 40] },
    rim: [0.8, 0.03, 300], accent: [0.84, 0.1, 62], sea: [0.66, 0.06, 320],
    mist: 0.3, windows: 0.25, stars: 12, clouds: 'streak', beam: 0.6,
    soft: [0.78, 0.07],
  },
  sunrise: {
    name: 'sunrise',
    sky: sky4([[0, 0.42, 0.07, 278], [0.55, 0.52, 0.09, 312], [0.8, 0.74, 0.09, 20], [1, 0.9, 0.07, 66]]),
    haze: [0.87, 0.045, 32], ink: [0.33, 0.055, 290], gamma: 0.85, kappa: 0.7,
    disc: { c: [0.96, 0.07, 84], halo: [0.92, 0.07, 60] },
    rim: [0.94, 0.035, 40], accent: [0.84, 0.1, 62], sea: [0.82, 0.05, 340],
    mist: 0.42, windows: 0.12, stars: 6, clouds: 'streak', beam: 0,
    soft: [0.72, 0.12],
  },
  day: {
    name: 'day',
    sky: sky4([[0, 0.54, 0.13, 252], [0.45, 0.75, 0.095, 238], [0.8, 0.86, 0.06, 225], [1, 0.91, 0.04, 208]]),
    haze: [0.87, 0.045, 215], ink: [0.38, 0.05, 192], gamma: 0.8, kappa: 1,
    disc: { c: [0.985, 0.04, 98], halo: [0.95, 0.04, 215] },
    rim: [0.975, 0.012, 85], accent: [0.62, 0.14, 45], sea: [0.74, 0.085, 230],
    mist: 0, windows: 0, stars: 0, clouds: 'puff', beam: 0,
    dark: [0.82, 0.85],
    soft: [0.68, 0.15],
  },
  golden: {
    name: 'golden',
    // the zenith stays blue; only the two lower stops warm, toward apricot (a blue-to-yellow wash mixed whole reads
    // khaki); the far paper fades into an apricot-rose air, the near into a deep green, the lake mirrors the blue
    // above (a gold lake under a gold range was one smoggy sheet)
    sky: sky4([[0, 0.54, 0.09, 248], [0.46, 0.74, 0.065, 244], [0.78, 0.88, 0.095, 66], [1, 0.9, 0.12, 60]]),
    haze: [0.84, 0.08, 55], ink: [0.32, 0.06, 165], gamma: 0.85, kappa: 0.85,
    disc: { c: [0.96, 0.11, 92], halo: [0.93, 0.1, 84] },
    rim: [0.95, 0.07, 86], accent: [0.8, 0.14, 72], sea: [0.66, 0.07, 230],
    mist: 0, windows: 0, stars: 0, clouds: 'streak', beam: 0,
    fly: [0.84, 0.085, 56],
    dark: [0.82, 0.85],
    soft: [0.68, 0.15],
  },
  sunset: {
    name: 'sunset',
    sky: sky4([[0, 0.48, 0.1, 288], [0.45, 0.66, 0.12, 334], [0.75, 0.8, 0.13, 42], [1, 0.88, 0.12, 70]]),
    haze: [0.84, 0.085, 52], ink: [0.27, 0.07, 318], gamma: 0.8, kappa: 0.6,
    disc: { c: [0.95, 0.1, 80], halo: [0.88, 0.12, 55] },
    // the sea mirrors the violet above it, darker than the low sky (the open sea mid-change keeps its depth)
    rim: [0.93, 0.065, 62], accent: [0.82, 0.13, 60], sea: [0.64, 0.09, 345],
    mist: 0, windows: 0.2, stars: 2, clouds: 'streak', beam: 0,
    // its low sky (c2's flats pale into the sunset's warm light, never a khaki)
    fly: [0.8, 0.12, 46],
    soft: [0.68, 0.13],
  },
  dusk: {
    name: 'dusk',
    sky: sky4([[0, 0.45, 0.1, 296], [0.36, 0.61, 0.13, 338], [0.7, 0.76, 0.13, 28], [1, 0.87, 0.1, 66]]),
    haze: [0.75, 0.11, 22], ink: [0.27, 0.07, 310], gamma: 0.85, kappa: 0.55,
    disc: { c: [0.94, 0.085, 84], halo: [0.86, 0.12, 48] },
    rim: [0.88, 0.075, 48], accent: [0.82, 0.13, 60], sea: [0.7, 0.12, 18],
    mist: 0, windows: 0.35, stars: 5, clouds: 'streak', beam: 0,
    soft: [0.7, 0.11],
  },
  evening: {
    name: 'evening',
    sky: sky4([[0, 0.33, 0.08, 268], [0.45, 0.46, 0.09, 282], [0.8, 0.6, 0.085, 312], [1, 0.72, 0.09, 42]]),
    haze: [0.56, 0.07, 296], ink: [0.21, 0.05, 276], gamma: 0.95, kappa: 0.45,
    disc: { c: [0.94, 0.04, 92], halo: [0.72, 0.05, 285] },
    rim: [0.7, 0.04, 288], accent: [0.84, 0.13, 78], sea: [0.5, 0.075, 288],
    mist: 0, windows: 0.8, stars: 28, clouds: null, beam: 1,
    soft: [0.8, 0.05],
  },
  night: {
    name: 'night',
    sky: sky4([[0, 0.19, 0.045, 266], [0.5, 0.235, 0.055, 264], [0.85, 0.3, 0.06, 268], [1, 0.35, 0.06, 272]]),
    // the far range fades into the horizon's glow, the ground is the night's darkest: depth by colour even at night
    haze: [0.4, 0.06, 268], ink: [0.12, 0.035, 266], gamma: 1, kappa: 0.3,
    disc: { c: [0.92, 0.07, 92], halo: [0.42, 0.06, 262] },
    rim: [0.56, 0.035, 258], accent: [0.86, 0.12, 85], sea: [0.27, 0.05, 264],
    mist: 0, windows: 0.32, stars: 150, clouds: null, beam: 1,
    soft: [0.88, 0],
  },
};

/** A warm light (the lanterns' glow, the lit windows) keeps more of its colour than the paper: softer, never grey. */
const WARM_KEEP = 0.6;
/** A window's light (the mock's), before its hour softens it. */
const LIT: LCH = [0.9, 0.12, 84];
/**
 * The share of its softening a paper in the olive band (OLIVE, below) is spared: a yellow or a yellow-green greyed
 * reads as khaki — smog over the land (the golden hour's town and headland, its green hills) — so there the paper
 * stays nearer its own colour, the time's full k again 20° outside the band.
 */
const OLIVE_KEEP = 0.75;

/**
 * The owner (round 3): 「除了角色和卡片後面的這些背景的元素啊，是不是顏色要把它調淡一點呢？可能飽和度低一點點，這樣
 * 才不會太搶眼睛」. The scenery, quieter than the mock, so the puppets and the cards (whose colours never change) stand
 * out. A time's `soft: [k, lift]`: its ink — the nearest paper — moves `lift` of the way to the haze, so every layer
 * between (t = d^γ from the haze to the ink) is pulled that much toward the far air and the depth by colour keeps its
 * order; every colour keeps k of its chroma — the paper by `paperChroma` once mixed (an olive keeps more), the sky,
 * the disc and the rim light here. The sky keeps its upper lightness (the chrome's ink and the cream hero read on it)
 * and its low stop comes a little toward the horizon's glow; the warm lights soften by less (WARM_KEEP). The day hours
 * the most, the night the least (it keeps its depth: only a little greyer).
 */
export function softened(T: Time): Time & { lit: LCH } {
  const [k, lift] = T.soft ?? [1, 0];
  const grey = ([L, C, h]: LCH): LCH => [L, C * k, h];
  const warm = ([L, C, h]: LCH): LCH => [L, C * (1 - (1 - k) * WARM_KEEP), h];
  const toward = ([L, C, h]: LCH, L1: number, f: number, keep = k): LCH => [L + (L1 - L) * f, C * keep, h];
  const glow = T.sky[3][0];
  return {
    ...T,
    sky: [grey(T.sky[0]), grey(T.sky[1]), toward(T.sky[2], glow, lift * 0.5), grey(T.sky[3])],
    // the paper's own chroma is taken once it is mixed (paperChroma): the haze and the ink only move
    ink: toward(T.ink, T.haze[0], lift, 1),
    disc: { c: grey(T.disc.c), halo: toward(T.disc.halo, glow, lift * 0.5) },
    rim: grey(T.rim),
    accent: warm(T.accent),
    fly: T.fly ? grey(T.fly) : undefined,
    lit: warm(LIT),
  };
}

/** A paper's chroma under its time's softening: k of it, more inside the olive band (OLIVE_KEEP). */
export function paperChroma([L, C, h]: LCH, k: number): LCH {
  const out = Math.max(0, OLIVE[0] - h, h - OLIVE[1]);
  const w = out >= 20 ? 0 : 1 - out / 20;
  return [L, C * (k + (1 - k) * OLIVE_KEEP * w), h];
}

/** The palette keyframes, by hour of the day. */
export const KEYFRAMES: [number, keyof typeof TIMES][] = [
  [5.33, 'blueHour'],
  [6.17, 'sunrise'],
  [8.0, 'day'],
  [14.0, 'day'],
  [16.5, 'golden'],
  [17.0, 'sunset'],
  [17.5, 'dusk'],
  [19.5, 'evening'],
  [21.0, 'night'],
];

/**
 * The hour along the film (s in film seconds): piecewise linear, each hour tied to the segment it starts (round 3
 * slowed the film: the hours keep their places in their scenes).
 */
export const HOURS: [number, number][] = [
  [0, 5.33],
  [SEG.c1.t0, 6.17],
  [SEG.journey.t0, 8.0],
  [SEG.catch.t0, 11.0],
  [SEG.reply.t0, 14.5],
  [SEG.c2.t0, 16.5],
  [SEG.bridge.t0, 17.5],
  [SEG.c3.t0, 19.5],
  [SEG.yours.t0, 21],
  [FILM_END, 22.5],
];

export function hourAt(s: number): number {
  if (s <= HOURS[0][0]) return HOURS[0][1];
  for (let i = 1; i < HOURS.length; i++) {
    const [s1, h1] = HOURS[i];
    if (s <= s1) {
      const [s0, h0] = HOURS[i - 1];
      return h0 + ((s - s0) / (s1 - s0)) * (h1 - h0);
    }
  }
  return HOURS[HOURS.length - 1][1];
}

/** The layers, far → near: depth d (0 = the haze, 1 = the ink) and their own paper (C, h). */
export const LAYERS: { key: string; d: number; own: [number, number] }[] = [
  { key: 'range', d: 0.08, own: [0.015, 285] },
  { key: 'peaks', d: 0.2, own: [0.025, 270] },
  { key: 'headland', d: 0.34, own: [0.03, 250] },
  { key: 'town', d: 0.5, own: [0.05, 48] },
  { key: 'hills', d: 0.66, own: [0.045, 140] },
  { key: 'near', d: 0.82, own: [0.035, 150] },
  { key: 'ground', d: 1, own: [0, 0] },
];

/** The formula: t = d^γ; L, C linear and h the short way from haze to ink at t; plus κ·sin(πd) of the layer's own paper. */
export function layerColour(T: Time, layer: { d: number; own: [number, number] }): LCH {
  const t = layer.d ** T.gamma;
  const [L, C, h] = mixLch(T.haze, T.ink, t);
  const w = T.kappa * Math.sin(Math.PI * layer.d);
  const [, a, b] = lchToLab([L, C, h]);
  const [, oa, ob] = lchToLab([0, layer.own[0], layer.own[1]]);
  return labToLch([L, a + w * oa, b + w * ob]);
}

/** Everything a time paints, colours and numbers, before it is mixed with its neighbour. */
interface Paint {
  c: Record<string, LCH>;
  n: Record<string, number>;
}

function paintOf(mock: Time, dim: boolean): Paint {
  const T = softened(mock);
  const k = mock.soft?.[0] ?? 1;
  const P: Record<string, LCH> = {};
  for (const l of LAYERS) P[l.key] = paperChroma(layerColour(T, l), k);
  // the sea keeps its lightness (the darkest band under the sky, the depth a scene change keeps: c2)
  P.sea = paperChroma(mixLch(T.sea, P.peaks, 0.2), k);
  P.shade = mixLab(P.ground, [0.08, 0.02, P.ground[2]], 0.4);
  const night = T.ink[0] < 0.25;
  const c: Record<string, LCH> = {
    'sky-0': T.sky[0],
    'sky-1': T.sky[1],
    'sky-2': T.sky[2],
    'sky-3': T.sky[3],
    range: P.range,
    peaks: P.peaks,
    sea: P.sea,
    headland: P.headland,
    town: P.town,
    hills: P.hills,
    near: P.near,
    ground: P.ground,
    shade: P.shade,
    bridge: mixLch([0.9, 0.03, 85], T.ink, night ? 0.38 : 0.06),
    'bridge-pen': mixLab(P.near, T.ink, 0.4),
    rim: T.rim,
    accent: T.accent,
    roof: paperChroma(mixLab(P.town, [P.town[0] - 0.035, 0.1, 38], T.kappa * 0.55), k),
    tree: [P.hills[0] - 0.035, P.hills[1] + 0.015, P.hills[2]],
    canopy: [P.near[0] + 0.035, P.near[1] + 0.012, P.near[2]],
    'fold-lit': mixLab(P.peaks, T.disc.halo, 0.2),
    'fold-dark': mixLab(P.peaks, T.ink, 0.12),
    unlit: mixLab(P.town, T.ink, 0.22),
    lit: T.lit,
    lamp: mixLab(P.headland, T.disc.c, 0.3),
    mist: T.sky[2],
    'sea-line': mixLab(P.sea, T.sky[3], 0.6),
    pencil: mixLab(P.ground, T.rim, 0.3),
    'ground-rim': mixLab(P.ground, T.rim, 0.45),
    speck: mixLab(P.ground, [0.12, 0.02, P.ground[2]], 0.5),
    fringe: [P.ground[0] * 0.7, P.ground[1] * 0.9, P.ground[2]],
    disc: T.disc.c,
    halo: T.disc.halo,
    'cloud-front': mixLab(T.sky[2], [0.985, 0.01, 90], 0.6),
    'cloud-back': mixLab(T.sky[1], T.sky[2], 0.6),
    streak: mixLab(mixLab(T.disc.halo, T.sky[1], 0.4), [0.98, 0.02, 80], 0.25),
    // a paper bird against the bright sky: the near paper's tone (its lit wing paler), never a white tick
    bird: mixLab(P.hills, T.ink, 0.3),
    wind: mixLab(T.rim, T.accent, 0.22),
  };
  const n: Record<string, number> = {
    windows: T.windows,
    stars: Math.min(1, Math.sqrt(T.stars / 150)),
    mist: T.mist,
    beam: T.beam,
    sliver: night ? 0.3 : 0.22,
    puff: T.clouds === 'puff' ? 1 : 0,
    streak: T.clouds === 'streak' ? 1 : 0,
    night: night ? 1 : 0,
  };
  const [dL, dC] = T.dark ?? [0.92, 0.9];
  if (dim) {
    // a dimmer day for a dark room: the sky and the paper ×0.92 (the sky's chroma ×0.9; the bright hours ×0.82 and
    // ×0.85, the paper's chroma too), the night's top at L 0.145
    const paperC = T.dark ? dC : 1;
    for (const k of Object.keys(c)) {
      if (k.startsWith('sky-')) c[k] = [c[k][0] * dL, c[k][1] * dC, c[k][2]];
      else if (LAYERS.some((l) => l.key === k) || ['sea', 'shade', 'roof', 'tree', 'canopy', 'fold-lit', 'fold-dark', 'unlit', 'fringe', 'bridge', 'mist'].includes(k)) {
        c[k] = [c[k][0] * dL, c[k][1] * paperC, c[k][2]];
      }
    }
    if (night) c['sky-0'] = [0.145, c['sky-0'][1], c['sky-0'][2]];
  }
  // the haze a flat flown into the sky pales into (a scene change's `haze`): the wash at 0.68 of the horizon's height,
  // where the flown flats are gone
  c.fly = T.fly ? (dim ? [T.fly[0] * dL, T.fly[1] * dC, T.fly[2]] : T.fly) : mixLab(c['sky-1'], c['sky-2'], 0.5);
  // and the backdrop's (the far range and peaks, low over the horizon): the wash at 0.88 of its height
  c['fly-low'] = mixLab(c['sky-2'], c['sky-3'], 0.4);
  return { c, n };
}

/** The olive band: a paper hue in it reads as khaki, as smog over the land. */
const OLIVE: [number, number] = [90, 160];
/** How many degrees a hue path (from h, dh degrees, signed) spends inside the olive band. */
function inOlive(h: number, dh: number): number {
  let n = 0;
  const step = dh / 64;
  for (let i = 0; i < 64; i++) {
    const x = (((h + step * (i + 0.5)) % 360) + 360) % 360;
    if (x >= OLIVE[0] && x <= OLIVE[1]) n += Math.abs(step);
  }
  return n;
}

/** The sky's washes (and what is painted in them): far apart, they mix through the pale haze a real sky passes through. */
const SKY_KEYS = new Set(['fly', 'fly-low', 'mist', 'halo', 'cloud-front', 'cloud-back', 'streak', 'sea-line']);

/**
 * Between two keyframes: the short way round the hue (no grey between dusk and night) — unless the two hues are more
 * than 120° apart, where the short way would pass through a third colour (a day's blue to the golden hour's yellow
 * through green). Then the sky's washes mix in OKLab, through the pale haze a real sky passes through; the paper
 * (`paper`: the land, the sea, the town) keeps its colour — no paper ever greys into one khaki sheet between two
 * hours — and goes round the hue the way that spends the least of it in the olive band (the day's blue range to the
 * golden hour's apricot through mauve, the golden hour's green hills to the sunset's plum through a cool blue).
 */
export function mixKey(a: LCH, b: LCH, t: number, paper = false): LCH {
  const d = ((b[2] - a[2] + 540) % 360) - 180;
  if (Math.abs(d) <= 120 || a[1] <= 0.005 || b[1] <= 0.005) return mixLch(a, b, t);
  if (!paper) return mixLab(a, b, t);
  const other = d > 0 ? d - 360 : d + 360;
  const dh = inOlive(a[2], other) < inOlive(a[2], d) ? other : d;
  // a long sweep dims its chroma a little on the way (a slate, not a cobalt, between the green and the plum)
  const C = (a[1] + (b[1] - a[1]) * t) * (1 - 0.4 * Math.sin(Math.PI * t));
  return [a[0] + (b[0] - a[0]) * t, C, (((a[2] + dh * t) % 360) + 360) % 360];
}

function mixPaint(a: Paint, b: Paint, t: number): Paint {
  const c: Record<string, LCH> = {};
  const n: Record<string, number> = {};
  for (const k of Object.keys(a.c)) c[k] = mixKey(a.c[k], b.c[k], t, !k.startsWith('sky-') && !SKY_KEYS.has(k));
  for (const k of Object.keys(a.n)) n[k] = a.n[k] + (b.n[k] - a.n[k]) * t;
  return { c, n };
}

const paintMemo = new Map<string, Paint>();
function keyPaint(name: string, dim: boolean): Paint {
  const k = `${name}:${dim}`;
  let p = paintMemo.get(k);
  if (!p) {
    p = paintOf(TIMES[name], dim);
    paintMemo.set(k, p);
  }
  return p;
}

/** The paint of an hour: its two keyframes mixed. */
export function paintAt(h: number, dim = false): Paint {
  if (h <= KEYFRAMES[0][0]) return keyPaint(KEYFRAMES[0][1], dim);
  for (let i = 1; i < KEYFRAMES.length; i++) {
    const [h1, n1] = KEYFRAMES[i];
    if (h <= h1) {
      const [h0, n0] = KEYFRAMES[i - 1];
      const t = h1 === h0 ? 1 : (h - h0) / (h1 - h0);
      return mixPaint(keyPaint(n0, dim), keyPaint(n1, dim), t);
    }
  }
  return keyPaint(KEYFRAMES[KEYFRAMES.length - 1][1], dim);
}

export const CREAM: LCH = [0.97, 0.015, 85];
export const GRAPHITE: LCH = [0.25, 0.03, 280];

/** The chrome's ink over a sky top: whichever of cream and graphite reads better on it. */
export function chromeInk(skyTop: LCH): LCH {
  return contrast(CREAM, skyTop) >= contrast(GRAPHITE, skyTop) ? CREAM : GRAPHITE;
}

/** The stage's CSS variables for an hour. */
export function paletteAt(h: number, { dim = false }: { dim?: boolean } = {}): Record<string, string> {
  const P = paintAt(h, dim);
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(P.c)) out[k.startsWith('sky-') ? `--film-${k}` : `--film-c-${k}`] = css(v);
  const w = P.n.windows;
  for (let b = 0; b < 5; b++) out[`--film-win-${b}`] = Math.min(1, Math.max(0, (w - b / 5) * 5)).toFixed(3);
  out['--film-stars'] = P.n.stars.toFixed(3);
  out['--film-mist'] = P.n.mist.toFixed(3);
  out['--film-beam'] = P.n.beam.toFixed(3);
  out['--film-sliver'] = P.n.sliver.toFixed(3);
  out['--film-cloud-puff'] = P.n.puff.toFixed(3);
  out['--film-cloud-streak'] = P.n.streak.toFixed(3);
  out['--film-night'] = P.n.night.toFixed(3);
  out['--film-c-window'] = css(P.c.lit);
  const ink = chromeInk(P.c['sky-0']);
  out['--film-chrome-ink'] = css(ink);
  out['--film-chrome-ink-soft'] = css(ink, 0.72);
  return out;
}

/** The colour of the sky wash at `f` of the horizon's height (0 = top), as the gradient draws it (in OKLab). */
export function skyAt(h: number, f: number, dim = false): LCH {
  const P = paintAt(h, dim);
  const stops: [number, LCH][] = [[0, P.c['sky-0']], [0.55, P.c['sky-1']], [0.8, P.c['sky-2']], [1, P.c['sky-3']]];
  if (f <= 0) return stops[0][1];
  for (let i = 1; i < stops.length; i++) {
    if (f <= stops[i][0]) {
      const [f0, c0] = stops[i - 1];
      const [f1, c1] = stops[i];
      return mixLab(c0, c1, (f - f0) / (f1 - f0));
    }
  }
  return stops[3][1];
}

/** The CSS text of a palette as one rule (the server's s = 0 block, a plate's hour). */
export function paletteCss(vars: Record<string, string>): string {
  return Object.entries(vars)
    .map(([k, v]) => `${k}:${v}`)
    .join(';');
}
