/**
 * A paper puppet in the film: a copy of the sticker kit's puppet (designs/stickers/kit/puppet.ts), its imports
 * rewritten to `@/lib/mascots/*`. The same rig (rig.ts reads the manifest), the same DOM (root → body → face, one <img>
 * per part turned about the rig's pivots), the same pose fields and transforms, so it moves exactly as the stickers and
 * the landing page's puppets do. What the film changes:
 * - it can be built without a DOM (`doc` null): a ghost that only answers where things are (pagePoint, mitten, aim),
 *   for a beat that needs another moment's pose, or a still that hasn't gone live yet;
 * - it is drawn at its element's origin: the element (the still's own `[data-actor]` box, riding its plane, or the
 *   carrier) stands at the feet, so the root only lifts by `rise` — `x`/`y` are the feet's stage px, for the geometry;
 * - every style is written only when it changes (the engine's cache), so a held pose costs nothing;
 * - it has a hand layer (`handLayer`): what it holds (a slip, a pencil) drawn inside its body, so it moves, turns and
 *   breathes with the body — in front of the torso and of both arms (round 5, the owner: 「卡片看起來是從…這隻臂下穿過去，
 *   而且截斷了他的肩膀」: a card under an arm hid the body's edge where the arm is pinned, and the arm read as cut
 *   off), with the holding mitten alone drawn again over it (`gripL` / `gripR`: a copy of the arm cut to its mitten), so
 *   the paper lies in front of the sleeve and the mitten closes over the paper's edge;
 * - its classes are `fk-*` (film.module.css styles them under the stage).
 */
import type { Pose } from '@/lib/mascots/puppet';
import { aimLift } from '@/lib/mascots/motion';
import { clamp, DEG } from '@/lib/mascots/geometry';
import { MITTEN_MIDDLE, readManifest, rigInfo, type RigInfo } from '@/lib/mascots/rig';
import type { ArmSide, Manifest, RigPart } from '@/lib/mascots/types';

export { MITTEN_MIDDLE };
export type { ArmSide };

export type Slug = 'tuck' | 'tag' | 'card' | 'dot' | 'night';
/**
 * Where each one's mitten begins, as a share of its arm (brad to the far corner of its box): measured on the cast's arm
 * images — where the paper across the arm turns from the sleeve's to the mitten's cream.
 */
export const MITTEN_FROM: Record<Slug, number> = { tuck: 0.52, tag: 0.51, card: 0.545, dot: 0.43, night: 0.54 };
export type Stance = 'stand' | 'sit' | 'floor';

/** The engine's pose (puppet.ts), plus what only stickers move. */
export interface StickerPose extends Pose {
  /** The deco's own offset (rig units, + right) and scale about its pivot. */
  decoX: number;
  decoS: number;
  /** The body leaning toward the viewer, degrees (a bow): the paper tips about the torso's foot, in perspective. */
  lean: number;
  /** Extra parts shown (opacity 0–1), where a rig has them. */
  extra: Record<string, number>;
  /** 悄悄's `stars-glow`. */
  glow: number;
  /** An arm mirrored along its own length, its mitten's thumb on the other side. */
  flipL: boolean;
  flipR: boolean;
  /**
   * An arm kept in front of the body whatever its lift (it holds what the hand layer draws: the pencil). Otherwise an
   * arm comes to the front only with `front` and once it is lifted 14° from where it hangs — a writing arm near its
   * rest would slip behind the body, and under the slip its mitten writes on.
   */
  keepL: boolean;
  keepR: boolean;
  /** A mitten closed over what the hand layer draws (the slip's edge, the pencil): its copy is drawn over that layer. */
  gripL: boolean;
  gripR: boolean;
}

/** A part as a manifest has it (MASCOT_CAST's, or the sticker parts'). */
interface RawPart {
  name: string;
  extra?: boolean;
}
export interface RawManifest {
  parts: readonly RawPart[];
  stars?: [number, number, number][];
  [key: string]: unknown;
}

export interface PuppetDef {
  slug: Slug;
  /** Px per rig unit. */
  k: number;
  stance?: Stance;
}

const f = (v: number) => v.toFixed(2);

export class StickerPuppet {
  readonly slug: Slug;
  readonly m: Manifest;
  readonly rig: RigInfo;
  readonly extras: readonly string[];
  readonly altHidesFace: boolean;
  /** The feet's stage px (the geometry's origin; the element itself is placed by its actor). */
  x = 0;
  y = 0;
  k: number;
  stance: Stance;
  pose!: StickerPose;

  readonly el: HTMLDivElement | null = null;
  readonly bodyEl: HTMLDivElement | null = null;
  readonly faceEl: HTMLDivElement | null = null;
  private readonly img = new Map<string, HTMLImageElement>();
  private readonly blushEl: HTMLElement[] = [];
  private readonly armsBehind: { side: ArmSide; img: HTMLImageElement; next: ChildNode | null; front: boolean }[] = [];
  private readonly variants: Record<'eye-l' | 'eye-r' | 'mouth' | 'torso', string[]>;
  private readonly variantNames: Set<string>;
  private readonly hideable: Set<string>;
  private readonly css = new Map<HTMLElement, Map<string, string>>();
  private readonly hand: HTMLDivElement | null = null;
  /** Each arm again, cut to its mitten, over the hand layer (shown while that mitten grips). */
  private readonly mitts: { side: ArmSide; img: HTMLImageElement }[] = [];

  constructor(doc: Document | null, root: HTMLElement | null, def: PuppetDef, raw: RawManifest | Manifest, base: string) {
    this.slug = def.slug;
    this.m = readManifest(raw);
    this.rig = rigInfo(this.m);
    this.extras = (raw.parts as readonly RawPart[]).filter((p) => p.extra).map((p) => p.name);
    this.altHidesFace = (this.rig.hides.get('torso-alt') || []).includes('face');
    this.k = def.k;
    this.stance = def.stance ?? 'stand';
    const variantsOf = (b: string) => [b, ...this.m.parts.filter((p) => p.variantOf === b && p.w).map((p) => p.name)];
    this.variants = { 'eye-l': variantsOf('eye-l'), 'eye-r': variantsOf('eye-r'), mouth: variantsOf('mouth'), torso: variantsOf('torso') };
    this.variantNames = new Set(Object.values(this.variants).flat());
    this.hideable = new Set([...this.rig.hides.values()].flat());

    if (doc && root) {
      // the DOM, as the engine builds it: parts in paint order, the face group where its first part falls
      const el = doc.createElement('div');
      el.className = 'fk-char';
      const body = doc.createElement('div');
      const face = doc.createElement('div');
      body.className = 'fk-body';
      face.className = 'fk-face';
      const parts = this.m.parts.filter((p) => p.w).sort((a, b) => a.z - b.z);
      const faceZ = Math.min(...parts.filter((p) => p.parent === 'face').map((p) => p.z));
      const bodyZ = Math.min(...parts.filter((p) => p.parent !== 'root').map((p) => p.z));
      let faceIn = false;
      for (const p of parts) {
        const im = doc.createElement('img');
        im.src = base + p.img;
        im.alt = '';
        im.draggable = false;
        im.decoding = 'async';
        this.img.set(p.name, im);
        if (p.parent === 'face') {
          face.append(im);
          continue;
        }
        if (p.parent === 'body') {
          if (!faceIn && p.z > faceZ) {
            body.append(face);
            faceIn = true;
          }
          body.append(im);
          continue;
        }
        if (p.z > bodyZ && !body.parentNode) el.append(body);
        el.append(im);
      }
      if (!faceIn) body.append(face);
      if (!body.parentNode) el.append(body);
      for (let i = 0; i < 2; i++) {
        const b = doc.createElement('i');
        b.className = 'fk-blush';
        face.append(b);
        this.blushEl.push(b);
      }
      const torsoZ = this.rig.torso.z;
      const behind = (['L', 'R'] as const).map((sd) => this.rig.arms[sd]).filter((a) => a.part.z < torsoZ);
      const behindImgs = behind.map((a) => this.img.get(a.name));
      for (const a of behind) {
        const im = this.img.get(a.name);
        if (!im) continue;
        let next = im.nextSibling;
        while (next && behindImgs.some((b) => b === next)) next = next.nextSibling;
        this.armsBehind.push({ side: a.side, img: im, next, front: false });
      }
      // what it holds, over everything of the body; and over that, each mitten again
      const hand = doc.createElement('div');
      hand.className = 'fk-hand';
      body.append(hand);
      this.hand = hand;
      for (const sd of ['L', 'R'] as const) {
        const src = this.img.get(this.rig.arms[sd].name);
        if (!src) continue;
        const im = doc.createElement('img');
        im.src = src.src;
        im.alt = '';
        im.draggable = false;
        im.decoding = 'async';
        im.style.visibility = 'hidden';
        body.append(im);
        this.mitts.push({ side: sd, img: im });
      }
      this.el = el;
      this.bodyEl = body;
      this.faceEl = face;
      root.append(el);
      this.layout();
    }
    this.base();
  }

  /**
   * The layer for what this puppet holds (live puppets only: null for a ghost): inside the body, over the torso, the
   * face and both arms (an arm brought to the front lands under it); only a gripping mitten's copy is over it. Its px
   * are the body's own: a rig point (ux, uy) is at ((ux − gx)·k, (uy − gy)·k).
   */
  handLayer(): HTMLDivElement | null {
    return this.hand;
  }

  /** Every part image, to wait for before going live. */
  images(): HTMLImageElement[] {
    return [...this.img.values()];
  }

  private set(el: HTMLElement | null | undefined, prop: string, v: string) {
    if (!el) return;
    let m = this.css.get(el);
    if (!m) {
      m = new Map();
      this.css.set(el, m);
    }
    if (m.get(prop) === v) return;
    m.set(prop, v);
    el.style.setProperty(prop, v);
  }

  /** Sizes and pivots, from the manifest in rig units (call again after changing k). */
  layout(): void {
    if (!this.el) return;
    const k = this.k;
    const { gx, gy, tp } = this.rig;
    const px = (v: number) => `${(v * k).toFixed(2)}px`;
    for (const p of this.m.parts) {
      const im = this.img.get(p.name);
      if (!im) continue;
      this.set(im, 'left', px(p.x - gx));
      this.set(im, 'top', px(p.y - gy));
      this.set(im, 'width', px(p.w));
      this.set(im, 'height', px(p.h));
      this.set(im, 'transform-origin', `${px(p.pivot[0] - p.x)} ${px(p.pivot[1] - p.y)}`);
    }
    // each mitten's copy: the arm's own box and pivot, cut across the arm where the mitten begins (MITTEN_FROM of the
    // way along it, by character) — a half plane in the image's own px, so it turns with the arm
    for (const mt of this.mitts) {
      const a = this.rig.arms[mt.side];
      const p = a.part;
      this.set(mt.img, 'left', px(p.x - gx));
      this.set(mt.img, 'top', px(p.y - gy));
      this.set(mt.img, 'width', px(p.w));
      this.set(mt.img, 'height', px(p.h));
      this.set(mt.img, 'transform-origin', `${px(p.pivot[0] - p.x)} ${px(p.pivot[1] - p.y)}`);
      const dx = Math.cos(a.theta * DEG);
      const dy = Math.sin(a.theta * DEG);
      const from = MITTEN_FROM[this.slug] * a.len;
      const bx = p.pivot[0] - p.x + from * dx;
      const by = p.pivot[1] - p.y + from * dy;
      const far = 1.2 * a.len;
      const pt = (along: number, across: number) => `${px(bx + along * dx - across * dy)} ${px(by + along * dy + across * dx)}`;
      this.set(mt.img, 'clip-path', `polygon(${pt(0, far)}, ${pt(0, -far)}, ${pt(far, -far)}, ${pt(far, far)})`);
    }
    this.set(this.bodyEl, 'transform-origin', `${px(tp[0] - gx)} ${px(tp[1] - gy)}`);
    const [[lx, ly], [rx, ry]] = this.rig.eyes;
    const spots: [number, number][] = [
      [lx - 10, ly + 26],
      [rx + 10, ry + 26],
    ];
    this.blushEl.forEach((b, i) => {
      const [x, y] = spots[i];
      this.set(b, 'left', px(x - gx - 15));
      this.set(b, 'top', px(y - gy - 7.5));
      this.set(b, 'width', px(30));
      this.set(b, 'height', px(15));
    });
  }

  /** The stance's baseline pose (the engine's `base()`): standing, sitting on an edge, or sitting on the floor. */
  base(): void {
    const R = this.rig;
    const sit = this.stance === 'sit' ? 1 : 0;
    const flo = this.stance === 'floor' ? 1 : 0;
    const rise = sit * -(R.gy - R.tp[1] + 3) + flo * (-(R.gy - R.tp[1]) + 4);
    this.pose = {
      rise, ground: rise, bodyUp: 0, tilt: 0, sx: 1, sy: 1,
      legL: 7 * sit + R.floorAng * flo, legR: -7 * sit - R.floorAng * flo, legS: 1 - 0.14 * sit - R.floorS * flo,
      liftL: R.arms.L.rest, liftR: R.arms.R.rest, faceX: 0, faceY: 0, eyes: 'open', mouth: 'mouth', alt: false,
      decoR: 0, decoY: 0, blush: 0, stars: 1, alpha: 1, shadow: 1, front: false, popX: 1, popY: 1,
      decoX: 0, decoS: 1, lean: 0, extra: {}, glow: 0, flipL: false, flipR: false, keepL: false, keepR: false,
      gripL: false, gripR: false,
    };
  }

  setLift(side: ArmSide, v: number): void {
    if (side === 'L') this.pose.liftL = v;
    else this.pose.liftR = v;
  }
  lift(side: ArmSide): number {
    return side === 'L' ? this.pose.liftL : this.pose.liftR;
  }
  /** An arm's rest lift (hanging as drawn). */
  rest(side: ArmSide): number {
    return this.rig.arms[side].rest;
  }

  /** A rig point on the body (units) → stage px, through this frame's pose (the engine's pagePoint, with the lean). */
  pagePoint(ux: number, uy: number): [number, number] {
    const R = this.rig;
    const p = this.pose;
    const k = this.k;
    const c = Math.cos(p.tilt * DEG);
    const s = Math.sin(p.tilt * DEG);
    const lx = (ux - R.tp[0]) * p.sx;
    const ly = (uy - R.tp[1]) * p.sy;
    let rx = lx * c - ly * s;
    let ry = lx * s + ly * c;
    if (p.lean) {
      const persp = this.perspective() / k;
      const a = p.lean * DEG;
      const y2 = ry * Math.cos(a);
      const z2 = -ry * Math.sin(a);
      const w = persp / (persp - z2);
      rx *= w;
      ry = y2 * w;
    }
    return [this.x + (R.tp[0] - R.gx + rx) * k, this.y + (R.tp[1] - R.gy - p.bodyUp + ry - p.rise) * k];
  }
  /** The face's centre (where it looks from), px. */
  facePoint(): [number, number] {
    return this.pagePoint(this.rig.face[0] + this.pose.faceX, this.rig.face[1] + this.pose.faceY);
  }
  /** The top of the torso above its pivot (where a pat lands), px. */
  headPoint(): [number, number] {
    return this.pagePoint(this.rig.tp[0], this.rig.torso.y + 6);
  }
  /** Where an arm's mitten is, px, and the arm's angle on the stage (`at` of the way along the arm). */
  mitten(side: ArmSide, at = 0.82): [number, number, number] {
    const a = this.rig.arms[side];
    const lift = this.lift(side);
    const ang = (side === 'L' ? 90 + lift : 90 - lift) + this.pose.tilt;
    const [bx, by] = this.pagePoint(...a.pivot);
    const r = a.len * at * this.k * Math.min(this.pose.sx, 1.2);
    return [bx + Math.cos(ang * DEG) * r, by + Math.sin(ang * DEG) * r, ang];
  }
  /** The lift that points this arm at a stage point (the short way round from its rest). */
  aim(side: ArmSide, x: number, y: number): number {
    const [bx, by] = this.pagePoint(...this.rig.arms[side].pivot);
    const raw = aimLift(side, Math.atan2(y - by, x - bx) / DEG - this.pose.tilt);
    const rest = this.rest(side);
    return rest + ((((raw - rest) % 360) + 540) % 360) - 180;
  }
  /** How far a mitten's middle is from its brad, px. */
  reach(side: ArmSide, at = MITTEN_MIDDLE): number {
    return this.rig.arms[side].len * at * this.k;
  }
  /** Half the body's width, px. */
  get halfW(): number {
    return Math.max(-this.rig.box.l, this.rig.box.r) * this.k * 0.9;
  }

  private perspective(): number {
    return this.rig.bodyH * this.k * 3.5;
  }

  /** Draws the pose (a ghost draws nothing). Only what changed is written. */
  render(): void {
    if (!this.el) return;
    const k = this.k;
    const p = this.pose;
    const R = this.rig;
    const set = (el: HTMLElement | null | undefined, prop: string, v: string) => this.set(el, prop, v);
    const pop = p.popX !== 1 || p.popY !== 1 ? ` scale(${p.popX.toFixed(3)},${p.popY.toFixed(3)})` : '';
    set(this.el, 'transform', `translate3d(0,${f(-p.rise * k)}px,0)${pop}`);
    set(this.el, 'opacity', p.alpha >= 1 ? '' : f(Math.max(0, p.alpha)));
    const air = Math.max(0, p.rise - p.ground);
    const sh = p.shadow * (1 - clamp(air / R.height, 0, 0.7));
    set(this.img.get('shadow'), 'transform', `translate(0,${f(p.rise * k)}px) scale(${f(Math.max(0, sh))})`);
    const lean = p.lean ? ` perspective(${f(this.perspective())}px) rotateX(${f(-p.lean)}deg)` : '';
    set(this.bodyEl, 'transform', `translate(0,${f(-p.bodyUp * k)}px)${lean} rotate(${f(p.tilt)}deg) scale(${f(p.sx)},${f(p.sy)})`);
    set(this.faceEl, 'transform', `translate(${f(clamp(p.faceX, -14, 14) * k)}px,${f(clamp(p.faceY, -10, 12) * k)}px)`);
    const tf = (name: string, v: string) => set(this.img.get(name), 'transform', v);
    tf('leg-l', `rotate(${f(p.legL)}deg) scale(1,${f(p.legS)})`);
    tf('leg-r', `rotate(${f(p.legR)}deg) scale(1,${f(p.legS)})`);
    for (const side of ['L', 'R'] as const) {
      const a = R.arms[side];
      const lift = side === 'L' ? p.liftL : p.liftR;
      const to = side === 'L' ? 90 + lift : 90 - lift;
      const flip = side === 'L' ? p.flipL : p.flipR;
      const turned = flip ? `rotate(${f(to)}deg) scale(1,-1) rotate(${f(-a.theta)}deg)` : `rotate(${f(to - a.theta)}deg)`;
      tf(a.name, turned);
      const mt = this.mitts.find((m) => m.side === side);
      if (mt) {
        const grip = side === 'L' ? p.gripL : p.gripR;
        set(mt.img, 'visibility', grip ? '' : 'hidden');
        if (grip) set(mt.img, 'transform', turned);
      }
    }
    for (const name of ['deco', 'deco-back']) {
      if (this.img.has(name)) tf(name, `translate(${f(p.decoX * k)}px,${f(-p.decoY * k)}px) rotate(${f(p.decoR)}deg) scale(${f(p.decoS)})`);
    }
    const vis = (name: string, on: boolean) => set(this.img.get(name), 'visibility', on ? '' : 'hidden');
    const shown: string[] = [];
    for (const b of ['eye-l', 'eye-r'] as const) {
      const want = p.eyes === 'open' ? b : this.img.has(`${b}-${p.eyes}`) ? `${b}-${p.eyes}` : this.img.has(`${b}-shut`) ? `${b}-shut` : b;
      for (const v of this.variants[b]) vis(v, v === want);
      shown.push(want);
    }
    const mouth = this.img.has(p.mouth) ? p.mouth : p.mouth === 'mouth-open' && this.img.has('mouth-o') ? 'mouth-o' : 'mouth';
    for (const v of this.variants.mouth) vis(v, v === mouth);
    shown.push(mouth);
    for (const a of this.armsBehind) {
      const lift = a.side === 'L' ? p.liftL : p.liftR;
      const want = (p.front && Math.abs(lift - R.arms[a.side].rest) > 14) || (a.side === 'L' ? p.keepL : p.keepR);
      if (want !== a.front && this.bodyEl) {
        a.front = want;
        // in front of the body, under what the hand layer holds
        if (want) this.bodyEl.insertBefore(a.img, this.hand);
        else this.bodyEl.insertBefore(a.img, a.next);
      }
    }
    const torso = p.alt && this.img.has('torso-alt') ? 'torso-alt' : 'torso';
    for (const v of this.variants.torso) vis(v, v === torso);
    shown.push(torso);
    for (const part of this.m.parts) {
      if (!part.only) continue;
      const im = this.img.get(part.name);
      set(im, 'visibility', p.glow > 0 ? '' : 'hidden');
      set(im, 'opacity', f(clamp(p.glow, 0, 1)));
    }
    for (const name of this.extras) {
      const o = clamp(p.extra[name] ?? 0, 0, 1);
      set(this.img.get(name), 'visibility', o > 0 ? '' : 'hidden');
      set(this.img.get(name), 'opacity', o >= 1 ? '' : f(o));
    }
    if (this.hideable.size) {
      const off = new Set<string>();
      for (const name of shown) for (const h of R.hides.get(name) || []) off.add(h);
      for (const name of this.hideable) {
        if (name === 'face') set(this.faceEl, 'visibility', off.has('face') ? 'hidden' : '');
        else if (off.has(name)) vis(name, false);
        else if (!this.variantNames.has(name) && !R.parts.get(name)?.only && !this.extras.includes(name)) vis(name, true);
      }
    }
    set(this.img.get('stars'), 'opacity', f(clamp(p.stars, 0, 1)));
    const b = f(clamp(p.blush, 0, 1) * 0.85);
    const wide = `scale(${f(1 + 0.7 * clamp(p.blush - 1, 0, 1))})`;
    for (const el of this.blushEl) {
      set(el, 'opacity', b);
      set(el, 'transform', wide);
    }
  }

  /** A part by name (rig units: its box and pivot). */
  part(name: string): RigPart | undefined {
    return this.rig.parts.get(name);
  }
}
