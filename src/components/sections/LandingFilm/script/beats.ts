/**
 * The film's beats (SPEC §5.3): one frame function per segment, `frame(x, ctx)`, where x is the act time A (seconds
 * into an act, on the act's own clock), the travel progress v (0…1, scrubbed by the scroll), or a change's p (0…1).
 * Each tick the director calls exactly one frame — the owner's (runtime/clock.ts `ownerOf`) — and that frame places
 * every DOM card slot, every actor and every prop the film shows then; what a frame doesn't place is hidden after it.
 * Frames are pure in (x, ctx): a scrub, a rewind and a jump all land on the same picture.
 *
 * The acting (step 2): every puppet is posed here — on twos (12 a second: what moves on its own is stop motion, what
 * the hand moves, the planes and the cards, is smooth). A live puppet skips the pose while its step is unchanged and
 * keeps the one it has; a still that hasn't gone live is stood in for by a ghost (the same rig, no DOM), so the cards
 * and the props always know where the mittens are. Turnovers: the paper half (the slip in a mitten, then flying and
 * turning edge-on) is a prop drawn here; at u = 0.5 the DOM card takes over. `ghost(seg, x, ctx)` evaluates another
 * segment's frame without touching the DOM.
 */
import type { Layout, Rect } from './layout';
import { ARMS_FRONT, EDGE_PX, HEADER_CLEAR, MARKS, SKY_CARDS, SWING_PX, boardSpot, carrierSpot, ctaSpot, markOf, pairSpots, skySpot, storySpot, topSpots, type Box, type PalSlug, type Spot } from './marks';
import { env } from '../kit/timeline';
import { SEG, bell, clamp01, lerp, smooth, span, type SceneN, type SegId } from './timeline';
import { quad, spline, yAt, type Pt } from './geom';
import { VALLEY_LEFT, VALLEY_LEFT_T, VALLEY_RIGHT, VALLEY_RIGHT_T, WALK, walkwayAt } from './ground';
import type { ArmSide, StickerPuppet, Stance } from '../kit/puppet';
import { MITTEN_MIDDLE } from '../kit/puppet';
import { bow, bowStrokes, hop, lookAt, moved, nod, wave } from '../kit/poses';
import { NO_PROPS, SLIP_H, SLIP_LINES, SLIP_W, type PropLook, type Props } from '../kit/props';
import { hopPose, hopsAt, sitBlend, walkAt } from '../kit/walk';
import { armAngle, heldInBody, heldOnStage, mittenAt, other, pencilHeld, rigOf, slipGripped, slipInHand, writeArms, writePose, type Held, type WritePose } from '../kit/write';

export type SlotId = 'story' | 'a' | 'b' | 'wave' | 'wave2' | 'cta' | 'sky0' | 'sky1' | 'sky2';
export const SLOT_IDS: SlotId[] = ['story', 'a', 'b', 'wave', 'wave2', 'cta', 'sky0', 'sky1', 'sky2'];

/** Where a DOM card stands this frame. */
export interface SlotPose {
  /** Its centre, stage px. */
  cx: number;
  cy: number;
  /** Uniform scale (it is laid out at full size, only ever scaled down). */
  scale?: number;
  /** A horizontal scale (unused since round 3's cards grow face-on out of the tossed paper; no turnover). */
  sx?: number;
  /** A squash (the catch). */
  sy?: number;
  /** Degrees. */
  rot?: number;
  alpha?: number;
  /** The ≋'s pen, 0…1 (the wave slot only). */
  draw?: number;
  /** The ≋'s stroke against its scale (the wave slot only: 1 as drawn; a ≋ scaled up keeps the pair's pen with 1/scale). */
  pen?: number;
}

export interface CardSlot {
  readonly id: SlotId;
  /** Its laid-out size at scale 1, px (measured on resize). */
  readonly w: number;
  readonly h: number;
  /** The card family its story card wears (cardColours' index; absent for a drawing): the slip it is written on wears it too. */
  readonly family?: number;
  place(p: SlotPose): void;
}

/** Where an actor stands this frame. */
export interface ActorPose {
  /** World x on its scene's ground plane — or stage px for a carrier. */
  x: number;
  /** World y of its feet (default: the ground at x) — or stage px for a carrier. */
  y?: number;
  alpha?: number;
  flip?: boolean;
}

export interface Actor {
  /** `1:tuck`, `carrier:dot`… */
  readonly key: string;
  readonly slug: PalSlug;
  place(p: ActorPose): void;
  /** Its live puppet, once its parts are decoded (absent or null: the still stands). */
  pup?: StickerPuppet | null;
  /** The step its live pose was made at (the beats skip the pose while it is unchanged). */
  poseKey?: string;
}

export interface BeatCtx {
  /** The scenery clock (film seconds). */
  s: number;
  layout: Layout;
  /** Each scene's measures (the journey's world is drawn larger on a tall screen). */
  layoutOf(scene: SceneN): Layout;
  /** Wall-clock seconds (the idle layer's), and whether the film is resting (no automatic motion). */
  now: number;
  resting: boolean;
  /** The hero block's box at rest (px). */
  hero: Rect;
  slot(id: SlotId): CardSlot;
  /** A scene's actor on its ground plane. */
  actor(scene: SceneN, slug: PalSlug): Actor | undefined;
  /** An actor riding a card, in screen space (the carrier layer, above the cards). */
  carrier(slug: PalSlug): Actor | undefined;
  /** World (a scene's plane of depth d, with its camera and its change offset now) → stage px, and back. */
  toScreen(scene: SceneN, x: number, y: number, depth?: number): [number, number];
  toWorld(scene: SceneN, px: number, py: number, depth?: number): [number, number];
  /** The world y of a scene's ground (the feet) at x. */
  groundY(scene: SceneN, x: number): number;
  /** A character with no DOM (posed afresh by whoever asks; one per tag), at a scene's size (default: this frame's). */
  ghost(slug: PalSlug, tag?: string, scene?: SceneN | 'carrier'): StickerPuppet;
  /** The props layer (slips, pencils, ripples, the blank, a bow's strokes). */
  props: Props;
  /** Bumped on every measure: a held pose made before it is made again. */
  epoch: number;
  /**
   * In a scene change, what the change's style does to the held group whose top is at `top` (stage px, where the beat
   * holds it): its offset (px, + down — already eased into the room under the header's pen line, so it never rises
   * within 12 px of it) and its opacity. Outside a change: nothing.
   */
  held(top: number): { dy: number; alpha: number };
  /** In a scene change, the style's shift of a leaving or an arriving scene's puppets (px, + down; opacity). */
  actorShift(scene: SceneN): { dy: number; alpha: number };
}

export type Frame = (x: number, ctx: BeatCtx) => void;

/* ───────────── the paper ───────────── */

/** 聆聆's own drawing (?b=drawn): its slip in the drawing's lavender paper and pen. */
const DRAWN_LOOK: PropLook = { fill: 'oklch(90% 0.035 290)', pen: 'oklch(40% 0.03 290)' };
/** What a slip is drawn in: the paper of the card it will become (its slot's family), else the drawing's. */
const lookOf = (slot: CardSlot): PropLook => (slot.family != null && slot.family >= 0 ? { family: slot.family } : DRAWN_LOOK);
/** The call to action's family (FilmCard's CTA_FAMILY): 牽牽's blank is a piece of its paper. */
const CTA_LOOK: PropLook = { family: 4 };

/* ───────────── helpers ───────────── */

const placeSpot = (slot: CardSlot, sp: Spot, extra: Partial<SlotPose> = {}) => slot.place({ cx: sp.cx, cy: sp.cy, scale: sp.scale, ...extra });

/** A slot's laid-out size. */
const box = (slot: CardSlot): Box => ({ w: slot.w, h: slot.h });
const storyOf = (ctx: BeatCtx) => storySpot(ctx.layout, ctx.hero, box(ctx.slot('story')));
/** Where card A waits for 點點 as the wind comes (the same card as the story: its slot's twin). */
const boardOf = (ctx: BeatCtx) => boardSpot(ctx.layout, ctx.hero, box(ctx.slot('a')), storyOf(ctx));
/** The pair's spots (reply, c2, bridge) and the pair's up top (bridge, meet, c3), for the cards as laid out. */
const pairOf = (ctx: BeatCtx, L = ctx.layout) => pairSpots(L, box(ctx.slot('a')), box(ctx.slot('b')), ctx.slot('wave').w);
const topOf3 = (ctx: BeatCtx) => topSpots(ctx.layoutOf(3), box(ctx.slot('a')), box(ctx.slot('b')), ctx.slot('wave2').w);

/** Stop motion: a time on twos (12 a second). */
const TWOS = 12;
const onTwos = (t: number) => Math.floor(t * TWOS + 1e-6) / TWOS;
/** A pose step's key: the segment, the frame on twos, the measure. */
const stepOf = (seg: string, t: number, ctx: BeatCtx) => `${seg}:${Math.floor(t * TWOS + 1e-6)}:${ctx.epoch}`;

type PoseFn = (P: StickerPuppet) => void;

/** The live puppet if there is one, else a ghost standing in for the still; its feet at stage (sx, sy), posed by fn. */
function posed(ctx: BeatCtx, a: Actor | undefined, slug: PalSlug, sx: number, sy: number, key: string, fn: PoseFn, stance: Stance = 'stand', scene?: SceneN | 'carrier'): StickerPuppet {
  const live = a?.pup ?? null;
  const P = live ?? ctx.ghost(slug, '', scene);
  P.x = sx;
  P.y = sy;
  const k = `${key}|${stance}`;
  if (live && a?.poseKey === k) return P;
  P.stance = stance;
  P.base();
  fn(P);
  if (live && a) a.poseKey = k;
  return P;
}

/** A scene change's shift of a scene's puppets, in world units on its ground (and their opacity). */
const shiftOf = (ctx: BeatCtx, scene: SceneN) => {
  const sh = ctx.actorShift(scene);
  return { dy: sh.dy / ctx.layoutOf(scene).u, alpha: sh.alpha };
};

/** A puppet of a scene standing at world x (its feet on the ground, or at world y), posed on its step. */
function act(ctx: BeatCtx, scene: SceneN, slug: PalSlug, at: ActorPose, key: string, fn: PoseFn, stance: Stance = 'stand'): StickerPuppet {
  const a = ctx.actor(scene, slug);
  const sh = shiftOf(ctx, scene);
  const y = (at.y ?? ctx.groundY(scene, at.x)) + sh.dy;
  a?.place({ ...at, y, alpha: (at.alpha ?? 1) * sh.alpha });
  const [sx, sy] = ctx.toScreen(scene, at.x, y);
  const front = ARMS_FRONT[scene]?.includes(slug);
  const pose: PoseFn = front
    ? (P) => {
        P.pose.keepL = P.pose.keepR = true;
        fn(P);
      }
    : fn;
  return posed(ctx, a, slug, sx, sy, key, pose, stance, scene);
}

/** A puppet riding a card (the carrier layer), its feet (or its seat) at stage px. */
function ride(ctx: BeatCtx, slug: PalSlug, px: number, py: number, key: string, fn: PoseFn, stance: Stance = 'sit', alpha = 1): StickerPuppet {
  const a = ctx.carrier(slug);
  a?.place(alpha >= 1 ? { x: px, y: py } : { x: px, y: py, alpha });
  return posed(ctx, a, slug, px, py, key, fn, stance, 'carrier');
}

/** Where a scene's puppet's feet are on the stage now. */
const feetOf = (ctx: BeatCtx, scene: SceneN, x: number): Pt => ctx.toScreen(scene, x, ctx.groundY(scene, x) + shiftOf(ctx, scene).dy);

/** A ghost of `slug` standing at stage (sx, sy), posed by fn (for another moment's pose: a release, a hold). */
function ghostAt(ctx: BeatCtx, slug: PalSlug, tag: string, [sx, sy]: Pt, fn: PoseFn, stance: Stance = 'stand', scene?: SceneN): StickerPuppet {
  const g = ctx.ghost(slug, tag, scene);
  g.x = sx;
  g.y = sy;
  g.stance = stance;
  g.base();
  fn(g);
  return g;
}

/** A face's own point, before it slides toward anything (where another looks to meet its eyes). */
const faceOf = (P: StickerPuppet): Pt => P.pagePoint(P.rig.face[0], P.rig.face[1]);

/* ───────────── writing a card, and tossing it ───────────── */

/** Who writes how: the slip held by its edge in the mitten on the side the card will go (or by a friend), the pencil in the other. */
interface Writer {
  hold: ArmSide;
  pen: ArmSide;
  wp: WritePose;
}
const writerFor = (P: StickerPuppet, towardRight: boolean): Writer => {
  const hold: ArmSide = towardRight ? 'R' : 'L';
  return { hold, pen: other(hold), wp: writePose(P, hold, other(hold)) };
};

type HeldProp = ReturnType<Props['get']>;
/**
 * A held prop drawn where it is held: inside the live puppet's hand layer (over its body and its arms), else on the
 * stage. `side`: the mitten that grips it — drawn again over it (kit/puppet `gripL` / `gripR`), so the paper lies in
 * front of the sleeve and the mitten closes over its edge.
 */
function drawHeld(prop: HeldProp, P: StickerPuppet, h: Held, alpha: number, side?: ArmSide): HeldProp {
  const layer = P.handLayer();
  const o = layer ? heldInBody(P, h) : heldOnStage(P, h);
  prop.into?.(layer);
  if (side && alpha > 0.3) {
    if (side === 'L') P.pose.gripL = true;
    else P.pose.gripR = true;
  }
  return prop.at(o.x, o.y, { k: o.k, rot: o.rot, anchor: h.anchor ?? 'center', alpha });
}

/** How much later than the pencil's going the pen arm comes down (s): the pencil is gone while the mitten is still up. */
const PEN_LATE = 0.15;
/** The pen arm's reach (0 rest … 1 writing): up over `pen`, back down over `away` (PEN_LATE behind the pencil). */
const penReach = (t: number, pen: readonly [number, number], away: readonly [number, number]) =>
  smooth(span(t, ...pen)) * (1 - smooth(span(t, away[0] + PEN_LATE, away[1] + PEN_LATE)));
/**
 * The pencil in the mitten: there as the arm starts up (0.15 s, never lying in a mitten still at rest), and gone over
 * 0.3 s as the writing ends, while the mitten is still up — never left in a lowered mitten, never dropped in one frame.
 */
const pencilShown = (t: number, pen: readonly [number, number], away: readonly [number, number]) =>
  smooth(span(t, pen[0], pen[0] + 0.15)) * (1 - smooth(span(t, away[0], away[0] + 0.3)));

/**
 * The slip in a hand with `ink` of it written (fading in by `appear`) — the writer's own (`slip` on its body), or a
 * friend's who holds it meanwhile (`holder`, `slip` on the friend's body) — and the pencil in the writer's pen mitten.
 */
function drawWriting(ctx: BeatCtx, name: string, look: PropLook, P: StickerPuppet, W: Writer, slip: Held, ink: number, appear: number, pencil: number, holder: { P: StickerPuppet; side: ArmSide } = { P, side: W.hold }): void {
  if (appear <= 0.005) return;
  drawHeld(ctx.props.get(`slip-${name}`, 'slip', look), holder.P, slip, appear, holder.side).ink(ink);
  if (pencil > 0.01) drawHeld(ctx.props.get(`pencil-${name}`, 'pencil'), P, pencilHeld(P, W.wp, W.pen, ink), pencil, W.pen);
}

/**
 * A toss (round 3, the owner: 「或許有點像它拋向空中，然後卡片慢慢的那一張慢慢的變大」), in act seconds: the slip lifted
 * (`lift`), let go (`release`) and tossed gently up over the head, slowing to the top of its arc (`top`), where it
 * hangs a moment; then the paper becomes the card (`become`: the card at the slip's size and place, the two crossfading)
 * and the card slowly grows into its place (`grown`), a soft halo blooming behind it. No turn, no flip.
 */
export interface Toss {
  lift: number;
  release: number;
  top: number;
  become: number;
  grown: number;
}
/**
 * How long the paper and the card crossfade (s) — the card held exactly on the paper meanwhile (its centre, width and
 * turn), growing only once the paper is gone: never a double image — and how much larger the paper is at the top than
 * in hand.
 */
export const FADE = 0.3;
const RISE_GROW = 1.7;

/** A vector turned `deg` (on the stage: + clockwise). */
const turned = ([x, y]: readonly [number, number], deg: number): Pt => {
  const a = (deg * Math.PI) / 180;
  return [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
};

/** The paper on the stage: its centre, its width (px) and its turn. */
interface Paper {
  cx: number;
  cy: number;
  w: number;
  rot: number;
}
/** The paper whose anchor (`a`, its units) is at stage (x, y), `k` px per unit, turned `rot`. */
function paperAt(x: number, y: number, k: number, rot: number, a: readonly [number, number]): Paper {
  const dx = (SLIP_W / 2 - a[0]) * k;
  const dy = (SLIP_H / 2 - a[1]) * k;
  const r = (rot * Math.PI) / 180;
  return { cx: x + dx * Math.cos(r) - dy * Math.sin(r), cy: y + dx * Math.sin(r) + dy * Math.cos(r), w: SLIP_W * k, rot };
}
/** A held slip's paper on the stage, through its holder's pose. */
const paperOf = (P: StickerPuppet, h: Held): Paper => {
  const o = heldOnStage(P, h);
  return paperAt(o.x, o.y, o.k, o.rot, h.anchor ?? [SLIP_W / 2, SLIP_H / 2]);
};
/** A paper on the stage as a thing held on a puppet's body, by its middle (between two mittens: neither's own grip). */
const heldAt = (P: StickerPuppet, p: Paper): Held => ({ at: rigOf(P, p.cx, p.cy), rot: p.rot - P.pose.tilt, scale: p.w / SLIP_W / P.k, anchor: [SLIP_W / 2, SLIP_H / 2] });
const mixPaper = (a: Paper, b: Paper, k: number): Paper => ({ cx: lerp(a.cx, b.cx, k), cy: lerp(a.cy, b.cy, k), w: lerp(a.w, b.w, k), rot: lerp(a.rot, b.rot, k) });
/**
 * How far a tosser's slip has come round its mitten (0 as held in front of the chest … 1 straight beyond the mitten):
 * with the arm's swing up (tossArm), so the paper leads the mitten up and never trails back over the shoulder.
 */
const tossOut = (A: number, T: Toss) => smooth(span(A, T.lift + 0.1, T.release - 0.05));

/** Where the tossed paper hangs: above the thrower's head, a little toward the card's place, under the header. */
function tossTop(ctx: BeatCtx, head: Pt, spot: Spot): Pt {
  const L = ctx.layout;
  return [lerp(head[0], spot.cx, 0.3), Math.max(HEADER_CLEAR + 40, head[1] - Math.max(44, 0.55 * L.pal))];
}

/** The paper tossed up (A from the release to the top: a soft arc, slowing to the top, fluttering a little), hanging there, fading as the card comes. */
function tossFlight(A: number, T: Toss, from: Paper, top: Pt): Paper & { alpha: number } {
  const u = span(A, T.release, T.top);
  const e = 1 - (1 - u) ** 2.4;
  const [x, y] = quad([from.cx, from.cy], [lerp(from.cx, top[0], 0.6), top[1] - 10], top, e);
  const hang = Math.max(0, A - T.top);
  const settle = smooth(span(hang, 0, 0.8));
  return {
    cx: x + 3 * Math.sin(hang * 2.3) * settle,
    cy: y - 3 * Math.sin(hang * 2.9) * settle,
    w: from.w * lerp(1, RISE_GROW, smooth(u)),
    rot: lerp(from.rot, -3, e) + 9 * Math.sin(2 * Math.PI * e) * (1 - e) + 1.5 * Math.sin(hang * 2) * settle,
    alpha: 1 - smooth(span(A, T.become, T.become + FADE)),
  };
}

/**
 * The card on the paper's size and place at the top while the two crossfade (`start`: the paper as it is now, or as it
 * was at the fade's end — `paperFor`), then slowly growing into its spot, drifting a little.
 */
function growCard(slot: CardSlot, A: number, T: Toss, start: Paper, spot: Spot): SlotPose {
  const u = span(A, T.become + FADE, T.grown);
  // from rest, then a long, slowing settle into its place
  const g = 1 - (1 - smooth(u)) ** 1.5;
  const side = Math.sign(spot.cx - start.cx) || 1;
  const drift = Math.sin(Math.PI * smooth(u));
  // across a little ahead of up: on a wide screen it rises beside the hero's words, not through them
  const gx = 1 - (1 - g) ** 1.8;
  return {
    cx: lerp(start.cx, spot.cx, gx) - side * 8 * drift,
    cy: lerp(start.cy, spot.cy, g) - 6 * drift,
    scale: lerp(start.w / slot.w, spot.scale, g),
    rot: lerp(start.rot, 0, smooth(u)),
    alpha: smooth(span(A, T.become, T.become + FADE)),
  };
}

/** The paper the card takes over from at A: the paper itself during the crossfade, as it was at the fade's end after. */
const paperFor = (A: number, T: Toss, from: Paper, top: Pt): Paper => tossFlight(Math.min(A, T.become + FADE), T, from, top);

/** The paper in the air (the props layer), its lines written (a blank's left as they are). */
function drawPaper(ctx: BeatCtx, name: string, kind: 'slip' | 'blank', look: PropLook, p: Paper & { alpha: number }) {
  if (p.alpha <= 0.01) return;
  const prop = ctx.props.get(`${kind}-${name}`, kind, look);
  prop.into?.(null);
  prop.at(p.cx, p.cy, { w: p.w, h: p.w * (SLIP_H / SLIP_W), rot: p.rot, alpha: p.alpha }).ink(1);
}

/**
 * A soft tissue halo blooming behind the card as it grows, fading once it is in its place — gone by `end` at the
 * latest (the act's end: never a faint disc left behind the card through the hold that follows).
 */
function bloom(ctx: BeatCtx, name: string, A: number, T: Toss, card: SlotPose, slot: CardSlot, end = Infinity) {
  const out = Math.min(1.2, Math.max(0.4, end - (T.grown - 0.2)));
  if (A < T.become || A > T.grown - 0.2 + out) return;
  const a = 0.5 * smooth((A - T.become) / 0.7) * (1 - smooth((A - T.grown + 0.2) / out));
  if (a <= 0.01) return;
  const size = Math.max(slot.w, slot.h) * (card.scale ?? 1) * 1.5;
  ctx.props.get(`halo-${name}`, 'halo').at(card.cx, card.cy, { w: size, h: size, alpha: a });
}

/** The tosser's holding arm (its lift now): dipping as it gathers, swung up toward the top to let go, then back down. */
function tossArm(P: StickerPuppet, side: ArmSide, A: number, T: Toss, held: number, top: Pt) {
  const dip = bell(A, T.lift, T.lift + 0.4);
  const up = smooth(span(A, T.lift + 0.2, T.release));
  const back = smooth(span(A, T.release + 0.2, T.top + 0.5));
  const toward = P.aim(side, top[0], top[1] - 30);
  P.setLift(side, lerp(lerp(held - 14 * dip, toward + 10, up), P.rest(side), back));
}
/** The tosser's body: a little crouch to gather, the stretch as it lets go, leaning toward where it goes. */
function tossBody(P: StickerPuppet, A: number, T: Toss, top: Pt) {
  const q = P.pose;
  const dip = bell(A, T.lift, T.lift + 0.4);
  const lift = bell(A, T.lift + 0.25, T.release + 0.35);
  q.sy *= (1 - 0.04 * dip) * (1 + 0.03 * lift);
  q.bodyUp += 7 * lift - 3 * dip;
  q.tilt += Math.sign(top[0] - P.x) * 3 * lift;
}

/** Writing's timing, 摺摺's card at the opening (act seconds): writing slowly, admiring it, the toss, the card grown, then a quiet moment to read it. */
export const W1 = {
  hold: [0.15, 0.5] as const,
  appear: [0.25, 0.45] as const,
  pen: [0.45, 0.8] as const,
  ink: [0.75, 3.6] as const,
  penAway: [3.6, 3.95] as const,
  toss: { lift: 4.3, release: 4.85, top: 5.85, become: 6.15, grown: 7.75 } as Toss,
  wave: 7.2,
};

/** 摺摺 writes its card at the blue hour (write, A on twos), admires it and tosses it up, `look`ing after it; then waves. */
function tuckWrites(P: StickerPuppet, A: number, W: Writer, top: Pt, look: Pt | null) {
  const q = P.pose;
  const T = W1.toss;
  q.front = true;
  const h = smooth(span(A, ...W1.hold));
  const w = penReach(A, W1.pen, W1.penAway);
  const ink = span(A, ...W1.ink);
  writeArms(P, W.wp, W.hold, W.pen, ink, h, w, 0, null);
  // eyes on the line being written, a small nod as each line begins: the hand at work
  const mid = W.wp.on([SLIP_W / 2, SLIP_H * 0.7]);
  q.faceY += (5 + 1.5 * Math.sin(Math.PI * ((ink * 3) % 1))) * w;
  q.faceX += Math.max(-8, Math.min(8, (mid[0] - P.rig.face[0]) / 5)) * w;
  // done: a look at it, glad
  const admire = smooth(span(A, W1.penAway[0], W1.penAway[1] + 0.2)) * (1 - smooth(span(A, T.lift, T.lift + 0.3)));
  q.faceY += 4 * admire;
  if (A >= 3.85 && A < T.lift) {
    q.mouth = 'mouth-open';
    q.blush = Math.max(q.blush, 0.45);
  }
  // the toss
  if (A >= T.lift) {
    tossBody(P, A, T, top);
    tossArm(P, W.hold, A, T, W.wp.hold, top);
  }
  if (look) lookAt(P, look[0], look[1], 0.9);
  if (A >= T.become) {
    q.mouth = 'mouth-open';
    q.blush = Math.max(q.blush, 0.5 * bell(A, T.become, W1.wave + 1.2));
  }
  if (A >= W1.wave) {
    wave(P, W.pen, A, W1.wave, W1.wave + 0.95, 2);
    q.blush = Math.max(q.blush, 0.55 * bell(A, W1.wave - 0.1, W1.wave + 1.2));
  }
  // then it rests, glad, looking at its card
  if (A >= W1.wave + 1.0) q.blush = Math.max(q.blush, 0.3);
}

/** 點點 beside it: reading along as it writes, a nod, its eyes after the paper and the card, a hop of joy. */
function dotWatches(P: StickerPuppet, A: number, look: Pt) {
  const q = P.pose;
  const T = W1.toss;
  lookAt(P, look[0], look[1]);
  nod(P, A, 1.6, 2.4, 1, 6);
  if (A >= T.release && A < T.top) q.mouth = 'mouth-o';
  if (A >= T.become) {
    q.mouth = 'mouth-open';
    q.blush = 0.5 * bell(A, T.become, W1.wave + 1.4);
  }
  hop(P, A, W1.wave + 0.35, W1.wave + 0.95, 60);
  if (A >= W1.wave + 0.55 && A < W1.wave + 0.8) q.eyes = 'shut';
}

/** 點點 on a card's top edge: sitting, holding on, its paper turning with the card. */
function dotRides(P: StickerPuppet, rot: number, armsUp: number, ahead: number) {
  const q = P.pose;
  q.tilt += rot;
  q.shadow = 0;
  q.faceX += ahead * 6;
  // little legs swinging over the edge
  if (armsUp > 0) {
    for (const side of ['L', 'R'] as const) P.setLift(side, lerp(P.rest(side), 150, armsUp));
    q.mouth = armsUp > 0.4 ? 'mouth-open' : 'mouth';
    q.blush = 0.6 * armsUp;
  }
}

/* ───────────── a card in 聆聆's hands ───────────── */

/**
 * In a hand a card is a small paper (round 5, the owner: 「這個卡他拿到手上的時候是不是要縮成一張很小的呢？」): the slip
 * of its own family, as the toss has it — a card in the sky, a paper in a mitten. Card A lands in 聆聆's left mitten as
 * that paper, is read in front of its chest, and becomes the card again as it is let go up to its place.
 */
/** 聆聆's slips are larger than 摺摺's: its paper arms are short for its wide body, and reach a larger card held at its chest. */
const NOD_SLIP = 1.5;
/** A slip passed from hand to hand (caught, handed over), against its size in front of the chest: it opens as it is brought in. */
export const PASS_SIZE = 0.56;
/** 點點's hop while 聆聆 reads (rig units). */
const READ_HOP = 50;
/** Card A in 聆聆's left mitten in front of its chest, to read: no pencil. */
const readHold = (P: StickerPuppet) => writePose(P, 'L', 'R', { penless: true, grow: NOD_SLIP });
/** How far above the level 聆聆 holds its left arm out for the card coming down the wind (degrees). */
const CATCH_UP = 38;
/** The catch (catch's act seconds, the slowed ones): the arm out for it, then the paper brought in front of the chest. */
export const CATCH_IN = [1.75, 2.45] as const;
/** Over the last of its flight the card becomes the paper it is in a hand (shares of the flight). */
export const CATCH_PAPER = [0.62, 0.92] as const;

/** The catch by the lone tree: 聆聆's reading hold, its left arm held out for the card, and the paper where it lands in that mitten. */
function catching(ctx: BeatCtx) {
  const feet = feetOf(ctx, 2, MARKS[2].card);
  const g = ghostAt(ctx, 'card', 'catch', feet, () => {}, 'stand', 2);
  const wp = readHold(ctx.ghost('card', 'w', 2));
  // out to its left and up: the arm's line on the stage is 180° + CATCH_UP (0 = right, 90 = down)
  const reach = 90 + CATCH_UP;
  g.setLift('L', reach);
  const land = paperOf(g, slipInHand(g, wp, 'L', 1, PASS_SIZE));
  return { wp, reach, land };
}
type Catching = ReturnType<typeof catching>;
/** How far the caught paper has been brought in (0 at arm's length … 1 in front of the chest). */
const caughtIn = (t: number) => smooth(span(t, ...CATCH_IN));
/** The caught paper in 聆聆's left mitten as its arm is now. */
const caughtSlip = (P: StickerPuppet, C: Catching, t: number): Held => {
  const e = caughtIn(t);
  return slipInHand(P, C.wp, 'L', 1 - e, lerp(PASS_SIZE, 1, e), 'slide');
};

/**
 * Ripples of the ≋ rising from a point (read, meet): the platform's own resonance glyph (the pair's ≋, at its pen),
 * drawn in as it starts, rising 34 px, a little larger, and fading. Never a heart. One at a time (round 4, the owner:
 * 「不會同時有很多疊在一起…有點像一個波這樣子傳出來」): `starts` are at least `life` apart, so a wave has gone before
 * the next leaves — a pulse sent out, then another, never a pile of marks. `width` is the glyph's (kept between 28 and
 * 64 px: a mark, not a banner).
 */
export const RIPPLE_LIFE = 0.95;
function ripples(ctx: BeatCtx, name: string, A: number, starts: number[], x: number, y: number, width: number, life = RIPPLE_LIFE) {
  const w0 = Math.min(64, Math.max(28, width));
  starts.forEach((a, i) => {
    const u = (A - a) / life;
    if (u <= 0 || u >= 1) return;
    const e = 1 - (1 - u) ** 2;
    const alpha = smooth(u / 0.2) * (1 - smooth((u - 0.5) / 0.5));
    const w = w0 * (0.8 + 0.35 * e);
    ctx.props.get(`ripple-${name}-${i}`, 'ripple').at(x, y - 10 - 34 * e, { w, h: w * 0.75, alpha }).ink(smooth(u / 0.35));
  });
}
/** The reading's and the meeting's waves (their act seconds): each a RIPPLE_LIFE after the one before, at the least. */
export const READ_RIPPLES = [1.1, 2.05, 2.95];
export const MEET_RIPPLES = [4.6, 5.55];

/* ───────────── the scenes' cast ───────────── */

/** A puppet's half width in a scene, world units (its torso, at its k there). */
const halfOf = (ctx: BeatCtx, slug: PalSlug, scene: SceneN) => {
  const g = ctx.ghost(slug, 'size', scene);
  return ((g.rig.torso.w / 2) * g.k) / ctx.layoutOf(scene).u;
};
/** 點點's place beside 聆聆 by the lone tree: a little gap between them, whatever the screen. */
const dotBy2 = (ctx: BeatCtx) => {
  const L = ctx.layoutOf(2);
  return MARKS[2].card + halfOf(ctx, 'card', 2) + halfOf(ctx, 'dot', 2) + (0.14 * L.pal) / L.u;
};
/** A puppet's drawing either side of its ground point in a scene, world units (its arms hanging as drawn). */
const boxOf = (ctx: BeatCtx, slug: PalSlug, scene: SceneN) => {
  const g = ctx.ghost(slug, 'size', scene);
  const u = ctx.layoutOf(scene).u;
  return { l: (-g.rig.box.l * g.k) / u, r: (g.rig.box.r * g.k) / u };
};
/** How far inside the view's edge a puppet's drawing keeps (EDGE_PX and its arms' swing), world units. */
const edgeOf = (ctx: BeatCtx, scene: SceneN) => (EDGE_PX + SWING_PX) / ctx.layoutOf(scene).u;

/**
 * The night's row of five, left to right, centred on the camera, a little gap between each. On a screen too narrow
 * for that they stand closer, shoulder to shoulder (their mittens touching) — never closer, and never nearer the
 * view's edges than edgeOf: a phone too narrow for that draws them smaller (lay(4).pal, CSS --pal-4).
 */
const NIGHT_ROW: PalSlug[] = ['tag', 'tuck', 'dot', 'card', 'night'];
/** Who turns to whom in the night's wait (牽牽 is still on its way). */
const GLANCE: Record<Exclude<PalSlug, 'tag'>, PalSlug> = { tuck: 'dot', dot: 'tuck', card: 'night', night: 'card' };
function nightRow(ctx: BeatCtx): Record<PalSlug, number> {
  const L = ctx.layoutOf(4);
  const halves = NIGHT_ROW.map((sl) => halfOf(ctx, sl, 4));
  const bodies = halves.reduce((a, h) => a + 2 * h, 0);
  // the arms beyond the torsos at the row's two ends
  const overL = Math.max(0, boxOf(ctx, NIGHT_ROW[0], 4).l - halves[0]);
  const overR = Math.max(0, boxOf(ctx, NIGHT_ROW[NIGHT_ROW.length - 1], 4).r - halves[halves.length - 1]);
  const room = L.view - 2 * edgeOf(ctx, 4) - bodies - overL - overR;
  const gap = Math.max(0, Math.min(((L.name === 'wide' ? 0.1 : 0.02) * L.pal) / L.u, room / (NIGHT_ROW.length - 1)));
  const total = overL + bodies + gap * (NIGHT_ROW.length - 1) + overR;
  // the drawings centred (not the torsos: the arms reach out further on one side than the other)
  let x = 1000 - total / 2 + overL;
  const out = {} as Record<PalSlug, number>;
  NIGHT_ROW.forEach((sl, i) => {
    out[sl] = x + halves[i];
    x += 2 * halves[i] + gap;
  });
  return out;
}


/** 點點 sitting on chip A's top edge, at its right third (seat at stage px, turning with the card). */
function seatOn(ctx: BeatCtx, sp: SlotPose): Pt {
  const a = ctx.slot('a');
  const sc = sp.scale ?? 1;
  const r = ((sp.rot ?? 0) * Math.PI) / 180;
  const dx = (a.w * sc) / 6;
  const dy = (-a.h * sc) / 2 + 3;
  return [sp.cx + dx * Math.cos(r) - dy * Math.sin(r), sp.cy + dx * Math.sin(r) + dy * Math.cos(r)];
}

/** Card A riding the wind on the journey: the carrier spot, bobbing and tilting with the scroll. */
function carried(ctx: BeatCtx, s = ctx.s): SlotPose {
  const sp = carrierSpot(ctx.layoutOf(2), box(ctx.slot('a')));
  return { cx: sp.cx, cy: sp.cy + 8 * Math.sin((2 * Math.PI * s) / 1.6), scale: sp.scale, rot: 3 * Math.sin((2 * Math.PI * s) / 2.2) };
}

/**
 * Card A as the wind comes (wind): from where it popped it eases down to where 點點 can sit on it (v 0.05–0.30: the
 * same card, no fold — round 2's 0.75 s, the travel since slowed around it: a card's flight keeps its pace), then
 * flutters, lifting a little.
 */
function windCard(ctx: BeatCtx, v: number): SlotPose {
  const from = storyOf(ctx);
  const to = boardOf(ctx);
  const k = smooth(span(v, 0.05, 0.3));
  const lift = 8 * smooth(span(v, 0.35, 1));
  return { cx: lerp(from.cx, to.cx, k), cy: lerp(from.cy, to.cy, k) - lift, scale: lerp(from.scale, to.scale, k), rot: 4 * Math.sin(3 * Math.PI * v) * (1 - v) * k };
}

function rides(ctx: BeatCtx, sp: SlotPose, key: string, armsUp = 0) {
  const [x, y] = seatOn(ctx, sp);
  ride(ctx, 'dot', x, y, key, (P) => dotRides(P, sp.rot ?? 0, armsUp, 1), 'sit', sp.alpha ?? 1);
}

/** A card's top on the stage (its scaled, turned box's), px. */
const topOf = (slot: CardSlot, sp: { cy: number; scale?: number; rot?: number }) => {
  const sc = sp.scale ?? 1;
  const r = (Math.abs(sp.rot ?? 0) * Math.PI) / 180;
  return sp.cy - ((slot.h * Math.cos(r) + slot.w * Math.sin(r)) * sc) / 2;
};

/** The top of 點點's head riding chip A at `sp` (a ghost seated where it would sit). */
function riderTop(ctx: BeatCtx, sp: SlotPose): number {
  const [x, y] = seatOn(ctx, sp);
  const g = ctx.ghost('dot', 'rider', 'carrier');
  g.x = x;
  g.y = y;
  g.stance = 'sit';
  g.base();
  dotRides(g, sp.rot ?? 0, 0, 1);
  return g.headPoint()[1] - 16 * g.k;
}

/** 聆聆 (and 點點) by the lone tree on the journey, looking at `at` (a change's style shifts and fades them). */
function scene2(ctx: BeatCtx, key: string, at: Pt | null, dot: boolean, fnNod?: PoseFn, fnDot?: PoseFn) {
  const N = act(ctx, 2, 'card', { x: MARKS[2].card }, key, (P) => {
    if (at) lookAt(P, at[0], at[1]);
    fnNod?.(P);
  });
  if (dot)
    act(ctx, 2, 'dot', { x: dotBy2(ctx) }, key, (P) => {
      lookAt(P, ...faceOf(N));
      fnDot?.(P);
    });
  return N;
}

/**
 * The valley: 摺摺 and 聆聆 crossing from either bank to the bridge's top, 點點 behind, 悄悄 waking (meet, A). Leaving
 * in a change (the style fading them), the bow's strokes and the ripples are not drawn.
 */
function scene3(ctx: BeatCtx, A0: number, key: string) {
  // the walk up at a walk's own pace, the meeting after it acted slower (round 3), its last pose held after it
  const t = meetClock(onTwos(A0));
  const tw = onTwos(A0);
  const whole = ctx.actorShift(3).alpha >= 1;
  const m = MARKS[3];
  const L3 = ctx.layoutOf(3);
  const u = L3.u;
  const h = (slug: PalSlug) => halfOf(ctx, slug, 3);
  // they meet at the bridge's top a hand's width apart, whatever their size on this screen
  const gT = ctx.ghost('tuck', 'w3', 3);
  const gN = ctx.ghost('card', 'w3', 3);
  const sep = ((gT.rig.torso.w / 2) * gT.k + (gN.rig.torso.w / 2) * gN.k + 0.16 * L3.pal) / u;
  const tuckTo = Math.min(m.tuckTo, 1000 - sep * 0.45);
  const cardTo = Math.max(m.cardTo, 1000 + sep * 0.55);
  // on a narrow screen they wait at the view's edges, at the bridge's feet, and rise with it — whole, inside the view
  const half = L3.view / 2;
  const edge = edgeOf(ctx, 3);
  const tuckFrom = Math.max(m.tuck, 1000 - half + edge + boxOf(ctx, 'tuck', 3).l);
  const cardFrom = Math.min(m.card, 1000 + half - edge - boxOf(ctx, 'card', 3).r);
  // 點點 and 悄悄 beside 聆聆 on the right bank, a little gap between each. 點點 stands whole in the view or not in it:
  // where there is no room beside 聆聆 at the bridge's foot it waits out of sight and hops in; on the bridge it keeps
  // inside the edge (on the narrowest phone a little in front of 聆聆's side)
  const dotBox = boxOf(ctx, 'dot', 3);
  const dotIn = 1000 + half - edge - dotBox.r;
  const dotBeside = cardFrom + 1.2 * (h('card') + h('dot'));
  const dotFrom = dotBeside <= dotIn ? dotBeside : Math.max(dotBeside, 1000 + half + dotBox.l + 4 / u);
  // 悄悄 too: whole in the view (pulled in from the edge where there is room beside 點點) or wholly out of it
  const nightBox = boxOf(ctx, 'night', 3);
  const nightAt = Math.max(m.night, dotBeside + 1.25 * (h('dot') + h('night')));
  const nightIn = 1000 + half - edge - nightBox.r;
  const nightOut = 1000 + half + nightBox.l + 4 / u;
  const nightX =
    nightAt <= nightIn || nightAt >= nightOut ? nightAt : nightIn >= Math.min(dotBeside, dotIn) + 1.1 * (h('dot') + h('night')) ? nightIn : nightOut;
  const dotTo = Math.min(m.dotTo, cardTo + 1.2 * (h('card') + h('dot')), dotIn);
  // (in the segment's own seconds: the walk is never slowed — the owner, 2026-11-12: 「走的有點像是慢動作」)
  const tuckKeys = [
    [MEET_WALK.tuck[0], tuckFrom],
    [MEET_WALK.tuck[1], tuckTo],
  ] as const;
  const nodKeys = [
    [MEET_WALK.nod[0], cardFrom],
    [MEET_WALK.nod[1], cardTo],
  ] as const;
  const tx = walkAtX(tw, tuckKeys);
  const nx = walkAtX(tw, nodKeys);
  const tuckFace = faceOf(ghostAt(ctx, 'tuck', 'face', valleyFeet(ctx, tx), () => {}, 'stand', 3));
  const nodFace = faceOf(ghostAt(ctx, 'card', 'face', valleyFeet(ctx, nx), () => {}, 'stand', 3));
  const apex = ctx.toScreen(3, 1000, walkwayAt(1000) - 260, 0.9);
  const meet = (P: StickerPuppet, other: Pt, side: 'L' | 'R') => {
    const q = P.pose;
    if (t < 3.4) lookAt(P, other[0], other[1], 0.6);
    else if (t < 5.5) lookAt(P, other[0], other[1], 1);
    if (t >= 3.5 && t < 4.1) {
      q.mouth = 'mouth-open';
      q.blush = Math.max(q.blush, 0.5 * bell(t, 3.4, 4.2));
    }
    const e = bow(P, t, 4.0, 4.5, 5.0, 5.5, 1);
    if (e > 0) {
      q.front = true;
      // mittens together before it, so a bow is never armless
      for (const sd of ['L', 'R'] as const) P.setLift(sd, lerp(P.rest(sd), sd === 'L' ? -28 : -28, e));
    }
    if (t >= 5.5) {
      wave(P, side, t, side === 'L' ? 5.6 : 5.7, 6.5, 2);
      q.mouth = 'mouth-open';
      q.blush = Math.max(q.blush, 0.5 * bell(t, 5.4, 6.6));
    }
    return e;
  };
  const T = act(ctx, 3, 'tuck', { x: tx, y: valleyY(ctx, tx) }, key, (P) => {
    walkAt(P, tw, tuckKeys, u);
    if (tw < MEET_WALK.tuck[0]) lookAt(P, apex[0], apex[1], 0.6);
    meet(P, nodFace, 'L');
  });
  const N = act(ctx, 3, 'card', { x: nx, y: valleyY(ctx, nx) }, key, (P) => {
    walkAt(P, tw, nodKeys, u);
    if (tw < MEET_WALK.nod[0]) lookAt(P, apex[0], apex[1], 0.6);
    meet(P, tuckFace, 'R');
  });
  // a bow's motion lines (on its bottom frames)
  const e = env(t, 4.0, 4.5, 5.0, 5.5);
  if (e >= 0.95 && whole) {
    bowStrokes(T, ctx.props.get('stroke-t-l', 'strokes'), ctx.props.get('stroke-t-r', 'strokes'), e);
    bowStrokes(N, ctx.props.get('stroke-n-l', 'strokes'), ctx.props.get('stroke-n-r', 'strokes'), e);
  }
  // the two connected: the ≋ rises between them
  const [hx1, hy1] = T.headPoint();
  const [hx2, hy2] = N.headPoint();
  // (the ripples on the segment's own seconds, each starting as the acting reaches it: a rest never stops one mid-air)
  if (whole) ripples(ctx, 'meet', A0, MEET_RIPPLES.map(meetStart), (hx1 + hx2) / 2, Math.min(hy1, hy2) - 6, 0.3 * Math.abs(hx2 - hx1) + 16);
  // 點點 hops twice behind 聆聆, then watches the two
  // the pause between its two hops is whole in the view too (it may have hopped in from out of sight)
  const dotMid = Math.min((dotFrom + dotTo) / 2, Math.max(dotTo, dotIn));
  const dx = dotX(t, dotFrom, dotTo, dotMid);
  act(ctx, 3, 'dot', { x: dx, y: valleyY(ctx, dx) }, key, (P) => {
    hopsAt(
      P,
      t,
      [
        [0.6, 1.3, dotFrom, dotMid],
        [1.5, 2.2, dotMid, dotTo],
      ],
      44,
    );
    const mid: Pt = [(tuckFace[0] + nodFace[0]) / 2, Math.min(tuckFace[1], nodFace[1])];
    if (t >= 2.2) lookAt(P, mid[0], mid[1]);
    if (t >= 4.6) {
      P.pose.mouth = 'mouth-open';
      P.pose.blush = 0.5 * bell(t, 4.6, 6.4);
    }
    hop(P, t, 5.1, 5.6, 50);
  });
  // 悄悄 on the right bank: dozing until they bow, then awake, lit
  act(ctx, 3, 'night', { x: nightX }, key, (P) => {
    const q = P.pose;
    const wake = span(t, 4.6, 5.6);
    q.eyes = t < 4.6 ? 'sleepy' : 'open';
    q.glow = smooth(wake);
    q.faceY += 4 * (1 - smooth(wake));
    q.bodyUp += 4 * bell(t, 4.6, 5.4);
    if (t >= 4.7) lookAt(P, nodFace[0], nodFace[1], 0.8);
    if (t >= 5.6) q.mouth = 'mouth-o';
  });
}
const walkAtX = (t: number, keys: readonly (readonly [number, number])[]) => {
  if (t <= keys[0][0]) return keys[0][1];
  const [t0, x0] = keys[0];
  const [t1, x1] = keys[keys.length - 1];
  return lerp(x0, x1, smooth((Math.min(t, t1) - t0) / (t1 - t0)));
};
const dotX = (t: number, from: number, to: number, mid = (from + to) / 2) => {
  const hx = (u: number, a: number, b: number) => lerp(a, b, smooth(clamp01((u - 0.17) / 0.61)));
  if (t < 0.6) return from;
  if (t < 1.3) return hx((t - 0.6) / 0.7, from, mid);
  if (t < 1.5) return mid;
  if (t < 2.2) return hx((t - 1.5) / 0.7, mid, to);
  return to;
};

/**
 * The valley's ground under x on the ground plane — on the walkway, wherever the bridge's own plane is now (it rises
 * under them in `bridge`, and flies off at its own pace in `c3`) — but never below the bank there: before the bridge
 * has come up, one waiting at its foot stands on the bank's lip (a phone's narrow view puts them there, so they are in
 * the valley as it arrives), and steps onto the walkway as it comes up past the bank.
 */
function valleyY(ctx: BeatCtx, x: number): number {
  const tall = ctx.layoutOf(3).name === 'tall';
  const [a, b] = tall ? WALK.tall : WALK.wide;
  if (x < a || x > b) return ctx.groundY(3, x);
  const [px, py] = ctx.toScreen(3, x, walkwayAt(x, tall), 0.9);
  return Math.min(ctx.toWorld(3, px, py, 1)[1], bankAt(x, tall));
}
const BANKS = new Map<string, Pt[]>();
/** The valley's bank under x (its paper's top, the feet 5 units in): the left bank left of the middle, the right one right of it. */
function bankAt(x: number, tall: boolean): number {
  const key = `${tall}${x < 1000 ? 'l' : 'r'}`;
  let e = BANKS.get(key);
  if (!e) {
    e = spline(x < 1000 ? (tall ? VALLEY_LEFT_T : VALLEY_LEFT) : tall ? VALLEY_RIGHT_T : VALLEY_RIGHT, 9, false);
    BANKS.set(key, e);
  }
  return yAt(e, x) + 5;
}
const valleyFeet = (ctx: BeatCtx, x: number): Pt => ctx.toScreen(3, x, valleyY(ctx, x) + shiftOf(ctx, 3).dy);

/**
 * The night's timing (act seconds): the lanterns going up into the sky (on a wide screen three of them become today's
 * stories, at a card's own pace); a quiet moment; 牽牽 steps in with a blank card held at its side; a look round; it
 * tosses the blank up and it grows into the call to action; they wave in turn.
 */
export const Y1 = {
  up: [0, 0.85] as const,
  sky: { from: 0.5, step: 0.12, dur: 1 },
  walk: [3.0, 5.0] as const,
  /** On a tall screen, a glance between neighbours while the lanterns rise. */
  glance: [1.1, 2.7] as const,
  show: [4.55, 5.0] as const,
  toss: { lift: 5.75, release: 6.3, top: 7.25, become: 7.5, grown: 8.9 } as Toss,
  waves: 7.6,
  waveStep: 0.25,
};

/** 牽牽 holding the blank by its edge at its side, below its face (no pencil: a card not written yet). */
const blankHold = (P: StickerPuppet) => writePose(P, 'R', 'L', { penless: true, grow: 1.3 });

/** The night: all five on the home hill; 牽牽 brings a blank card and tosses it up, and it grows into the call to action; they wave in turn. */
function scene4(ctx: BeatCtx, A: number, key: string, panel: Pt, top: Pt, look: Pt | null): StickerPuppet {
  const L = ctx.layoutOf(4);
  const t = onTwos(A);
  const T = Y1.toss;
  const row = nightRow(ctx);
  // 牽牽 steps in from the left to its place in the row — from as far left as the view's edge allows
  const tagFrom = Math.max(row.tag - (0.5 * L.pal) / L.u, 1000 - L.view / 2 + edgeOf(ctx, 4) + boxOf(ctx, 'tag', 4).l);
  const tagKeys = [
    [Y1.walk[0], Math.min(row.tag, tagFrom)],
    [Y1.walk[1], row.tag],
  ] as const;
  const tagX = walkAtX(t, tagKeys);
  const tagFace = faceOf(ghostAt(ctx, 'tag', 'face', feetOf(ctx, 4, tagX), () => {}, 'stand', 4));
  // on a tall screen no sky cards rise meanwhile: the wait has its own small beat — the four turn to a neighbour and
  // back, 悄悄's stars brighten (the review, round 3: the lanterns alone read as a stall, not a pause)
  const tall = L.name !== 'wide';
  const glance = tall ? bell(t, ...Y1.glance) : 0;
  const up = (P: StickerPuppet) => {
    // the lanterns going up into the night: everyone looks up; then at 牽牽 as it comes; then at the blank, the card
    const q = P.pose;
    if (t < Y1.walk[0] + 0.2) {
      q.faceY -= 7 * smooth(span(t, ...Y1.up)) * (1 - glance);
      if (glance > 0 && P.slug !== 'tag') {
        const nb = GLANCE[P.slug as Exclude<PalSlug, 'tag'>];
        const g = ctx.ghost(nb, 'glance', 4);
        const [fx, fy] = feetOf(ctx, 4, row[nb]);
        lookAt(P, fx, fy + g.rig.box.t * g.k * 0.6, 0.8 * glance);
        if (glance > 0.6) q.mouth = 'mouth-open';
      }
      if (P.slug === 'night') q.glow = 1 - 0.4 * Math.abs(Math.sin(Math.PI * 2 * span(t, ...Y1.glance)));
    }
    else if (!look || t < Y1.show[1]) {
      if (P.slug !== 'tag') lookAt(P, tagFace[0], tagFace[1], 0.7);
    } else lookAt(P, look[0], look[1], 0.7 * (1 - smooth(span(t, T.grown, T.grown + 0.6))));
  };
  const order: PalSlug[] = ['tag', 'tuck', 'dot', 'card', 'night'];
  const turnIn = (slug: PalSlug, P: StickerPuppet) => {
    const i = order.indexOf(slug);
    const a = Y1.waves + i * Y1.waveStep;
    const b = Math.min(a + 1.1, SEG.yours.dur);
    if (t < a) return;
    const q = P.pose;
    if (slug === 'dot') hop(P, t, a, a + 0.6, 56);
    else if (slug === 'night') {
      // its stars brighten twice
      q.glow = 1 - 0.55 * Math.abs(Math.sin(2 * Math.PI * span(t, a, b)));
      q.stars = 1;
      q.bodyUp += 4 * bell(t, a, b);
    } else wave(P, slug === 'card' ? 'R' : 'L', t, a, b, 2);
    q.mouth = 'mouth-open';
    q.blush = Math.max(q.blush, 0.45 * bell(t, a - 0.1, b + 0.3));
  };
  let tag: StickerPuppet | null = null;
  for (const slug of order) {
    if (slug === 'tag') {
      tag = act(ctx, 4, 'tag', { x: tagX }, key, (P) => {
        walkAt(P, t, tagKeys, L.u);
        up(P);
        const q = P.pose;
        // the blank: brought up to its side as it arrives, shown, then tossed
        const wp = blankHold(P);
        const h = smooth(span(t, ...Y1.show));
        if (h > 0) {
          q.front = true;
          P.setLift('R', lerp(P.rest('R'), wp.hold, h));
        }
        if (t >= Y1.show[1] && t < T.lift) {
          // a look at the others, then at its blank
          lookAt(P, panel[0], panel[1], 0.5 * smooth(span(t, Y1.show[1], T.lift)));
          q.mouth = 'mouth-open';
        }
        if (t >= T.lift) {
          tossBody(P, t, T, top);
          tossArm(P, 'R', t, T, wp.hold, top);
          if (look) lookAt(P, look[0], look[1], 0.8);
        }
        turnIn('tag', P);
      });
      continue;
    }
    act(ctx, 4, slug, { x: row[slug] }, key, (P) => {
      if (slug === 'night') P.pose.glow = 1;
      up(P);
      turnIn(slug, P);
    });
  }
  return tag!;
}

/** The pair at its spots (A, B and the ≋ drawn), lifted by `lift` px and faded by `alpha`. */
function pair(ctx: BeatCtx, lift = 0, alpha = 1) {
  const P = pairOf(ctx);
  placeSpot(ctx.slot('a'), { ...P.a, cy: P.a.cy - lift }, { alpha });
  placeSpot(ctx.slot('b'), { ...P.b, cy: P.b.cy - lift }, { alpha });
  ctx.slot('wave').place({ cx: P.wave.cx, cy: P.wave.cy - lift, rot: P.wave.rot, scale: P.wave.scale, draw: 1, alpha });
}

function atTop(ctx: BeatCtx, alpha = 1, lift = 0, wave = 1) {
  const T = topOf3(ctx);
  placeSpot(ctx.slot('a'), { ...T.a, cy: T.a.cy - lift }, { alpha });
  placeSpot(ctx.slot('b'), { ...T.b, cy: T.b.cy - lift }, { alpha });
  if (wave * alpha > 0.01) ctx.slot('wave2').place({ cx: T.wave.cx, cy: T.wave.cy - lift, scale: T.wave.scale, draw: wave, alpha: alpha });
}

/** 點點 hopping between two stage points over u (0…1): crouch, air (the actor changes layer at the apex), landing. */
function dotHop(ctx: BeatCtx, u: number, from: Pt, to: Pt, onGround: SceneN, groundAtStart: boolean, key: string, landSit: boolean, lookTo: Pt) {
  const air = clamp01((u - 0.17) / 0.61);
  const height = Math.max(40, 0.1 * ctx.layout.h);
  const ctrl: Pt = [(from[0] + to[0]) / 2, Math.min(from[1], to[1]) - height];
  const [x, y] = air <= 0 ? from : air >= 1 ? to : quad(from, ctrl, to, smooth(air));
  const dir = Math.sign(to[0] - from[0]) || 1;
  const fn: PoseFn = (P) => {
    hopPose(P, u, dir, 0);
    const q = P.pose;
    const ab = bell(air);
    q.shadow = air > 0 && air < 1 ? 0 : groundAtStart === u < 0.5 ? 1 : 0;
    for (const sd of ['L', 'R'] as const) P.setLift(sd, P.lift(sd) + 50 * ab);
    q.mouth = ab > 0.2 ? 'mouth-open' : q.mouth;
    if (landSit) sitBlend(P, smooth((u - 0.78) / 0.22));
    else if (!groundAtStart && u < 0.17) sitBlend(P, 1 - smooth(u / 0.17));
    lookAt(P, lookTo[0], lookTo[1], 0.7);
  };
  // the first half on its starting layer, the second on its landing layer
  const first = u < 0.5;
  const onStage = first === groundAtStart;
  if (onStage) {
    const [wx, wy] = ctx.toWorld(onGround, x, y);
    act(ctx, onGround, 'dot', { x: wx, y: wy }, key, fn);
  } else ride(ctx, 'dot', x, y, key, fn, 'stand');
}

/* ───────────── the answer ───────────── */

/**
 * The answer's timing (act seconds; round 4, the owner: 「點點從背後掏出那個卡片，拿給聆聆，聆聆拿在手上面去寫，寫完之後
 * 再交回去給他」): card A leaves 聆聆's mitten and goes up to its place (a card's own pace; `rise`: the paper it was in
 * the hand becoming the card again); 點點 reaches behind its back and brings out a small slip (`fetch`, `out`), holding
 * it out; 聆聆 reaches for it (`reach`), it passes from mitten to mitten (`pass`) and 聆聆 brings it in front of itself
 * (`hold`), where it opens, and writes on it, slowly; then holds it out again (`offer`), it passes back (`back`), and
 * 點點 tosses it up and it grows into B; the ≋ joins them; a quiet moment.
 */
export const R1 = {
  // a card's own move: round 2's 0.8 s (the owner, round 3: 「卡片…在移動…那種不要變慢」)
  up: 0.8,
  rise: 0.28,
  fetch: [0.7, 1.05] as const,
  out: [1.05, 1.45] as const,
  reach: [1.3, 1.6] as const,
  pass: [1.6, 1.8] as const,
  hold: [1.8, 2.15] as const,
  pen: [2.05, 2.4] as const,
  ink: [2.4, 4.5] as const,
  penAway: [4.5, 4.85] as const,
  offer: [4.85, 5.2] as const,
  back: [5.2, 5.4] as const,
  toss: { lift: 5.5, release: 6.05, top: 7.0, become: 7.3, grown: 8.75 } as Toss,
  wave: [8.6, 9.2] as const,
};

/** The pair's rise to the top over the bridge, seconds (round 2's whole bridge segment: a card's own pace). */
export const PAIR_RISE_S = 2;

/** How far behind its back 點點's arm goes for the slip (its lift there: across its own body, behind it). */
const DOT_BEHIND = -38;

/** Where 點點 holds the slip out for 聆聆: its left arm up and toward 聆聆 (degrees on the stage: 180 = level, toward 聆聆; 270 = straight up). */
const OFFER_ANGLE = 235;
/** Where on the slip 點點 holds out 聆聆's mitten takes it (slip units): by its top, a little toward 聆聆. */
const TAKE_AT: readonly [number, number] = [SLIP_W * 0.36, SLIP_H * 0.14];

/**
 * The hand-over by the lone tree (round 5: the paper never lies over a shoulder). The two stand a mitten apart, so the
 * small slip goes up into the gap between them: 點點 holds it out on its left arm (`offer`), straight beyond its
 * mitten, level with 聆聆's shoulder — `pass` is the paper there; 聆聆 reaches its right arm over to it (`take`) and its
 * mitten closes on the slip's top (`takeAt`, slip units), 點點 lets go, and 聆聆 brings it in front of its chest, where it
 * opens to the size it writes on (`wp`). It gives it back the same way. `rd` is card A's hold, read in the left mitten.
 * From both standing still (ghosts), so the pass is the same place every time.
 */
function handOver(ctx: BeatCtx) {
  const N = ghostAt(ctx, 'card', 'stand2', feetOf(ctx, 2, MARKS[2].card), () => {}, 'stand', 2);
  const D = ghostAt(ctx, 'dot', 'stand2', feetOf(ctx, 2, dotBy2(ctx)), () => {}, 'stand', 2);
  const wp = writePose(ctx.ghost('card', 'w', 2), 'R', 'L', { grow: NOD_SLIP });
  const rd = readHold(ctx.ghost('card', 'w', 2));
  const pd = D.pagePoint(...D.rig.arms.L.pivot);
  const offer = D.aim('L', pd[0] + 100 * Math.cos((OFFER_ANGLE * Math.PI) / 180), pd[1] + 100 * Math.sin((OFFER_ANGLE * Math.PI) / 180));
  D.setLift('L', offer);
  const pass = paperOf(D, slipGripped(wp, 'L', mittenAt(D, 'L', offer), armAngle('L', offer), 1, (PASS_SIZE * N.k) / D.k));
  // 聆聆's mitten onto the slip's top: as near TAKE_AT as its arm comes
  const kpx = pass.w / SLIP_W;
  const [tx, ty] = turned([(TAKE_AT[0] - SLIP_W / 2) * kpx, (TAKE_AT[1] - SLIP_H / 2) * kpx], pass.rot);
  const take = N.aim('R', pass.cx + tx, pass.cy + ty);
  N.setLift('R', take);
  const [mx, my] = N.mitten('R', MITTEN_MIDDLE);
  const [ux, uy] = turned([mx - pass.cx, my - pass.cy], -pass.rot);
  const takeAt: Pt = [Math.min(SLIP_W - 1.2, Math.max(1.2, SLIP_W / 2 + ux / kpx)), Math.min(SLIP_H - 1.2, Math.max(1.2, SLIP_H / 2 + uy / kpx))];
  return { N, D, wp, rd, take, offer, pass, takeAt };
}
type HandOver = ReturnType<typeof handOver>;

/** 聆聆's holding arm through the answer: out to take the slip, in to write on it, out again to give it back, down. */
const nodHoldLift = (P: StickerPuppet, A: number, H: HandOver) => {
  const rest = P.rest('R');
  if (A < R1.hold[0]) return lerp(rest, H.take, smooth(span(A, ...R1.reach)));
  if (A < R1.offer[0]) return lerp(H.take, H.wp.hold, smooth(span(A, ...R1.hold)));
  if (A < R1.back[1]) return lerp(H.wp.hold, H.take, smooth(span(A, ...R1.offer)));
  return lerp(H.take, rest, smooth(span(A, R1.back[1], R1.back[1] + 0.4)));
};
/** How far 聆聆's slip is out of its hold (1 at arm's length, as taken and as given back … 0 in front of the chest). */
const nodOut = (A: number) => (A < R1.offer[0] ? 1 - smooth(span(A, ...R1.hold)) : smooth(span(A, ...R1.offer)));
/** 點點's giving arm: behind its back for the slip, out with it, away once 聆聆 has it, out again to take it back. */
const dotGiveLift = (P: StickerPuppet, A: number, H: HandOver) => {
  const rest = P.rest('L');
  if (A < R1.out[0]) return lerp(rest, DOT_BEHIND, smooth(span(A, ...R1.fetch)));
  if (A < R1.pass[1]) return lerp(DOT_BEHIND, H.offer, smooth(span(A, ...R1.out)));
  if (A < R1.offer[0]) return lerp(H.offer, rest, smooth(span(A, R1.pass[1], R1.pass[1] + 0.35)));
  return lerp(rest, H.offer, smooth(span(A, ...R1.offer)));
};
/** How much of the slip is 聆聆's (0 in 點點's mitten … 1 in its own): the two passes. */
const nodHas = (A: number) => smooth(span(A, ...R1.pass)) * (1 - smooth(span(A, ...R1.back)));

/** The small slip in 點點's left mitten, straight beyond it on its arm's line (on 點點's own body: its hand layer draws it). */
function dotSlip(D: StickerPuppet, H: HandOver): Held {
  const lift = D.lift('L');
  return slipGripped(H.wp, 'L', mittenAt(D, 'L', lift), armAngle('L', lift), 1, (PASS_SIZE * H.N.k) / D.k);
}
/** The slip in 聆聆's right mitten as its arm is now: small at arm's length, open in front of its chest. */
function nodSlip(N: StickerPuppet, H: HandOver, A: number): Held {
  const out = nodOut(A);
  return slipInHand(N, H.wp, 'R', out, lerp(1, PASS_SIZE, out), H.takeAt);
}

/** 聆聆 in the answer: letting card A go up, taking the slip 點點 holds out, writing on it in its own mitten, giving it back, watching it fly and grow. */
function nodWrites(P: StickerPuppet, A: number, H: HandOver, going: SlotPose, at: Pt, look: Pt | null) {
  const q = P.pose;
  const T = R1.toss;
  // lifting the card up and letting it go: the left arm after it a little, then down
  q.bodyUp += 6 * bell(A, 0, 0.6);
  const after = lerp(H.rd.hold, P.aim('L', going.cx, going.cy), smooth(span(A, 0, 0.3)));
  P.setLift('L', lerp(after, P.rest('L'), smooth(span(A, 0.3, 0.75))));
  if (A < R1.up) {
    lookAt(P, going.cx, going.cy);
    return;
  }
  const w = penReach(A, R1.pen, R1.penAway);
  const ink = span(A, ...R1.ink);
  writeArms(P, H.wp, 'R', 'L', ink, 1, w, 0, null);
  P.setLift('R', nodHoldLift(P, A, H));
  // its eyes on the slip wherever it is (in 點點's mitten, in its own, flying), a small nod as each line begins
  lookAt(P, (look ?? at)[0], (look ?? at)[1], 0.9);
  q.faceY += 1.5 * Math.sin(Math.PI * ((ink * 3) % 1)) * w;
  // a little bow of thanks as it takes it
  q.bodyUp -= 3 * bell(A, R1.pass[0] - 0.1, R1.hold[1]);
  if ((A >= R1.pass[0] && A < R1.pen[0]) || (A >= R1.penAway[0] + 0.2 && A < T.lift)) {
    q.mouth = 'mouth-open';
    q.blush = Math.max(q.blush, 0.45);
  }
  if (A >= T.become) {
    q.mouth = 'mouth-open';
    q.blush = Math.max(q.blush, 0.55 * bell(A, T.become, R1.wave[1] + 0.6));
  }
  if (A >= R1.wave[0]) moved(P, 0.6 * bell(A, R1.wave[0], R1.wave[1] + 0.4));
}

/** 點點 in the answer: a slip from behind its back, held out to 聆聆; reading along; taking it back, a hop as it tosses it up, its eyes after it. */
function dotGives(P: StickerPuppet, A: number, H: HandOver, top: Pt, look: Pt) {
  const q = P.pose;
  const T = R1.toss;
  const lift = dotGiveLift(P, A, H);
  // behind its back the arm is behind its body; holding the slip out it is in front
  q.front = lift > P.rest('L') + 8;
  if (A < T.lift) P.setLift('L', lift);
  // a glance back over its shoulder as it reaches behind
  const back = bell(A, R1.fetch[0], R1.out[0] + 0.15);
  lookAt(P, look[0], look[1], 1 - 0.8 * back);
  q.faceX += 5 * back;
  q.tilt += 3 * back;
  if ((A >= R1.out[0] + 0.15 && A < R1.pen[0]) || (A >= R1.penAway[0] + 0.2 && A < T.lift)) {
    q.mouth = 'mouth-open';
    q.blush = 0.45;
  }
  if (A >= T.lift) {
    q.front = true;
    hop(P, A, T.lift, T.release + 0.35, 30);
    tossArm(P, 'L', A, T, H.offer, top);
    if (A < T.top) q.mouth = 'mouth-o';
  }
  if (A >= T.become) {
    q.mouth = 'mouth-open';
    q.blush = 0.5;
  }
  hop(P, A, R1.wave[0] + 0.05, R1.wave[0] + 0.6, 50);
}

/**
 * The bridge's coming (in its segment's v; round 4, the owner: 「符號就停留在那裡…橋直接從底下長出來」): the ≋ stays
 * between the two cards; the bridge grows up out of the river — from wholly under the water (`drop`, world units: its
 * crown below the river's surface, behind the banks and the water in front of it) to its place, over `rise`. Read by
 * the director for the bridge's own plane.
 */
export const BRIDGE_IN = { rise: [0.1, 0.92] as const, drop: 126 };

/* ───────────── the pace ───────────── */

/** A quiet moment in an act: at act second `at` the acting stops, its pose held, for `rest` seconds. */
export type Rest = readonly [at: number, rest: number];

/**
 * An act's clock with its quiet moments (留白): every motion at its own pace — one act second a second — and the room
 * between them made by holding a pose (`rests`, in act order), never by playing a motion slower. The owner
 * (2026-11-12): 「走的有點像是慢動作」 — rounds 3–5 had given the catch, the reading and the meeting their room by
 * playing them 1.35–1.4× slower, which slowed every walk, hop, nod and wave in them too; 「還是稍微有這個留白」.
 */
export function restClock(s: number, rests: readonly Rest[]): number {
  let a = s;
  for (const [at, rest] of rests) {
    if (a <= at) break;
    a = Math.max(at, a - rest);
  }
  return a;
}
/** The segment second at which an act's clock reaches act second `a` (the end of any rest at `a` not counted). */
export const restStart = (a: number, rests: readonly Rest[]) => a + rests.reduce((n, [at, rest]) => (at < a ? n + rest : n), 0);

/** The catch: the card flies at its own pace and lands at 1.6; once 聆聆 has brought it in to its chest, a moment. */
export const CATCH = { at: 1.6, rests: [[2.45, 0.6]] as readonly Rest[] } as const;
/** The reading: a moment before the first nod, and one after the two nods, before it is moved. */
export const READ_RESTS: readonly Rest[] = [
  [0.9, 0.4],
  [2.4, 0.5],
];
/** The meeting, after the walk up: a moment as they face each other, and one after the bow (and 點點's hop), before the waves. */
export const MEET_RESTS: readonly Rest[] = [
  [3.4, 0.8],
  [5.6, 0.8],
];
const MEET_ACTED = 6.5;
/**
 * The walk up the bridge, in the meeting's own seconds (never slowed: a walk played slower reads as slow motion — the
 * owner, 2026-11-12): 摺摺 and 聆聆 each [start, arrive]. The acting they arrive into (the look, the bow, the wave)
 * keeps its slower pace after it.
 */
export const MEET_WALK = { tuck: [0.25, 2.45], nod: [0.5, 2.7] } as const;
/** Where the acting stands when they arrive (the look turns full, the bow follows). */
const MEET_ARRIVE = 3.4;
/**
 * The meeting's acting clock from its segment's seconds, every motion at its own pace: the walk up (and 點點's hops
 * meanwhile) as the segment runs; from the arrival the meeting with its quiet moments (MEET_RESTS); held at MEET_ACTED.
 */
export function meetClock(s: number): number {
  const at = MEET_WALK.nod[1];
  const a = s <= at ? s : restClock(MEET_ARRIVE + (s - at), MEET_RESTS);
  return Math.min(MEET_ACTED, Math.max(0, a));
}
/** The segment second at which the meeting's clock reaches act second `a` (≥ the arrival). */
export const meetStart = (a: number) => MEET_WALK.nod[1] + restStart(a, MEET_RESTS) - MEET_ARRIVE;

/* ───────────── the frames ───────────── */

export const BEATS: Record<SegId, Frame> = {
  /**
   * 1 · write (blue hour): 摺摺 writes its card on a slip of the card's own paper, held at its side below its face; looks
   * at it, glad; tosses it up; the paper becomes the card, which slowly grows into its place — and holds there, read.
   */
  write(A, ctx) {
    const t = onTwos(A);
    const key = stepOf('write', A, ctx);
    const story = ctx.slot('story');
    const sp = storyOf(ctx);
    const L = ctx.layout;
    const T = W1.toss;
    const tuckX = markOf(1, 'tuck', L);
    const feet = feetOf(ctx, 1, tuckX);
    const Wt = writerFor(ctx.ghost('tuck', 'w', 1), sp.cx >= feet[0]);
    // the paper's way: from where it is let go (the pose on that step), up over the head, the card on from there
    const tRel = onTwos(T.release);
    const top = tossTop(ctx, ghostAt(ctx, 'tuck', 'head', feet, () => {}, 'stand', 1).headPoint(), sp);
    const rel = ghostAt(ctx, 'tuck', 'release', feet, (P) => tuckWrites(P, tRel, Wt, top, top), 'stand', 1);
    const from = paperOf(rel, slipInHand(rel, Wt.wp, Wt.hold, tossOut(tRel, T)));
    const flying = A >= T.release ? tossFlight(A, T, from, top) : null;
    const card = A >= T.become ? growCard(story, A, T, paperFor(A, T, from, top), sp) : null;
    const look: Pt | null = card ? [card.cx, card.cy] : flying ? [flying.cx, flying.cy] : A >= T.lift ? top : null;
    const P = act(ctx, 1, 'tuck', { x: tuckX }, key, (Q) => tuckWrites(Q, t, Wt, top, look));
    const appear = smooth(span(A, ...W1.appear));
    let slipAt: Pt = look ?? top;
    if (A < T.release) {
      const ink = span(t, ...W1.ink);
      const pen = pencilShown(t, W1.pen, W1.penAway);
      const slip = slipInHand(P, Wt.wp, Wt.hold, tossOut(t, T));
      drawWriting(ctx, 'write', lookOf(story), P, Wt, slip, ink, appear, pen);
      const at = paperOf(P, slip);
      if (!look) slipAt = [at.cx, at.cy];
    }
    if (flying) drawPaper(ctx, 'write', 'slip', lookOf(story), flying);
    if (card) {
      story.place(card);
      bloom(ctx, 'write', A, T, card, story);
    }
    act(ctx, 1, 'dot', { x: markOf(1, 'dot', L) }, key, (Q) => dotWatches(Q, t, slipAt));
  },

  /**
   * 2 · wind: the card eases down to where 點點 can board it (the same card: the story's slot hands over to A's, which
   * is its twin, as it starts to move), and flutters; 點點 hops onto its top edge.
   */
  wind(v, ctx) {
    const pose = windCard(ctx, v);
    if (span(v, 0.05, 0.35) <= 0) placeSpot(ctx.slot('story'), storyOf(ctx));
    else ctx.slot('a').place(pose);
    const at: Pt = [pose.cx, pose.cy];
    const tv = onTwos(v * SEG.wind.dur) / SEG.wind.dur;
    const key = stepOf('wind', v * SEG.wind.dur, ctx);
    // 摺摺 watches its card go, glad
    act(ctx, 1, 'tuck', { x: markOf(1, 'tuck', ctx.layout) }, key, (P) => {
      lookAt(P, at[0], at[1]);
      P.pose.mouth = 'mouth-open';
      P.pose.blush = 0.35;
      P.pose.bodyUp += 3 * bell(tv, 0, 0.5);
    });
    // 點點 hops up onto the chip and sits on its top edge
    const ground = feetOf(ctx, 1, markOf(1, 'dot', ctx.layout));
    if (tv < 0.35) {
      act(ctx, 1, 'dot', { x: markOf(1, 'dot', ctx.layout) }, key, (P) => {
        lookAt(P, at[0], at[1]);
        P.pose.mouth = tv > 0.15 ? 'mouth-o' : 'mouth';
        // gathering itself to jump
        const c = smooth(span(tv, 0.26, 0.35));
        P.pose.sy *= 1 - 0.06 * c;
        P.pose.sx *= 1 + 0.03 * c;
      });
    } else if (tv < 0.66) {
      const hu = span(tv, 0.35, 0.66);
      const seat = seatOn(ctx, windCard(ctx, Math.max(0.35, tv)));
      dotHop(ctx, hu, ground, seat, 1, true, key, true, [seat[0] + 40, seat[1] - 30]);
    } else rides(ctx, windCard(ctx, v), key);
  },

  /**
   * 3 · c1: the home flats fly, the journey rises (the change's style); the chip (with 點點) moves up to where the
   * wind carries it, held by the style.
   */
  c1(p, ctx) {
    const L = ctx.layout;
    const a = ctx.slot('a');
    const cs = windCard(ctx, 1);
    const end = carried(ctx, SEG.journey.t0);
    const k = smooth(p);
    const rest: SlotPose = { cx: lerp(cs.cx, end.cx, k), cy: lerp(cs.cy, end.cy, k), scale: lerp(cs.scale ?? 1, end.scale ?? 1, k), rot: lerp(cs.rot ?? 0, end.rot ?? 0, k) };
    // the held group's top: the chip's, or 點點's head riding it
    const h = ctx.held(Math.min(topOf(a, rest), riderTop(ctx, rest)));
    const pose: SlotPose = { ...rest, cy: rest.cy + h.dy, ...(h.alpha < 1 ? { alpha: h.alpha } : {}) };
    a.place(pose);
    const tq = onTwos(p * SEG.c1.dur);
    const key = stepOf('c1', p * SEG.c1.dur, ctx);
    rides(ctx, pose, key);
    // 摺摺 waves it goodbye as its hill starts to fly away (the style fades it before the hill passes the card)
    act(ctx, 1, 'tuck', { x: markOf(1, 'tuck', L) }, key, (P) => {
      lookAt(P, pose.cx, pose.cy);
      wave(P, 'L', tq, 0.05, 1.7, 3);
      P.pose.mouth = 'mouth-open';
      P.pose.blush = 0.4;
    });
    scene2(ctx, key, null, false);
  },

  /** 4 · journey: the camera rides along; the chip bobs on the wind with 點點 aboard; 聆聆 waits by the lone tree. */
  journey(v, ctx) {
    const pose = carried(ctx);
    ctx.slot('a').place(pose);
    const tv = onTwos(v * SEG.journey.dur) / SEG.journey.dur;
    const key = stepOf('journey', v * SEG.journey.dur, ctx);
    rides(ctx, pose, key, bell(tv, 0.2, 0.5));
    // 聆聆 notices the card coming on the wind
    scene2(ctx, key, tv > 0.55 ? [pose.cx, pose.cy] : null, false, (P) => {
      if (tv > 0.8) {
        P.pose.mouth = 'mouth-o';
        P.pose.bodyUp += 3 * smooth(span(tv, 0.8, 0.95));
      }
    });
  },

  /**
   * 5 · catch: the chip arcs down into 聆聆's left mitten, held out for it — becoming, as it lands, the small paper a card
   * is in a hand — and 聆聆 brings it in front of its chest; 點點 hops off beside it.
   */
  catch(A0, ctx) {
    const a = ctx.slot('a');
    // every motion at its own pace (the card's flight a card's); a quiet moment once it is held (CATCH.rests)
    const A = restClock(A0, CATCH.rests);
    const t = restClock(onTwos(A0), CATCH.rests);
    const key = stepOf('catch', A0, ctx);
    const start = carried(ctx, SEG.catch.t0);
    const C = catching(ctx);
    const k = smooth(span(A, 0, CATCH.at));
    const [fx, fy] = quad([start.cx, start.cy], [(start.cx + C.land.cx) / 2, Math.min(start.cy, C.land.cy) - 60], [C.land.cx, C.land.cy], k);
    const flying: SlotPose = { cx: fx, cy: fy, scale: lerp(start.scale ?? 1, C.land.w / a.w, k), rot: lerp(start.rot ?? 0, C.land.rot, k) };
    const caught = A >= CATCH.at;
    const N = act(ctx, 2, 'card', { x: MARKS[2].card }, key, (P) => {
      const q = P.pose;
      // the catch: the paper gives under it
      const give = bell(t, 1.55, 1.95);
      q.sy *= 1 - 0.045 * give;
      q.bodyUp -= 4 * give;
      if (t < CATCH.at) {
        lookAt(P, flying.cx, flying.cy);
        if (t > 0.6) q.mouth = 'mouth-o';
        const e = smooth(span(t, 0.9, 1.4));
        P.setLift('L', lerp(P.rest('L'), C.reach, e));
        P.setLift('R', lerp(P.rest('R'), P.rest('R') + 28, 0.6 * e));
      } else {
        P.setLift('L', lerp(C.reach, C.wp.hold, caughtIn(t)));
        P.setLift('R', lerp(P.rest('R'), P.rest('R') + 28, 0.6 * (1 - smooth(span(t, 1.7, 2.3)))));
        const at = paperOf(P, caughtSlip(P, C, t));
        lookAt(P, at.cx, at.cy, 0.8);
        q.mouth = 'mouth-open';
        q.blush = 0.4 * bell(t, 1.6, 2.5);
      }
    });
    if (caught) drawHeld(ctx.props.get('slip-a', 'slip', lookOf(a)), N, caughtSlip(N, C, t), 1, 'L').ink(1);
    else {
      // over the last of its flight the card is the paper already, the two on one another as they change over
      const paper = smooth(span(k, ...CATCH_PAPER));
      if (paper < 1) a.place(paper > 0 ? { ...flying, alpha: 1 - paper } : flying);
      if (paper > 0) drawPaper(ctx, 'a', 'slip', lookOf(a), { cx: fx, cy: fy, w: a.w * flying.scale!, rot: flying.rot!, alpha: paper });
    }
    // 點點: aboard until 0.9, then a hop down beside 聆聆
    if (A < 0.9) rides(ctx, flying, key);
    else if (A < 1.5) {
      const seat = seatOn(ctx, flying);
      dotHop(ctx, span(A, 0.9, 1.5), seat, feetOf(ctx, 2, dotBy2(ctx)), 2, false, key, false, faceOf(N));
    } else
      act(ctx, 2, 'dot', { x: dotBy2(ctx) }, key, (P) => {
        lookAt(P, ...faceOf(N));
        P.pose.mouth = 'mouth-open';
      });
  },

  /** 6 · read: 聆聆 reads the card — a small paper in its left mitten, in front of its chest — 點點 reading along; the ripples ≋ rise — never a heart. */
  read(A0, ctx) {
    const a = ctx.slot('a');
    // read at a reader's pace with its quiet moments (READ_RESTS), then a last one (all on twos: the ripples too)
    const t = restClock(onTwos(A0), READ_RESTS);
    const key = stepOf('read', A0, ctx);
    const wp = readHold(ctx.ghost('card', 'w', 2));
    const N = act(ctx, 2, 'card', { x: MARKS[2].card }, key, (P) => {
      nod(P, t, 1.0, 1.6, 1, 6);
      nod(P, t, 1.8, 2.4, 1, 6);
      moved(P, bell(t, 2.4, 3.5));
      P.setLift('L', wp.hold);
      // its eyes run along the card's lines
      const [x0, x1, y] = SLIP_LINES[1];
      const [lx, ly] = P.pagePoint(...wp.on([lerp(x0, x1, (t * 0.5) % 1), y]));
      lookAt(P, lx, ly, 0.9);
    });
    const held = slipInHand(N, wp, 'L');
    drawHeld(ctx.props.get('slip-a', 'slip', lookOf(a)), N, held, 1, 'L').ink(1);
    const at = paperOf(N, held);
    const [hx, hy] = N.headPoint();
    // (on the segment's own seconds, each starting as the reading reaches it: a rest never stops one mid-air)
    ripples(ctx, 'read', onTwos(A0), READ_RIPPLES.map((r) => restStart(r, READ_RESTS)), hx, hy, N.rig.torso.w * N.k * 0.45);
    act(ctx, 2, 'dot', { x: dotBy2(ctx) }, key, (P) => {
      // reading along, then looking up at 聆聆
      if (t < 2.2) lookAt(P, at.cx, at.cy);
      else lookAt(P, ...faceOf(N));
      if (t > 2.2) {
        P.pose.mouth = 'mouth-open';
        P.pose.blush = 0.5;
      }
      hop(P, t, 3.0, 3.5, READ_HOP);
    });
  },

  /**
   * 7 · reply: the paper leaves 聆聆's mitten and is the card again as it goes up to pair spot A; 點點 brings a small slip
   * of B's paper out from behind its back and hands it to 聆聆, who brings it in front of its chest and writes its answer
   * on it, then hands it back; 點點 tosses it up, it grows into B; the ≋ joins them.
   */
  reply(A, ctx) {
    const a = ctx.slot('a');
    const b = ctx.slot('b');
    const t = onTwos(A);
    const key = stepOf('reply', A, ctx);
    const PS = pairOf(ctx);
    const T = R1.toss;
    const feet = feetOf(ctx, 2, MARKS[2].card);
    const dotFeet = feetOf(ctx, 2, dotBy2(ctx));
    const H = handOver(ctx);
    const W: Writer = { hold: 'R', pen: 'L', wp: H.wp };
    // card A: from the paper in the left mitten (as it was read), up to its place — the card again within its first steps
    const reading = ghostAt(ctx, 'card', 'hold', feet, (P) => P.setLift('L', H.rd.hold), 'stand', 2);
    const inHand = paperOf(reading, slipInHand(reading, H.rd, 'L'));
    const k = smooth(span(A, 0, R1.up));
    const [cx, cy] = quad([inHand.cx, inHand.cy], [(inHand.cx + PS.a.cx) / 2, Math.min(inHand.cy, PS.a.cy) - 40], [PS.a.cx, PS.a.cy], k);
    const going: SlotPose = { cx, cy, scale: lerp(inHand.w / a.w, PS.a.scale, k), rot: lerp(inHand.rot, 0, k) };
    const card = smooth(span(A, 0, R1.rise));
    a.place(card < 1 ? { ...going, alpha: card } : going);
    if (card < 1) drawPaper(ctx, 'a', 'slip', lookOf(a), { cx, cy, w: a.w * going.scale!, rot: going.rot!, alpha: 1 - card });
    // the answer's paper: from 點點's mitten as it lets go, up over the two of them, B on from there
    const heads = [H.N.headPoint(), H.D.headPoint()];
    const top = tossTop(ctx, [(heads[0][0] + heads[1][0]) / 2, Math.min(heads[0][1], heads[1][1])], PS.b);
    const tRel = onTwos(T.release);
    const rel = ghostAt(ctx, 'dot', 'release', dotFeet, (P) => dotGives(P, tRel, H, top, top), 'stand', 2);
    const from = paperOf(rel, dotSlip(rel, H));
    const flying = A >= T.release ? tossFlight(A, T, from, top) : null;
    const grown = A >= T.become ? growCard(b, A, T, paperFor(A, T, from, top), PS.b) : null;
    const look: Pt | null = grown ? [grown.cx, grown.cy] : flying ? [flying.cx, flying.cy] : A >= T.lift ? top : null;
    // where the slip is this step, for their eyes: from the pose a step ago would lag, so from the hand-over's own stand
    const has = nodHas(t);
    const gD = ghostAt(ctx, 'dot', 'eyes', dotFeet, (P) => P.setLift('L', dotGiveLift(P, t, H)), 'stand', 2);
    const his0 = paperOf(gD, dotSlip(gD, H));
    const writing = H.N.pagePoint(...H.wp.on([SLIP_W / 2, SLIP_H * 0.6]));
    const slipAt: Pt = [lerp(his0.cx, writing[0], has), lerp(his0.cy, writing[1], has)];
    const shown = t >= R1.out[0] + 0.1;
    const N = act(ctx, 2, 'card', { x: MARKS[2].card }, key, (P) => nodWrites(P, t, H, going, shown ? slipAt : faceOf(gD), look));
    const D = act(ctx, 2, 'dot', { x: dotBy2(ctx) }, key, (P) => dotGives(P, t, H, top, look ?? (shown ? slipAt : faceOf(N))));
    if (A < T.release) {
      const ink = span(t, ...R1.ink);
      const pen = pencilShown(t, R1.pen, R1.penAway);
      // out from behind 點點's back: there once the mitten has come round its body, opening as it comes
      const appear = smooth(span(t, lerp(R1.out[0], R1.out[1], 0.55), lerp(R1.out[0], R1.out[1], 0.95)));
      const his = dotSlip(D, H);
      const own = nodSlip(N, H, t);
      if (has <= 0) drawWriting(ctx, 'reply', lookOf(b), N, W, appear < 1 ? { ...his, scale: his.scale * lerp(0.5, 1, appear) } : his, ink, appear, pen, { P: D, side: 'L' });
      else if (has >= 1) drawWriting(ctx, 'reply', lookOf(b), N, W, own, ink, 1, pen);
      else {
        // from mitten to mitten: between the two grips, in the hand it is nearer
        const mid = mixPaper(paperOf(D, his), paperOf(N, own), has);
        if (has < 0.5) drawWriting(ctx, 'reply', lookOf(b), N, W, heldAt(D, mid), ink, 1, pen, { P: D, side: 'L' });
        else drawWriting(ctx, 'reply', lookOf(b), N, W, heldAt(N, mid), ink, 1, pen);
      }
    }
    if (flying) drawPaper(ctx, 'reply', 'slip', lookOf(b), flying);
    if (grown) {
      b.place(grown);
      bloom(ctx, 'reply', A, T, grown, b);
    }
    const draw = span(A, ...R1.wave);
    if (draw > 0) ctx.slot('wave').place({ cx: PS.wave.cx, cy: PS.wave.cy, rot: PS.wave.rot, scale: PS.wave.scale, draw });
  },

  /** 8 · c2: the journey flies, the valley rises (the change's style); the pair holds, as the style holds it. */
  c2(p, ctx) {
    const PS = pairOf(ctx);
    const h = ctx.held(Math.min(topOf(ctx.slot('a'), PS.a), topOf(ctx.slot('b'), PS.b), topOf(ctx.slot('wave'), PS.wave)));
    pair(ctx, -h.dy, h.alpha);
    const key = stepOf('c2', p * SEG.c2.dur, ctx);
    const mid: Pt = [PS.wave.cx, PS.wave.cy];
    // the journey's two (the style fades them before their hill flies up past the cards)
    const N = scene2(ctx, key, mid, false, (P) => {
      P.pose.mouth = 'mouth-open';
      P.pose.blush = 0.3;
    });
    act(ctx, 2, 'dot', { x: dotBy2(ctx) }, key, (P) => lookAt(P, ...faceOf(N)));
    scene3(ctx, 0, key);
  },

  /**
   * 9 · bridge: the pair goes up top, its ≋ between the two all the way (it never leaves them); under them the bridge
   * grows up out of the river (BRIDGE_IN, the director's).
   */
  bridge(v, ctx) {
    // side by side at every width (the pair is never stacked): the two go up together to their places at the top
    const PS = pairOf(ctx, ctx.layoutOf(2));
    const T = topOf3(ctx);
    // the cards' own move keeps round 2's 2 s (「卡片…在移動…那種不要變慢」): under ▶ the segment's last 0.6 s is a rest
    const k = smooth(span(v * SEG.bridge.dur, 0, Math.min(PAIR_RISE_S, SEG.bridge.dur)));
    const mix = (a: Spot, b: Spot): Spot => ({ cx: lerp(a.cx, b.cx, k), cy: lerp(a.cy, b.cy, k), scale: lerp(a.scale, b.scale, k) });
    placeSpot(ctx.slot('a'), mix(PS.a, T.a));
    placeSpot(ctx.slot('b'), mix(PS.b, T.b));
    // the ≋ with them: the pair's own until they are up, the top's from then on (the same mark at the same place)
    const w = mix(PS.wave, T.wave);
    if (k < 1) ctx.slot('wave').place({ cx: w.cx, cy: w.cy, scale: w.scale, rot: (PS.wave.rot ?? 0) * (1 - k), draw: 1 });
    else ctx.slot('wave2').place({ cx: T.wave.cx, cy: T.wave.cy, scale: T.wave.scale, draw: 1 });
    scene3(ctx, 0, stepOf('bridge', onTwos(v * SEG.bridge.dur), ctx));
  },

  /** 10 · meet: 摺摺 and 聆聆 cross from either bank to the bridge's top and bow; 悄悄 wakes. */
  meet(A, ctx) {
    atTop(ctx);
    scene3(ctx, A, stepOf('meet', A, ctx));
  },

  /** 11 · c3: lanterns rise from the town; the pair at the top, the valley and the night as the change's style moves them. */
  c3(p, ctx) {
    const T = topOf3(ctx);
    const h = ctx.held(Math.min(topOf(ctx.slot('a'), T.a), topOf(ctx.slot('b'), T.b)));
    if (h.alpha > 0) atTop(ctx, h.alpha, -h.dy);
    const key = stepOf('c3', p * SEG.c3.dur, ctx);
    // the valley's four (with the bridge), as the style lets them go
    if (ctx.actorShift(3).alpha > 0.01) scene3(ctx, SEG.meet.dur, key);
    const cta = ctx.slot('cta');
    const sp = ctaSpot(ctx.layout, cta.h);
    scene4(ctx, 0, key, [sp.cx, sp.cy], [sp.cx, sp.cy], null);
  },

  /** 12 · yours: three lanterns become today's stories (wide); 牽牽 tosses up a blank card that grows into the call to action. */
  yours(A, ctx) {
    const L = ctx.layout;
    const cta = ctx.slot('cta');
    const sp = ctaSpot(L, cta.h);
    const key = stepOf('yours', A, ctx);
    const T = Y1.toss;
    if (L.name === 'wide') {
      for (let i = 0; i < SKY_CARDS; i++) {
        const k = smooth(span(A, Y1.sky.from + i * Y1.sky.step, Y1.sky.from + i * Y1.sky.step + Y1.sky.dur));
        const sky = skySpot(L, i, cta.w * sp.scale);
        if (k > 0) placeSpot(ctx.slot(`sky${i}` as SlotId), sky, { scale: lerp(0.3, 1, k) * sky.scale, alpha: k });
      }
    }
    // the blank's way: from 牽牽's mitten as it lets go, up over its head, the card on from there
    const feet = feetOf(ctx, 4, nightRow(ctx).tag);
    const head = ghostAt(ctx, 'tag', 'head', feet, () => {}, 'stand', 4).headPoint();
    const top = tossTop(ctx, head, sp);
    const tRel = onTwos(T.release);
    const rel = ghostAt(
      ctx,
      'tag',
      'release',
      feet,
      (P) => {
        P.pose.front = true;
        tossBody(P, tRel, T, top);
        tossArm(P, 'R', tRel, T, blankHold(P).hold, top);
      },
      'stand',
      4,
    );
    const from = paperOf(rel, slipInHand(rel, blankHold(rel), 'R', tossOut(tRel, T)));
    const flying = A >= T.release ? tossFlight(A, T, from, top) : null;
    const card = A >= T.become ? growCard(cta, A, T, paperFor(A, T, from, top), sp) : null;
    const look: Pt | null = card ? [card.cx, card.cy] : flying ? [flying.cx, flying.cy] : A >= T.lift ? top : null;
    const tag = scene4(ctx, A, key, [sp.cx, sp.cy], top, look);
    // the blank in 牽牽's mitten, at its side
    if (A < T.release) {
      const show = smooth(span(A, Y1.show[0], Y1.show[0] + 0.25));
      if (show > 0.005) {
        const wp = blankHold(tag);
        drawHeld(ctx.props.get('blank-cta', 'blank', CTA_LOOK), tag, slipInHand(tag, wp, 'R', tossOut(onTwos(A), T)), show, 'R');
      }
    }
    if (flying) drawPaper(ctx, 'cta', 'blank', CTA_LOOK, flying);
    if (card) {
      cta.place(card);
      bloom(ctx, 'cta', A, T, card, cta, SEG.yours.dur);
    }
  },

  /** 13 · rest: the night holds, idle life only, until the stage lets go. */
  rest(_x, ctx) {
    BEATS.yours(SEG.yours.dur, ctx);
  },
};

/* ───────────── ghosts: a frame evaluated elsewhere, without the DOM ───────────── */

export interface Ghost {
  slots: Map<SlotId, SlotPose>;
  actors: Map<string, ActorPose>;
}

/** What `seg`'s frame would place at x, recorded (for continuity: a travel starting where an act ended). */
export function ghost(seg: SegId, x: number, ctx: BeatCtx): Ghost {
  const g: Ghost = { slots: new Map(), actors: new Map() };
  const rec: BeatCtx = {
    ...ctx,
    slot: (id) => {
      const real = ctx.slot(id);
      return { id, w: real.w, h: real.h, place: (p) => g.slots.set(id, p) };
    },
    actor: (scene, slug) => ({ key: `${scene}:${slug}`, slug, place: (p) => g.actors.set(`${scene}:${slug}`, p) }),
    carrier: (slug) => ({ key: `carrier:${slug}`, slug, place: (p) => g.actors.set(`carrier:${slug}`, p) }),
    props: NO_PROPS,
  };
  BEATS[seg](x, rec);
  return g;
}
