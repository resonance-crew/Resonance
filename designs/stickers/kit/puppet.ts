/**
 * A paper puppet on a sticker: the landing page's puppet (src/lib/mascots/puppet.ts) without its stage — the same rig
 * (rig.ts reads the manifest), the same DOM (root → body → face, one <img> per part turned about the rig's pivots), the
 * same pose fields and the same transforms, so a sticker moves exactly as the puppets on the site do. What it adds is
 * only what a sticker needs: no clock (a choreography sets the whole pose every frame), extra parts (`extra`), a deco
 * that can move freely (`decoX`, `decoS`), a bow toward the viewer (`lean`), and 悄悄's glow on any background.
 */
import type { Pose } from '../../../src/lib/mascots/puppet';
import { aimLift } from '../../../src/lib/mascots/motion';
import { clamp, DEG } from '../../../src/lib/mascots/geometry';
import { MITTEN_MIDDLE, readManifest, rigInfo, type RigInfo } from '../../../src/lib/mascots/rig';
import type { ArmSide, Manifest, RigPart } from '../../../src/lib/mascots/types';

export { MITTEN_MIDDLE };
export type { ArmSide };

export type Slug = 'tuck' | 'tag' | 'card' | 'dot' | 'night';
export type Stance = 'stand' | 'sit' | 'floor';

/** The engine's pose (puppet.ts), plus what only stickers move. */
export interface StickerPose extends Pose {
  /** The deco's own offset (rig units, + right) and scale about its pivot (a bow's loops perking up, a beret doffed). */
  decoX: number;
  decoS: number;
  /** The body leaning toward the viewer, degrees (a bow): the paper tips about the torso's foot, in perspective. */
  lean: number;
  /** Extra parts shown (opacity 0–1): 摺摺's `flap` / `flap-alt`, 悄悄's `star-glow-0…10`. */
  extra: Record<string, number>;
  /** 悄悄's `stars-glow` (the landing page shows it on the night page only; a sticker decides). */
  glow: number;
  // blush: as the engine's, 0–1; a sticker may go to 2, the flush spreading wider (a deep thank-you, a lean-on)
}

/** Where a puppet stands on the sticker (px of the 432 canvas) and how large it is. */
export interface PuppetDef {
  slug: Slug;
  /** Its ground point: x, and the y its feet (or, sitting, its seat) rest on. */
  x: number;
  ground: number;
  /** Px per rig unit (摺摺 alone ≈ 0.74: about 330 px tall with its fringe). */
  k: number;
  stance?: Stance;
  /** Paint order among the sticker's puppets and props (higher in front; puppets default to 10, 20, …). */
  z?: number;
  /**
   * Inside another puppet, just above one of its parts: in front of that part, behind the rest of it — its face, its
   * deco, its arms brought to the front (聆聆 scooping 點點 into a hug: `{ puppet: 'nod', above: 'torso' }`). It still
   * stands at x / ground on the sticker, and moves with the other puppet's body.
   */
  inside?: { puppet: string; above: string };
}

/** A part as the sticker parts' manifest has it (designs/stickers/parts/<slug>/manifest.json). */
interface RawPart {
  name: string;
  extra?: boolean;
}
export interface RawManifest {
  parts: RawPart[];
  stars?: [number, number, number][];
  [key: string]: unknown;
}

const f = (v: number) => v.toFixed(2);

export class StickerPuppet {
  readonly slug: Slug;
  readonly m: Manifest;
  readonly rig: RigInfo;
  /** Extra parts this rig has (hidden until a pose shows them). */
  readonly extras: readonly string[];
  /** 悄悄's stars: centre and size, rig units. */
  readonly stars: readonly (readonly [number, number, number])[];
  readonly altHidesFace: boolean;
  x: number;
  y: number;
  k: number;
  z: number;
  stance: Stance;
  pose!: StickerPose;
  /** Set when it is held inside another puppet (PuppetDef.inside): how a sticker point maps into that puppet's body. */
  mount: { toBody(x: number, y: number): [number, number]; tilt(): number; sx(): number; sy(): number } | null = null;

  readonly el: HTMLDivElement;
  readonly bodyEl: HTMLDivElement;
  readonly faceEl: HTMLDivElement;
  private readonly img = new Map<string, HTMLImageElement>();
  private readonly blushEl: [HTMLElement, HTMLElement];
  private readonly armsBehind: { side: ArmSide; img: HTMLImageElement; next: ChildNode | null; front: boolean }[];
  private readonly variants: Record<'eye-l' | 'eye-r' | 'mouth' | 'torso', string[]>;
  private readonly variantNames: Set<string>;
  private readonly hideable: Set<string>;

  constructor(doc: Document, root: HTMLElement, def: PuppetDef, raw: RawManifest, base: string) {
    this.slug = def.slug;
    this.m = readManifest(raw);
    this.rig = rigInfo(this.m);
    this.extras = raw.parts.filter(p => p.extra).map(p => p.name);
    this.stars = raw.stars ?? [];
    this.altHidesFace = (this.rig.hides.get('torso-alt') || []).includes('face');
    this.x = def.x;
    this.y = def.ground;
    this.k = def.k;
    this.z = def.z ?? 10;
    this.stance = def.stance ?? 'stand';

    // the DOM, as the engine builds it: parts in paint order, the face group where its first part falls
    const el = doc.createElement('div');
    el.className = 'sk-char';
    const body = doc.createElement('div');
    const face = doc.createElement('div');
    body.className = 'sk-body';
    face.className = 'sk-face';
    const parts = this.m.parts.filter(p => p.w).sort((a, b) => a.z - b.z);
    const faceZ = Math.min(...parts.filter(p => p.parent === 'face').map(p => p.z));
    const bodyZ = Math.min(...parts.filter(p => p.parent !== 'root').map(p => p.z));
    let faceIn = false;
    for (const p of parts) {
      const im = doc.createElement('img');
      im.src = base + p.img;
      im.alt = '';
      im.draggable = false;
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
    this.blushEl = [doc.createElement('i'), doc.createElement('i')];
    for (const b of this.blushEl) {
      b.className = 'sk-blush';
      face.append(b);
    }
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
    const variantsOf = (b: string) => [b, ...this.m.parts.filter(p => p.variantOf === b && p.w).map(p => p.name)];
    this.variants = { 'eye-l': variantsOf('eye-l'), 'eye-r': variantsOf('eye-r'), mouth: variantsOf('mouth'), torso: variantsOf('torso') };
    this.variantNames = new Set(Object.values(this.variants).flat());
    this.hideable = new Set([...this.rig.hides.values()].flat());
    this.el = el;
    this.bodyEl = body;
    this.faceEl = face;
    root.append(el);
    this.layout();
    this.base();
  }

  /** Every part image, to wait for before the first frame. */
  images(): HTMLImageElement[] {
    return [...this.img.values()];
  }
  /** A part's <img> (to put a prop just above it inside the body: Prop.mountIn). */
  partImg(name: string): HTMLImageElement | undefined {
    return this.img.get(name);
  }

  /** Sizes and pivots, from the manifest in rig units (call again after changing k). */
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
    this.bodyEl.style.transformOrigin = `${px(tp[0] - gx)} ${px(tp[1] - gy)}`;
    const [[lx, ly], [rx, ry]] = this.rig.eyes;
    for (const [b, x, y] of [[this.blushEl[0], lx - 10, ly + 26], [this.blushEl[1], rx + 10, ry + 26]] as const) {
      b.style.left = px(x - gx - 15);
      b.style.top = px(y - gy - 7.5);
      b.style.width = px(30);
      b.style.height = px(15);
    }
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
      decoR: 0, decoY: 0, blush: 0, stars: 1, alpha: 1, shadow: 0, front: false, popX: 1, popY: 1,
      decoX: 0, decoS: 1, lean: 0, extra: {}, glow: 0,
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

  /** A rig point on the body (units) → sticker px, through this frame's pose (the engine's pagePoint, with the lean). */
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
      // rotateX about the torso's foot, seen through the body's perspective (as render() draws it)
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
  /**
   * Where an arm's mitten is, px, and the arm's angle on the sticker: `at` of the way along the arm (0.82, the mitten's
   * far rim; MITTEN_MIDDLE, where it holds something).
   */
  mitten(side: ArmSide, at = 0.82): [number, number, number] {
    const a = this.rig.arms[side];
    const lift = this.lift(side);
    const ang = (side === 'L' ? 90 + lift : 90 - lift) + this.pose.tilt;
    const [bx, by] = this.pagePoint(...a.pivot);
    const r = a.len * at * this.k * Math.min(this.pose.sx, 1.2);
    return [bx + Math.cos(ang * DEG) * r, by + Math.sin(ang * DEG) * r, ang];
  }
  /** The lift that points this arm at a sticker point (the short way round from its rest). */
  aim(side: ArmSide, x: number, y: number): number {
    const [bx, by] = this.pagePoint(...this.rig.arms[side].pivot);
    const raw = aimLift(side, Math.atan2(y - by, x - bx) / DEG - this.pose.tilt);
    const rest = this.rest(side);
    return rest + ((((raw - rest) % 360) + 540) % 360) - 180;
  }
  /** How far a mitten's middle is from its brad, px (what an arm can reach). */
  reach(side: ArmSide, at = MITTEN_MIDDLE): number {
    return this.rig.arms[side].len * at * this.k;
  }

  private perspective(): number {
    return this.rig.bodyH * this.k * 3.5;
  }

  /** Draws the pose (every frame: a choreography sets the whole pose each time). */
  render(): void {
    const k = this.k;
    const p = this.pose;
    const R = this.rig;
    const pop = p.popX !== 1 || p.popY !== 1 ? ` scale(${p.popX.toFixed(3)},${p.popY.toFixed(3)})` : '';
    if (this.mount) {
      // held inside another puppet's body: placed through its transforms, so it moves with that body
      const m = this.mount;
      const [bx, by] = m.toBody(this.x, this.y - p.rise * k);
      this.el.style.transform = `translate(${f(bx)}px,${f(by)}px) rotate(${f(-m.tilt())}deg) scale(${f(1 / m.sx())},${f(1 / m.sy())})${pop}`;
      this.el.style.zIndex = '';
    } else {
      this.el.style.transform = `translate(${f(this.x)}px,${f(this.y - p.rise * k)}px)${pop}`;
      this.el.style.zIndex = String(Math.round(this.z));
    }
    this.el.style.opacity = p.alpha >= 1 ? '' : f(Math.max(0, p.alpha));
    const sh = this.img.get('shadow');
    if (sh) sh.style.transform = `translate(0,${f(p.rise * k)}px) scale(${f(Math.max(0, p.shadow))})`;
    const lean = p.lean ? ` perspective(${f(this.perspective())}px) rotateX(${f(-p.lean)}deg)` : '';
    this.bodyEl.style.transform = `translate(0,${f(-p.bodyUp * k)}px)${lean} rotate(${f(p.tilt)}deg) scale(${f(p.sx)},${f(p.sy)})`;
    this.faceEl.style.transform = `translate(${f(clamp(p.faceX, -14, 14) * k)}px,${f(clamp(p.faceY, -10, 12) * k)}px)`;
    const set = (name: string, tf: string) => {
      const im = this.img.get(name);
      if (im) im.style.transform = tf;
    };
    set('leg-l', `rotate(${f(p.legL)}deg) scale(1,${f(p.legS)})`);
    set('leg-r', `rotate(${f(p.legR)}deg) scale(1,${f(p.legS)})`);
    for (const side of ['L', 'R'] as const) {
      const a = R.arms[side];
      const lift = side === 'L' ? p.liftL : p.liftR;
      set(a.name, `rotate(${f((side === 'L' ? 90 + lift : 90 - lift) - a.theta)}deg)`);
    }
    for (const name of ['deco', 'deco-back']) {
      set(name, `translate(${f(p.decoX * k)}px,${f(-p.decoY * k)}px) rotate(${f(p.decoR)}deg) scale(${f(p.decoS)})`);
    }
    const vis = (name: string, on: boolean) => {
      const im = this.img.get(name);
      if (im) im.style.visibility = on ? '' : 'hidden';
    };
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
    for (const part of this.m.parts) {
      if (part.only) {
        const im = this.img.get(part.name);
        if (im) {
          im.style.visibility = p.glow > 0 ? '' : 'hidden';
          im.style.opacity = f(clamp(p.glow, 0, 1));
        }
      }
    }
    for (const name of this.extras) {
      const im = this.img.get(name);
      if (!im) continue;
      const o = clamp(p.extra[name] ?? 0, 0, 1);
      im.style.visibility = o > 0 ? '' : 'hidden';
      im.style.opacity = o >= 1 ? '' : f(o);
    }
    if (this.hideable.size) {
      const off = new Set<string>();
      for (const name of shown) for (const h of R.hides.get(name) || []) off.add(h);
      for (const name of this.hideable) {
        if (name === 'face') this.faceEl.style.visibility = off.has('face') ? 'hidden' : '';
        else if (off.has(name)) vis(name, false);
        else if (!this.variantNames.has(name) && !R.parts.get(name)?.only && !this.extras.includes(name)) vis(name, true);
      }
    }
    const stars = this.img.get('stars');
    if (stars) stars.style.opacity = f(clamp(p.stars, 0, 1));
    // a blush past 1 (stickers only) spreads wider, as a full flush does
    const b = f(clamp(p.blush, 0, 1) * 0.85);
    const wide = `scale(${f(1 + 0.7 * clamp(p.blush - 1, 0, 1))})`;
    for (const el of this.blushEl) {
      el.style.opacity = b;
      el.style.transform = wide;
    }
  }

  /** A part by name (rig units: its box and pivot). */
  part(name: string): RigPart | undefined {
    return this.rig.parts.get(name);
  }
}
