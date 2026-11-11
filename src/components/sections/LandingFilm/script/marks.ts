/**
 * Where everything stands (SPEC §5.3–5.5): each scene's place and camera, the puppets' marks (world x on the ground
 * plane), and the DOM cards' spots (screen px) by layout. Pure: functions of the Layout (and of the hero's measured
 * box where the story card must keep clear of it).
 */
import type { Layout, Rect } from './layout';
import type { SceneN } from './timeline';
import type { PlaceId } from './ground';

export type PalSlug = 'tuck' | 'tag' | 'card' | 'dot' | 'night';

export const PLACE_OF: Record<SceneN, PlaceId> = { 1: 'home', 2: 'journey', 3: 'valley', 4: 'home' };
/** The place a scene's ground is, by layout (a tall screen's valley has the narrower bridge). */
export const placeOf = (scene: SceneN, L: Layout | 'wide' | 'tall'): PlaceId => (scene === 3 && (typeof L === 'string' ? L : L.name) === 'tall' ? 'valleyT' : PLACE_OF[scene]);

/**
 * Each scene's camera (world x at the stage's centre) at rest. The journey's runs on (journeyCam). A tall screen's
 * opening looks right of the middle: the lit town on its hill and the lighthouse behind the two, the sun beside them.
 */
export const OPENING_CAM_TALL = 1330;
export function camOf(scene: SceneN, L: Layout): number {
  if (scene === 1) return L.name === 'wide' ? 1000 : OPENING_CAM_TALL;
  return 1000;
}
/** Where the journey's camera comes to rest: 聆聆 a little right of centre — on a tall screen 聆聆 and 點點 centred. */
export const journeyCamEnd = (L: Layout) => (L.name === 'wide' ? 3370 - 0.12 * L.view : 3370 + (0.48 * L.pal) / L.u);

/** The puppets' marks: world x on their scene's ground. */
export const MARKS = {
  1: {
    wide: { tuck: 630, dot: 820 },
    // a 390 phone's (the server's stills); the runtime measures them from the view (markOf)
    tall: { tuck: 1202, dot: 1322 },
  },
  2: { card: 3370, dot: 3480, tree: 3600 },
  3: { tuck: 520, tuckTo: 960, card: 1480, cardTo: 1040, dot: 1540, dotTo: 1440, night: 1600 },
  4: {
    wide: { tag: 760, tuck: 880, dot: 1000, card: 1120, night: 1250 },
    tall: { tag: 850, tuck: 925, dot: 1000, card: 1075, night: 1150 },
  },
} as const;

/** Which puppets stand in each scene (the server draws them there; the cast adopts them). */
export const CAST_OF: Record<SceneN, PalSlug[]> = {
  1: ['tuck', 'dot'],
  2: ['card', 'dot'],
  3: ['tuck', 'card', 'dot', 'night'],
  4: ['tag', 'tuck', 'dot', 'card', 'night'],
};

/** A puppet's mark in its scene at rest (the scene's opening place), by layout. */
export function markOf(scene: SceneN, slug: PalSlug, L: Layout | 'wide' | 'tall'): number {
  const name = typeof L === 'string' ? L : L.name;
  if (scene === 4) return MARKS[4][name][slug];
  if (scene === 1) {
    // a tall screen's opening: 摺摺 a quarter in from the left, 點點 a body's width on — whatever the screen's scale
    if (typeof L !== 'string' && name === 'tall') {
      const tuck = camOf(1, L) - 0.26 * L.view;
      return slug === 'dot' ? tuck + (1.08 * L.pal) / L.u : tuck;
    }
    return (MARKS[1][name] as Record<string, number>)[slug] ?? 0;
  }
  const m = MARKS[scene] as Record<string, number>;
  return m[slug] ?? 0;
}

/**
 * A DOM card's laid-out size, px (its slot's, measured by the director: the cards are the landing page's StoryCard,
 * laid out at full size — film.module.css `.slot` widths — and only ever scaled down).
 */
export interface Box {
  w: number;
  h: number;
}
/** The night sky's small cards, as the spots plan for them (the tallest of them, about). */
export const SKY_BOX: Box = { w: 220, h: 370 };

/** Every puppet on screen stands at least this far inside the view (px)… */
export const EDGE_PX = 12;
/** …and this much more, for its arms' swing and a lean (px). */
export const SWING_PX = 6;
/**
 * The night's row of five, torsos shoulder to shoulder, spans this many 摺摺 heights (their torsos and the outer arms at
 * the row's ends, by the rigs). On a phone too narrow for that the night's puppets are drawn smaller until the row fits
 * inside EDGE_PX + SWING_PX each side: film.module.css `--pal-4` (the same number), measured back as `lay(4).pal`.
 */
export const NIGHT_ROW_PALS = 3.95;

/** The header's foot: nothing floats above it. */
export const HEADER_CLEAR = 88;
/**
 * The header's pen line, its lowest point (px from the top: FilmHeader's wave stroke, 72–74 at every width). A scene
 * change keeps every held card at least 12 px under it (script/changes `easeIntoRoom`); the director measures the line
 * and falls back to this.
 */
export const HEADER_PEN = 74;
/** Nothing held (a card, the puppet riding one) rises above this: 12 px under the header's pen line. */
export const HELD_TOP = HEADER_PEN + 12;
/** 點點 riding a card: its head this far over the card's top, in its own height (摺摺's, the carrier's: measured 0.557). */
const RIDER_H = 0.58;

export interface Spot {
  cx: number;
  cy: number;
  scale: number;
}

/** The top of the puppets' heads (the tallest of the opening two), px. */
const headsY = (L: Layout) => L.groundY - L.pal * 1.12;
/** The room 點點 takes over a card it sits on (its head, from the card's top edge), px. */
const riderRoom = (pal: number) => RIDER_H * pal + 8;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const topOf = (sp: Spot, b: Box) => sp.cy - (b.h * sp.scale) / 2;

/**
 * The story card, revealed (SPEC §0b.1; the landing page's StoryCard since round 3): wide, in the sky right of the hero
 * (its left edge ≥ 24 px past the hero's right, its foot above the puppets' heads, scaled down to 0.8 if need be);
 * tall, centred under the hero, its foot above 摺摺's head (down to 0.7; 0.62 on a screen under 700 px tall, whose
 * card shows no cover, film.module.css).
 */
export function storySpot(L: Layout, hero: Rect, card: Box): Spot {
  const limit = headsY(L) - 14;
  if (L.name === 'wide') {
    const left = Math.max(hero.x + hero.w + 24, Math.min(L.w * 0.62 - card.w / 2, L.w - 32 - card.w));
    let top = Math.max(HEADER_CLEAR, hero.y - 8);
    const scale = Math.min(1, Math.max(0.8, (limit - top) / card.h));
    if (top + card.h * scale > limit) top = Math.max(HEADER_CLEAR, limit - card.h * scale);
    // scaled about its centre: its scaled box's left edge stays where it was meant to be
    return { cx: left + (card.w * scale) / 2, cy: top + (card.h * scale) / 2, scale };
  }
  const top = hero.y + hero.h + 16;
  const scale = Math.min(1, Math.max(L.h < 700 ? 0.62 : 0.7, (limit - top) / card.h));
  return { cx: L.w / 2, cy: top + (card.h * scale) / 2, scale };
}

/**
 * Where the card waits as the wind comes and 點點 hops onto its top edge (wind): where it popped, moved down (and on a
 * tall screen made a little smaller) only as far as 點點, sitting on it, needs to keep its head under the header and
 * clear of the hero's words — the card's foot still above the puppets' heads.
 */
export function boardSpot(L: Layout, hero: Rect, card: Box, pop: Spot): Spot {
  const limit = headsY(L) - 14;
  // (and the 8 px the wind then lifts it by)
  const want = Math.max(HELD_TOP, L.name === 'tall' ? hero.y + hero.h + 10 : HELD_TOP) + riderRoom(L.pal) + 8;
  if (topOf(pop, card) >= want) return pop;
  const scale = clamp((limit - want) / card.h, 0.45, pop.scale);
  return { cx: pop.cx, cy: want + (card.h * scale) / 2, scale };
}

/**
 * Where the wind carries the card along the journey (it bobs 8 px and tilts 3° there): high in the sky, small enough
 * for the scenery to show (about 0.3 of the screen's height), 點點's head under the header.
 */
export function carrierSpot(L: Layout, card: Box): Spot {
  const scale = clamp((0.3 * L.h) / card.h, 0.5, L.name === 'wide' ? 0.62 : L.tablet ? 0.78 : 0.62);
  const top = HELD_TOP + riderRoom(L.pal) + 10;
  return { cx: L.name === 'wide' ? 0.56 * L.w : L.w / 2, cy: Math.max(top + (card.h * scale) / 2, 0.24 * L.h), scale };
}

export interface PairSpots {
  a: Spot;
  b: Spot;
  /** The ≋ between them: its centre, turn and scale (its slot laid out at `waveW`). */
  wave: { cx: number; cy: number; rot: number; len: number; scale: number };
}

/**
 * Two cards side by side, top-aligned at `top`, a gap between them for the ≋ (level, centred on the shorter card's
 * middle), scaled alike to `scale` at most and to fit the view.
 */
function sideBySide(L: Layout, A: Box, B: Box, top: number, cap: number, gap: number, waveW: number): PairSpots {
  const scale = Math.min(cap, (L.w - 2 * 12 - gap) / (A.w + B.w));
  const wa = A.w * scale;
  const wb = B.w * scale;
  const left = L.w / 2 - (wa + gap + wb) / 2;
  return {
    a: { cx: left + wa / 2, cy: top + (A.h * scale) / 2, scale },
    b: { cx: left + wa + gap + wb / 2, cy: top + (B.h * scale) / 2, scale },
    wave: { cx: left + wa + gap / 2, cy: top + (Math.min(A.h, B.h) * scale) / 2, rot: 0, len: 56, scale: Math.min(1, (gap - 8) / waveW) },
  };
}

/**
 * The pair, story A and its answer B (reply, c2): side by side under the header at every width (the owner, round 3: a
 * phone too), covers and titles big enough to know them by; their feet well above the puppets' heads.
 */
export function pairSpots(L: Layout, A: Box, B: Box, waveW = 53): PairSpots {
  if (L.name === 'wide') {
    const top = Math.max(HELD_TOP + 10, 0.1 * L.h);
    const cap = Math.min(0.8, (0.88 * (headsY(L) - top)) / Math.max(A.h, B.h));
    return sideBySide(L, A, B, top, cap, 72, waveW);
  }
  return sideBySide(L, A, B, L.tablet ? 112 : HELD_TOP + 10, L.tablet ? 0.85 : 0.62, L.tablet ? 56 : 40, waveW);
}

/**
 * The pair, gone up to the stage's top while the two meet on the bridge (bridge, meet, c3): side by side, smaller on a
 * wide screen (the sky over the bridge open); on a tall one where it was.
 */
export function topSpots(L: Layout, A: Box, B: Box, waveW = 61): PairSpots {
  if (L.name === 'wide') return sideBySide(L, A, B, HELD_TOP + 10, 0.52, 56, waveW);
  return sideBySide(L, A, B, L.tablet ? 112 : HELD_TOP + 10, L.tablet ? 0.85 : 0.62, L.tablet ? 56 : 40, waveW);
}

/** The night sky's small cards (wide only): three — two left of the call to action, one right of it under the moon. */
export const SKY_CARDS = 3;

/**
 * The night sky's small cards (wide only), i < SKY_CARDS: two on the left, staggered, the lower one's foot over the
 * five's heads; one on the right, under the moon (moonSpot), never over it. Scaled alike, never over the card in the
 * middle. `skySpot(L, SKY_CARDS)` is the fourth lantern's place (a lantern that stays one), left of the moon.
 */
export function skySpot(L: Layout, i: number, ctaW = 380): Spot {
  const top = HELD_TOP + 18;
  const gapY = 28;
  const scale = clamp((headsY(L) - 12 - top - gapY) / (2 * SKY_BOX.h), 0.5, 0.7);
  const w = SKY_BOX.w * scale;
  const h = SKY_BOX.h * scale;
  const edge = Math.max(32, 0.05 * L.w);
  // the room between the screen's edge and the call to action's, 24 px from each
  const room = L.w / 2 - ctaW / 2 - 24 - edge;
  const step = Math.max(0, Math.min(0.75 * w, room - w));
  const moon = moonSpot(L);
  if (i === 0) return { cx: edge + w / 2, cy: top + h / 2, scale };
  if (i === 1) return { cx: edge + step + w / 2, cy: top + h + gapY + h / 2, scale };
  // under the moon's disc and its glow (its radius 60 world units)
  const under = Math.max(top, moon.y + 110 * L.u);
  if (i === 2) return { cx: L.w - edge - w / 2, cy: Math.min(under, headsY(L) - 12 - h) + h / 2, scale };
  return { cx: Math.min(moon.x - 120 * L.u, L.w / 2 + ctaW / 2 + 60), cy: top + 0.1 * L.h, scale };
}

/**
 * On a tall screen, the band of sky kept between the night card's foot and the five's heads (px): where the lanterns
 * hang (round 4, the owner: 「天燈…跟那個角色卡在一起」 — on a short phone the card ran down to the heads and the
 * lanterns had nowhere to be but over the puppets).
 */
export const LANTERN_BAND = 60;
/** The top of the night row's heads, px (the lanterns keep above it). */
export const nightHeadsY = (L: Layout) => headsY(L);

/**
 * The night's card (the story not written yet): wide centred, its top at 0.11 of the screen; tall centred, its top
 * at 0.12 — a smaller card there (its cover a strip, none on a short phone: film.module.css) — its foot above the
 * five's heads (on a tall screen, above the lanterns' band over them), scaled down if need be (never below 0.72 on a
 * tall screen).
 */
export function ctaSpot(L: Layout, panelH: number): Spot {
  const wide = L.name === 'wide';
  const top = Math.max(HEADER_CLEAR + 8, (wide ? 0.11 : 0.12) * L.h);
  const limit = headsY(L) - (wide ? 20 : 16 + LANTERN_BAND);
  const scale = Math.min(1, Math.max(wide ? 0.6 : 0.72, (limit - top) / panelH));
  return { cx: L.w / 2, cy: top + (panelH * scale) / 2, scale };
}

/** The moon of the last scene: wide high on the right; tall low on the right, under the panel's side. */
export function moonSpot(L: Layout): { x: number; y: number } {
  return L.name === 'wide' ? { x: 0.86 * L.w, y: 0.14 * L.h } : { x: 0.8 * L.w, y: 0.86 * L.hz };
}

/**
 * Who handles a card in a scene wears both arms in front of its body for the whole of it (round 5, the owner: 「這個
 * 聆聆的右手是不是也改成…定在前面呢？…為了寫字…把它的左手定在前面，那右手也要不要一起定在前面呢？」): never one arm
 * pinned over the body and the other behind it, and no arm changing sides as it starts to write. The stills stand so
 * too (World.tsx), and the live puppets (script/beats.ts `act`).
 */
export const ARMS_FRONT: Partial<Record<1 | 2 | 3 | 4, readonly PalSlug[]>> = { 1: ['tuck'], 2: ['card'] };
