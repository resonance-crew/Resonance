/**
 * A sticker: its cast (puppets placed on the 432 px canvas), its props, and a frame function — a pure function of time
 * that poses everyone and places the props. The renderer (scripts/stickers/render.ts) bundles one sticker with this file,
 * opens it in headless Chrome and calls `window.__sticker.renderAt(t)` for each frame.
 *
 *   export default defineSticker({
 *     duration: 2,
 *     hero: 1,
 *     cast: { tuck: { slug: 'tuck', x: 216, ground: 404, k: 0.74 } },
 *     props: { sun: { kind: 'sun', z: 0 } },
 *     frame(t, { tuck }, { sun }) { … },
 *   });
 */
import card from '../parts/card/manifest.json';
import dot from '../parts/dot/manifest.json';
import night from '../parts/night/manifest.json';
import tag from '../parts/tag/manifest.json';
import tuck from '../parts/tuck/manifest.json';
import { paperFilters } from './paper';
import { initProp, Prop, type PropKind } from './props';
import { StickerPuppet, type PuppetDef, type RawManifest, type Slug } from './puppet';

/** The canvas: 432 px square (rendered at 2× and scaled down, so nothing is soft). */
export const SIZE = 432;

const MANIFESTS: Record<Slug, RawManifest> = { tuck, tag, card, dot, night } as unknown as Record<Slug, RawManifest>;

export interface PropDef<C extends string> {
  kind: PropKind;
  /** Its paper's seed (two props of one kind look alike only if they share it). */
  seed?: number;
  /** Paint order among puppets (10, 20, … by default) and props (front: 100 by default; a backdrop 0). */
  z?: number;
  /** Inside a puppet, just above one of its parts (a note slipped under 摺摺's dog-ear: above `torso-alt`). */
  inside?: { puppet: C; above: string };
}

export interface StickerDef<C extends string = string, P extends string = string> {
  /** One play, seconds: 1.5–2.5. t = 0 and t = duration are both the key pose. */
  duration: number;
  /**
   * The moment that says what this sticker means, seconds (0–duration): the frame that reads best at 128 pt — mid-bow
   * with its blush, the heart glowing. It becomes the thumb, which is what the picker shows and what a sticker rests on
   * in the thread once its two plays are over. (The animation still starts and ends on the key pose.)
   */
  hero: number;
  cast: Record<C, PuppetDef>;
  props?: Record<P, PropDef<C>>;
  /** Called for every frame with each puppet's pose reset to its stance's baseline: set the poses, place the props. */
  frame(t: number, cast: Record<C, StickerPuppet>, props: Record<P, Prop>): void;
}

export function defineSticker<C extends string, P extends string = never>(def: StickerDef<C, P>): StickerDef<C, P> {
  return def;
}

const STYLE = `
html,body{margin:0;padding:0;background:transparent;overflow:hidden}
#stage{position:relative;width:${SIZE}px;height:${SIZE}px;overflow:hidden;isolation:isolate}
.sk-char{position:absolute;left:0;top:0;width:0;height:0}
.sk-char img{position:absolute;display:block;max-width:none;margin:0;padding:0;border:0;user-select:none}
.sk-body,.sk-face{position:absolute;left:0;top:0;width:0;height:0}
.sk-blush{position:absolute;display:block;opacity:0;border-radius:50%;background:radial-gradient(closest-side,oklch(66% 0.13 40/.75),oklch(66% 0.13 40/0))}
.sk-prop{position:absolute;left:0;top:0;transform-origin:0 0;line-height:0}
.sk-prop svg{display:block;overflow:visible}
`;

export class Scene<C extends string, P extends string> {
  readonly cast = {} as Record<C, StickerPuppet>;
  readonly props = {} as Record<P, Prop>;

  constructor(readonly def: StickerDef<C, P>, readonly root: HTMLElement, partsBase: string) {
    const doc = root.ownerDocument;
    let z = 10;
    for (const [name, pd] of Object.entries(def.cast) as [C, PuppetDef][]) {
      this.cast[name] = new StickerPuppet(doc, root, { ...pd, z: pd.z ?? z }, MANIFESTS[pd.slug], `${partsBase}${pd.slug}/`);
      z += 10;
    }
    for (const [name, pd] of Object.entries(def.cast) as [C, PuppetDef][]) {
      if (!pd.inside) continue;
      const pp = this.cast[name];
      const host = this.cast[pd.inside.puppet as C];
      const after = host?.partImg(pd.inside.above);
      if (!host || !after) throw new Error(`puppet ${name}: no part ${pd.inside.above} on ${pd.inside.puppet}`);
      after.after(pp.el);
      pp.mount = { toBody: (x, y) => toBody(host, x, y), tilt: () => host.pose.tilt, sx: () => host.pose.sx, sy: () => host.pose.sy };
    }
    for (const [name, pd] of Object.entries(def.props ?? {}) as [P, PropDef<C>][]) {
      const p = new Prop(doc, pd.kind, pd.seed ?? 1, pd.z ?? 100);
      if (pd.inside) {
        const pp = this.cast[pd.inside.puppet];
        const after = pp?.partImg(pd.inside.above);
        if (!pp || !after) throw new Error(`prop ${name}: no part ${pd.inside.above} on ${pd.inside.puppet}`);
        after.after(p.el);
        p.inside = { body: pp.bodyEl, toBody: (x, y) => toBody(pp, x, y), tilt: () => pp.pose.tilt };
      } else root.append(p.el);
      initProp(p);
      this.props[name] = p;
    }
  }

  /** Every image, decoded, before the first frame. */
  async ready(): Promise<void> {
    const imgs = Object.values<StickerPuppet>(this.cast).flatMap(p => p.images());
    await Promise.all(imgs.map(im => im.decode().catch(() => {
      throw new Error(`could not load ${im.src}`);
    })));
  }

  render(t: number): void {
    const cast = Object.values<StickerPuppet>(this.cast);
    const props = Object.values<Prop>(this.props);
    for (const p of cast) p.base();
    for (const p of props) p.begin();
    this.def.frame(t, this.cast, this.props);
    for (const p of cast) p.render();
    for (const p of props) p.end();
  }
}

/** A sticker point → a point in a puppet's body (the inverse of its root and body transforms; its lean left out). */
function toBody(pp: StickerPuppet, x: number, y: number): [number, number] {
  const p = pp.pose;
  const k = pp.k;
  const R = pp.rig;
  const ox = (R.tp[0] - R.gx) * k;
  const oy = (R.tp[1] - R.gy) * k;
  const lx = (x - pp.x) / p.popX - ox;
  const ly = (y - (pp.y - p.rise * k)) / p.popY - oy + p.bodyUp * k;
  const a = (-p.tilt * Math.PI) / 180;
  const rx = lx * Math.cos(a) - ly * Math.sin(a);
  const ry = lx * Math.sin(a) + ly * Math.cos(a);
  return [ox + rx / p.sx, oy + ry / p.sy];
}

/**
 * A pack's tab icon when the pack draws none of its own (designs/stickers/<pack>/icon.ts): its hero's head, eyes open
 * and a little blush, filling the canvas (the renderer scales it to 96 px).
 */
export function iconSticker(slug: Slug): StickerDef<'hero', never> {
  type P = { name: string; parent: string; x: number; y: number; w: number; h: number; variantOf: string | null; extra?: boolean; only?: string | null };
  const raw = MANIFESTS[slug] as unknown as { parts: P[]; ground: [number, number]; faceCenter: [number, number] };
  const part = (n: string) => raw.parts.find(p => p.name === n)!;
  const body = raw.parts.filter(p => p.parent === 'body' && !p.variantOf && !p.extra && !p.only && p.w && !p.name.startsWith('arm'));
  // a head-and-shoulders crop round the face: from the top of the deco to a little under the mouth, at least wide
  // enough for the eyes to sit well inside it
  const top = Math.min(...body.map(p => p.y)) - 14;   // room over the deco: its die-cut rim never meets the edge
  const mouth = part('mouth');
  const bottom = mouth.y + mouth.h + 44;
  const [el, er] = [part('eye-l'), part('eye-r')];
  const eyes = er.x + er.w - el.x;
  const fx = (el.x + er.x + er.w) / 2;
  // the whole deco in it too (聆聆's beret is wide and off to one side): the crop shifts toward it a little and grows
  const deco = part('deco');
  const l = Math.min(el.x - 30, deco.x - 10);
  const r = Math.max(er.x + er.w + 30, deco.x + deco.w + 10);
  const cx = fx + Math.max(-40, Math.min(40, (r - fx - (fx - l)) / 2));
  const half = Math.max((bottom - top) / 2, eyes * 1.3, r - cx, cx - l);
  // …never down past the foot of the torso (no legs in a head's crop): a big crop rises instead, room over the deco
  const torso = part('torso');
  const cy = Math.min(top + half, torso.y + torso.h - 8 - half);
  const k = (SIZE / 2 - 8) / half;
  const [gx, gy] = raw.ground;
  return defineSticker({
    duration: 1 / 12,
    hero: 0,
    cast: { hero: { slug, x: SIZE / 2 - (cx - gx) * k, ground: SIZE / 2 + (gy - cy) * k, k } },
    frame(_t, { hero }) {
      hero.pose.blush = 0.35;
      // arms out of the crop's corners: tucked in behind the paper where they hang behind it, else straight down
      const behind = hero.rig.arms.L.part.z < hero.rig.torso.z;
      hero.pose.liftL = behind ? -45 : 0;
      hero.pose.liftR = behind ? -45 : 0;
    },
  });
}

declare global {
  interface Window {
    __sticker?: { ready: Promise<void>; duration: number; hero: number; renderAt(t: number): Promise<void> };
  }
}

/** The page: one sticker on its canvas, drawn on request. */
export function mount(def: StickerDef<string, string>, partsBase = '/parts/'): void {
  const style = document.createElement('style');
  style.textContent = STYLE;
  document.head.append(style);
  document.body.insertAdjacentHTML('beforeend', paperFilters());
  const root = document.createElement('div');
  root.id = 'stage';
  document.body.append(root);
  const scene = new Scene(def, root, partsBase);
  const frame = () => new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r())));
  window.__sticker = {
    duration: def.duration,
    hero: def.hero,
    ready: scene.ready().then(() => document.fonts.ready).then(() => {
      scene.render(0);
      return frame();
    }),
    async renderAt(t: number) {
      scene.render(t);
      await frame();
    },
  };
}
