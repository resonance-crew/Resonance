/**
 * The film's props (SPEC §5.2), small inline drawings with no filters, placed in stage px in the props layer over the
 * planes — or, while a live puppet holds them, inside its own body (`into`: between its torso and its arms, so the
 * mittens close over a slip's edge and a pencil's body): the slip a puppet writes on (round 3, the owner: 「那張卡片
 * 和現在角色的這個設計就不搭」 — a tiny card of the very paper it will become: its family's interior inside a soft
 * wobbly outline at INK_LIGHT in the family's pen, a striped cover block at its top, a title and two lines appearing
 * in the family's own ink as they are written, never black), 牽牽's blank (the same tiny card in the call to action's
 * family, its lines only pencilled guides), the pencil (the engine's, held a third of the way from its cap), a ripple
 * (one wavy arc of the ≋, in the chrome's ink — never a heart) and a bow's motion strokes. Each has a drawing box in
 * its own units, named anchors, and `at(x, y, {k, rot, anchor, alpha, sx, sy, w, h})`: k px per drawing unit (or
 * w × h px, the drawing stretched). Strokes keep their px width at any size. A prop not placed in a frame is hidden
 * after it (PropKit.end). Only what changed is written.
 */
import { cssOklch, paletteFor, type PaletteToken } from '@/lib/design/palette';
import { WAVE_PATHS } from '@/components/atoms/Icon/icons/wave';
import { INK, INK_LIGHT } from '@/lib/design/strokes';
import { wobRect } from '@/lib/design/wobRect';

export type PropKind = 'slip' | 'pencil' | 'ripple' | 'blank' | 'strokes' | 'halo';

export interface PropAt {
  /** Px per drawing unit (default 1). */
  k: number;
  /** Degrees, about the anchor. */
  rot: number;
  /** A named anchor, or a point of the drawing. */
  anchor: string | readonly [number, number];
  alpha: number;
  /** Extra scales. */
  sx: number;
  sy: number;
  /** Stretch the drawing to this many px (overrides k on that axis). */
  w: number;
  h: number;
}

/** What a prop is drawn in: a card family's paper (slips and blanks), or plain colours. */
export interface PropLook {
  fill?: string;
  /** The card family (cardColours' index) whose paper and pen a slip or a blank wears. */
  family?: number;
  /** The pen of a slip with no family (a drawing's own). */
  pen?: string;
}

interface KindDef {
  size: readonly [number, number];
  anchors: Record<string, readonly [number, number]>;
  /** Its SVG; `uid` names anything it defines (a gradient), unique on the page: a hidden prop's own definition is no one else's. */
  draw(o: PropLook & { uid: string }): string;
}
let uidSeq = 0;

const GRAPHITE = 'oklch(30% 0.02 280)';
const NS = 'vector-effect="non-scaling-stroke"';

/** The slip: a tiny portrait card (the story card's own shape, 300 × 440), drawing units. */
export const SLIP_W = 30;
export const SLIP_H = 44;
/** Its written lines, [x0, x1, y]: the title, then two lines of the story, under the cover. */
export const SLIP_LINES: readonly (readonly [number, number, number])[] = [
  [5, 24, 24.5],
  [5, 24.5, 30.5],
  [5, 19, 36],
];
/** A line's handwriting: a wave of this period and height (units), the pencil's path along it (kit/write `writingAt`). */
export const SLIP_WAVE = { period: 4.75, amp: 0.9 } as const;
/** The pencil's drawing: its point, and its grip — a third of the way from its cap, where a mitten closes over it. */
export const PENCIL_POINT: readonly [number, number] = [6, 54];
export const PENCIL_GRIP: readonly [number, number] = [6, 2 + 52 / 3];

const slipLine = ([x0, x1, y]: readonly [number, number, number]) => {
  const { period: p, amp } = SLIP_WAVE;
  let d = `M${x0} ${y} q${p / 2} ${-2 * amp} ${p} 0`;
  for (let x = x0 + p; x < x1 - 0.01; x += p) d += ` t${Math.min(p, x1 - x).toFixed(2)} 0`;
  return d;
};
/** The slip's outline and its cover block (made once: the same paper for every slip). */
const SLIP_EDGE = wobRect(SLIP_W, SLIP_H, 4.6, 31, 0.55, { segmentsH: [2, 3], segmentsV: [3, 4], curve: 0.55, cornerJitter: 0.7, cornerOffset: 0.6 });
const COVER = { x: 3.2, y: 3.2, w: SLIP_W - 6.4, h: 15.5 };
const COVER_EDGE = wobRect(COVER.w, COVER.h, 2.6, 57, 0.35, { segmentsH: 2, segmentsV: 2, curve: 0.5, cornerJitter: 0.6 });
/** The cover's stripes (the card's before its picture), clipped to its box by hand: no clip-path id to collide. */
const COVER_STRIPES = (() => {
  const out: string[] = [];
  const { x, y, w, h } = COVER;
  const slope = 1.6;
  for (let i = 1; i < 6; i++) {
    // a line x = x0 + slope·(t − y) through the box, cut to its sides
    const x0 = x - 6 + i * 6.2;
    let a = 0;
    let b = h;
    const xa = x0 + slope * a;
    if (xa < x) a = (x - x0) / slope;
    if (x0 + slope * b > x + w) b = (x + w - x0) / slope;
    if (b <= a + 0.5) continue;
    out.push(`M${(x0 + slope * a).toFixed(2)} ${(y + a).toFixed(2)}L${(x0 + slope * b).toFixed(2)} ${(y + b).toFixed(2)}`);
  }
  return out.join('');
})();

/**
 * A card family's paper as the light scheme draws it, whatever the page's scheme: a slip is the puppets' paper, which
 * keeps its colours at night (a dark scheme's card paper in a puppet's mitten reads as a phone, not a slip).
 */
const LIGHT = paletteFor('terracotta', 'light');
const lightOf = (role: string, f: number) => cssOklch(LIGHT[`card-${role}-${f}` as PaletteToken]);

/** A slip (or a blank) in its family's paper: written lines (`.s`, drawn in by `ink`), or a blank's pencilled guides. */
function slipDrawing(o: PropLook, blank: boolean): string {
  const f = o.family ?? -1;
  const has = f >= 0;
  const paper = has ? lightOf('interior', f) : (o.fill ?? 'oklch(97% 0.015 86)');
  const pen = has ? lightOf('border', f) : (o.pen ?? GRAPHITE);
  const ink = has ? lightOf('border-deep', f) : (o.pen ?? GRAPHITE);
  const cover = has ? lightOf('fill', f) : 'oklch(92% 0.03 86)';
  const stripe = has ? lightOf('stripe', f) : pen;
  const lines = blank
    ? // its lines only faint ruled guides, nothing written yet
      `<g fill="none" stroke="${pen}" stroke-width="${INK_LIGHT}" stroke-linecap="round" opacity=".3">` +
      SLIP_LINES.map(([x0, , y]) => `<path d="M${x0} ${y + 1}H${SLIP_W - x0}" ${NS}/>`).join('') +
      '</g>'
    : SLIP_LINES.map(
        (l, i) =>
          `<path class="s" pathLength="1" stroke-dasharray="1 1" stroke-dashoffset="1" d="${slipLine(l)}" fill="none" stroke="${i ? pen : ink}" ` +
          `stroke-width="${i ? INK_LIGHT : INK}" stroke-opacity="${i ? 0.78 : 0.85}" stroke-linecap="round" ${NS}/>`,
      ).join('');
  return (
    `<path d="${SLIP_EDGE}" fill="${paper}" stroke="${pen}" stroke-width="${INK_LIGHT}" stroke-linejoin="round" ${NS}/>` +
    `<g transform="translate(${COVER.x} ${COVER.y})"><path d="${COVER_EDGE}" fill="${cover}"/></g>` +
    `<path d="${COVER_STRIPES}" fill="none" stroke="${stripe}" stroke-width="${INK_LIGHT}" stroke-opacity=".32" ${NS}/>` +
    lines
  );
}

const KINDS: Record<PropKind, KindDef> = {
  slip: {
    size: [SLIP_W, SLIP_H],
    anchors: { center: [SLIP_W / 2, SLIP_H / 2], gripL: [1.2, 30], gripR: [SLIP_W - 1.2, 30] },
    draw: (o) => slipDrawing(o, false),
  },
  pencil: {
    size: [12, 56],
    anchors: { center: [6, 28], tip: PENCIL_POINT, grip: PENCIL_GRIP },
    draw: () =>
      `<path d="M3 8 L9 8 L9 46 L6 54 L3 46 Z" fill="oklch(74% 0.1 70)" stroke="${GRAPHITE}" stroke-opacity=".7" stroke-width=".9" ${NS}/>` +
      `<path d="M3 46 L9 46 L6 54 Z" fill="oklch(92% 0.03 80)" stroke="${GRAPHITE}" stroke-opacity=".7" stroke-width=".8" ${NS}/>` +
      `<path d="M5 51 L6 54 L7 51 Z" fill="${GRAPHITE}"/><rect x="3" y="2" width="6" height="6" fill="oklch(62% 0.14 45)"/>`,
  },
  /**
   * A ripple of the ≋ (read, meet): the platform's resonance glyph itself — the 'wave' icon's three waves, the one between
   * the pair — at the icon's own proportions (its pen scales with it, as the mark's does), drawn in by `ink`.
   */
  ripple: {
    size: [20, 15],
    anchors: { center: [10, 7.5] },
    draw: () =>
      `<g transform="translate(-2 -4.5)" fill="none" stroke="var(--film-chrome-ink)" stroke-width="${INK_LIGHT}" stroke-linecap="round" stroke-linejoin="round">` +
      WAVE_PATHS.map((d) => `<path class="s" pathLength="1" stroke-dasharray="1 1.01" stroke-dashoffset="1" d="${d}"/>`).join('') +
      '</g>',
  },
  /** 牽牽's blank: the slip's tiny card in the call to action's family, nothing written yet (its lines pencilled guides). */
  blank: {
    size: [SLIP_W, SLIP_H],
    anchors: { center: [SLIP_W / 2, SLIP_H / 2], gripL: [1.2, 30], gripR: [SLIP_W - 1.2, 30] },
    draw: (o) => slipDrawing(o, true),
  },
  /** The tissue halo blooming behind a card as it grows: soft light and two torn tissue rings (no filter). */
  halo: {
    size: [100, 100],
    anchors: { center: [50, 50] },
    draw: ({ uid }) =>
      `<defs><radialGradient id="${uid}"><stop offset="0" stop-color="oklch(97% 0.05 85)" stop-opacity=".95"/><stop offset=".45" stop-color="oklch(94% 0.07 78)" stop-opacity=".45"/><stop offset="1" stop-color="oklch(92% 0.07 70)" stop-opacity="0"/></radialGradient></defs>` +
      `<circle cx="50" cy="50" r="50" fill="url(#${uid})"/>` +
      `<path d="M50 14 C70 13 87 29 86 50 C87 71 70 87 50 86 C29 88 13 71 14 50 C13 29 30 12 50 14Z" fill="oklch(97% 0.04 85)" opacity=".16"/>` +
      `<path d="M50 26 C64 25 75 36 74 50 C75 64 64 75 50 74 C36 75 25 64 26 50 C25 36 36 25 50 26Z" fill="oklch(98% 0.03 88)" opacity=".18"/>`,
  },
  strokes: {
    size: [30, 30],
    anchors: { center: [15, 15], right: [2, 6], left: [2, 6] },
    draw: () =>
      `<g fill="none" stroke="${GRAPHITE}" stroke-width="${INK_LIGHT}" stroke-linecap="round" opacity=".75">` +
      '<path class="s" pathLength="1" d="M4 4 L14 10"/><path class="s" pathLength="1" d="M3 12 L15 16"/><path class="s" pathLength="1" d="M5 20 L13 22"/></g>',
  },
};

const n2 = (v: number) => v.toFixed(2);

export class FilmProp {
  readonly el: HTMLDivElement;
  /** Its own layer (the props layer), where `into(null)` puts it back. */
  private readonly home: HTMLElement;
  private readonly svg: SVGSVGElement;
  private readonly lines: SVGPathElement[];
  private readonly def: KindDef;
  private readonly css = new Map<Element, Map<string, string>>();
  placed = false;
  private shown: boolean | null = null;

  constructor(
    doc: Document,
    layer: HTMLElement,
    readonly kind: PropKind,
    opts: PropLook = {},
  ) {
    this.def = KINDS[kind];
    const [w, h] = this.def.size;
    const el = doc.createElement('div');
    el.className = 'fk-prop';
    el.innerHTML = `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" preserveAspectRatio="none" aria-hidden="true" focusable="false">${this.def.draw({ ...opts, uid: `fk-p${++uidSeq}` })}</svg>`;
    el.style.display = 'none';
    layer.append(el);
    this.home = layer;
    this.el = el;
    this.svg = el.firstElementChild as SVGSVGElement;
    this.lines = [...el.querySelectorAll<SVGPathElement>('path.s')];
  }

  private set(el: Element, prop: string, v: string) {
    let m = this.css.get(el);
    if (!m) {
      m = new Map();
      this.css.set(el, m);
    }
    if (m.get(prop) === v) return;
    m.set(prop, v);
    (el as HTMLElement).style.setProperty(prop, v);
  }

  /**
   * Where it is drawn: inside `parent` (a live puppet's hand layer: then `at` is in that body's own px, and it turns,
   * squashes and breathes with the body), or back in the props layer (null: stage px). Moved only when it changes.
   */
  into(parent: HTMLElement | null): this {
    const want = parent ?? this.home;
    if (this.el.parentElement !== want) want.append(this.el);
    return this;
  }

  /** Its anchor at stage (x, y). */
  at(x: number, y: number, o: Partial<PropAt> = {}): this {
    const [W, H] = this.def.size;
    const [ax, ay] = typeof o.anchor === 'string' || o.anchor == null ? (this.def.anchors[o.anchor ?? 'center'] ?? this.def.anchors.center) : o.anchor;
    const k = o.k ?? 1;
    const kx = (o.w != null ? o.w / W : k) * (o.sx ?? 1);
    const ky = (o.h != null ? o.h / H : k) * (o.sy ?? 1);
    this.placed = true;
    this.set(this.el, 'transform', `translate3d(${n2(x)}px,${n2(y)}px,0) rotate(${n2(o.rot ?? 0)}deg) scale(${kx.toFixed(4)},${ky.toFixed(4)}) translate(${n2(-ax)}px,${n2(-ay)}px)`);
    const a = o.alpha ?? 1;
    this.set(this.el, 'opacity', a >= 1 ? '' : Math.max(0, a).toFixed(3));
    return this;
  }

  /** The slip's lines (or the strokes) drawn in: 0 none, 1 all (one after another). */
  ink(u: number): this {
    const n = this.lines.length;
    this.lines.forEach((l, i) => this.set(l, 'stroke-dashoffset', (1 - Math.min(1, Math.max(0, u * n - i))).toFixed(3)));
    return this;
  }

  show(on: boolean) {
    if (this.shown === on) return;
    this.shown = on;
    this.el.style.display = on ? '' : 'none';
  }

  /** The drawing's own box, units. */
  get size() {
    return this.def.size;
  }
  get svgEl() {
    return this.svg;
  }
}

/** Something that can hand out props by name (a ghost hands out ones that draw nothing). */
export interface Props {
  get(name: string, kind: PropKind, opts?: PropLook): Pick<FilmProp, 'at' | 'ink' | 'size'> & Partial<Pick<FilmProp, 'into'>>;
}

/** The props of one stage: made on first use, hidden when a frame doesn't place them. */
export class PropKit implements Props {
  private readonly props = new Map<string, FilmProp>();
  constructor(private readonly layer: HTMLElement) {}

  get(name: string, kind: PropKind, opts: PropLook = {}): FilmProp {
    let p = this.props.get(name);
    if (!p) {
      p = new FilmProp(this.layer.ownerDocument, this.layer, kind, opts);
      this.props.set(name, p);
    }
    return p;
  }

  begin() {
    for (const p of this.props.values()) p.placed = false;
  }
  end() {
    for (const p of this.props.values()) p.show(p.placed);
  }
}

/** Props that draw nothing (a ghost frame's). */
export const NO_PROPS: Props = {
  get: (_name, kind) => ({
    at() {
      return this as never;
    },
    ink() {
      return this as never;
    },
    into() {
      return this as never;
    },
    size: KINDS[kind].size,
  }),
};
