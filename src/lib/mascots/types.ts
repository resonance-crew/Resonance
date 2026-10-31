/**
 * The landing stage's vocabulary: what the page tells the engine (the env and its ledges), what a character is (its
 * manifest and traits), what the engine answers (events, the stage handle), and the few shapes its own modules share.
 * Page px throughout, the page's own coordinates (y grows downward); rig units are the 700 × 760 drawing a part
 * image was cut from.
 */
import type { Puppet } from './puppet';

export type Theme = 'light' | 'dark';
/** Which pencil reads on a background: the dark one on a pale page, the light one on a dark or terracotta one. */
export type Ink = 'light' | 'dark';
export type Side = 'left' | 'right';
export type Zone = 'hero' | 'feed' | 'cta' | 'footer';
/** [x, y] */
export type Point = readonly [number, number];

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * An element a character can be behind: its rect, its drawn top edge (x ascending) or its rounded top corners, and the
 * width of the pen that drew its outline — whoever is behind it keeps under the whole line (round 20, the owner: the
 * card's border stays in front of the puppet), not just under its middle.
 */
export interface Cover extends Rect {
  top?: readonly Point[];
  radius?: number;
  pen?: number;
  /** Its drawn sides, y ascending (a wobbly card's): someone slid out past one is cut along it, not at the box. */
  sides?: { left?: readonly Point[]; right?: readonly Point[] };
}

/** What `env.behind` is handed: the cover and how far below it (`depth`) the character's feet reach. */
export interface BehindCover extends Cover {
  depth: number;
}

/** What a character can do at a place. */
export type ActName =
  | 'read' | 'swing' | 'look' | 'wave' | 'stretch' | 'hop' | 'deco' | 'reveal' | 'twinkle' | 'point' | 'beckon'
  | 'lean' | 'write' | 'nap' | 'duck';

// --- ledges: the places on the page a character goes to -------------------------------------------------------------

interface LedgeCommon {
  id: string;
  /** The page's own words for the place, passed through on events. */
  label?: string;
  zone?: Zone;
  /** How often it is chosen (1 by default). */
  weight?: number;
  /** One place of a group is used at a time (the headline's two ends). */
  group?: string;
  /** The place across (by id): a guest goes there and the two greet from afar. */
  partner?: string;
  /** A guest can walk up to whoever stands here (a line or a stand spot). */
  meet?: boolean;
  /** The chance a meeting follows a first visitor here (options.meetChance otherwise). */
  meetChance?: number;
  /** Page y nothing of a character may rise above (the line of text over it). */
  ceiling?: number;
  /** Rects the character's body keeps off (the button beside it, the words above a card's seat). */
  clear?: readonly Rect[];
  /**
   * A stand spot whose `clear` rects stay out of the arm's reach too, not just the body's (a store badge's clear
   * space: pointing at it from here, the mitten stops short of it).
   */
  reach?: boolean;
  /** The pencil that reads on this place's background, by page theme. */
  ink?: Partial<Record<Theme, Ink>>;
  /** Characters (by slug) never sent here: a pale paper on a pale background. */
  avoid?: readonly string[];
  /** Characters (by slug) sent here five times as often (who may nap here, too). */
  prefer?: readonly string[];
  /** What a character does here (by ActName; anything else is ignored). `['look', 'wave']` when absent. */
  acts?: readonly string[];
  /** What pointing, beckoning, leaning and writing aim at. */
  target?: Point;
}

/** A line to walk along, walked onto from the side of the view (the waves). */
export interface LineLedge extends LedgeCommon {
  kind: 'line';
  points: readonly Point[];
}

interface EdgeCommon extends LedgeCommon {
  kind: 'edge';
  /** The top of words or an element (x ascending). */
  points: readonly Point[];
  stance?: 'sit' | 'stand';
}

/** An edge: popped up onto (words), or climbed onto from behind its element and sat on (a card's top). */
export type EdgeLedge = (EdgeCommon & { enter: 'pop'; cover?: Cover }) | (EdgeCommon & { enter?: undefined; cover: Cover });

/** A place to stand (or sit on the floor), walked to from `from` or popped up at. */
export interface SpotLedge extends LedgeCommon {
  kind: 'spot';
  x: number;
  y: number;
  from?: Side;
  stance?: 'stand' | 'floor';
  enter?: 'pop' | 'walk';
}

/** Hiding behind `cover`: rising over its top or sliding out past one side. */
export interface PeekLedge extends LedgeCommon {
  kind: 'peek';
  side: 'left' | 'right' | 'top';
  cover: Cover;
  /** Where the feet are (the cover's foot by default). */
  ground?: number;
  /** Over the top: where, and how much of the character shows (0.6 by default; at least the eyes). */
  x?: number;
  show?: number;
  /** Past a side: how much of the width shows (0.6 by default). */
  reveal?: number;
}

export type Ledge = LineLedge | EdgeLedge | SpotLedge | PeekLedge;

// --- a character -----------------------------------------------------------------------------------------------------

export type PartParent = 'root' | 'body' | 'face';

/** Where torso-alt differs from the torso, in rig units: a corner a mitten can lift (`frac` < 0.4) or the whole sheet. */
export interface RevealInfo {
  at: Point;
  tip?: Point;
  frac: number;
  spread: number;
}

/** One part image, as the kit's exporter writes it: its box and pivot in rig units, its image at `base + img`. */
export interface RigPart {
  name: string;
  parent: PartParent;
  pivot: Point;
  /** An arm's drawn angle (0 = pointing right, 90 = down). */
  angle?: number | null;
  /** A leg's hip-to-sole length. */
  len?: number | null;
  /** A variant shown instead of this base part (eye-l-shut of eye-l, torso-alt of torso…). */
  variantOf?: string | null;
  /** Shown on one page theme only (stars-glow). */
  only?: Theme | null;
  /** Parts hidden while this variant shows, space separated; `face` is the whole face group. */
  hides?: string | null;
  z: number;
  x: number;
  y: number;
  w: number;
  h: number;
  img: string;
  /** The torso's pointer shape: [fx, fy] fractions of its box. */
  hit?: readonly Point[];
  /** torso-alt's secret. */
  reveal?: RevealInfo;
}

export interface Manifest {
  name?: string;
  prefix?: string;
  /** The ground point under the character, rig units. */
  ground: Point;
  faceCenter?: Point;
  /** Ground to the top of the body, decoration excluded. */
  height?: number;
  walk?: 'walk' | 'hop';
  viewBox?: Point;
  scale?: number;
  parts: RigPart[];
}

/** Per-character habits (all optional). */
export interface Traits {
  /** × walking speed. */
  pace?: number;
  /** Chosen three times as often. */
  likes?: readonly ActName[];
  /** Naps wherever a place allows it. */
  naps?: boolean;
  /** Small steps (a narrower leg swing). */
  shuffle?: boolean;
  /** Keeps its eyes open while stretching (shut, a pale face would have no dark mark left). */
  openStretch?: boolean;
  /** × how often it goes to a zone, by page theme. */
  zones?: Partial<Record<Theme, Partial<Record<Zone, number>>>>;
  /** × how often it comes at all, by page theme. */
  often?: Partial<Record<Theme, number>>;
}

/** A character on the bill: its part images are at `base + part.img`. */
export interface CastEntry {
  slug: string;
  base: string;
  manifest: Manifest;
  traits?: Traits;
}

// --- the page --------------------------------------------------------------------------------------------------------

export interface StageClock {
  now(): number;
  raf(fn: (now: number) => void): number;
  caf(id: number): void;
  /** Wakes the stepped mode just before a step is due; without it every animation frame is used. */
  timers?: { set(fn: () => void, ms: number): number; clear(id: number): void };
}

/** Everything the engine knows about the page. */
export interface StageEnv {
  /** Covers the whole page (position relative or absolute); the engine draws inside it, in page px. */
  layer: HTMLElement;
  ledges: readonly Ledge[] | (() => readonly Ledge[] | null | undefined);
  /** The part of the page in view. */
  viewport(): Rect;
  /** Px for a character 420 rig units tall (摺摺): 120 on a desktop, 80 on a phone; the others follow heightCurve. */
  unitHeight: number;
  /** Words and buttons: props keep off them, a torso over them takes no pointer, nobody walks off across them. */
  content?: readonly Rect[] | (() => readonly Rect[] | null | undefined);
  /** Shows the character's element behind `cover` and returns what undoes it; without it the engine clips. */
  behind?: (root: HTMLElement, cover: BehindCover) => () => void;
  theme: Theme;
  reducedMotion: boolean;
  clock?: StageClock;
  /** [0, 1) */
  random?: () => number;
  /** The layer's document by default. */
  document?: Document;
}

export interface StageOptions {
  /** × every character's height. */
  size: number;
  /** Pose steps a second (12: cut-paper stop motion); 0 is smooth. */
  fps: number;
  /** Position steps a second while fps is set. */
  moveFps: number;
  /** Height = unitHeight × (rig height / 420) ^ heightCurve (1: to scale). */
  heightCurve: number;
  /** Seconds before the first visitor. */
  first: readonly [number, number];
  /** Seconds a visit lasts. */
  visit: readonly [number, number];
  /** Seconds at least spent at the place once there. */
  dwell: number;
  /** Seconds between visitors. */
  gap: readonly [number, number];
  meetChance: number;
  /** The chance a second visitor comes on its own. */
  pairChance: number;
  /** Seconds at least between two walked-up meetings. */
  meetEvery: number;
  greetChance: number;
  /** Seconds at least between two greetings from afar. */
  greetEvery: number;
  /** Px from the side of the view past which a spot is usually popped up at instead. */
  farWalk: number;
  /** Seconds a walk in or out is kept to (a brisker walk, at most motion.ts's MAX_HURRY×). */
  walkLimit: number;
  /** Brightness of the characters on the dark page (the stars' glow stays). */
  nightDim: number;
  seed?: number;
  onEvent?: (e: StageEvent) => void;
  /** Starts at once (true by default). */
  autoplay?: boolean;
  /** Pauses while the layer is out of view (true by default). */
  observe?: boolean;
}

/** What setOptions takes: any option, and the page's theme and motion preference. */
export type StageSettings = Partial<StageOptions> & { theme?: Theme; reducedMotion?: boolean };

// --- what the engine answers -----------------------------------------------------------------------------------------

/** How a character reaches its place. */
export type How = 'walk' | 'pop' | 'climb' | 'rise' | 'slide';

/** An act event's act: an ActName, or a pair's (greet from afar, resonate, a note, a touch of mittens), or shy. */
export type StageAct = ActName | 'greet' | 'resonate' | 'note' | 'five' | 'shy';

export type MeetVariant = 'none' | 'note' | 'five';

export type StageEventDetail =
  | { type: 'enter'; how: How; side?: Side; ledge: string; label?: string }
  | { type: 'arrive'; ledge: string; label?: string }
  /** `with`: the other one's slug in a pair act or a note; `cause`: the visitor's pointer started it. */
  | { type: 'act'; act: StageAct; pair?: true; with?: string; cause?: 'hover' | 'poke' }
  | { type: 'meet'; pair: true; with: string }
  | { type: 'leave'; pair?: true; with?: string; together?: boolean };

/** `slug` and `name` are the character's (the first of a pair); `t` is the stage's time in seconds. */
export type StageEvent = StageEventDetail & { slug: string; name: string; t: number };

export type PuppetMode = 'enter' | 'act' | 'exit' | 'shy' | 'duet' | 'duet-walk' | 'still';

export interface VisitorInfo {
  slug: string;
  name: string;
  /** The ground point under it, page px. */
  x: number;
  y: number;
  mode: PuppetMode;
  ledge: string | null;
  /** Its height, px. */
  h: number;
}

export interface StageStats {
  /** Frames run, their total and longest cost (ms), steps taken. */
  n: number;
  sum: number;
  max: number;
  steps: number;
  avgMs: number;
}

export interface VisitRequest {
  /** A ledge id; any ledge in view otherwise. */
  ledge?: string;
  /** A cast slug; anyone otherwise. */
  slug?: string;
  /** What it does first, in order (names it doesn't know are dropped). */
  acts?: readonly string[];
  /** Someone else walks up to meet it once it is there (it stands where a meeting can happen). */
  meet?: boolean;
}

/** The stage, as createStage hands it out. Its functions don't need `this`. */
export interface StageApi {
  start(): void;
  stop(): void;
  pause(): void;
  resume(): void;
  /** The visitors on stage leave now and the next one comes. */
  next(): void;
  /** A meeting now; false when there is no place in view for one. */
  meet(variant?: MeetVariant): boolean;
  canMeet(): boolean;
  visit(request?: VisitRequest): boolean;
  setOptions(settings: StageSettings): void;
  setTheme(theme: Theme): void;
  setReducedMotion(reduced: boolean): void;
  /** Runs the stage `sec` seconds of its own time at once (tests, stills). */
  advance(sec: number): void;
  /** Re-reads the viewport and draws (after a scroll or a resize while paused). */
  refresh(): void;
  /**
   * The places were measured again (env.ledges answers the new ones): visitors whose place moved straight up or down
   * move with it, the others leave.
   */
  relayout(): void;
  visitors(): VisitorInfo[];
  /**
   * A tap at a page point (the apps' island, whose web view takes no touch): the visitor whose torso is there reacts as
   * to a click, and true; false if nobody is there.
   */
  tap(x: number, y: number): boolean;
  /** Where a tap would reach someone: each visitor's torso, page px (the apps keep a tap there from the card under it). */
  hits(): Rect[];
  stats(): StageStats;
  resetStats(): void;
  destroy(): void;
  /** The stage's own time, seconds. */
  readonly time: number;
}

// --- shared by the engine's modules ----------------------------------------------------------------------------------

/** A task is a generator stepped once per update; it writes that frame's pose. */
export type Task = Generator<void, void, unknown>;

export type ArmSide = 'L' | 'R';
export type Stance = 'stand' | 'sit' | 'floor';

/** A visit's plan: where the character stands, how it gets there, how long it stays. */
export interface Plan {
  ledge: Ledge;
  how: How;
  x: number;
  y: number;
  stance: Stance | 'peek';
  /** The ground's y at an x (a line follows its points). */
  surface: (x: number) => number;
  /** Walking: the side it comes in from, and the side it leaves by when someone was in the way. */
  side?: Side;
  exitSide?: Side;
  /** A spot far from the side of the view. */
  far?: boolean;
  speed?: number;
  endAt: number;
  exitDur: number;
  /** Acts to do first, in order. */
  first?: ActName[];
  target?: Point;
  cover?: Cover;
  noShadow?: boolean;
  /** Rising over a cover: how much shows, and the rise (rig units) hidden and shown. */
  show?: number;
  rise0?: number;
  rise1?: number;
  /** Sliding past a side: where it starts (hidden), its ground, and the arm behind the cover. */
  x0?: number;
  ground?: number;
  hidden?: ArmSide;
  /** The arm a wave uses (the visitor's pointer is on that side). */
  waveSide?: ArmSide;
}

/** Two characters meeting: `a` ends on the left. 'host': a guest walks up to `host`; 'pair': both walk in. */
export interface Duet {
  a: Puppet;
  b: Puppet;
  host?: Puppet;
  mode: 'host' | 'pair';
  variant?: MeetVariant;
  gen?: Task;
  met?: boolean;
  done?: boolean;
  together?: boolean;
}
