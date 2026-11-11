/**
 * Where the ground is, light enough for the runtime: the places' ground keys (the mock's, shifted +200 and extended),
 * the edge splines the puppets stand on and the valley's walkway — without the rest of the world's paper (world.ts
 * builds that on the server from these same keys).
 */
import { spline, yAt, type Pt } from './geom';

/** `valleyT`: the valley as a tall screen draws it (its bridge narrower, so both feet and the ≋ are in view). */
export type PlaceId = 'home' | 'journey' | 'valley' | 'valleyT';

/** The mock's 1600 composition shifted into the 2000-unit world. */
export const DX = 200;
const sh = (keys: Pt[]) => keys.map(([x, y]): Pt => [x + DX, y]);
/** Mirrored about the world's middle (x → 2000 − x), x ascending again. */
export const mirrorX = (pts: Pt[]) => pts.map(([x, y]): Pt => [2000 - x, y]).reverse();
/** A key list repeated a period further on. */
export const tileKeys = (keys: Pt[], offset = 2000) => [...keys, ...keys.map(([x, y]): Pt => [x + offset, y])];
/** The keys within one period. */
export const within = (keys: Pt[], from = -40, to = 2040) => keys.filter(([x]) => x >= from && x <= to);

/** Home's edges (world x), extended past the mock's ends so a 1900-unit view never finds a cut edge. */
export const HOME = {
  shore: sh([[-420, 590], [-80, 588], [90, 579], [260, 585], [440, 596], [560, 606]]),
  headland: sh([[1010, 640], [1028, 600], [1060, 580], [1130, 570], [1260, 560], [1390, 540], [1510, 548], [1680, 556], [2000, 560]]),
  townHill: sh([[-400, 800], [300, 792], [700, 760], [820, 712], [960, 688], [1110, 676], [1270, 660], [1420, 668], [1560, 688], [1680, 696], [1900, 716], [2100, 740]]),
  hills: sh([[-420, 736], [-80, 742], [120, 728], [330, 748], [560, 770], [760, 778], [980, 760], [1200, 770], [1420, 748], [1680, 736], [2000, 744]]),
  near: sh([[-420, 662], [-80, 650], [70, 622], [210, 610], [360, 634], [520, 712], [660, 812], [780, 900]]),
  nearRight: sh([[1180, 900], [1290, 838], [1420, 806], [1540, 796], [1680, 800], [2000, 808]]),
  ground: sh([[-420, 862], [-80, 868], [160, 884], [420, 890], [700, 888], [980, 880], [1260, 866], [1480, 846], [1680, 832], [2000, 826]]),
};

/** The journey's road: home's ground mirrored, one period repeated (one continuous spline across both tiles). */
export const JOURNEY_GROUND: Pt[] = [[-300, 830], ...tileKeys(within(mirrorX(HOME.ground))), [4400, 860]];

/** The valley's banks: their ground at y 885, sloping away (torn, never a cliff) to the valley floor between them. */
export const VALLEY_LEFT: Pt[] = [[-420, 870], [-80, 878], [200, 886], [420, 888], [600, 884], [650, 892], [700, 914], [750, 948], [800, 990], [840, 1034]];
/** A tall screen's: the same banks, their feet closer, under a narrower bridge — only as far as a tall screen sees. */
export const VALLEY_LEFT_T: Pt[] = [[540, 887], [700, 888], [810, 884], [842, 893], [874, 914], [906, 948], [938, 990], [962, 1034]];
const mirror1000 = (pts: Pt[]) => pts.map(([x, y]): Pt => [2000 - x, y]).reverse();
export const VALLEY_RIGHT: Pt[] = mirror1000(VALLEY_LEFT);
export const VALLEY_RIGHT_T: Pt[] = mirror1000(VALLEY_LEFT_T);

/** The bridge's span (its walkway's feet), wide and tall. */
export const WALK = { wide: [600, 1400], tall: [810, 1190] } as const;

/**
 * How high the walkway's arch rises over its feet (world units): a gentle bow the puppets walk up, never a hump to
 * climb — a tall screen's narrower bridge rises less, so its slope stays as easy as the wide one's.
 */
export const WALK_RISE = { wide: 45, tall: 32 } as const;
/** The walkway's feet (world y), on the banks' lips. */
export const WALK_FOOT = 880;

/** The valley's walkway: a parabolic arch from (a, 880) over its apex at the middle (1000, 880 − rise) to (b, 880). */
export function walkwayAt(x: number, tall = false): number {
  const [a, b] = tall ? WALK.tall : WALK.wide;
  const u = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return WALK_FOOT - (tall ? WALK_RISE.tall : WALK_RISE.wide) * 4 * u * (1 - u);
}

const edges = new Map<PlaceId, Pt[]>();

/** The edge the puppets' feet stand on (x ascending), 5 units into the paper as the mock stood them. */
export function groundEdge(place: PlaceId): Pt[] {
  let e = edges.get(place);
  if (e) return e;
  const feet = (pts: Pt[]) => pts.map(([x, y]): Pt => [x, y + 5]);
  if (place === 'home') e = feet(spline(HOME.ground, 9, false));
  else if (place === 'journey') e = feet(spline(JOURNEY_GROUND, 9, false));
  else {
    const tall = place === 'valleyT';
    const [a, b] = tall ? WALK.tall : WALK.wide;
    const walk: Pt[] = [];
    for (let x = a; x <= b; x += 10) walk.push([x, walkwayAt(x, tall)]);
    e = [...feet(spline(tall ? VALLEY_LEFT_T : VALLEY_LEFT, 9, false)).filter(([x]) => x < a), ...walk, ...feet(spline(tall ? VALLEY_RIGHT_T : VALLEY_RIGHT, 9, false)).filter(([x]) => x > b)];
  }
  edges.set(place, e);
  return e;
}

/** The world y of a place's ground (the feet) at x. */
export const groundAt = (place: PlaceId, x: number) => yAt(groundEdge(place), x);
