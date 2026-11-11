/**
 * A scene change's style (the owner: 「場景在轉換的時候…可以用這個視差滾動嘛，讓這些東西這樣子滾上去，然後換到下一個場景」).
 * A style is a pure function of the change's progress p (0 → 1, scrubbed by the scroll): the same p always gives the
 * same frame, so a scrub forwards, backwards or a jump lands on the same picture. The director (runtime/director.ts)
 * asks it once per frame and turns the answer into transforms and opacity only — no layout read, no filter.
 *
 * Units: offsets and sizes are in stage widths (x) and stage heights (y) — the stage is the visible screen below the
 * address bar (100svh, `info.h` px); y grows downward. Positions given in `info` are from the stage's top-left.
 *
 * What a style controls, per frame (`ChangeFrame`):
 * - every plane of the old and the new set (`old[i]` answers `info.old[i]`): its offset, opacity, an optional scale and
 *   turn about a point under the stage's centre, and its foot — `cut` (only its art and a short torn foot: a cut-out),
 *   `paper` (its paper down to its torn foot, as drawn) or `apron` (its paper running on below the stage). The
 *   backdrop's planes (the far range, the peaks, the sea: `backdrop: true`) are in the same lists;
 * - the front grass in the corners (`fringe`), the held cards (`held`), the lanterns (`lanterns`, c3), the puppets
 *   leaving and arriving (`actors`), the hero block (`hero`, c1), how far the hour has turned (`hour`);
 * - an optional overlay of tissue-paper strips with torn edges (`strips`, `count` of them), each placed, sized, turned,
 *   coloured with one of the hour's paints and slotted between the planes by its z.
 * What it can't do: lift a held card or lantern within 12 px of the header's pen line (the scaffold eases every held
 * offset into the room there is: `easeIntoRoom`), or touch the picture book (reduced motion never runs a change).
 * Pure, no DOM.
 */
import type { SceneN } from '../timeline';

/** c1 (the opening → the journey), c2 (the journey → the valley), c3 (the valley → the night). */
export type ChangeN = 1 | 2 | 3;

export type PlaneId = 'range' | 'peaks' | 'sea' | 'headland' | 'town' | 'hills' | 'near' | 'bridge' | 'ground';

/** A plane of a set, as the style sees it (at rest, before the change moves it). */
export interface ChangePlane {
  id: PlaneId;
  /** 0 the haze … 1 the ground. Below 0.35 it is the backdrop. */
  depth: number;
  backdrop: boolean;
  /** Its index in its set, far to near (the order it is painted in at rest). */
  index: number;
  /** Its drawn top and its paper's torn foot at rest, stage heights from the stage's top (the foot is below the stage). */
  top: number;
  foot: number;
  /**
   * Where its art ends in a cut-out (the short torn foot under its lowest drawn edge, under the stage's centre at
   * rest), stage heights — or null when it has no cut-out foot (the bridge: its ribbons are all art).
   */
  cutFoot: number | null;
}

/** One change on one screen: what the style is given. Plain data. */
export interface ChangeInfo {
  n: ChangeN;
  from: SceneN;
  to: SceneN;
  layout: 'wide' | 'tall';
  /** Tall and at least 640 px wide (a tablet held upright). */
  tablet: boolean;
  /** The stage, px: its width, its height (100svh) and the large viewport's height (100lvh, ≥ h). */
  w: number;
  h: number;
  lvh: number;
  /** The leaving set's planes and the arriving set's, far to near. */
  old: ChangePlane[];
  new: ChangePlane[];
  /** Nothing held rises above this line (12 px under the header's pen line), stage heights. */
  clear: number;
}

/**
 * - `cut`: its art and a short torn foot only (a cut-out flying free; under the foot whatever is behind shows);
 * - `paper`: its paper down to its torn foot as drawn (the ground's runs well below the stage);
 * - `apron`: its paper and an apron of the same paper running on under the stage's foot (no sky ever shows under it).
 * - `rest`: a middle flat (headland, town, hills, near) of home or the journey as its scene shows it at rest — its paper
 *   down to just under the edges of the planes in front, torn (world.ts `restClip`): switched to at rest it changes
 *   nothing on screen, and flown free it is the piece one saw. Elsewhere `rest` draws as `paper`.
 * The backdrop's and the bridge's planes have no apron (`apron` draws as `paper`); the bridge has no cut-out (`cut`
 * draws as `paper`).
 */
export type FootMode = 'cut' | 'paper' | 'apron' | 'rest';

/** A plane's move at p. */
export interface PlaneMove {
  /** Offset, stage heights (+ down). */
  y: number;
  /** Offset, stage widths (+ right). */
  x?: number;
  /** 0 … 1. */
  alpha: number;
  /** A scale and a turn (degrees, + clockwise) about the plane's point under the stage's centre, at its `origin`. */
  scale?: number;
  rot?: number;
  /** Where the scale and the turn pivot: the paper's foot (default), its drawn top, or its cut-out foot. */
  origin?: 'foot' | 'top' | 'cut';
  foot: FootMode;
  /**
   * 0 … 1: how far it has gone into the haze — its whole silhouette painted over, opaque, in the sky's colour high up
   * (`--film-c-fly`, the wash at 0.68 of the horizon's height): depth by colour, so a flat flown away pales into the sky
   * instead of turning see-through. Absent or 0: its own paper. The sea never hazes.
   */
  haze?: number;
}

/** A plain move: offset (stage heights) and opacity. */
export interface Move {
  y: number;
  alpha: number;
}

/** The puppets of the leaving or the arriving scene: they ride their ground plane, plus this offset and opacity. */
export interface ActorMove {
  /** Extra offset over their plane's, stage heights (+ down). */
  y: number;
  alpha: number;
}

/**
 * A held group (c1: card A on the wind with 點點 aboard; c2: the pair A ≋ B; c3: the pair at the top) or the lanterns
 * (c3): an offset from where the beats hold it, and its opacity. An upward offset is eased into the room under the
 * header (`easeIntoRoom`): asking for more never takes it higher than `info.clear`.
 */
export interface HeldMove {
  /** Stage heights (+ down). */
  y: number;
  alpha: number;
}

/** The hour's paints a tissue strip may wear (the stage's `--film-c-*` / `--film-sky-*` variables). */
export type StripPaint =
  | 'mist'
  | 'cloud-front'
  | 'cloud-back'
  | 'streak'
  | 'halo'
  | 'sky-0'
  | 'sky-1'
  | 'sky-2'
  | 'sky-3'
  | 'range'
  | 'peaks'
  | 'sea'
  | 'headland'
  | 'town'
  | 'hills'
  | 'near'
  | 'ground';

/**
 * One tissue strip of the overlay: a torn ribbon of paper (`count` of them, each its own tear), stretched to `w` × `h`.
 * Its z slots it among the planes (see `ChangeOrder`); a strip with alpha 0 is not drawn.
 */
export interface StripMove {
  /** Its centre, stage widths / heights from the stage's top-left. */
  x: number;
  y: number;
  /** Its size, stage widths / heights. */
  w: number;
  h: number;
  /** Degrees. */
  rot?: number;
  alpha: number;
  paint: StripPaint;
  /** Its z-index among the planes' (an integer). */
  z: number;
}

/** Everything a style says at one p. */
export interface ChangeFrame {
  /** One per `info.old` / `info.new` plane, in the same order. */
  old: PlaneMove[];
  new: PlaneMove[];
  /** The front grass in the corners (each set has its own). */
  fringe: { old: Move; new: Move };
  held: HeldMove;
  /** c3's lanterns rising from the town (ignored in c1 and c2). */
  lanterns: HeldMove;
  actors: { old: ActorMove; new: ActorMove };
  /** c1's hero block (the h1, its line and the badges; ignored in c2 and c3). Once it has faded out it is gone. */
  hero: Move;
  /** How far the hour has turned across the change: 0 the old scene's hour, 1 the new one's (the palette follows). */
  hour: number;
  /** The overlay (at most `ChangeStyle.strips` of them; fewer leaves the rest hidden). */
  strips: StripMove[];
}

/**
 * The paint order through a change (z-indices, fixed for the whole change): one per plane of each set, and each set's
 * front grass. Legacy's: the old backdrop 1, the new backdrop 2, the old flats 10 + index, the new flats 30 + index, the
 * old grass 50, the new 60. The overlay's strips slot in by their own z. Everything is under the cards and the puppet
 * riding them; at rest (no change) the director paints a set as legacy's old one.
 */
export interface ChangeOrder {
  old: number[];
  new: number[];
  fringe: { old: number; new: number };
}

export interface ChangeStyle {
  /** Its name in `?change=<name>`. */
  name: string;
  /** How many tissue strips its overlay uses (0: none; the director makes them once). */
  strips: number;
  /**
   * Optional: strip i's own paper, a path `d` in the strips' 1000 × 100 box (stretched to the strip's `w` × `h`, so a
   * style that wants round shapes keeps that box's aspect itself). Without it, each strip is the scaffold's torn ribbon.
   */
  paper?(i: number): string;
  order(info: ChangeInfo): ChangeOrder;
  /** Pure in (p, info). */
  frame(p: number, info: ChangeInfo): ChangeFrame;
}

/* ───────────── the scaffold's own rules (the director and the tests use them) ───────────── */

/**
 * A held thing's offset, eased into the room it has: `want` (px, + down) is free downward; upward it is as asked for
 * the first half of `room` (px from the thing's top at rest up to the clearance line), then bends smoothly toward the
 * line and never passes it. No room (the thing already at or above the line): it doesn't rise at all.
 */
export function easeIntoRoom(want: number, room: number): number {
  if (want >= 0) return want;
  if (room <= 0) return 0;
  const up = -want;
  const knee = room / 2;
  if (up <= knee) return want;
  return -(knee + (room - knee) * Math.tanh((up - knee) / (room - knee)));
}

/** The scaffold's clearance: 12 px under the header's pen line. */
export const CLEAR_UNDER_PEN = 12;
