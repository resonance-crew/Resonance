/**
 * The director (SPEC §4, §5, §7.3): each frame, from the clocks' state, it moves the planes (the camera's pan, the
 * scene changes' moves), recolours the sky and the paper by the hour, walks the disc along its arc, drives the
 * particles, flies the hero away, and hands the owner segment's frame (script/beats.ts) a context to place the DOM
 * cards and the actors in. Transform and opacity only; no layout read inside a frame (everything measured on resize).
 *
 * A scene change is the style's (script/changes, `?change=<name>`): once a frame it asks the style for the change's
 * frame at p and applies it — each plane's offset, opacity, scale and turn, its foot (a cut-out's clip, its paper, or
 * its apron), the paint order, the front grass, the hero, the hour, the tissue strips — and hands the beats the held
 * cards' offset (eased into the room under the header: no style can lift them into it) and the puppets' shift.
 */
import { progressLineY } from '../script/progressLine';
import { BEATS, BRIDGE_IN, R1, SLOT_IDS, W1, Y1, ghost, type BeatCtx, type CardSlot, type SlotId, type SlotPose } from '../script/beats';
import { DEFAULT_STYLE } from '../script/changes/load';
import { PLANE_TOP, changeInfo, changePlanes, cutAt, parseCut, type SetPlane } from '../script/changes/info';
import { CLEAR_UNDER_PEN, easeIntoRoom, type ChangeFrame, type ChangeInfo, type ChangeN, type ChangeStyle, type FootMode, type PlaneId, type StripPaint } from '../script/changes/types';
import { path, rng, ribbon, tear, type Pt } from '../script/geom';
import { groundAt } from '../script/ground';
import { finishLayout, type Layout, type Rect } from '../script/layout';
import { hourAt, paletteAt } from '../script/palette';
import { scrollbarCss } from '../script/scrollbar';
import { HEADER_PEN, camOf, ctaSpot, journeyCamEnd, moonSpot, nightHeadsY, placeOf } from '../script/marks';
import { SEG, TRACK_SVH, changeAt, clamp01, lerp, smooth, span, type SceneN } from '../script/timeline';
import type { ClockState } from './clock';
import { Cast, ghostPuppet } from './actors';
import { Particles, StyleBook } from './particles';
import { PropKit } from '../kit/props';
import type { PalSlug } from '../script/marks';
import type { StickerPuppet } from '../kit/puppet';

interface PlaneRef {
  el: HTMLElement;
  id: PlaneId;
  depth: number;
  x0: number;
  foot: number;
  back: boolean;
  reflect: HTMLElement | null;
  /** Its paper again in the haze's paint (a change's `haze`; none for the sea), and whether it is shown now. */
  haze: SVGSVGElement | null;
  hazeShown: boolean;
  /** Its <use>s and the cut-out clip each wears in a `cut` foot (and its silhouette at rest in a `rest` one). */
  uses: { el: SVGElement; cut: string | null; rest: string | null }[];
  /** Its cut-out foot's samples, a wide screen's and a tall one's (the valley's tall art differs). */
  cutWide: SetPlane['cut'];
  cutTall: SetPlane['cut'];
  /** The foot it wears now ('' as the server drew it). */
  footMode: FootMode | '';
}
interface SetRef {
  n: SceneN;
  el: HTMLElement;
  planes: PlaneRef[];
  fringes: HTMLElement[];
}
/** Where a plane is this frame: its pan and the change's move (px), and the pivot of its scale and turn (stage px). */
interface PlaneXf {
  tx: number;
  ty: number;
  alpha: number;
  scale: number;
  rot: number;
  /** How far it has gone into the haze (0 its own paper). */
  haze: number;
  /** The pivot at rest: the stage's centre, at the origin's line (stage px, before ty). */
  oy: number;
  /** Its origin in the plane's own box (px), for transform-origin. */
  ox: number;
  foot: FootMode;
}
const STILL: Omit<PlaneXf, 'oy' | 'ox'> = { tx: 0, ty: 0, alpha: 1, scale: 1, rot: 0, haze: 0, foot: 'paper' };

/** A torn ribbon of tissue in a 1000 × 100 box (the strips' paper; each its own tear). */
function stripPaper(i: number): string {
  const r = rng(5100 + i * 17);
  const f = 90 + r() * 70;
  const ph = r() * 6;
  const line: Pt[] = [];
  for (let x = 0; x <= 1000; x += 20) line.push([x, 50 + Math.sin(x / f + ph) * 7]);
  return path(tear(ribbon(line, 64, 0.32), 5200 + i, { jag: 1.6, wander: 5 }), true, 0);
}
/** How often a plane's paper steps through the hours during a scene change (per hour; twelve elsewhere, as the light). */
const PLANE_STEPS_IN_CHANGE = 4;
/** The variables of the light itself — the sky, the disc and its glow, the clouds, the stars, the chrome — cheap to
 *  repaint; every other one is the planes' paper. */
const LIGHT_VAR = /^--film-(sky-|c-(disc|halo|cloud|streak|bird|wind|fly)|stars|cloud-|chrome-|night$)/;
/** The light's paints a plane wears too: the disc's (the sea's reflection of it), the haze's (a flown flat's). */
const PLANE_LIGHT = /^--film-c-(disc|fly)/;
const paintVar = (k: StripPaint) => (k.startsWith('sky-') ? `var(--film-${k})` : `var(--film-c-${k})`);

/** A DOM card over the stage. */
class Slot implements CardSlot {
  w = 0;
  h = 0;
  /** The family its story card wears (read from the card's own palette variable), -1 for a drawing. */
  family = -1;
  placed = false;
  private live: boolean | null = null;
  private last = '';
  constructor(
    readonly id: SlotId,
    readonly el: HTMLElement,
    private readonly onHideFocused: () => void,
  ) {}
  measure() {
    this.w = this.el.offsetWidth;
    this.h = this.el.offsetHeight;
    // StoryCard writes its family's interior as `--card-interior: var(--card-interior-<n>)` on its article
    const v = this.el.querySelector<HTMLElement>('article')?.style.getPropertyValue('--card-interior') ?? '';
    const m = /--card-interior-(\d+)/.exec(v);
    this.family = m ? Number(m[1]) : -1;
  }
  place(p: SlotPose) {
    this.placed = true;
    const sc = p.scale ?? 1;
    const sy = (p.sy ?? 1) * sc;
    // no turnovers since round 3 (a card grows out of the tossed paper, face-on): a plain scale
    const sx = (p.sx ?? 1) * sc;
    const face = Math.abs(p.sx ?? 1);
    const t =
      `translate3d(${(p.cx - this.w / 2).toFixed(1)}px,${(p.cy - this.h / 2).toFixed(1)}px,0) rotate(${(p.rot ?? 0).toFixed(2)}deg)` +
      ` scale(${sx.toFixed(4)},${sy.toFixed(4)})`;
    const key = `${t}|${p.alpha ?? 1}|${p.draw ?? ''}|${p.pen ?? ''}`;
    if (key !== this.last) {
      this.el.style.transform = t;
      this.el.style.opacity = p.alpha == null || p.alpha >= 1 ? '' : p.alpha.toFixed(3);
      if (p.draw != null) this.el.style.setProperty('--draw', p.draw.toFixed(3));
      if (p.pen != null && Math.abs(p.pen - 1) > 1e-3) this.el.style.setProperty('--pen', p.pen.toFixed(3));
      else this.el.style.removeProperty('--pen');
      this.last = key;
    }
    // seen at all: live (its covers fetched); focusable only while it is plainly there (never a near-invisible link)
    this.setLive(face > 0.02 && (p.alpha ?? 1) > 0.02, face > 0.2 && (p.alpha ?? 1) >= 0.2);
  }
  /**
   * Its deferred covers may be fetched now (once), even while the card is unseen: its cards (FilmCard's FilmStoryCard)
   * watch for `data-covers` on their slot and only then give their cover its address.
   */
  fetchCovers() {
    if (!this.el.hasAttribute('data-covers')) this.el.setAttribute('data-covers', '');
  }
  private focusable: boolean | null = null;
  setLive(on: boolean, focusable = on) {
    if (this.live !== on) {
      this.live = on;
      if (on) this.fetchCovers();
      this.el.toggleAttribute('data-live', on);
    }
    if (this.id === 'wave' || this.id === 'wave2') return;
    const f = on && focusable;
    if (this.focusable === f) return;
    this.focusable = f;
    if (!f && this.el.contains(document.activeElement)) this.onHideFocused();
    this.el.inert = !f;
  }
  endFrame() {
    if (!this.placed) this.setLive(false);
  }
  /** As the server drew it (the film stopped). */
  reset() {
    this.el.style.removeProperty('transform');
    this.el.style.removeProperty('opacity');
    this.el.style.removeProperty('--draw');
    this.el.style.removeProperty('--pen');
    this.el.style.removeProperty('--ink');
    this.el.removeAttribute('data-live');
    this.el.inert = this.id !== 'story';
    this.live = null;
    this.focusable = null;
    this.last = '';
  }
}

export interface RenderInput {
  st: ClockState;
  acts: ReadonlyMap<number, number>;
  now: number;
  resting: boolean;
  /** ❚❚ held the acts: the puppets' idle life (breath, blinks) holds still too. */
  held?: boolean;
  dim: boolean;
  /** The track position (svh). */
  ySvh: number;
  /** The stage has let go (runtime/index.ts decides it once, for the root's `data-released` and the header's ink alike). */
  released: boolean;
  /** 0 … 1: the end's motion winding down (5 s after the film ends, only breath and blinks are left). */
  settle?: number;
}

export class Director {
  /** The stage's measures: the opening's, the valley's and the night's world (the night's puppets' size: L4). */
  L!: Layout;
  /** The journey's (scene 2): on a tall screen the world drawn larger once the hero is gone (CSS `--u-2`, `--pal-2`). */
  L2!: Layout;
  /** The night's (scene 4): its puppets smaller on a phone too narrow for their row of five (CSS --pal-4). */
  L4!: Layout;
  readonly cast: Cast;
  readonly slots = new Map<SlotId, Slot>();
  private readonly sets: SetRef[];
  private readonly particles: Particles;
  private readonly css = new StyleBook();
  private readonly hero: HTMLElement | null;
  private heroRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private heroTy = 0;
  private readonly disc: HTMLElement | null;
  private readonly clouds: HTMLElement | null;
  private readonly dot: HTMLElement | null;
  private paletteKey = '';
  private planeKey = '';
  /** The planes' paints (renderLight): each plane's own, the hour they were made for, and the planes still to take them. */
  private readonly paint = new StyleBook();
  private paintVars: [string, string][] = [];
  private paintQueue: Element[] = [];
  private paintAt = 0;
  private paintDim = false;
  /** What wears the light besides the planes (the sky, the stars, the disc, the clouds, the particles, the props, the ≋s, the tissue strips), and which of them wear the planes' paints too. */
  private lightOn: Element[] = [];
  private paintToo: Element[] = [];
  private skyFetched = false;
  private readonly paletteKeys = new Set<string>();
  private shownSets = '';
  /** The slips, pencils, ripples, the blank: a layer over the planes, under the cards. */
  readonly props: PropKit;
  /** Bumped on every measure: poses held from before are made again. */
  private epoch = 0;
  /** Reduced motion asked for (the opt-in film): no idle life. */
  reduced = false;
  /** The safety net's level: 1 the small particles dropped (CSS), 2 the clouds' drift stopped too. */
  lowfx = 0;
  private readonly layer: HTMLElement;
  /** The scene changes' style, and what it is told of each change on this screen (rebuilt on every measure). */
  readonly style: ChangeStyle;
  private infos: Partial<Record<ChangeN, ChangeInfo>> = {};
  private readonly frames = new Map<ChangeN, { p: number; epoch: number; f: ChangeFrame }>();
  /** 12 px under the header's pen line (stage px). */
  private clearPx = HEADER_PEN + CLEAR_UNDER_PEN;
  private readonly strips: { el: SVGSVGElement; path: SVGPathElement; paint: string; z: string }[] = [];
  private readonly stripBox: HTMLElement | null = null;
  private stripsOn: boolean | null = null;
  /** The page's scrollbar (script/scrollbar.ts): the server's frame-0 rule, rewritten with the light; its text as the
   *  server wrote it (given back on destroy), and the hour's palette it was last written for. */
  private readonly sbStyle: HTMLStyleElement | null;
  private readonly sbServer: string;
  private sbVars: Record<string, string> | null = null;
  private sbKey = '';
  private sbText = '';
  private sbPaper = false;

  constructor(
    private readonly root: HTMLElement,
    private readonly stage: HTMLElement,
    private readonly header: HTMLElement | null,
    focusPlay: () => void,
    style?: ChangeStyle,
  ) {
    this.style = style ?? DEFAULT_STYLE;
    this.sbStyle = root.closest('[data-film-page]')?.querySelector<HTMLStyleElement>('style[data-film-scrollbar]') ?? null;
    this.sbServer = this.sbStyle?.textContent ?? '';
    this.cast = new Cast(stage);
    for (const id of SLOT_IDS) {
      const el = stage.querySelector<HTMLElement>(`[data-slot="${id}"]`);
      if (el) this.slots.set(id, new Slot(id, el, focusPlay));
    }
    this.sets = [...stage.querySelectorAll<HTMLElement>('[data-set]')].map((el) => ({
      n: Number(el.dataset.set) as SceneN,
      el,
      planes: [...el.querySelectorAll<HTMLElement>('[data-plane]')].map((p) => ({
        el: p,
        id: (p.dataset.plane ?? 'ground') as PlaneId,
        depth: Number(p.dataset.d ?? 1),
        x0: Number(p.dataset.x0 ?? 0),
        foot: Number(p.dataset.foot ?? 1190),
        back: p.hasAttribute('data-back'),
        reflect: p.querySelector<HTMLElement>('[data-reflect]'),
        haze: p.querySelector<SVGSVGElement>(':scope > svg[data-haze]'),
        hazeShown: false,
        uses: [...p.querySelectorAll<SVGElement>(':scope > svg > use')].map((u) => ({ el: u, cut: u.getAttribute('data-cut'), rest: u.getAttribute('data-rest') })),
        cutWide: parseCut(p.dataset.cutYs),
        cutTall: parseCut(p.dataset.cutYsTall) ?? parseCut(p.dataset.cutYs),
        footMode: '' as const,
      })),
      fringes: [...el.querySelectorAll<HTMLElement>('[data-fringe]')],
    }));
    // the style's tissue strips: made once, inside the sets' stacking context (each slotted among the planes by its z)
    const setsEl = this.sets[0]?.el.parentElement ?? null;
    if (setsEl && this.style.strips > 0) {
      const box = document.createElement('div');
      box.className = 'fk-strips';
      box.setAttribute('aria-hidden', 'true');
      box.style.display = 'none';
      const NS = 'http://www.w3.org/2000/svg';
      for (let i = 0; i < this.style.strips; i++) {
        const svg = document.createElementNS(NS, 'svg');
        svg.setAttribute('class', 'fk-strip');
        svg.setAttribute('viewBox', '0 0 1000 100');
        svg.setAttribute('preserveAspectRatio', 'none');
        svg.setAttribute('focusable', 'false');
        const pth = document.createElementNS(NS, 'path');
        pth.setAttribute('d', this.style.paper?.(i) ?? stripPaper(i));
        svg.append(pth);
        box.append(svg);
        this.strips.push({ el: svg, path: pth, paint: '', z: '' });
      }
      setsEl.append(box);
      this.stripBox = box;
    }
    this.particles = new Particles(stage);
    const layer = document.createElement('div');
    this.layer = layer;
    layer.className = 'fk-props';
    layer.setAttribute('aria-hidden', 'true');
    const ui = stage.querySelector('[data-ui]');
    if (ui) ui.before(layer);
    else stage.append(layer);
    this.props = new PropKit(layer);
    this.hero = stage.querySelector('[data-hero]');
    this.disc = stage.querySelector('[data-disc]');
    this.clouds = stage.querySelector('[data-clouds]');
    this.dot = root.querySelector('[data-progress-dot]');
    const el = (q: string) => stage.querySelector<HTMLElement>(q);
    const some = (els: (Element | null | undefined)[]) => els.filter((e): e is Element => !!e);
    const particles = el('[data-wind]')?.parentElement;
    this.paintToo = some([this.disc, particles, this.stripBox]);
    this.lightOn = some([el('[data-sky]'), el('[data-sky]')?.nextElementSibling, this.disc, this.clouds, particles, layer, this.stripBox, this.slots.get('wave')?.el, this.slots.get('wave2')?.el]);
  }

  /** Read the stage's measures back from the CSS (the probes), the cards' sizes and the hero's box. Never inside a frame. */
  measure(): Layout {
    const probe = (k: string) => this.stage.querySelector<HTMLElement>(`[data-probe="${k}"]`)!.getBoundingClientRect();
    const u = probe('u');
    const pal = probe('pal');
    const u2 = probe('u2');
    const lip = probe('lip');
    const svh = probe('svh').height;
    const lvh = probe('lvh').height;
    const w = this.stage.clientWidth;
    const name = w / svh >= 1.1 ? 'wide' : 'tall';
    this.L = finishLayout({
      name,
      tablet: name === 'tall' && w >= 640,
      w,
      h: svh,
      lvh,
      u: u.width / 1000,
      groundY: u.height,
      heroBottom: pal.height,
      pal: pal.width,
      lip: lip.width,
      pad: lip.height,
    });
    this.L2 = finishLayout({ ...this.L, u: u2.width / 1000, pal: u2.height });
    const pal4 = this.stage.querySelector<HTMLElement>('[data-probe="pal4"]')?.getBoundingClientRect().width;
    this.L4 = finishLayout({ ...this.L, pal: pal4 && pal4 > 0 ? Math.min(this.L.pal, pal4) : this.L.pal });
    // the clearance under the header's pen line (its lowest point; the constant if the header isn't there)
    const pen = this.header?.querySelector('[data-pen]')?.getBoundingClientRect();
    this.clearPx = (pen && pen.height > 0 ? Math.max(pen.bottom, 0) : HEADER_PEN) + CLEAR_UNDER_PEN;
    this.infos = { 1: this.infoOf(1), 2: this.infoOf(2), 3: this.infoOf(3) };
    this.frames.clear();
    for (const st of this.strips) {
      st.el.style.width = `${this.L.w}px`;
      st.el.style.height = `${(0.1 * this.L.h).toFixed(1)}px`;
    }
    this.ghostCache.clear();
    for (const s of this.slots.values()) s.measure();
    if (this.hero) {
      const r = this.hero.getBoundingClientRect();
      const st = this.stage.getBoundingClientRect();
      // the words' own extent (the block spans its column; its words may be narrower, or wider when they don't wrap)
      const ink = (el: Element | null) => {
        if (!el) return r.right;
        const range = document.createRange();
        range.selectNodeContents(el);
        return range.getBoundingClientRect().right;
      };
      const right = Math.max(ink(this.hero.querySelector('h1')), ink(this.hero.querySelector('p')));
      this.heroRect = { x: r.left - st.left, y: r.top - st.top - this.heroTy, w: right - r.left, h: r.height };
    }
    this.paletteKey = '';
    this.planeKey = '';
    this.epoch++;
    this.cast.resize(this.L.pal, this.L2.pal, this.L4.pal);
    return this.L;
  }

  /**
   * Hands the stage back as the server drew it (the film stopped: the picture book took over, or the page is leaving):
   * the props layer and the live puppets go, the stills stand again, every style the film wrote is removed.
   */
  destroy() {
    this.layer.remove();
    this.cast.destroy();
    for (const sl of this.slots.values()) sl.reset();
    this.css.clear();
    this.particles.css.clear();
    for (const set of this.sets) {
      set.el.style.removeProperty('display');
      set.el.removeAttribute('data-live');
      for (const pl of set.planes) {
        pl.el.style.removeProperty('z-index');
        pl.el.removeAttribute('data-foot-mode');
        for (const u of pl.uses) u.el.style.removeProperty('clip-path');
        pl.footMode = '';
      }
      for (const f of set.fringes) f.style.removeProperty('z-index');
    }
    this.stripBox?.remove();
    this.hero?.removeAttribute('data-gone');
    for (const k of this.paletteKeys) this.root.style.removeProperty(k);
    this.paint.clear();
    this.paintQueue = [];
    this.header?.style.removeProperty('--film-chrome-ink');
    if (this.sbStyle) this.sbStyle.textContent = this.sbServer;
    this.sbKey = '';
    this.sbVars = null;
    this.shownSets = '';
    this.paletteKey = '';
    this.planeKey = '';
  }

  get heroBox(): Rect {
    return this.heroRect;
  }

  /** A scene's measures (the journey's world is larger on a tall screen). */
  lay(n: SceneN): Layout {
    return n === 2 ? this.L2 : n === 4 ? this.L4 : this.L;
  }

  /** 摺摺's height for the puppet riding the card: the opening's, growing into the journey's through the first change. */
  carrierPal(s: number): number {
    const k = smooth(span(s, SEG.c1.t0, SEG.c1.t1));
    return Math.round(lerp(this.L.pal, this.L2.pal, k) * 2) / 2;
  }

  /** The horizon's screen y now: the journey's, eased in and out through the changes around it. */
  hzAt(s: number): number {
    const k = smooth(span(s, SEG.c1.t0, SEG.c1.t1)) * (1 - smooth(span(s, SEG.c2.t0, SEG.c2.t1)));
    return lerp(this.L.hz, this.L2.hz, k);
  }

  /** A scene's camera now (world x at the stage's centre). */
  cam(n: SceneN, s: number): number {
    const L = this.lay(n);
    const c0 = camOf(n, L);
    if (n !== 2) return c0;
    return lerp(c0, journeyCamEnd(L), smooth(span(s, SEG.journey.t0, SEG.journey.t1)));
  }

  private sceneStart(n: SceneN): number {
    return n === 1 ? 0 : n === 2 ? SEG.c1.t0 : n === 3 ? SEG.c2.t0 : SEG.c3.t0;
  }

  /** What the style is told of change n on this screen: both sets' planes at rest (the journey's camera where it is then). */
  private infoOf(n: ChangeN): ChangeInfo {
    const planes = (k: SceneN) => {
      const set = this.sets.find((x) => x.n === k);
      const L = this.lay(k);
      const c0 = camOf(k, L);
      const cam = k === 2 && n === 2 ? journeyCamEnd(L) : c0;
      const list: SetPlane[] = (set?.planes ?? []).map((pl) => ({ id: pl.id, depth: pl.depth, foot: pl.foot, x0: pl.x0, cut: L.name === 'tall' ? pl.cutTall : pl.cutWide }));
      return changePlanes(list, L, c0, cam);
    };
    return changeInfo(n, this.L, planes(n as SceneN), planes((n + 1) as SceneN), this.clearPx);
  }

  /** The style's frame for change n at p (asked once per p and measure). */
  private frameOf(n: ChangeN, p: number): ChangeFrame {
    const m = this.frames.get(n);
    if (m && m.p === p && m.epoch === this.epoch) return m.f;
    const f = this.style.frame(p, this.infos[n] ?? this.infoOf(n));
    this.frames.set(n, { p, epoch: this.epoch, f });
    return f;
  }

  /** The change at s and its frame, or null. */
  private changeNow(s: number): { n: ChangeN; p: number; from: SceneN; to: SceneN; t0: number; t1: number; f: ChangeFrame } | null {
    const ch = changeAt(s);
    if (!ch) return null;
    const n = ch.from as ChangeN;
    return { n, p: ch.p, from: ch.from, to: ch.to, t0: ch.seg.t0, t1: ch.seg.t1, f: this.frameOf(n, ch.p) };
  }

  /** A plane of a set by id (the nearest in depth when the set has none of that id). */
  private planeOf(n: SceneN, id: string, depth: number): { pl: PlaneRef; i: number } | null {
    const set = this.sets.find((x) => x.n === n);
    if (!set || !set.planes.length) return null;
    let i = set.planes.findIndex((pl) => pl.id === id);
    if (i < 0) {
      let best = Infinity;
      set.planes.forEach((pl, k) => {
        const d = Math.abs(pl.depth - depth);
        if (d < best) {
          best = d;
          i = k;
        }
      });
    }
    return { pl: set.planes[i], i };
  }

  /** A plane's place now: the camera's pan, the change's move (the style's), the bridge's own rise. */
  private planeXf(n: SceneN, pl: PlaneRef, i: number, s: number): PlaneXf {
    const L = this.lay(n);
    const c0 = camOf(n, L);
    const pan = n === 2 ? -(this.cam(2, s) - c0) * pl.depth * L.u : 0;
    const xf: PlaneXf = { ...STILL, tx: pan, oy: 0, ox: 0 };
    let originY = pl.foot;
    const ch = this.changeNow(s);
    if (ch && (ch.from === n || ch.to === n)) {
      const mv = (n === ch.from ? ch.f.old : ch.f.new)[i];
      if (mv) {
        xf.ty = mv.y * L.h;
        xf.tx += (mv.x ?? 0) * L.w;
        xf.alpha = clamp01(mv.alpha);
        xf.scale = mv.scale ?? 1;
        xf.rot = mv.rot ?? 0;
        xf.haze = pl.haze ? clamp01(mv.haze ?? 0) : 0;
        xf.foot = mv.foot;
        if (mv.origin === 'top') originY = PLANE_TOP[pl.id] ?? pl.foot;
        else if (mv.origin === 'cut') {
          const cut = L.name === 'tall' ? pl.cutTall : pl.cutWide;
          const cam = n === 2 && ch.n === 2 ? journeyCamEnd(L) : c0;
          if (cut) originY = cutAt(cut, pl.x0, c0 + (cam - c0) * pl.depth);
        }
      }
    } else if (s < this.sceneStart(n)) xf.ty = 2 * L.lvh;
    // the bridge grows up out of the river (script/beats.ts BRIDGE_IN): from wholly under the water — behind the banks
    // and the water, which are in front of it — to its place; not there at all before its segment
    if (n === 3 && pl.id === 'bridge' && s < SEG.bridge.t1) {
      const v = span(s, SEG.bridge.t0, SEG.bridge.t1);
      const up = span(v, ...BRIDGE_IN.rise);
      xf.ty += (1 - up) ** 2.2 * BRIDGE_IN.drop * L.u;
      if (s < SEG.bridge.t0) xf.alpha = 0;
    }
    xf.oy = L.groundY + (originY - 885) * L.u;
    // the pivot is the stage's centre (whatever the pan): in the plane's own box
    xf.ox = (c0 - pl.x0) * L.u - pan;
    return xf;
  }

  /** The front grass's place now (it pans with depth 1.3 on the road; the change's style moves it). */
  private fringeXf(n: SceneN, s: number): { tx: number; ty: number; alpha: number } {
    const L = this.lay(n);
    const tx = n === 2 ? -(this.cam(2, s) - camOf(2, L)) * 1.3 * L.u : 0;
    const ch = this.changeNow(s);
    if (ch && (ch.from === n || ch.to === n)) {
      const m = n === ch.from ? ch.f.fringe.old : ch.f.fringe.new;
      return { tx, ty: m.y * L.h, alpha: clamp01(m.alpha) };
    }
    return { tx, ty: s < this.sceneStart(n) ? 2 * L.lvh : 0, alpha: 1 };
  }

  /** The plane a world point of depth d rides (the ground's, the bridge's, else the nearest). */
  private riding(n: SceneN, depth: number, s: number): PlaneXf | null {
    const id = depth >= 1 ? 'ground' : depth >= 0.9 ? 'bridge' : 'near';
    const at = this.planeOf(n, id, depth);
    return at ? this.planeXf(n, at.pl, at.i, s) : null;
  }

  /** World → stage px on a scene's plane of depth d (with its camera and its change's move now, scale and turn too). */
  toScreen(n: SceneN, x: number, y: number, depth: number, s: number): [number, number] {
    const L = this.lay(n);
    const c0 = camOf(n, L);
    const m = this.riding(n, depth, s);
    let px = L.w / 2 + (x - c0) * L.u + (m?.tx ?? 0);
    let py = L.groundY + (y - 885) * L.u + (m?.ty ?? 0);
    if (m && (m.rot || m.scale !== 1)) {
      const ox = L.w / 2;
      const oy = m.oy + m.ty;
      const a = (m.rot * Math.PI) / 180;
      const dx = px - ox;
      const dy = py - oy;
      px = ox + m.scale * (dx * Math.cos(a) - dy * Math.sin(a));
      py = oy + m.scale * (dx * Math.sin(a) + dy * Math.cos(a));
    }
    return [px, py];
  }

  toWorld(n: SceneN, px: number, py: number, depth: number, s: number): [number, number] {
    const L = this.lay(n);
    const c0 = camOf(n, L);
    const m = this.riding(n, depth, s);
    if (m && (m.rot || m.scale !== 1)) {
      const ox = L.w / 2;
      const oy = m.oy + m.ty;
      const a = (-m.rot * Math.PI) / 180;
      const dx = (px - ox) / m.scale;
      const dy = (py - oy) / m.scale;
      px = ox + dx * Math.cos(a) - dy * Math.sin(a);
      py = oy + dx * Math.sin(a) + dy * Math.cos(a);
    }
    return [(px - (m?.tx ?? 0) - L.w / 2) / L.u + c0, (py - (m?.ty ?? 0) - L.groundY) / L.u + 885];
  }

  /** The answer card fetches its cover: a scene ahead of the reply, or at once when a jump is headed past the catch. */
  prefetchAnswer() {
    this.slots.get('b')?.fetchCovers();
  }
  /**
   * The night's sky cards (a wide screen's) fetch their covers: a scene ahead of the night as the page scrolls on, and
   * at once when a seek, a glide or a jump is headed past the meet (so they are in by the time it lands).
   */
  prefetchSky() {
    if (this.skyFetched || this.L.name !== 'wide') return;
    this.skyFetched = true;
    for (const [id, sl] of this.slots) if (id.startsWith('sky')) sl.fetchCovers();
  }

  /**
   * Makes the writers' poses ahead of their acts: kit/write.ts memoizes each (`writePose`: a search of tens of thousands
   * of rig evaluations, once per size) — made inside the reply's first frame it froze WebKit for half a second just as
   * 聆聆 starts to write (the engineering review, round 3). A ghost frame of each writing act, no DOM touched. Called at
   * a still moment once the opening has played (runtime/index.ts), and again after a new measure.
   */
  warmPoses() {
    const at = [
      ['reply', R1.ink[0] + 0.5],
      ['yours', Y1.show[1]],
      ['write', W1.ink[0] + 0.5],
    ] as const;
    for (const [id, x] of at) {
      const seg = SEG[id];
      ghost(id, x, this.ctx(seg.t0 + x, 0, true, seg.scene));
    }
  }

  /** One frame. */
  render(inp: RenderInput) {
    const { st, now, resting, dim } = inp;
    const s = st.s;
    const L = this.L;
    const seg = st.owner;
    this.css.set(this.stage, '--hz', `${this.hzAt(s).toFixed(1)}px`);
    this.cast.carrierSize(this.carrierPal(s));
    this.renderDisc(s);
    this.renderSets(s);
    this.renderStrips(s);
    this.renderLight(this.hourS(s), dim, inp.released, !!changeAt(s));
    this.writeScrollbar();
    this.renderHero(s);
    // the beats: the owner's frame places the cards and the actors
    this.cast.beginFrame();
    this.props.begin();
    for (const sl of this.slots.values()) sl.placed = false;
    // the night's sky chips (a wide screen's) fetch their covers a scene ahead
    if (s > SEG.meet.t0) this.prefetchSky();
    // the answer card's cover a scene ahead of it (in by the time 聆聆 writes it, never decoded mid-turn)
    if (s > SEG.catch.t0) this.prefetchAnswer();
    BEATS[seg.id](st.x, this.ctx(s, now, resting, seg.scene));
    for (const sl of this.slots.values()) sl.endFrame();
    this.props.end();
    this.cast.endFrame(now, !resting && !this.reduced && !inp.held);
    const yours = inp.acts.get(SEG.yours.index) ?? 0;
    const a = this.slots.get('a');
    const c3 = s >= SEG.c3.t0 && s < SEG.c3.t1 ? this.changeNow(s) : null;
    this.particles.render({
      s,
      L,
      now,
      resting,
      hour: hourAt(this.hourS(s)),
      lift: c3 ? c3.f.lanterns : null,
      clear: this.clearPx,
      chip: a && a.placed ? this.lastPose(a) : null,
      yoursA: yours,
      ctaH: this.slots.get('cta')?.h ?? 300,
      settle: inp.settle ?? 0,
      // the moon's disc (stage px), which no lantern crosses
      moon: this.discState.moon > 0.5 ? { x: this.discState.x, y: this.discState.y, r: this.discState.r * L.u } : null,
    });
    if (this.lowfx < 2) this.css.set(this.clouds, 'transform', `translate3d(${(-(this.cam(2, s) - 1000) * 0.02 * L.u - s * 1.6).toFixed(1)}px,0,0)`);
    // the progress line's dot: its rail as wide as the line, moved along it — and up and down with the pen line's own
    // curve (script/progressLine.ts) — by a transform alone
    const along = clamp01(inp.ySvh / TRACK_SVH);
    this.css.set(this.dot, 'transform', `translate3d(${(along * 100).toFixed(2)}%,${progressLineY(along).toFixed(2)}px,0)`);
  }

  private poses = new Map<SlotId, SlotPose>();
  private lastPose(sl: Slot): SlotPose | null {
    return this.poses.get(sl.id) ?? null;
  }

  /** Ghosts by character, tag and size (a ghost answers where a puppet of that size would hold its mittens). */
  private readonly ghostCache = new Map<string, StickerPuppet>();

  private ctx(s: number, now: number, resting: boolean, scene: SceneN): BeatCtx {
    const poses = this.poses;
    const slots = this.slots;
    const palOf = (n?: SceneN | 'carrier') => (n === 'carrier' ? this.carrierPal(s) : this.lay(n ?? scene).pal);
    return {
      s,
      layout: this.lay(scene),
      layoutOf: (n) => this.lay(n),
      now,
      resting,
      hero: this.heroRect,
      slot(id) {
        const sl = slots.get(id)!;
        return {
          id,
          w: sl.w,
          h: sl.h,
          family: sl.family,
          place(p) {
            poses.set(id, p);
            sl.place(p);
          },
        };
      },
      actor: (n, slug) => this.cast.actor(n, slug),
      carrier: (slug) => this.cast.carrier(slug),
      ghost: (slug: PalSlug, tag = '', n?: SceneN | 'carrier') => {
        const pal = palOf(n);
        const id = `${slug}|${tag}|${pal.toFixed(1)}`;
        let g = this.ghostCache.get(id);
        if (!g) {
          g = ghostPuppet(slug, pal);
          this.ghostCache.set(id, g);
        }
        return g;
      },
      props: this.props,
      epoch: this.epoch,
      held: (top) => {
        const ch = this.changeNow(s);
        if (!ch) return { dy: 0, alpha: 1 };
        return { dy: easeIntoRoom(ch.f.held.y * this.L.h, top - this.clearPx), alpha: clamp01(ch.f.held.alpha) };
      },
      actorShift: (n) => {
        const ch = this.changeNow(s);
        if (!ch || (ch.from !== n && ch.to !== n)) return { dy: 0, alpha: 1 };
        const m = n === ch.from ? ch.f.actors.old : ch.f.actors.new;
        return { dy: m.y * this.L.h, alpha: clamp01(m.alpha) };
      },
      toScreen: (n, x, y, depth = 1) => this.toScreen(n, x, y, depth, s),
      toWorld: (n, px, py, depth = 1) => this.toWorld(n, px, py, depth, s),
      groundY: (n, x) => groundAt(placeOf(n, this.lay(n)), x),
    };
  }

  /** Which sets stand now (the current one; during a change the incoming too) and where each plane is. */
  private renderSets(s: number) {
    const L = this.L;
    const ch = this.changeNow(s);
    const current = ch ? null : this.sceneOfS(s);
    const shown = ch ? [ch.from, ch.to] : [current!];
    const key = `${shown.join(',')}|${this.epoch}`;
    if (key !== this.shownSets) {
      this.shownSets = key;
      // the paint order: the style's through a change; at rest the backdrop, then the flats far to near, then the grass
      const order = ch ? this.style.order(this.infos[ch.n] ?? this.infoOf(ch.n)) : null;
      for (const set of this.sets) {
        const on = shown.includes(set.n);
        set.el.style.display = on ? 'block' : 'none';
        set.el.toggleAttribute('data-live', on);
        const side = !ch ? null : set.n === ch.from ? 'old' : set.n === ch.to ? 'new' : null;
        set.planes.forEach((pl, i) => {
          const z = order && side ? order[side][i] : pl.back ? 1 : 10 + i;
          pl.el.style.zIndex = String(Math.round(z ?? 10 + i));
        });
        const fz = order && side ? order.fringe[side] : 50;
        set.fringes.forEach((f) => (f.style.zIndex = String(Math.round(fz))));
      }
    }
    for (const set of this.sets) {
      if (!shown.includes(set.n)) continue;
      const SL = this.lay(set.n);
      const c0 = camOf(set.n, SL);
      set.planes.forEach((pl, i) => {
        const m = this.planeXf(set.n, pl, i, s);
        const turn = m.rot !== 0 || m.scale !== 1;
        this.css.set(pl.el, 'transform', `translate3d(${m.tx.toFixed(1)}px,${m.ty.toFixed(1)}px,0)` + (turn ? ` rotate(${m.rot.toFixed(3)}deg) scale(${m.scale.toFixed(4)})` : ''));
        if (turn) this.css.set(pl.el, 'transform-origin', `${m.ox.toFixed(1)}px ${(m.oy - SL.groundY + 885 * SL.u).toFixed(1)}px`);
        this.css.set(pl.el, 'opacity', m.alpha >= 1 ? '1' : m.alpha.toFixed(3));
        this.setFoot(pl, m.foot);
        this.setHaze(pl, m.alpha > 0 ? m.haze : 0);
        if (pl.reflect) {
          const d = this.discState;
          const left = L.w / 2 + (pl.x0 - c0) * SL.u + m.tx;
          this.css.set(pl.reflect, 'transform', `translate3d(${(d.x - left).toFixed(1)}px,0,0)`);
          this.css.set(pl.reflect, 'opacity', d.refl.toFixed(3));
        }
      });
      for (const f of set.fringes) {
        const fm = this.fringeXf(set.n, s);
        // on the road the corner grass streams past (wrapping round the screen); elsewhere it holds its corner
        const fw = 420 * SL.u * (L.name === 'wide' ? 0.72 : 0.42);
        const base = f.dataset.fringe === 'l' ? 0 : L.w - fw;
        let pos = base + fm.tx;
        if (set.n === 2) {
          const P = L.w + fw;
          pos = ((((pos + fw) % P) + P) % P) - fw;
        }
        this.css.set(f, 'transform', `translate3d(${(pos - base).toFixed(1)}px,${fm.ty.toFixed(1)}px,0)`);
        this.css.set(f, 'opacity', fm.alpha >= 1 ? '1' : fm.alpha.toFixed(3));
      }
    }
  }

  /**
   * A plane's foot: `cut` clips each of its <use>s to its cut-out (its art and a short torn foot), `apron` shows the
   * paper under it, `paper` neither. Written only when it changes.
   */
  private setFoot(pl: PlaneRef, mode: FootMode) {
    if (pl.footMode === mode) return;
    const was = pl.footMode;
    pl.footMode = mode;
    pl.el.setAttribute('data-foot-mode', mode);
    if (mode === 'cut' || was === 'cut' || mode === 'rest' || was === 'rest') {
      for (const u of pl.uses) {
        const clip = mode === 'cut' ? u.cut : mode === 'rest' ? u.rest : null;
        if (clip) u.el.style.setProperty('clip-path', `url(#${clip})`);
        else u.el.style.removeProperty('clip-path');
      }
    }
  }

  /** A plane's haze: its paper again in the haze's paint over itself, shown only while it hazes (opacity only). */
  private setHaze(pl: PlaneRef, haze: number) {
    if (!pl.haze) return;
    const on = haze > 0.002;
    if (on !== pl.hazeShown) {
      pl.hazeShown = on;
      pl.haze.style.display = on ? 'block' : '';
    }
    if (on) this.css.set(pl.haze, 'opacity', haze >= 1 ? '1' : haze.toFixed(3));
  }

  /** The style's tissue strips (only during a change; each placed, sized, turned, painted and slotted by its z). */
  private renderStrips(s: number) {
    if (!this.stripBox) return;
    const ch = this.changeNow(s);
    const on = !!ch && ch.f.strips.length > 0;
    if (on !== this.stripsOn) {
      this.stripsOn = on;
      this.stripBox.style.display = on ? 'block' : 'none';
    }
    if (!on || !ch) return;
    const L = this.L;
    this.strips.forEach((st, i) => {
      const m = ch.f.strips[i];
      const alpha = m ? clamp01(m.alpha) : 0;
      this.css.set(st.el, 'opacity', alpha.toFixed(3));
      if (!m || alpha <= 0) return;
      const t = `translate3d(${(m.x * L.w - L.w / 2).toFixed(1)}px,${(m.y * L.h - 0.05 * L.h).toFixed(1)}px,0) rotate(${(m.rot ?? 0).toFixed(2)}deg) scale(${m.w.toFixed(4)},${(m.h / 0.1).toFixed(4)})`;
      this.css.set(st.el, 'transform', t);
      const z = String(Math.round(m.z));
      if (z !== st.z) {
        st.z = z;
        st.el.style.zIndex = z;
      }
      if (m.paint !== st.paint) {
        st.paint = m.paint;
        st.path.style.fill = paintVar(m.paint);
      }
    });
  }

  /** The hour's film time: through a change, as far as the style has turned the hour. */
  private hourS(s: number): number {
    const ch = this.changeNow(s);
    return ch ? lerp(ch.t0, ch.t1, clamp01(ch.f.hour)) : s;
  }

  private sceneOfS(s: number): SceneN {
    if (s < SEG.c1.t1) return 1;
    if (s < SEG.c2.t1) return 2;
    if (s < SEG.c3.t1) return 3;
    return 4;
  }

  /**
   * The hour's colours (`s`: the hour's film time). The sky, the disc, the clouds and the chrome step every twelfth of
   * an hour; so does the planes' paper (every other variable) — except through a scene change, where the hour runs
   * fastest (a step every 0.13–0.27 s) and the planes fly, masking a larger step: there every quarter of an hour. Each
   * paper step repaints every plane, which WebKit takes 50 ms and more over (the engineering review, round 3). At rest a
   * quarter's step would show (ΔE up to 0.06 a step at dawn), so there the planes keep the twelfths. Each written only
   * when it moves (or the scheme changes).
   */
  private renderLight(s: number, dim: boolean, released: boolean, inChange: boolean) {
    const hour = hourAt(s);
    const step = Math.floor(hour * 12);
    const per = inChange ? PLANE_STEPS_IN_CHANGE : 12;
    const pstep = Math.floor(hour * per);
    const key = `${step}|${dim}|${released}`;
    const pkey = `${pstep}/${per}|${dim}`;
    if (pkey !== this.planeKey) {
      // the planes' paper: the hour's paints written on each plane itself (never on the root: a custom property set
      // there restyles the whole film, and every plane then repaints in the one frame — in WebKit a dropped frame or
      // two at every step of the light, twelve an hour). The planes not on stage take it at once (nothing to paint);
      // those on stage one a frame, far to near — a step of the light is a twelfth of an hour, far too small to see
      // pass from plane to plane. A jump (the first frame, a seek, the scheme changing) is written whole, at once.
      const at = pstep / per;
      const jump = this.planeKey === '' || Math.abs(at - this.paintAt) > 1.5 / PLANE_STEPS_IN_CHANGE || dim !== this.paintDim;
      this.paintAt = at;
      this.paintDim = dim;
      this.planeKey = pkey;
      // (the disc's own paint too: the sea's reflection wears it; and the haze's, which a flown flat pales into)
      this.paintVars = Object.entries(per === 12 ? paletteAt(step / 12, { dim }) : paletteAt(at, { dim })).filter(([k]) => !LIGHT_VAR.test(k) || PLANE_LIGHT.test(k));
      const queue: Element[] = [];
      for (const set of this.sets) {
        const els = [...set.planes.map((pl) => pl.el), ...set.fringes];
        if (!jump && set.el.hasAttribute('data-live')) queue.push(...els);
        else for (const el of els) this.paintOn(el);
      }
      for (const el of this.paintToo) this.paintOn(el);
      this.paintQueue = queue;
    }
    const next = this.paintQueue.shift();
    if (next) this.paintOn(next);
    if (key === this.paletteKey) return;
    this.paletteKey = key;
    // the light (the sky, the stars, the disc, the clouds, the wind and the birds, the ≋'s ink): on what wears it, never
    // on the root either — the sky's step then restyles a handful of small trees, not every card, puppet and plane
    const vars = paletteAt(step / 12, { dim });
    this.sbVars = vars;
    for (const [k, v] of Object.entries(vars)) {
      if (!LIGHT_VAR.test(k)) continue;
      for (const el of this.lightOn) this.paint.set(el, k, v);
    }
    // once the stage has let go the header is the site's own, its ink the theme's (FilmHeader.module.css)
    if (this.header) {
      if (released) this.header.style.removeProperty('--film-chrome-ink');
      else this.header.style.setProperty('--film-chrome-ink', vars['--film-chrome-ink']);
    }
  }

  /** The stories' paper is up (`data-paper`, runtime/index.ts): the bar is the theme's; down again, the film's at once. */
  set paperUp(on: boolean) {
    if (on === this.sbPaper) return;
    this.sbPaper = on;
    this.writeScrollbar();
  }

  private writeScrollbar() {
    if (!this.sbStyle || (!this.sbPaper && !this.sbVars)) return;
    const key = this.sbPaper ? 'paper' : this.paletteKey;
    // (and again when someone else wrote it: a film stopped after this one started hands the server's rule back)
    if (key === this.sbKey && this.sbStyle.textContent === this.sbText) return;
    this.sbKey = key;
    this.sbText = this.sbPaper || !this.sbVars ? '' : scrollbarCss(this.sbVars);
    this.sbStyle.textContent = this.sbText;
  }

  /** The hour's paints on one plane (or the grass, the tissue strips, the birds): only what changed is written. */
  private paintOn(el: Element) {
    for (const [k, v] of this.paintVars) this.paint.set(el, k, v);
  }

  private discState = { x: 0, y: 0, r: 86, refl: 0, moon: 0 };

  /**
   * The disc's arc (SPEC §5.4): the sun rising, crossing and setting; the moon rising; the crescent. On a tall screen
   * the disc is never larger than 0.11 of the width (it must not own a phone's frame), the opening's sun shows its top
   * over the range, and the journey's crosses near the edges, beside the cards rather than behind them.
   */
  private renderDisc(s: number) {
    const L = this.L;
    const W = L.w;
    const hz = this.hzAt(s);
    const wide = L.name === 'wide';
    const cap = (r: number) => (wide ? r : Math.min(r, (0.11 * W) / L.u));
    const rise = smooth(span(s, 0, SEG.c1.t0));
    const s1 = { x: (wide ? 0.74 : 0.78) * W, y: (wide ? lerp(1.03, 0.84, rise) : lerp(0.76, 0.66, rise)) * hz, r: cap(86) };
    const s1End = wide ? 0.84 : 0.66;
    const v2 = span(s, SEG.journey.t0, SEG.c2.t0);
    const [x2a, x2b] = wide ? [0.8, 0.22] : [0.86, 0.14];
    const s2 = { x: lerp(x2a, x2b, v2) * W, y: lerp(0.3, 0.8, v2) * hz - 0.25 * hz * Math.sin(Math.PI * v2), r: cap(lerp(60, 104, v2)) };
    // the sun sets into the valley and the moon comes up as far into the meeting as round 2 had it (s 32 of 28.5–37)
    const dusk = lerp(SEG.bridge.t0, SEG.meet.t1, 3.5 / 8.5);
    const s3 = { x: 0.3 * W, y: lerp(0.86, 1.06, smooth(span(s, SEG.bridge.t0, dusk))) * hz, r: cap(110) };
    const m3 = { x: 0.82 * W, y: lerp(1.0, 0.45, smooth(span(s, dusk, SEG.meet.t1))) * hz, r: cap(66) };
    const ms = moonSpot(L);
    const m4 = { x: ms.x, y: ms.y, r: cap(60) };
    if (!wide) {
      // a tall screen's night moon hangs in the lanterns' band, clear of the night card's foot (never half under it)
      const cta = this.slots.get('cta');
      const sp = ctaSpot(L, cta?.h ?? 300);
      const foot = sp.cy + ((cta?.h ?? 300) * sp.scale) / 2;
      const r = m4.r * L.u;
      m4.y = Math.min(nightHeadsY(L) - r - 6, Math.max(m4.y, foot + r + 10));
    }
    let d = s1;
    let sun = 1;
    let cres = 0;
    if (s >= SEG.c1.t0 && s < SEG.journey.t0) {
      const k = smooth(span(s, SEG.c1.t0, SEG.c1.t1));
      d = { x: lerp(s1.x, x2a * W, k), y: lerp(s1End * hz, 0.3 * hz, k), r: lerp(s1.r, cap(60), k) };
    } else if (s >= SEG.journey.t0 && s < SEG.c2.t0) d = s2;
    else if (s >= SEG.c2.t0 && s < SEG.bridge.t0) {
      const k = smooth(span(s, SEG.c2.t0, SEG.c2.t1));
      d = { x: lerp(x2b * W, s3.x, k), y: lerp(0.8 * hz, 0.86 * hz, k), r: lerp(cap(104), s3.r, k) };
    } else if (s >= SEG.bridge.t0 && s < dusk) d = s3;
    else if (s >= dusk && s < SEG.c3.t0) {
      d = m3;
      sun = 0;
    } else if (s >= SEG.c3.t0) {
      // one moon: it travels to the crescent's place while the shadow slides across it (never two discs at once)
      const k = smooth(span(s, SEG.c3.t0, SEG.c3.t1));
      d = { x: lerp(m3.x, m4.x, k), y: lerp(0.45 * hz, m4.y, k), r: lerp(m3.r, m4.r, k) };
      sun = 0;
      cres = k;
    }
    const moon = 1 - sun;
    const above = smooth(span(hz * 1.04 - d.y, 0, hz * 0.25));
    const refl = sun ? 0.85 * above : 0.5 * above * (1 - cres) + cres * 0.3;
    this.discState = { x: d.x, y: d.y, r: d.r, refl, moon };
    this.css.set(this.disc, 'transform', `translate3d(${d.x.toFixed(1)}px,${d.y.toFixed(1)}px,0) scale(${(d.r / 100).toFixed(3)})`);
    this.css.set(this.disc, '--film-sun', String(sun));
    this.css.set(this.disc, '--film-moon', moon.toFixed(3));
    this.css.set(this.disc, '--film-crescent', cres.toFixed(3));
    this.css.set(this.disc, '--film-glow', (sun ? 1 : 0.55).toFixed(2));
  }

  /** The hero leaves with the first change (as the style moves it); once it's gone its words are visually hidden. */
  private renderHero(s: number) {
    if (!this.hero) return;
    const L = this.L;
    const h = s < SEG.c1.t0 ? { y: 0, alpha: 1 } : this.frameOf(1, span(s, SEG.c1.t0, SEG.c1.t1)).hero;
    const alpha = clamp01(h.alpha);
    this.heroTy = h.y * L.h;
    this.css.set(this.hero, 'transform', `translate3d(0,${this.heroTy.toFixed(1)}px,0)`);
    this.css.set(this.hero, 'opacity', alpha.toFixed(3));
    // gone (its words visually hidden, still read) as soon as it has faded out
    const gone = s >= SEG.c1.t0 && alpha < 0.01;
    if (gone !== this.hero.hasAttribute('data-gone')) this.hero.toggleAttribute('data-gone', gone);
  }
}
