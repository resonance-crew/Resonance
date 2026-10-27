/**
 * A character on the stage. It is DOM: root → body → face, one <img> per part, transformed about the rig's pivots,
 * variants switched by visibility. Each frame changes only transform, opacity and visibility (clip-path only while
 * it is behind an element and the page gave no env.behind). Never flipped: the face slides the way it walks.
 */
import { ACTS } from './acts';
import type { Stage } from './engine';
import { clamp, DEG, overlaps, pathY } from './geometry';
import { mouthOpen } from './motion';
import { rigInfo, type Arm, type RigInfo } from './rig';
import type { ArmSide, BehindCover, CastEntry, Cover, Duet, Manifest, Plan, PuppetMode, Rect, Stance, Task, Traits } from './types';

/** The frame's pose, rebuilt from the stance's baseline every step; tasks and the overlay add to it. */
export interface Pose {
  /** Rig units up (the stance's own rise included); `ground` is the stance's. */
  rise: number;
  ground: number;
  bodyUp: number;
  tilt: number;
  sx: number;
  sy: number;
  legL: number;
  legR: number;
  legS: number;
  /** Each arm's lift: 0 hangs straight down, 90 points sideways, 180 straight up. */
  liftL: number;
  liftR: number;
  faceX: number;
  faceY: number;
  /** 'open', 'shut', or any eye variant the rig has (nap, sleepy…; shut otherwise). */
  eyes: string;
  mouth: 'mouth' | 'mouth-o' | 'mouth-open';
  /** torso-alt shows. */
  alt: boolean;
  decoR: number;
  decoY: number;
  blush: number;
  stars: number;
  alpha: number;
  shadow: number;
  /** Arms tucked behind the torso may come to the front. */
  front: boolean;
  popX: number;
  popY: number;
}

type StyleKey = 'transform' | 'opacity' | 'clipPath' | 'pointerEvents' | 'visibility';

interface ArmBehind {
  side: ArmSide;
  img: HTMLImageElement;
  next: ChildNode | null;
  front: boolean;
}

export class Puppet {
  readonly slug: string;
  readonly name: string;
  readonly m: Manifest;
  readonly rig: RigInfo;
  readonly traits: Traits;
  readonly hop: boolean;
  readonly gait: { speed: number; stride: number; swing: number; arm: number; hopLen: number; hopH: number };
  /** How far the decoration stands above the torso, rig units. */
  readonly decoH: number;
  /** torso-alt is its back (it hides the face): a reveal turns it round. */
  readonly altHidesFace: boolean;
  kMul = 1;

  x = 0;
  y = 0;
  stance: Stance = 'stand';
  sitU = 0;
  floorU = 0;
  baseRise = 0;
  surface: (x: number) => number;
  plan: Plan | null = null;
  tasks: Task[] = [];
  fx: { t0: number; dur: number; fn: (u: number) => void }[] = [];
  face = { x: 0, y: 0 };
  phase = 0;
  mode: PuppetMode = 'enter';
  /** Between two activities (a greeting may start). */
  between = false;
  blinkAt: number;
  blinkUntil = 0;
  clicks = 0;
  greetedAt = -9;
  hover: { fx: number; fy: number } | null = null;
  /** The stage's top left on the page (px), read as a pointer comes over this character. */
  private origin: [number, number] | null = null;
  release: (() => void) | null = null;
  cover: BehindCover | null = null;
  blushHold = 0;
  gone = false;
  drawn = false;
  still = false;
  noShadow = false;
  duet: Duet | null = null;
  pose!: Pose;

  el!: HTMLDivElement;
  private bodyEl!: HTMLDivElement;
  private faceEl!: HTMLDivElement;
  private hitEl!: HTMLElement;
  private blushEl!: [HTMLElement, HTMLElement];
  private readonly img = new Map<string, HTMLImageElement>();
  private armsBehind: ArmBehind[] = [];
  private variants!: Record<'eye-l' | 'eye-r' | 'mouth' | 'torso', string[]>;
  private variantNames = new Set<string>();
  /** What any variant can hide (`face`: the face group). */
  private hideable = new Set<string>();
  private readonly css = new Map<string, string>();

  constructor(readonly S: Stage, readonly entry: CastEntry, readonly slot: number) {
    this.slug = entry.slug;
    this.m = entry.manifest;
    this.name = this.m.name || entry.slug;
    this.rig = rigInfo(this.m);
    this.traits = entry.traits || {};
    const R = this.rig;
    this.hop = this.m.walk === 'hop';
    this.scaleBy();
    this.gait = {
      speed: (240 + R.legLen * 1.5) * (this.traits.pace || 1), stride: Math.max(44, R.legLen * 1.05),
      swing: this.traits.shuffle ? 14 : 24, arm: 10, hopLen: (R.box.r - R.box.l) * 0.62, hopH: 44,
    };
    this.decoH = Math.max(0, R.torso.y - Math.min(...this.m.parts.filter(p => p.parent === 'body' && p.w && !p.variantOf).map(p => p.y)));
    this.altHidesFace = (R.hides.get('torso-alt') || []).includes('face');
    this.surface = () => this.y;
    this.blinkAt = S.time + 1 + S.rand() * 3;
    this.build();
    this.layout();
    this.base();
  }

  /**
   * A character's height on the stage: unitHeight × (its height / 420) ^ heightCurve, so the tallest is a little less
   * tall and the smallest a little less small than a straight scale would make them.
   */
  scaleBy(): void {
    this.kMul = (this.rig.height / 420) ** ((this.S.o.heightCurve ?? 1) - 1);
  }
  /** Px per rig unit. */
  get k(): number {
    return this.S.k * this.kMul;
  }
  get halfW(): number {
    return Math.max(-this.rig.box.l, this.rig.box.r) * this.k * 0.9;
  }
  get h(): number {
    return -this.rig.box.t * this.k;
  }
  halfWFor(stance: Stance): number {
    const R = this.rig;
    return stance === 'floor' ? Math.max(R.floorHalf, R.torsoHalf) * this.k
      : stance === 'sit' ? Math.max(R.torsoHalf, R.hipX + 30) * this.k : this.halfW;
  }
  arm(side: ArmSide): Arm {
    return this.rig.arms[side];
  }
  /** Px per second along the ground, walking or hopping. */
  pace(): number {
    return this.hop ? (this.gait.hopLen * this.k) / 0.5 : this.gait.speed * this.k;
  }
  setLift(side: ArmSide, v: number): void {
    if (side === 'L') this.pose.liftL = v;
    else this.pose.liftR = v;
  }

  private build(): void {
    const doc = this.S.doc;
    const base = this.entry.base;
    const el = doc.createElement('div');
    el.className = 'ms-char';
    el.style.zIndex = String(10 + this.slot * 3);
    const body = doc.createElement('div');
    const face = doc.createElement('div');
    body.className = 'ms-body';
    face.className = 'ms-face';
    const parts = this.m.parts.filter(p => p.w).sort((a, b) => a.z - b.z);
    const img = (name: string, src: string, glow: boolean) => {
      const im = doc.createElement('img');
      im.src = base + src;
      im.alt = '';
      im.draggable = false;
      im.decoding = 'async';
      if (glow) im.className = 'ms-glow';   // night-only light (stars-glow) is never dimmed
      this.img.set(name, im);
      return im;
    };
    const faceZ = Math.min(...parts.filter(p => p.parent === 'face').map(p => p.z));
    const bodyZ = Math.min(...parts.filter(p => p.parent !== 'root').map(p => p.z));
    let faceIn = false;
    for (const p of parts) {
      const im = img(p.name, p.img, p.only === 'dark');
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
    this.blushEl = [doc.createElement('i'), doc.createElement('i')];
    for (const b of this.blushEl) {
      b.className = 'ms-blush';
      face.append(b);
    }
    // the only thing that takes the pointer: an invisible shape over the torso (never the arms, legs or decoration,
    // whose transparent corners would cover the buttons beside them)
    this.hitEl = doc.createElement('i');
    this.hitEl.className = 'ms-hit';
    body.append(this.hitEl);
    // arms painted behind the torso (tucked under its edge) come to the front, one at a time, once a pose turns them
    // across the body (mittens over the face, holding a book, reading a note): remember where they live
    const torsoZ = this.rig.torso.z;
    const behind = (['L', 'R'] as const).map(sd => this.rig.arms[sd]).filter(a => a.part.z < torsoZ);
    const behindImgs = behind.map(a => this.img.get(a.name));
    this.armsBehind = behind.flatMap(a => {
      const im = this.img.get(a.name);
      if (!im) return [];
      let next = im.nextSibling;
      while (next && behindImgs.some(b => b === next)) next = next.nextSibling;
      return [{ side: a.side, img: im, next, front: false }];
    });
    const variantsOf = (base: string) => [base, ...this.m.parts.filter(p => p.variantOf === base && p.w).map(p => p.name)];
    this.variants = { 'eye-l': variantsOf('eye-l'), 'eye-r': variantsOf('eye-r'), mouth: variantsOf('mouth'), torso: variantsOf('torso') };
    this.variantNames = new Set(Object.values(this.variants).flat());
    this.hideable = new Set([...this.rig.hides.values()].flat());
    this.el = el;
    this.bodyEl = body;
    this.faceEl = face;
    el.addEventListener('pointerenter', e => this.onEnter(e));
    el.addEventListener('pointermove', e => this.onMove(e));
    el.addEventListener('pointerleave', () => {
      this.hover = null;
    });
    el.addEventListener('click', e => this.onClick(e));
    this.S.root.append(el);
  }

  layout(): void {
    const k = this.k;
    const { gx, gy, tp } = this.rig;
    const px = (v: number) => `${(v * k).toFixed(2)}px`;
    for (const p of this.m.parts) {
      const im = this.img.get(p.name);
      if (!im) continue;
      const s = im.style;
      s.left = px(p.x - gx);
      s.top = px(p.y - gy);
      s.width = px(p.w);
      s.height = px(p.h);
      s.transformOrigin = `${px(p.pivot[0] - p.x)} ${px(p.pivot[1] - p.y)}`;
    }
    const t = this.rig.torso;
    const hs = this.hitEl.style;
    hs.left = px(t.x - gx);
    hs.top = px(t.y - gy);
    hs.width = px(t.w);
    hs.height = px(t.h);
    hs.clipPath = t.hit && t.hit.length > 2
      ? `polygon(${t.hit.map(([x, y]) => `${(x * 100).toFixed(1)}% ${(y * 100).toFixed(1)}%`).join(',')})`
      : 'ellipse(45% 45% at 50% 52%)';
    this.bodyEl.style.transformOrigin = `${px(tp[0] - gx)} ${px(tp[1] - gy)}`;
    const [[lx, ly], [rx, ry]] = this.rig.eyes;
    const w = 30;
    const h = 15;
    for (const [b, x, y] of [[this.blushEl[0], lx - 10, ly + 26], [this.blushEl[1], rx + 10, ry + 26]] as const) {
      b.style.left = px(x - gx - w / 2);
      b.style.top = px(y - gy - h / 2);
      b.style.width = px(w);
      b.style.height = px(h);
    }
    this.css.clear();
    this.drawn = false;
  }

  /** The rise (rig units) that puts the hips on an edge: sitting lowers the body by this much. */
  get seatRise(): number {
    return -(this.rig.gy - this.rig.tp[1] + 3);
  }
  /** The stance's baseline pose: standing, sitting on an edge (legs over its front) or sitting on the floor. */
  base(): void {
    const R = this.rig;
    const sit = this.sitU;
    const flo = this.floorU;
    const seat = this.seatRise;
    const floor = -(R.gy - R.tp[1]) + 4;
    const rise = this.baseRise + sit * seat + flo * floor;
    this.pose = {
      rise, ground: rise, bodyUp: 0, tilt: 0, sx: 1, sy: 1,
      legL: 7 * sit + R.floorAng * flo, legR: -7 * sit - R.floorAng * flo, legS: 1 - 0.14 * sit - R.floorS * flo,
      liftL: R.arms.L.rest, liftR: R.arms.R.rest, faceX: 0, faceY: 0, eyes: 'open', mouth: 'mouth', alt: false,
      decoR: 0, decoY: 0, blush: 0, stars: 1, alpha: 1, shadow: 1 - 0.4 * sit + 0.15 * flo, front: false, popX: 1, popY: 1,
    };
  }

  push(task: Task): void {
    this.tasks.push(task);
  }
  /** Steps the top task; one that ends hands the rest of the step to the one under it. */
  run(): void {
    for (let i = 0; i < 4 && this.tasks.length; i++) {
      if (!this.tasks[this.tasks.length - 1].next().done) return;
      this.tasks.pop();
    }
  }

  /** After the task: blinks, breathing, the face easing toward where it looks, the visitor's pointer, click hops. */
  overlay(dt: number): void {
    const S = this.S;
    const p = this.pose;
    if (!S.reduced) {
      if (S.time >= this.blinkAt) {
        this.blinkUntil = S.time + 0.13;
        this.blinkAt = S.time + 2.5 + S.rand() * 3.5;
      }
      if (S.time < this.blinkUntil) p.eyes = 'shut';
      if (this.mode !== 'enter' && this.mode !== 'exit') p.sy *= 1 + 0.012 * Math.sin(S.time * 2.1 + this.slot);
      if (this.hover && this.mode !== 'exit') {
        p.faceX = this.hover.fx;
        p.faceY = this.hover.fy;
      }
      for (const f of this.fx) f.fn(clamp((S.time - f.t0) / f.dur, 0, 1));
      this.fx = this.fx.filter(f => S.time - f.t0 < f.dur);
      if (this.rig.has('stars') && p.stars === 1) p.stars = 0.8 + 0.2 * Math.sin(S.time * 2.7 + this.slot * 2);
    }
    if (this.blushHold > 0) {
      p.blush = Math.max(p.blush, this.blushHold);
      this.blushHold = Math.max(0, this.blushHold - dt * 0.35);
    }
    const ease = 1 - Math.exp(-dt * 16);
    this.face.x += (clamp(p.faceX, -12, 12) - this.face.x) * ease;
    this.face.y += (clamp(p.faceY, -8, 8) - this.face.y) * ease;
  }

  private elFor(name: string): HTMLElement | undefined {
    return name === 'root' ? this.el : name === 'body' ? this.bodyEl : name === 'face' ? this.faceEl
      : name === 'hit' ? this.hitEl : name === 'b0' ? this.blushEl[0] : name === 'b1' ? this.blushEl[1] : this.img.get(name);
  }
  private set(name: string, key: StyleKey, v: string): void {
    const el = this.elFor(name);
    if (!el) return;
    const id = name + '.' + key;
    if (this.css.get(id) !== v) {
      this.css.set(id, v);
      el.style[key] = v;
    }
  }

  /** `full`: the pose too (12 times a second in the stepped mode); otherwise only where the character is. */
  render(full = true): void {
    const k = this.k;
    const p = this.pose;
    const R = this.rig;
    const S = this.S;
    if (!this.drawn) full = true;
    const f = (v: number) => v.toFixed(2);
    const pop = p.popX !== 1 || p.popY !== 1 ? ` scale(${p.popX.toFixed(3)},${p.popY.toFixed(3)})` : '';
    this.set('root', 'transform', `translate3d(${f(this.x)}px,${f(this.y - p.rise * k)}px,0)${pop}`);
    this.set('root', 'opacity', p.alpha >= 1 ? '' : f(Math.max(0, p.alpha)));
    this.set('root', 'clipPath', this.cover && !S.env.behind ? this.clipPolygon(this.cover) : '');
    this.set('hit', 'pointerEvents', this.takesPointer() ? '' : 'none');
    if (!full) return;
    this.drawn = true;
    const air = Math.max(0, p.rise - p.ground);
    const sh = this.cover || this.noShadow ? 0 : p.shadow * (1 - clamp(air / R.height, 0, 0.55));
    this.set('shadow', 'transform', `translate(0,${f(p.rise * k)}px) scale(${f(sh)})`);
    this.set('body', 'transform', `translate(0,${f(-p.bodyUp * k)}px) rotate(${f(p.tilt)}deg) scale(${f(p.sx)},${f(p.sy)})`);
    this.set('face', 'transform', `translate(${f(this.face.x * k)}px,${f(this.face.y * k)}px)`);
    this.set('leg-l', 'transform', `rotate(${f(p.legL)}deg) scale(1,${f(p.legS)})`);
    this.set('leg-r', 'transform', `rotate(${f(p.legR)}deg) scale(1,${f(p.legS)})`);
    for (const side of ['L', 'R'] as const) {
      const a = R.arms[side];
      const lift = side === 'L' ? p.liftL : p.liftR;
      this.set(a.name, 'transform', `rotate(${f((side === 'L' ? 90 + lift : 90 - lift) - a.theta)}deg)`);
    }
    for (const name of ['deco', 'deco-back']) {
      if (this.img.has(name)) this.set(name, 'transform', `translate(0,${f(-p.decoY * k)}px) rotate(${f(p.decoR)}deg)`);
    }
    const vis = (name: string, on: boolean) => {
      if (this.img.has(name)) this.set(name, 'visibility', on ? '' : 'hidden');
    };
    const shown: string[] = [];
    // variants: eyes 'open' | 'shut' | any other variant the rig has (eye-l-nap…, falling back to shut);
    // mouth 'mouth' | 'mouth-o' | 'mouth-open' (falling back to mouth-o); torso-alt for the reveal
    for (const base of ['eye-l', 'eye-r'] as const) {
      const want = p.eyes === 'open' ? base : this.img.has(`${base}-${p.eyes}`) ? `${base}-${p.eyes}`
        : this.img.has(`${base}-shut`) ? `${base}-shut` : base;
      for (const v of this.variants[base]) vis(v, v === want);
      shown.push(want);
    }
    const mouth = this.img.has(p.mouth) ? p.mouth : p.mouth === 'mouth-open' && this.img.has('mouth-o') ? 'mouth-o' : 'mouth';
    for (const v of this.variants.mouth) vis(v, v === mouth);
    shown.push(mouth);
    // an arm tucked behind the torso comes to the front once the pose has turned it away from rest (so the strip
    // between its brad and the paper's edge never pops onto the sheet while it still hangs down)
    for (const a of this.armsBehind) {
      const lift = a.side === 'L' ? p.liftL : p.liftR;
      const want = p.front && Math.abs(lift - R.arms[a.side].rest) > 14;
      if (want !== a.front) {
        a.front = want;
        if (want) this.bodyEl.append(a.img);
        else this.bodyEl.insertBefore(a.img, a.next);
      }
    }
    const torso = p.alt && this.img.has('torso-alt') ? 'torso-alt' : 'torso';
    for (const v of this.variants.torso) vis(v, v === torso);
    shown.push(torso);
    for (const part of this.m.parts) if (part.only) vis(part.name, part.only === S.theme);
    // a variant that shows can hide other parts (the tag's back hides its face: `hides="face"`)
    if (this.hideable.size) {
      const off = new Set<string>();
      for (const name of shown) for (const h of R.hides.get(name) || []) off.add(h);
      for (const name of this.hideable) {
        if (name === 'face') this.set('face', 'visibility', off.has('face') ? 'hidden' : '');
        else if (off.has(name)) vis(name, false);
        else if (!this.variantNames.has(name) && !R.parts.get(name)?.only) vis(name, true);
      }
    }
    if (this.img.has('stars')) this.set('stars', 'opacity', f(p.stars));
    if (this.img.has('stars-glow') && S.theme === 'dark') this.set('stars-glow', 'opacity', f(p.stars));
    const b = f(clamp(p.blush, 0, 1) * 0.85);
    this.set('b0', 'opacity', b);
    this.set('b1', 'opacity', b);
  }

  /**
   * The pointer: never in reduced motion (nothing would answer), never while the torso overlaps a button or words
   * (its place's `clear` rects, the page's content: a lean, a tilt, walking past).
   */
  takesPointer(): boolean {
    if (this.S.reduced || this.still || this.gone) return false;
    const own = this.plan && this.plan.ledge.clear;
    const page = this.S.content();
    if (!(own && own.length) && !page.length) return true;
    const t = this.rig.torso;
    const pts = [[t.x, t.y], [t.x + t.w, t.y], [t.x, t.y + t.h], [t.x + t.w, t.y + t.h]].map(([x, y]) => this.pagePoint(x, y));
    const xs = pts.map(q => q[0]);
    const ys = pts.map(q => q[1]);
    const m = 0.06;
    const w = Math.max(...xs) - Math.min(...xs);
    const h = Math.max(...ys) - Math.min(...ys);
    const box = { x: Math.min(...xs) + w * m, y: Math.min(...ys) + h * m, w: w * (1 - 2 * m), h: h * (1 - 2 * m) };
    return !(own && own.some(r => overlaps(box, r, 2))) && !page.some(r => overlaps(box, r, 2));
  }

  /** A rig point (units, on the body) → page px, through the frame's pose. */
  pagePoint(ux: number, uy: number): [number, number] {
    const R = this.rig;
    const p = this.pose;
    const k = this.k;
    const c = Math.cos(p.tilt * DEG);
    const s = Math.sin(p.tilt * DEG);
    const lx = (ux - R.tp[0]) * p.sx;
    const ly = (uy - R.tp[1]) * p.sy;
    return [this.x + (R.tp[0] - R.gx + lx * c - ly * s) * k, this.y + (R.tp[1] - R.gy - p.bodyUp + lx * s + ly * c - p.rise) * k];
  }
  facePage(): [number, number] {
    return this.pagePoint(this.rig.face[0] + this.face.x, this.rig.face[1] + this.face.y);
  }
  /** Where an arm's mitten is, page px, and the arm's screen angle. */
  mitten(side: ArmSide): [number, number, number] {
    const a = this.arm(side);
    const lift = side === 'L' ? this.pose.liftL : this.pose.liftR;
    const ang = (side === 'L' ? 90 + lift : 90 - lift) + this.pose.tilt;
    const [bx, by] = this.pagePoint(...a.pivot);
    const r = a.len * 0.82 * this.k;
    return [bx + Math.cos(ang * DEG) * r, by + Math.sin(ang * DEG) * r, ang];
  }
  /** How far (px) this arm reaches out sideways from the ground point under the body, held straight out. */
  reach(side: ArmSide): number {
    const a = this.arm(side);
    return (Math.abs(a.pivot[0] - this.rig.gx) + a.len) * this.k;
  }
  /** Would this arm's mitten (a disc at its far end, a fifth of the arm across) keep `pad` px off every one of `rects`? */
  mittenClear(side: ArmSide, lift: number, rects: readonly Rect[], pad: number): boolean {
    const a = this.arm(side);
    const ang = ((side === 'L' ? 90 + lift : 90 - lift) + this.pose.tilt) * DEG;
    const [bx, by] = this.pagePoint(...a.pivot);
    const k = this.k;
    const rad = a.len * 0.2 * k;
    const cx = bx + Math.cos(ang) * a.len * 0.8 * k;
    const cy = by + Math.sin(ang) * a.len * 0.8 * k;
    return rects.every(r => {
      const nx = clamp(cx, r.x - pad, r.x + r.w + pad);
      const ny = clamp(cy, r.y - pad, r.y + r.h + pad);
      const inside = cx > r.x - pad && cx < r.x + r.w + pad && cy > r.y - pad && cy < r.y + r.h + pad;
      return !inside && Math.hypot(cx - nx, cy - ny) >= rad;
    });
  }
  /**
   * Would this arm's mitten show at this lift? Not behind the card it peeks past, and over the top of what it peeks
   * from only when raised high enough to clear the edge.
   */
  armShows(side: ArmSide, lift: number): boolean {
    const pl = this.plan;
    if (!pl) return true;
    if (pl.how === 'slide') return pl.hidden !== side;
    if (pl.how !== 'rise' || !this.cover) return true;
    const a = this.arm(side);
    const ang = ((side === 'L' ? 90 + lift : 90 - lift) + this.pose.tilt) * DEG;
    const [bx, by] = this.pagePoint(...a.pivot);
    const r = a.len * 0.82 * this.k;
    const mx = bx + Math.cos(ang) * r;
    const my = by + Math.sin(ang) * r - a.len * 0.12 * this.k;
    const c = this.cover;
    const top = c.top && c.top.length ? pathY(c.top, mx) : c.y;
    return my < top - 3;
  }
  /** The arm (and how high) a wave or a beckon uses: `want` if it shows, else the other one, else null. */
  waveArm(want: ArmSide, lifts: readonly number[] = [145, 168]): { side: ArmSide; lift: number } | null {
    const other: ArmSide = want === 'L' ? 'R' : 'L';
    for (const lift of lifts) for (const side of [want, other]) if (this.armShows(side, lift)) return { side, lift };
    return null;
  }

  goBehind(cover: Cover, lowestRise: number): void {
    this.leaveBehind();
    const feet = this.y - lowestRise * this.k;
    const c: BehindCover = { ...cover, depth: Math.max(0, feet - (cover.y + cover.h) + 4) };
    this.cover = c;
    const behind = this.S.env.behind;
    if (behind) this.release = behind(this.el, c);
  }
  leaveBehind(): void {
    if (this.release) this.release();
    this.release = null;
    this.cover = null;
  }
  /** The built-in "behind": everything inside the element's outline (and the slot below it) is cut away. */
  private clipPolygon(c: BehindCover): string {
    const ox = this.x;
    const oy = this.y - this.pose.rise * this.k;
    const f = (v: number) => `${v.toFixed(1)}px`;
    let top: readonly (readonly [number, number])[] = c.top && c.top.length ? c.top : [[c.x, c.y], [c.x + c.w, c.y]];
    if (!(c.top && c.top.length) && c.radius) {   // rounded top corners
      const r = Math.min(c.radius, c.w / 2, c.h / 2);
      const arc = (cx: number, a0: number) => [0, 1, 2, 3, 4].map(i => {
        const a = (a0 + i * 22.5) * DEG;
        return [cx + Math.cos(a) * r, c.y + r + Math.sin(a) * r] as const;
      });
      top = [...arc(c.x + r, 180), ...arc(c.x + c.w - r, 270)];
    }
    const bottom = c.y + c.h + c.depth;
    const hole = [[c.x, top[0][1]], ...top, [c.x + c.w, top[top.length - 1][1]], [c.x + c.w, bottom], [c.x, bottom]]
      .map(([x, y]) => `${f(x - ox)} ${f(y - oy)}`);
    return `polygon(evenodd, -4000px -4000px, 4000px -4000px, 4000px 4000px, -4000px 4000px, -4000px -4000px, ${hole.join(', ')}, ${f(c.x - ox)} ${f(top[0][1] - oy)})`;
  }

  // --- the visitor ---
  private onEnter(e: PointerEvent): void {
    const S = this.S;
    if (S.reduced || e.pointerType === 'touch') return;
    this.origin = null;   // read afresh once per visit of the pointer
    this.onMove(e);
    if (this.mode === 'act' && S.time - this.greetedAt > 4 && !this.duet && this.plan) {
      this.greetedAt = S.time;
      const side: ArmSide = this.hover && this.hover.fx < 0 ? 'L' : 'R';
      this.push(ACTS.wave(S, this, { ...this.plan, waveSide: side }));
      S.emit(this, { type: 'act', act: 'wave', cause: 'hover' });
    }
  }
  /**
   * The eyes follow the pointer: where they are comes from the pose (no layout read per move, right after a frame's
   * writes); only the stage's own place on the page is read, once as the pointer comes over.
   */
  private onMove(e: PointerEvent): void {
    if (this.S.reduced || e.pointerType === 'touch') return;
    if (!this.origin) {
      const r = this.S.root.getBoundingClientRect();
      const v = this.S.doc.defaultView;
      this.origin = [r.left + (v ? v.scrollX : 0), r.top + (v ? v.scrollY : 0)];
    }
    const [[lx, ly], [rx, ry]] = this.rig.eyes;
    const [ex, ey] = this.pagePoint((lx + rx) / 2 + this.face.x, (ly + ry) / 2 + this.face.y);
    const unit = this.k || 1;
    const dx = (e.pageX - this.origin[0] - ex) / unit;
    const dy = (e.pageY - this.origin[1] - ey) / unit;
    this.hover = { fx: clamp(dx / 5, -11, 11), fy: clamp(dy / 7, -6, 6) };
  }
  private onClick(e: MouseEvent): void {
    const S = this.S;
    e.stopPropagation();
    if (S.reduced || this.mode === 'exit' || this.mode === 'shy') return;
    this.clicks++;
    if (this.clicks === 1) {
      this.fx.push({
        t0: S.time, dur: 0.6, fn: u => {
          const p = this.pose;
          p.rise += 30 * Math.sin(Math.PI * clamp((u - 0.15) / 0.85, 0, 1));
          p.sy *= u < 0.15 ? 1 - (0.1 * u) / 0.15 : 1 + 0.04 * Math.sin(Math.PI * u);
          p.eyes = 'shut';
          p.mouth = mouthOpen(this);
          p.blush = Math.max(p.blush, 0.5);
        },
      });
      S.emit(this, { type: 'act', act: 'hop', cause: 'poke' });
    } else {
      S.emit(this, { type: 'act', act: 'shy', cause: 'poke' });
      S.leaveSoon(this, { shy: true });
    }
  }

  destroy(): void {
    this.leaveBehind();
    this.S.dropProps(this);
    this.el.remove();
  }
}
