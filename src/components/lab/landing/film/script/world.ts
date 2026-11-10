/**
 * The film's three places, cut from paper: the art mock's geometry (mocks/palettes.html, its seeds) shifted +200 into a
 * world 2000 units wide and 1400 tall (the ground at y ≈ 885, the sea's top at 600, the horizon 614), each plane of
 * each place as a list of parts. Colours are never written here: a part names its paint (`ff-<paint>`, a class the
 * stage maps to a `--film-c-*` variable), so the hours recolour the same paper. Pure and seeded: the server draws the
 * symbols from it, the runtime asks it where the ground is.
 *
 * Places: `home` (scenes 1 and 4: the mock's place), `journey` (scene 2: home mirrored, its nearer planes tiled twice
 * along a 4000-unit road, the lone tree placed so it stands beside 聆聆 when the camera arrives), `valley` (scene 3:
 * home's far layers, sea, town and hills; two banks, a river and an arched bridge over it).
 */
import { DX, HOME, JOURNEY_GROUND, VALLEY_LEFT, VALLEY_LEFT_T, VALLEY_RIGHT, VALLEY_RIGHT_T, WALK, groundEdge, mirrorX, tileKeys, walkwayAt, within, type PlaceId } from './ground';
import { closeDown, ellipse, path, peaks, poly, ribbon, rng, spline, tear, yAt, type Peak, type Pt } from './geom';
import { lerp } from './timeline';

export type { PlaceId };
export type PlaneId = 'range' | 'peaks' | 'sea' | 'headland' | 'town' | 'hills' | 'near' | 'bridge' | 'ground';

/** Far to near. Depth < 0.35 is the backdrop (it barely moves in a change). */
export const PLANE_DEPTH: Record<PlaneId, number> = {
  range: 0.08,
  peaks: 0.2,
  sea: 0.27,
  headland: 0.34,
  town: 0.5,
  hills: 0.66,
  near: 0.82,
  bridge: 0.9,
  ground: 1,
};
export const PLANE_ORDER: PlaneId[] = ['range', 'peaks', 'sea', 'headland', 'town', 'hills', 'near', 'bridge', 'ground'];
export const FRINGE_DEPTH = 1.3;

/** World constants (units). */
export const GROUND_Y = 885;
export const SEA_TOP = 600;
export const HORIZON = 614;
/** The top of the far range: the world's top as the layout reserves room for it. */
export const WORLD_TOP = 370;
/** How deep the backdrop's paper runs (it barely moves in a change, so it must reach past the stage's foot). */
export const WORLD_BOTTOM = 1400;
/**
 * Where a flat's paper ends: a torn foot just below the stage at rest (on every layout, toolbars hidden or not), so a
 * flat lifting away in a change reads as a strip of paper with two torn edges — never as a block cut by the screen.
 */
export const FLAT_BOTTOM = 1190;

/** A part of a plane: a path and how it is painted (`ff-*` fill / `fs-*` stroke classes), its opacity a variable. */
export interface ArtPart {
  d: string;
  /** Paint classes, space separated: `ff-range`, `ff-roof`, `fs-sea-line`… (see World.tsx). */
  cls: string;
  /** An opacity variable (`--film-win-2`…) or a number. */
  op?: string | number;
}

export interface PlaneArt {
  id: PlaneId;
  /** Drawn by another place's group (the valley reuses home's far planes). */
  src?: PlaceId;
  /** On a tall screen, drawn by this place's group of the same plane instead (the valley's narrower bridge). */
  tall?: PlaceId;
  depth: number;
  /** Where its paper ends (world y): a torn foot, hidden behind the nearer flats at rest. */
  foot: number;
  /** The plane's extent in its own (world) x. */
  x0: number;
  w: number;
  parts: ArtPart[];
  /**
   * The top edges of its paper (x ascending): where its art stands. A cut-out (a scene change flying it free) keeps
   * what is above the topmost of them plus a short torn foot (`cutEdge`). None: it has no cut-out (the bridge).
   */
  edges?: Pt[][];
}

export interface PlaceArt {
  id: PlaceId;
  planes: PlaneArt[];
  /** The ground's edge the puppets stand on (x ascending), and where its paper's top is at x. */
  groundEdge: Pt[];
  /** The bridge's walkway (valley only), x ascending: (600, 880) → (1000, 835) → (1400, 880) (ground.ts walkwayAt). */
  walkway?: Pt[];
  /** Where the sun lights the peaks' faces from (world x): which fold is lit. */
  sunX: number;
}

/* ───────────── the building blocks (each the mock's, parameterised) ───────────── */

const D = (pts: Pt[], d = 0) => path(pts, true, d);

/** A flat's paper: its top edge, down its sides to a torn foot at FLAT_BOTTOM. */
function strip(edge: Pt[], seed: number, bottom = FLAT_BOTTOM): Pt[] {
  const x0 = edge[0][0];
  const x1 = edge[edge.length - 1][0];
  const foot = tear(poly([[x1 + 4, bottom - 6], [x0 - 4, bottom + 4]], 22, false), seed + 7000, { jag: 2.4, wander: 10, closed: false });
  return [...edge, ...foot];
}

/**
 * Each flat's foot: just deep enough to stay behind the nearer flats at rest (the ground's runs past the stage), so in
 * a change the flats lift away as separate bands of paper with the backdrop showing between them.
 */
export const FOOT = { headland: 670, town: 860, hills: 1000, near: 990, bridge: 975, ground: FLAT_BOTTOM, back: WORLD_BOTTOM } as const;

/* ───────────── the cut-out foot (a scene change may fly a plane free of its paper below) ───────────── */

/**
 * How far a plane's cut-out foot hangs under its topmost drawn edge (world units): deep enough to keep what stands on
 * the edge (the houses' bodies, the trunks, the river under the valley's floor, the sea's lines), short enough to
 * read as a strip of torn paper, never a slab.
 */
export const CUT_DEPTH: Record<PlaneId, number> = { range: 44, peaks: 44, sea: 128, headland: 60, town: 56, hills: 56, near: 56, bridge: 0, ground: 60 };
/** The runtime's samples of a cut-out foot (world units apart), for the director's pivots and the styles' info. */
export const CUT_STEP = 100;

/** A level edge across a plane (the backdrop's horizon, the sea's top). */
const level = (x0: number, w: number, y: number): Pt[] => [
  [x0, y],
  [x0 + w, y],
];

/**
 * The cut-out's foot, untorn (x ascending, every 24 units across the plane): under the topmost of its edges at each x
 * (the paper that shows there) by CUT_DEPTH; where no edge reaches, the nearest one's end held.
 */
function cutLine(plane: PlaneArt): Pt[] | null {
  const edges = plane.edges;
  if (!edges?.length || !CUT_DEPTH[plane.id]) return null;
  const out: Pt[] = [];
  const x1 = plane.x0 + plane.w;
  for (let x = plane.x0 - 40; x <= x1 + 40 + 1e-6; x += 24) {
    let top = Infinity;
    let near = Infinity;
    let nearY = 0;
    for (const e of edges) {
      const a = e[0][0];
      const b = e[e.length - 1][0];
      if (x >= a && x <= b) top = Math.min(top, yAt(e, x));
      else {
        const d = x < a ? a - x : x - b;
        if (d < near) {
          near = d;
          nearY = x < a ? e[0][1] : e[e.length - 1][1];
        }
      }
    }
    out.push([x, (top === Infinity ? nearY : top) + CUT_DEPTH[plane.id]]);
  }
  return out;
}

/** The cut-out as a clip (world units): everything above the torn foot. Null: the plane has no cut-out. */
export function cutClip(plane: PlaneArt, seed: number): string | null {
  const line = cutLine(plane);
  if (!line) return null;
  const torn = tear(line, seed, { jag: 2.4, wander: 9, amp: 3, closed: false });
  const first = torn[0];
  const last = torn[torn.length - 1];
  return path([[first[0], -600], [last[0], -600], ...[...torn].reverse(), [first[0], first[1]]], true, 0);
}

/** The cut-out's foot sampled every CUT_STEP units from the plane's x0 (whole units), for the runtime. */
export function cutSamples(plane: PlaneArt): number[] | null {
  const line = cutLine(plane);
  if (!line) return null;
  const out: number[] = [];
  for (let x = plane.x0; x <= plane.x0 + plane.w + 1e-6; x += CUT_STEP) out.push(Math.round(yAt(line, x)));
  return out;
}

/* ───────────── the silhouette at rest (a scene change may fly a middle flat free as the piece one saw) ───────────── */

/** How far under the nearer planes' edges a `rest` cut-out's torn foot runs (world units): past any tear's wander. */
export const REST_MARGIN = 30;
/** The planes a `rest` cut-out is drawn for: the middle flats (the backdrop, the bridge and the ground have none). */
export const REST_PLANES: readonly PlaneId[] = ['headland', 'town', 'hills', 'near'];
/** The places whose sets have `rest` cut-outs (the ones a style flies away whole; elsewhere `rest` draws as paper). */
export const REST_PLACES: readonly PlaceId[] = ['home', 'journey'];
/**
 * The cameras a place's set is flown from, as offsets from its camera at rest (world units): home from where it rests;
 * the journey from where its camera comes to rest (marks.ts `journeyCamEnd`, about 2155 units on a wide screen and
 * 2440 on a tall one), its nearer planes panned against each middle flat by then (offset × their depths' difference).
 * A `rest` foot runs under the nearer edges as every one of these cameras shows them (and at rest too).
 */
export const REST_PANS: Partial<Record<PlaceId, readonly number[]>> = { journey: [0, 2155, 2440] };

/**
 * A middle flat's silhouette as its place shows it at rest (a scene change's `rest` foot): everything above the nearer
 * planes' top edges plus REST_MARGIN, torn, never deeper than its paper. Switching a set's planes to it at rest changes
 * nothing on screen (each foot is behind the paper in front of it; the ground's `cut` foot runs deeper than the margin),
 * and a flat flown free is exactly the piece one saw — a hill down to the ground's line, never its slab, its ends
 * tapering where the plane in front hid them. Null: not a middle flat, or nothing nearer has edges.
 */
export function restClip(place: PlaceArt, plane: PlaneArt, seed: number): string | null {
  if (!REST_PLANES.includes(plane.id) || !plane.edges?.length) return null;
  const i = place.planes.indexOf(plane);
  const nearerPlanes = place.planes.slice(i + 1).filter((pl) => pl.edges?.length);
  const nearer = nearerPlanes.flatMap((pl) => pl.edges ?? []);
  if (i < 0 || !nearer.length) return null;
  // the cameras its set is flown from (REST_PANS): the foot runs under the nearer edges as each of them shows them
  const pans = REST_PANS[place.id] ?? [0];
  const line: Pt[] = [];
  const x1 = plane.x0 + plane.w;
  for (let x = plane.x0 - 40; x <= x1 + 40 + 1e-6; x += 20) {
    let deepest = -Infinity;
    for (const pan of pans) {
      let env = Infinity;
      for (const pl of nearerPlanes) {
        const xq = x + pan * (pl.depth - plane.depth);
        for (const e of pl.edges!) if (xq >= e[0][0] && xq <= e[e.length - 1][0]) env = Math.min(env, yAt(e, xq));
      }
      deepest = Math.max(deepest, env);
    }
    line.push([x, Math.min(plane.foot + 20, deepest + REST_MARGIN)]);
  }
  const torn = tear(line, seed, { jag: 2.4, wander: 9, amp: 3, closed: false });
  const first = torn[0];
  const last = torn[torn.length - 1];
  return path([[first[0], -600], [last[0], -600], ...[...torn].reverse(), [first[0], first[1]]], true, 0);
}

/**
 * Grass on the ground's edge: little clusters of two or three short blades (3–8 units), leaning together, at uneven
 * intervals — never one tall spike every few steps.
 */
function tufts(edge: Pt[], seed: number): string {
  const r = rng(seed);
  const x0 = edge[0][0];
  const x1 = edge[edge.length - 1][0];
  let d = '';
  for (let x = x0 + 12; x < x1; x += 30 + r() * 70) {
    if (r() > 0.55) continue;
    const y = yAt(edge, x) + 1.6;
    const n = 2 + (r() < 0.45 ? 1 : 0);
    const lean0 = (r() - 0.5) * 1.8;
    for (let k = 0; k < n; k++) {
      const off = k - (n - 1) / 2;
      const bx = x + off * (2.4 + r() * 1.4);
      const h = 3 + r() * 5;
      const lean = (lean0 + off * 0.7 + (r() - 0.5) * 0.6) * h * 0.42;
      const w = 1 + r() * 0.8;
      d += `M${(bx - w).toFixed(1)},${y.toFixed(1)}Q${(bx + lean * 0.35 - w * 0.25).toFixed(1)},${(y - h * 0.6).toFixed(1)} ${(bx + lean).toFixed(1)},${(y - h).toFixed(1)}Q${(bx + lean * 0.35 + w * 0.35).toFixed(1)},${(y - h * 0.45).toFixed(1)} ${(bx + w).toFixed(1)},${y.toFixed(1)}Z`;
    }
  }
  return d;
}

function peakParts(list: Peak[], paint: string, jag: number, wander: number, sunX: number, folds: boolean): ArtPart[] {
  const out: ArtPart[] = [];
  let body = '';
  let lit = '';
  let dark = '';
  for (const p of list) {
    body += D(tear(poly(p.pts, 15, false).concat([[p.pts[4][0], WORLD_BOTTOM], [p.pts[0][0], WORLD_BOTTOM]]), p.seed, { jag, wander }), 0);
    if (!folds) continue;
    const s = sunX < p.cx ? -1 : 1;
    const [L, ls, top, rs, R] = p.pts;
    const foot: Pt = [top[0] + s * p.hw * 0.08, HORIZON];
    lit += D(s < 0 ? [top, ls, L, foot] : [top, rs, R, foot], 0);
    dark += D(s < 0 ? [top, rs, R, foot] : [top, ls, L, foot], 0);
  }
  out.push({ d: body, cls: paint });
  if (folds) {
    out.push({ d: lit, cls: 'ff-fold-lit' });
    out.push({ d: dark, cls: 'ff-fold-dark' });
  }
  return out;
}

interface House {
  body: Pt[];
  roof: Pt[];
}
interface Win {
  x: number;
  y: number;
  w: number;
  h: number;
  on: number;
}

/**
 * The paper town along its hill (round 4, the owner: 「房子就有一點複雜」): a short row of plain gabled houses — a body
 * in the hill's own paper, a roof, one window (two on a wide one) that lights in its turn. No towers, no flat roofs, no
 * unlit panes, no glow.
 */
function town(hill: Pt[], seed: number, xFrom: number, xTo: number): { houses: House[]; windows: Win[] } {
  const r = rng(seed);
  const houses: House[] = [];
  const windows: Win[] = [];
  let x = xFrom;
  while (x < xTo) {
    const w = 46 + r() * 34;
    const h = 30 + r() * 24;
    const rh = 20 + r() * 14;
    const yb = Math.min(yAt(hill, x), yAt(hill, x + w)) + 8;
    houses.push({
      body: [[x, yb + 30], [x, yb - h], [x + w, yb - h], [x + w, yb + 30]],
      roof: [[x - 5, yb - h + 1], [x + w / 2, yb - h - rh], [x + w + 5, yb - h + 1]],
    });
    const n = w > 66 ? 2 : 1;
    for (let c = 0; c < n; c++) windows.push({ x: x + (w * (c + 1)) / (n + 1) - 5, y: yb - h + Math.max(7, 0.3 * h), w: 10, h: 12, on: r() });
    x += w + 12 + r() * 30;
  }
  return { houses, windows };
}

function townParts(hill: Pt[], t: { houses: House[]; windows: Win[] }, seed: number): ArtPart[] {
  const out: ArtPart[] = [];
  out.push({ d: D(strip(hill, seed, FOOT.town)), cls: 'ff-town' });
  out.push({ d: t.houses.map((h) => D(h.body)).join(''), cls: 'ff-town' });
  out.push({ d: t.houses.map((h) => D(h.roof)).join(''), cls: 'ff-roof' });
  const rect = (w: Win) => `M${w.x.toFixed(1)},${w.y.toFixed(1)}h${w.w}v${w.h}h-${w.w}Z`;
  for (let b = 0; b < 5; b++) {
    const lit = t.windows.filter((w) => Math.min(4, Math.floor(w.on * 5)) === b);
    if (lit.length) out.push({ d: lit.map(rect).join(''), cls: 'ff-lit', op: `var(--film-win-${b})` });
  }
  return out;
}

interface Tree {
  x: number;
  y: number;
  kind: 'cypress' | 'round';
  s: number;
  seed: number;
}

function trees(edge: Pt[], seed: number, from: number, to: number, gap: [number, number] | null): Tree[] {
  const rt = rng(seed);
  const out: Tree[] = [];
  for (let tx = from; tx < to; tx += 22 + rt() * 64) {
    if (gap && tx > gap[0] && tx < gap[1] && rt() < 0.7) continue;
    const y = yAt(edge, tx) + 5;
    const kind = rt() < 0.35 ? 'cypress' : 'round';
    const s = 0.9 + rt() * 0.7;
    out.push({ x: tx, y, kind, s, seed: 400 + Math.floor(tx) });
  }
  return out;
}

function treeParts(list: Tree[]): string {
  return list
    .map((t) => {
      if (t.kind === 'cypress') return D(tear(ellipse(t.x, t.y - 28 * t.s, 7.5 * t.s, 30 * t.s, 12), t.seed, { jag: 0.6, wander: 1.5 }));
      return `M${Math.round(t.x - 1.6)},${Math.round(t.y - 20 * t.s)}h3v${Math.round(20 * t.s)}h-3Z` + D(tear(ellipse(t.x, t.y - 28 * t.s, 16 * t.s, 14 * t.s, 13), t.seed, { jag: 0.8, wander: 2 }));
    })
    .join('');
}

/** The lone tree on the near hill: its trunk and five torn canopies (the mock's, at `dx`). */
function loneTree(dx: number, flip = false): string {
  const f = (x: number) => (flip ? -x : x);
  const trunk: Pt[] = [[204, 620], [208, 566], [214, 524], [226, 488], [238, 470], [246, 474], [234, 494], [224, 530], [220, 570], [222, 620]].map(([x, y]): Pt => [dx + f(x), y]);
  const canopy = [[240, 420, 74, 50], [178, 444, 50, 36], [302, 448, 54, 36], [250, 390, 46, 32], [206, 410, 40, 28]].map(([x, y, rx, ry], i) =>
    D(tear(ellipse(dx + f(x), y, rx, ry, 30), 960 + i, { jag: 1.6, wander: 5 })),
  );
  return D(tear(spline(trunk, 4), 1203, { jag: 0.5, wander: 1 })) + canopy.join('');
}

/* ───────────── the places ───────────── */

function groundShape(keys: Pt[], tuftSeed: number, tornSeed: number): { edge: Pt[]; torn: Pt[]; tufts: string } {
  const g = spline(keys, 9, false);
  const torn = tear(g, tornSeed, { jag: 0.8, wander: 2.4, amp: 2, closed: false });
  return { edge: g, torn, tufts: tufts(torn, tuftSeed) };
}

function seaParts(x0: number, w: number, mist: boolean): ArtPart[] {
  const r = rng(41);
  for (let i = 0; i < 30; i++) r(); // the mock drew its sun strips from this first
  let lines = '';
  for (let i = 0; i < 9; i++) {
    const y = SEA_TOP + 26 + i * 12;
    const x = x0 + r() * w;
    lines += `M${x.toFixed(0)},${y}h${(50 + r() * 120).toFixed(0)}`;
  }
  const out: ArtPart[] = [
    { d: `M${x0},${SEA_TOP}h${w}V${WORLD_BOTTOM}H${x0}Z`, cls: 'ff-sea' },
    { d: lines, cls: 'fs-sea-line fx-ns' },
  ];
  if (mist) {
    out.push({
      d: D(tear(ribbon(spline([[-420, 612], [-80, 616], [300, 604], [700, 618], [1100, 606], [1680, 614], [2000, 610]].map(([x, y]): Pt => [x + DX, y]), 20, false), 34, 0.3), 71, { jag: 1, wander: 6 })),
      cls: 'ff-mist',
      op: 'var(--film-mist)',
    });
  }
  return out;
}

function headlandParts(shore: Pt[], head: Pt[], lighthouseX: number | null): ArtPart[] {
  let d = D(closeDown(shore, 612)) + D(closeDown(head, 660));
  if (lighthouseX == null) return [{ d, cls: 'ff-headland' }];
  const lx = lighthouseX - 1415;
  d += D(poly([[1404, 548], [1426, 548], [1422, 486], [1428, 482], [1415, 462], [1402, 482], [1408, 486]].map(([x, y]): Pt => [x + lx, y]), 3));
  return [
    { d, cls: 'ff-headland' },
    // the lamp, lit from the evening (and at the blue hour, still on): a warm glow round it (a radial gradient, no
    // filter), the glass itself the lit windows' warm light over its daytime grey
    { d: `M${lighthouseX - 6},472h12v7h-12Z`, cls: 'ff-lamp' },
    { d: `M${lighthouseX - 52},475.5a52,52 0 1 0 104,0a52,52 0 1 0 -104,0Z`, cls: 'ff-lamp-glow', op: 'var(--film-beam)' },
    { d: `M${lighthouseX - 6},472h12v7h-12Z`, cls: 'ff-lit', op: 'var(--film-beam)' },
  ];
}

function homeArt(): PlaceArt {
  const sunX = 1500;
  const range = [...peaks(11, -120, 1720, HORIZON, 120, 230, 7), ...peaks(12, -560, -160, HORIZON, 110, 200, 2), ...peaks(13, 1760, 2160, HORIZON, 110, 210, 2)].map((p) => shiftPeak(p, DX));
  const pk = [...peaks(23, -120, 1720, HORIZON, 50, 120, 11), ...peaks(24, -560, -150, HORIZON, 50, 110, 3), ...peaks(25, 1740, 2160, HORIZON, 50, 110, 3)].map((p) => shiftPeak(p, DX));
  const townHill = spline(HOME.townHill, 10, false);
  const tw = town(townHill, 77, 880 + DX, 1500 + DX);
  const hills = spline(HOME.hills, 10, false);
  const tr = [...trees(hills, 91, -20 + DX, 1660 + DX, [640 + DX, 980 + DX]), ...trees(hills, 92, -300, 180, null), ...trees(hills, 93, 1880, 2300, null)];
  const near = tear(spline(HOME.near, 9, false), 1201, { jag: 1.2, wander: 4, closed: false });
  const nearR = tear(spline(HOME.nearRight, 9, false), 1202, { jag: 1.2, wander: 4, closed: false });
  const gr = groundShape(HOME.ground, 53, 1301);
  const x0 = -260;
  const w = 2520;
  const shore = spline(HOME.shore, 7, false);
  const head = spline(HOME.headland, 7, false);
  return {
    id: 'home',
    sunX,
    groundEdge: gr.edge.map(([x, y]): Pt => [x, y + 5]),
    planes: [
      { id: 'range', depth: PLANE_DEPTH.range, foot: FOOT.back, x0, w, parts: peakParts(range, 'ff-range', 0.8, 3, sunX, false), edges: [level(x0, w, HORIZON)] },
      { id: 'peaks', depth: PLANE_DEPTH.peaks, foot: FOOT.back, x0, w, parts: peakParts(pk, 'ff-peaks', 0.7, 2.5, sunX, true), edges: [level(x0, w, HORIZON)] },
      { id: 'sea', depth: PLANE_DEPTH.sea, foot: FOOT.back, x0, w, parts: seaParts(x0, w, true), edges: [level(x0, w, SEA_TOP)] },
      { id: 'headland', depth: PLANE_DEPTH.headland, foot: FOOT.headland, x0, w, parts: headlandParts(shore, head, 1415 + DX), edges: [shore, head] },
      { id: 'town', depth: PLANE_DEPTH.town, foot: FOOT.town, x0, w, parts: townParts(townHill, tw, 1601), edges: [townHill] },
      { id: 'hills', depth: PLANE_DEPTH.hills, foot: FOOT.hills, x0, w, parts: hillsParts(hills, tr, 1701), edges: [hills] },
      { id: 'near', depth: PLANE_DEPTH.near, foot: FOOT.near, x0, w, parts: nearParts([near, nearR], loneTree(DX), 1801, 'ff-canopy ff-lonetree'), edges: [near, nearR] },
      { id: 'ground', depth: PLANE_DEPTH.ground, foot: FOOT.ground, x0, w, parts: groundParts(gr, 1901), edges: [gr.torn] },
    ],
  };
}

function shiftPeak(p: Peak, dx: number): Peak {
  return { ...p, cx: p.cx + dx, top: [p.top[0] + dx, p.top[1]], pts: p.pts.map(([x, y]): Pt => [x + dx, y]) };
}

function hillsParts(edge: Pt[], tr: Tree[], seed: number): ArtPart[] {
  return [{ d: D(strip(edge, seed, FOOT.hills)), cls: 'ff-hills' }, { d: treeParts(tr), cls: 'ff-tree' }];
}

function nearParts(edges: Pt[][], tree: string, seed: number, treeCls = 'ff-canopy'): ArtPart[] {
  const out: ArtPart[] = [];
  edges.forEach((e, i) => {
    out.push({ d: D(strip(e, seed + i, FOOT.near)), cls: 'ff-near' });
  });
  if (tree) out.push({ d: tree, cls: treeCls });
  return out;
}

function groundParts(gr: { edge: Pt[]; torn: Pt[]; tufts: string }, seed: number): ArtPart[] {
  return [{ d: D(strip(gr.torn, seed)), cls: 'ff-ground' }, { d: gr.tufts, cls: 'ff-ground' }];
}

/** A small round fleck (an ellipse as two arcs: a few bytes). */
const dot = (x: number, y: number, rx: number, ry = rx) =>
  `M${(x - rx).toFixed(1)},${y.toFixed(1)}a${rx.toFixed(1)},${ry.toFixed(1)} 0 1 0 ${(2 * rx).toFixed(1)},0a${rx.toFixed(1)},${ry.toFixed(1)} 0 1 0 ${(-2 * rx).toFixed(1)},0Z`;

/**
 * The road's foreground on its near hills (scene 2): a footpath worn across each slope (a ribbon of paler paper, winding
 * down toward the viewer and widening as it comes) and a few clusters of paper flowers in the grass — so a phone, whose
 * lower half the near slope fills for the whole journey, sees a hillside walked through rather than a plain green sheet.
 * (Round 4: the fence is gone, the flowers are half as many.)
 */
function roadside(edge: Pt[], seed: number): ArtPart[] {
  const r = rng(seed);
  const x0 = edge[0][0];
  const x1 = edge[edge.length - 1][0];
  const span = x1 - x0;
  // the path: from the brow's low shoulder across and down the slope, meandering
  const line: Pt[] = [];
  for (let i = 0; i <= 40; i++) {
    const t = i / 40;
    const x = x0 + span * (0.12 + 0.8 * t);
    const top = yAt(edge, x);
    const y = Math.min(905, top + 40 + (905 - top - 40) * t ** 1.3) + 9 * Math.sin(t * Math.PI * 3 + r());
    line.push([x, y]);
  }
  const trail = path(tear(ribbon(line, 22, 0.35), seed + 1, { amp: 1, jag: 0.4, wander: 1.6 }), true, 1);
  // flowers: little clusters in the grass, nearer ones larger
  let warm = '';
  let pale = '';
  for (let k = 0; k < 8; k++) {
    const x = x0 + span * (0.08 + 0.86 * r());
    const top = yAt(edge, x);
    const t = 0.15 + 0.8 * r();
    const y = top + 18 + (905 - top - 18) * t;
    const size = 1.8 + 2.2 * t;
    const n = 3 + Math.floor(r() * 2);
    for (let i = 0; i < n; i++) {
      const d = dot(x + (r() - 0.5) * 7 * size, y + (r() - 0.5) * 3 * size, size, size * 0.8);
      if ((k + i) % 3 === 0) warm += d;
      else pale += d;
    }
  }
  return [
    { d: trail, cls: 'ff-trail' },
    { d: pale, cls: 'ff-flower' },
    { d: warm, cls: 'ff-flower-warm' },
  ];
}

/** Scene 2's road: home mirrored, the nearer planes tiled twice (period 2000), the far ones 2600 wide. */
const JOURNEY_PERIOD = 2000;
/** The near plane's second tile sits early, so its lone tree stands beside 聆聆 (ground x ≈ 3600) at the road's end. */
const JOURNEY_NEAR_TILE = 1626;

function journeyArt(): PlaceArt {
  const M = mirrorX;
  const tile = (keys: Pt[]) => tileKeys(keys, JOURNEY_PERIOD);
  const sunX = 1400;
  const range = peaks(31, -300, 2900, HORIZON, 120, 230, 11);
  const pk = peaks(41, -300, 2900, HORIZON, 50, 120, 17);
  // the mirrored shore and headland without home's off-screen extensions, each sliding into the sea at its ends
  const shore: Pt[] = [...M(HOME.shore).filter(([x]) => x < 2000), [1990, 600], [2070, 616]];
  const head: Pt[] = [[-90, 664], [-20, 640], ...M(HOME.headland).filter(([x]) => x > 0)];
  const townHill = spline([[-300, 772] as Pt, ...tile(within(M(HOME.townHill), 0, 2000)), [4300, 720] as Pt], 10, false);
  const tw1 = town(townHill, 77, 2000 - 1500 - DX, 2000 - 880 - DX);
  const tw2 = town(townHill, 78, 2000 + 2000 - 1500 - DX, 2000 + 2000 - 880 - DX);
  const hillKeys = within(M(HOME.hills));
  const hills = spline([[-300, 740] as Pt, ...tile(hillKeys), [4400, 744] as Pt], 10, false);
  const tr = [...trees(hills, 94, -260, 4300, null)];
  // the near hill, mirrored: rising to the right; its high end rolls down again before the next tile's low rise
  const nearHill = [...M(HOME.near).filter(([x]) => x <= 1900), [1990, 700], [2100, 800], [2220, 905]] as Pt[];
  const nearRise = [[-200, 905], ...M(HOME.nearRight).filter(([x]) => x >= 0)] as Pt[];
  // the low rises first, the hills over them (a hill's paper covers the rise's rim where they meet)
  const nearEdges = [
    ...[0, JOURNEY_NEAR_TILE].map((o, i) => tear(spline(nearRise.map(([x, y]): Pt => [x + o, y]), 9, false), 1212 + i * 2, { jag: 1.2, wander: 4, closed: false })),
    ...[0, JOURNEY_NEAR_TILE].map((o, i) => tear(spline(nearHill.map(([x, y]): Pt => [x + o, y]), 9, false), 1211 + i * 2, { jag: 1.2, wander: 4, closed: false })),
  ];
  // mirrored about x 1000: the mock's x → 1800 − x (and the second tile's copy beside 聆聆)
  const tree = loneTree(1800, true) + loneTree(1800 + JOURNEY_NEAR_TILE, true);
  const gr = groundShape(JOURNEY_GROUND, 54, 1311);
  const xFar = -260;
  const wFar = 3000;
  const x0 = -260;
  const w = 4560;
  const headEdges = [0, JOURNEY_PERIOD].map((o) => [spline(shore.map(([x, y]): Pt => [x + o, y]), 7, false), spline(head.map(([x, y]): Pt => [x + o, y]), 7, false)]);
  const headlands = headEdges.flatMap(([sh, hd], i) => headlandParts(sh, hd, 2000 - 1415 - DX + i * JOURNEY_PERIOD));
  return {
    id: 'journey',
    sunX,
    groundEdge: gr.edge.map(([x, y]): Pt => [x, y + 5]),
    planes: [
      { id: 'range', depth: PLANE_DEPTH.range, foot: FOOT.back, x0: xFar, w: wFar, parts: peakParts(range, 'ff-range', 0.8, 3, sunX, false), edges: [level(xFar, wFar, HORIZON)] },
      { id: 'peaks', depth: PLANE_DEPTH.peaks, foot: FOOT.back, x0: xFar, w: wFar, parts: peakParts(pk, 'ff-peaks', 0.7, 2.5, sunX, true), edges: [level(xFar, wFar, HORIZON)] },
      { id: 'sea', depth: PLANE_DEPTH.sea, foot: FOOT.back, x0: xFar, w: wFar, parts: seaParts(xFar, wFar, false), edges: [level(xFar, wFar, SEA_TOP)] },
      { id: 'headland', depth: PLANE_DEPTH.headland, foot: FOOT.headland, x0, w, parts: headlands, edges: headEdges.flat() },
      { id: 'town', depth: PLANE_DEPTH.town, foot: FOOT.town, x0, w, parts: townParts(townHill, { houses: [...tw1.houses, ...tw2.houses], windows: [...tw1.windows, ...tw2.windows] }, 1611), edges: [townHill] },
      { id: 'hills', depth: PLANE_DEPTH.hills, foot: FOOT.hills, x0, w, parts: hillsParts(hills, tr, 1711), edges: [hills] },
      // its lone trees only on a wide screen (a tall one sees just a canopy floating at its edge)
      {
        id: 'near',
        depth: PLANE_DEPTH.near,
        foot: FOOT.near,
        x0,
        w,
        // the hills' foreground (path, fence, flowers) laid on their paper, before the lone trees
        parts: (() => {
          const parts = nearParts(nearEdges, tree, 1811, 'ff-canopy ff-lonetree');
          const at = parts.findIndex((pt) => pt.cls.includes('ff-lonetree'));
          const extra = nearEdges.slice(2).flatMap((e, i) => roadside(e, 2311 + i * 7));
          return [...parts.slice(0, at), ...extra, ...parts.slice(at)];
        })(),
        edges: nearEdges,
      },
      { id: 'ground', depth: PLANE_DEPTH.ground, foot: FOOT.ground, x0, w, parts: groundParts(gr, 1911), edges: [gr.torn] },
    ],
  };
}

/** The river's surface between the valley's banks (world y): 40 units under their lips, inside every screen's foot (a tall tablet's too). */
export const WATER_Y = 925;

/**
 * The valley (scene 3): home's far layers, sea, town and hills; two banks sloping down into a river, and a bridge over
 * it. Round 4 (the owner: 「它就是不太像一個橋，它像一個陸地」): the three ≋ ribbons lay on the ground like a striped
 * mound, with nothing under them — so the bridge is now one plain arch of paper: a deck the puppets walk, a wall under
 * it, and an open arch through which the far hills and the water show. `tall`: the same valley as a tall screen frames
 * it — its bridge 810…1190 and the banks' feet closer, so both feet and the whole arch are in a phone's view (the far
 * layers are the wide one's, drawn by home's groups).
 */
function valleyArt(tall = false): PlaceArt {
  const home = homeArt();
  const sunX = 700;
  const pk = [...peaks(23, -120, 1720, HORIZON, 50, 120, 11), ...peaks(24, -560, -150, HORIZON, 50, 110, 3), ...peaks(25, 1740, 2160, HORIZON, 50, 110, 3)].map((p) => shiftPeak(p, DX));
  const keep = (id: PlaneId): PlaneArt => ({ ...home.planes.find((p) => p.id === id)!, src: 'home' });
  const x0 = -260;
  const w = 2520;
  const [wa, wb] = tall ? WALK.tall : WALK.wide;
  // the banks: their ground at y 885, sloping away into the river between them
  const left = groundShape(tall ? VALLEY_LEFT_T : VALLEY_LEFT, 55, 1321);
  const right = groundShape(tall ? VALLEY_RIGHT_T : VALLEY_RIGHT, 56, 1322);
  const fx0 = wa - 200;
  const fx1 = wb + 200;
  const water: Pt[] = level(fx0, fx1 - fx0, WATER_Y);
  // a few quiet lines on the water, as the sea's
  const r = rng(1343);
  let lines = '';
  for (let i = 0; i < 4; i++) {
    const len = (wb - wa) * (0.08 + r() * 0.1);
    const x = lerp(wa + (wb - wa) * 0.22, wb - (wb - wa) * 0.22 - len, r());
    lines += `M${x.toFixed(0)},${WATER_Y + 16 + i * 13}h${len.toFixed(0)}`;
  }
  const ground: ArtPart[] = [
    { d: D(strip(water, 1340)), cls: 'ff-sea' },
    { d: lines, cls: 'fs-sea-line fx-ns' },
    { d: D(strip(left.torn, 1931)) + D(strip(right.torn, 1932)), cls: 'ff-ground' },
    { d: left.tufts + right.tufts, cls: 'ff-ground' },
  ];
  // the bridge: the walkway's gentle bow as its deck; under it a wall whose arch — half an ellipse — springs from the
  // water where the banks meet it. Cut clean by hand (a fine wobble, no tear), sampled finely so no edge steps
  const over = tall ? 14 : 40;
  const deck = tall ? 13 : 16;
  const inset = tall ? 90 : 130;
  const a1 = wa + inset;
  const b1 = wb - inset;
  const spring = WATER_Y + 10;
  const base = spring + 26;
  const crown = walkwayAt(1000, tall) + deck + (tall ? 5 : 7);
  const top: Pt[] = [];
  for (let x = wa - over; x <= wb + over + 0.01; x += 5) top.push([x, walkwayAt(x, tall)]);
  const arch: Pt[] = [];
  for (let i = 0; i <= 56; i++) {
    const u = i / 56;
    arch.push([lerp(a1, b1, u), spring - (spring - crown) * Math.sqrt(Math.max(0, 1 - (2 * u - 1) ** 2))]);
  }
  const wall: Pt[] = [...top, [wb + over, base], [b1, base], ...[...arch].reverse(), [a1, base], [wa - over, base]];
  const walk: Pt[] = [...top, ...[...top].reverse().map(([x, y]): Pt => [x, y + deck])];
  const cut = (pts: Pt[], seed: number) => D(tear(pts, seed, { amp: 0, jag: 0.12, wander: 1.2 }), 1);
  const bridge: ArtPart[] = [
    { d: cut(wall, 2001), cls: 'ff-bridge-wall' },
    { d: cut(walk, 2002), cls: 'ff-bridge' },
  ];
  const walkway: Pt[] = [];
  for (let x = wa; x <= wb; x += 10) walkway.push([x, walkwayAt(x, tall)]);
  return {
    id: tall ? 'valleyT' : 'valley',
    sunX,
    groundEdge: groundEdge(tall ? 'valleyT' : 'valley'),
    walkway,
    planes: [
      keep('range'),
      { id: 'peaks', depth: PLANE_DEPTH.peaks, foot: FOOT.back, x0, w, parts: peakParts(pk, 'ff-peaks', 0.7, 2.5, sunX, true), edges: [level(x0, w, HORIZON)], ...(tall ? { src: 'valley' as PlaceId } : {}) },
      keep('sea'),
      keep('headland'),
      keep('town'),
      keep('hills'),
      { id: 'bridge', depth: PLANE_DEPTH.bridge, foot: FOOT.bridge, x0, w, parts: bridge, ...(tall ? {} : { tall: 'valleyT' as PlaceId }) },
      { id: 'ground', depth: PLANE_DEPTH.ground, foot: FOOT.ground, x0, w, parts: ground, edges: [water, left.torn, right.torn], ...(tall ? {} : { tall: 'valleyT' as PlaceId }) },
    ],
  };
}

const memo = new Map<PlaceId, PlaceArt>();

/** A place's art (memoized: it is the same paper every time). */
export function placeArt(id: PlaceId): PlaceArt {
  let p = memo.get(id);
  if (!p) {
    p = id === 'home' ? homeArt() : id === 'journey' ? journeyArt() : valleyArt(id === 'valleyT');
    memo.set(id, p);
  }
  return p;
}

export { groundAt, walkwayAt } from './ground';

/** The front fringe: dark grass blades and seed heads in a corner (a 420 × 320 box, its foot at y 320). */
export function fringeArt(side: 'left' | 'right'): string {
  const r = rng(side === 'left' ? 1401 : 1402);
  const dir = side === 'left' ? 1 : -1;
  const out: string[] = [];
  const H = 320;
  for (let i = 0; i < 7; i++) {
    const x = side === 'left' ? 10 + r() * 190 : 220 + r() * 190;
    const h = 60 + r() * 150;
    const lean = dir * (24 + r() * 60);
    const w = 16 + r() * 14;
    const blade: Pt[] = [[x - w / 2, H + 10], [x + lean * 0.5 - w * 0.3, H - h * 0.55], [x + lean, H - h], [x + lean * 0.5 + w * 0.3, H - h * 0.5], [x + w / 2, H + 10]];
    out.push(D(tear(spline(blade, 4), 1410 + i, { jag: 0.4, wander: 0.8 })));
    if (r() < 0.35) out.push(D(tear(ellipse(x + lean, H - h - 6, 4, 9, 14, lean * 0.01), 1450 + i, { jag: 0.4, wander: 0.6 })));
  }
  return out.join('');
}
