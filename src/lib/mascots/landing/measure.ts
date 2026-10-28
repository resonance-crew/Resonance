/**
 * The landing page's places for the stage, measured from the page itself (the round-3 prototype measured them from
 * screenshots: stage/measure-ledges.py; its ids and choices are kept). Every place is found through a `data-mascot`
 * mark on the element (or `data-mascot-zone` on a section), in the stage layer's own px: the waves from the
 * SectionEdge's own path, words from their glyphs' ink (each glyph's box and its font's ascent against the glyph's
 * own — within a pixel of what is drawn), cards from their drawn outline, the rest from their boxes.
 *
 * Run it on a resize, once fonts are in and when the page's height changes — never per frame: it reads layout.
 */
import type { Cover, EdgeLedge, Ink, Ledge, LineLedge, PeekLedge, Point, Rect, SpotLedge, Theme, Zone } from '../types';
import type { LandingPreset } from './presets';
import { flattenPath } from './svgPath';

/**
 * The marks this file finds the landing page by (`data-mascot-zone` on its sections, `data-mascot` inside them),
 * and the structure it reads under them: renaming or moving one takes its places away (measure.test renders the real
 * sections and checks every one resolves).
 */
export const LANDING_MARKS = {
  zones: ['hero', 'feed', 'cta', 'footer'],
  hero: ['pill', 'headline', 'hero-text', 'badge', 'avatars', 'proof'],
  /** On a computer only (GetTheApp shows its QR code where a mouse is). */
  heroComputer: ['qr'],
  feed: ['feed-heading', 'feed-title', 'feed-subtitle', 'browse'],
  card: ['card-edge', 'card-foot'],
  cta: ['cta-title', 'cta-text', 'cta-buttons'],
  footer: ['footer-logo'],
} as const satisfies Record<string, readonly string[]>;
/** A SectionEdge's wave, under its section (the feed's and the CTA band's tops). */
export const WAVE_PATH = ':scope > div[aria-hidden="true"] > svg > path[stroke]';
/** A card in the feed's grid (CardLinkGrid's item); the card itself is the <article> in it, its title the <h3>. */
export const CARD_ITEM = '[data-card-id]';
/** The fixed header whose foot the view starts under: the page's first <header>. */
export const HEADER = 'header';

export interface LandingLayout {
  ledges: Ledge[];
  /** Words and buttons: props keep off them, a torso over them takes no pointer, nobody walks off across them. */
  content: Rect[];
  /** The page's height in layer px (the footer's foot). */
  height: number;
  /** The fixed header's foot, in the window's px (what of the page is under it is out of view). */
  header: number;
  /** Where the layer's own origin is on the page, px (0, 0 when it sits at the page's top left). */
  origin: { x: number; y: number };
  /** The page's width, px. */
  width: number;
}

export type Inks = Partial<Record<Theme, Ink>>;
/** The pencil that reads on the cream papers (hero, feed) and on the bands (the CTA's terracotta, the footer's ink). */
export const ON_PAPER: Inks = { light: 'dark', dark: 'light' };
const ON_BAND: Inks = { light: 'light', dark: 'light' };
const WAVE_ACTS = ['wave', 'look', 'stretch', 'hop', 'deco', 'reveal', 'twinkle'];
const CARD_ACTS = ['read', 'swing', 'look', 'wave', 'reveal'];
const PEEK_ACTS = ['look', 'wave', 'duck'];

export interface Glyph {
  x0: number;
  x1: number;
  /** Its ink's top. */
  top: number;
  /** Its line box's top and foot. */
  lineTop: number;
  lineBottom: number;
}

/** The page as the stage sees it: every rect in layer px. */
export class Page {
  readonly origin: { x: number; y: number };
  private readonly ox: number;
  private readonly oy: number;
  private canvas: CanvasRenderingContext2D | null | undefined;

  constructor(readonly doc: Document, readonly win: Window, layer: HTMLElement) {
    const l = layer.getBoundingClientRect();
    this.ox = l.left;
    this.oy = l.top;
    this.origin = { x: l.left + win.scrollX, y: l.top + win.scrollY };
  }

  rect(el: Element | null | undefined): Rect | null {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (!(r.width > 0 && r.height > 0)) return null;
    return { x: r.left - this.ox, y: r.top - this.oy, w: r.width, h: r.height };
  }

  /** A viewport point in layer px. */
  point(x: number, y: number): Point {
    return [x - this.ox, y - this.oy];
  }

  /** The boxes of an element's words, one per line (or per run of a line). */
  textRects(el: Element | null | undefined): Rect[] {
    if (!el) return [];
    const range = this.doc.createRange();
    range.selectNodeContents(el);
    const out: Rect[] = [];
    for (const r of Array.from(range.getClientRects())) {
      if (r.width > 0.5 && r.height > 0.5) out.push({ x: r.left - this.ox, y: r.top - this.oy, w: r.width, h: r.height });
    }
    return out;
  }

  /** What is drawn in an element: its words' boxes, and its pictures and icons whole. */
  inkRects(el: Element | null | undefined, pad = 0): Rect[] {
    if (!el) return [];
    const out: Rect[] = [];
    const visit = (n: Element) => {
      if (n.namespaceURI === 'http://www.w3.org/2000/svg' || n.tagName === 'IMG') {
        const r = this.rect(n);
        if (r) out.push(r);
        return;
      }
      for (const c of Array.from(n.childNodes)) {
        if (c.nodeType === 3 && c.textContent && c.textContent.trim()) {
          const range = this.doc.createRange();
          range.selectNodeContents(c);
          for (const r of Array.from(range.getClientRects())) {
            if (r.width > 0.5) out.push({ x: r.left - this.ox, y: r.top - this.oy, w: r.width, h: r.height });
          }
        } else if (c.nodeType === 1) visit(c as Element);
      }
    };
    visit(el);
    return out.map(r => grow(r, pad));
  }

  /** Each glyph of an element's words: its box, and its ink's top (the font's ascent less the glyph's own). */
  glyphs(el: Element | null | undefined): Glyph[] {
    if (!el) return [];
    const out: Glyph[] = [];
    const range = this.doc.createRange();
    const walker = this.doc.createTreeWalker(el, 4 /* NodeFilter.SHOW_TEXT */);
    for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
      const parent = n.parentElement;
      if (!parent) continue;
      const style = this.win.getComputedStyle(parent);
      const size = parseFloat(style.fontSize) || 16;
      const ctx = this.context();
      if (ctx) ctx.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      const text = n.data;
      for (let i = 0; i < text.length;) {
        const cp = text.codePointAt(i) ?? 32;
        const len = cp > 0xffff ? 2 : 1;
        const ch = text.slice(i, i + len);
        if (!/\s/.test(ch)) {
          range.setStart(n, i);
          range.setEnd(n, i + len);
          const r = range.getBoundingClientRect();
          if (r.width > 0 && r.height > 0) {
            const m = ctx ? ctx.measureText(ch) : null;
            // the glyph box's top is the line's ascent above the baseline; the ink starts where the glyph's own does
            const below = m && m.fontBoundingBoxAscent > 0 && m.actualBoundingBoxAscent >= 0
              ? m.fontBoundingBoxAscent - m.actualBoundingBoxAscent
              : size * 0.17;   // no metrics (an old browser): a CJK glyph's top in the house fonts, near enough
            out.push({ x0: r.left - this.ox, x1: r.right - this.ox, top: r.top - this.oy + below, lineTop: r.top - this.oy, lineBottom: r.bottom - this.oy });
          }
        }
        i += len;
      }
    }
    return out;
  }

  private context(): CanvasRenderingContext2D | null {
    if (this.canvas === undefined) {
      try {
        this.canvas = this.doc.createElement('canvas').getContext('2d');
      } catch {
        this.canvas = null;
      }
    }
    return this.canvas;
  }

  /**
   * A path's points in layer px, about every `spacing` px along it (its transform, its SVG's viewBox and any
   * stretching all applied: the screen matrix). Read from its `d` (svgPath.ts); only a path that can't be read so
   * asks the browser, coarsely — getPointAtLength walks the whole path on every call.
   */
  pathPoints(path: SVGGeometryElement, spacing: number): Point[] {
    let m: DOMMatrix | null = null;
    try {
      m = path.getScreenCTM();
    } catch {
      return [];
    }
    if (!m) return [];
    const { a, b, c, d: dm, e, f } = m;
    const scale = Math.max(Math.hypot(a, b), Math.hypot(c, dm)) || 1;
    const d = path.getAttribute('d');
    const own = d ? flattenPath(d, spacing / scale) : null;
    const user = own ?? this.askedPoints(path, Math.max(spacing, 12) / scale);
    return user.map(([x, y]) => this.point(a * x + c * y + e, b * x + dm * y + f));
  }

  /** A path's points in its own units, about every `step` of them, from the browser (at most 400). */
  private askedPoints(path: SVGGeometryElement, step: number): [number, number][] {
    let len = 0;
    try {
      len = path.getTotalLength();
    } catch {
      return [];
    }
    if (!(len > 0)) return [];
    const n = Math.min(400, Math.max(8, Math.ceil(len / step)));
    const out: [number, number][] = [];
    for (let i = 0; i <= n; i++) {
      const p = path.getPointAtLength((len * i) / n);
      out.push([p.x, p.y]);
    }
    return out;
  }
}

export const grow = (r: Rect, pad: number): Rect => ({ x: r.x - pad, y: r.y - pad, w: r.w + 2 * pad, h: r.h + 2 * pad });
export const right = (r: Rect) => r.x + r.w;
export const bottom = (r: Rect) => r.y + r.h;
const round1 = (v: number) => Math.round(v * 10) / 10;

export function union(rs: readonly Rect[]): Rect | null {
  if (!rs.length) return null;
  const x = Math.min(...rs.map(r => r.x));
  const y = Math.min(...rs.map(r => r.y));
  return { x, y, w: Math.max(...rs.map(right)) - x, h: Math.max(...rs.map(bottom)) - y };
}

/** The glyphs of the first line. */
export function firstLine(gs: readonly Glyph[]): Glyph[] {
  if (!gs.length) return [];
  const top = Math.min(...gs.map(g => g.lineTop));
  const line = gs.filter(g => g.lineTop < top + 4);
  return line.sort((a, b) => a.x0 - b.x0);
}

/**
 * A surface over a line of big type, from x0 to x1: the upper envelope of its glyphs' ink (at each x the highest ink
 * within `reach`, enough to bridge the letter spacing between two glyph boxes), lightly smoothed — feet never dip
 * between glyphs, and stand on the letters under them: on a Latin line that is the x-height or an ascender, not a
 * board laid across the ascenders (the prototype's glyph_tops reached 40 px, which only its CJK lines could take).
 */
export function inkTops(gs: readonly Glyph[], x0: number, x1: number, reach = 6, smooth = 2): Point[] {
  const env: Point[] = [];
  for (let x = Math.round(x0); x <= x1; x += 3) {
    const near = gs.filter(g => g.x1 >= x - reach && g.x0 <= x + reach);
    if (near.length) env.push([x, Math.min(...near.map(g => g.top))]);
  }
  const out: Point[] = [];
  for (let i = 0; i < env.length; i += 2) {
    const win = env.slice(Math.max(0, i - smooth), i + smooth + 1).map(p => p[1]);
    out.push([env[i][0], round1(Math.min(env[i][1], win.reduce((s, v) => s + v, 0) / win.length))]);
  }
  return out;
}

/** The drawn top of an outline (its points near `y`), one point every 6 px from x0 to x1, gaps filled from neighbours. */
export function topContour(pts: readonly Point[], x0: number, x1: number, y: number, band = 24): Point[] {
  const near = pts.filter(p => Math.abs(p[1] - y) < band && p[0] >= x0 - 4 && p[0] <= x1 + 4);
  if (!near.length) return [];
  const out: Point[] = [];
  for (let x = Math.round(x0); x <= x1; x += 6) {
    const col = near.filter(p => Math.abs(p[0] - x) <= 3);
    const at = col.length ? Math.min(...col.map(p => p[1]))
      : near.reduce((best, p) => (Math.abs(p[0] - x) < Math.abs(best[0] - x) ? p : best))[1];
    out.push([x, round1(at)]);
  }
  return out;
}

/** A line along a path's points, x ascending, one point per few px. */
function alongX(pts: readonly Point[]): Point[] {
  const sorted = [...pts].sort((a, b) => a[0] - b[0]);
  const out: Point[] = [];
  for (const p of sorted) if (!out.length || p[0] - out[out.length - 1][0] >= 4) out.push([round1(p[0]), round1(p[1])]);
  return out;
}

/** `span` less what lies within `cuts` (x ranges): the longest piece left, or null. */
export function longestPiece(span: [number, number], cuts: readonly [number, number][]): [number, number] | null {
  let pieces: [number, number][] = [span];
  for (const [a, b] of cuts) {
    pieces = pieces.flatMap(([p, q]): [number, number][] => (b <= p || a >= q ? [[p, q]] : [[p, a], [b, q]].filter(([u, v]) => v - u > 0) as [number, number][]));
  }
  pieces.sort((u, v) => v[1] - v[0] - (u[1] - u[0]));
  return pieces[0] ?? null;
}

export const visible = (doc: ParentNode, sel: string, page: Page): Element[] => Array.from(doc.querySelectorAll(sel)).filter(e => page.rect(e));

/**
 * The landing page's places for this preset, measured now. `layer` is the stage's layer (its box is the page's
 * origin); the page's elements are found by their `data-mascot` marks.
 */
export function measureLanding(doc: Document, layer: HTMLElement, preset: LandingPreset): LandingLayout {
  const win = doc.defaultView as Window;
  const page = new Page(doc, win, layer);
  const W = doc.documentElement.clientWidth || win.innerWidth;
  const unit = preset.unitHeight;
  // what a clear rect keeps off is the body's middle (the engine's box is 0.8 of its half-width): this much more keeps
  // a raised mitten off it too
  const arm = Math.round(unit * 0.12);
  const armClear = (r: Rect): Rect => ({ x: r.x - arm, y: r.y, w: r.w + 2 * arm, h: r.h });
  const zoneEl = (z: Zone) => doc.querySelector(`[data-mascot-zone="${z}"]`);
  const mark = (name: string, root: ParentNode = doc) => root.querySelector(`[data-mascot="${name}"]`);
  const sections = { hero: page.rect(zoneEl('hero')), feed: page.rect(zoneEl('feed')), cta: page.rect(zoneEl('cta')), footer: page.rect(zoneEl('footer')) };
  const zoneOf = (y: number): Zone => (sections.hero && y < bottom(sections.hero) + 60 ? 'hero'
    : sections.cta && y < sections.cta.y ? 'feed' : sections.footer && y < sections.footer.y ? 'cta' : 'footer');
  const inkOf = (z: Zone): Inks => (z === 'cta' || z === 'footer' ? ON_BAND : ON_PAPER);
  const L: Ledge[] = [];
  const content: Rect[] = [];
  const add = <T extends Ledge>(l: T, at: number): T => {
    l.zone = l.zone ?? zoneOf(at);
    l.ink = l.ink ?? inkOf(l.zone);
    if (l.zone === 'hero' && (l.meet || l.partner)) l.meetChance = 0.7;   // the first screen: a meeting more often
    L.push(l);
    return l;
  };

  // --- the header: what of the page lies under it is out of view
  let header = 0;
  const hd = doc.querySelector(HEADER);
  if (hd && win.getComputedStyle(hd).position === 'fixed') header = Math.max(0, hd.getBoundingClientRect().bottom);

  // --- the waves: the SectionEdge at the top of the feed (the hero's foot) and of the CTA band, from their own path
  const wave = (section: Element | null): Point[] => {
    const path = section?.querySelector<SVGGeometryElement>(WAVE_PATH);
    return path ? alongX(page.pathPoints(path, 8)) : [];
  };
  for (const [id, z, above] of [['hero-wave', 'feed', 'hero'], ['cta-wave', 'cta', 'feed']] as const) {
    const pts = wave(zoneEl(z));
    if (pts.length < 2) continue;
    // faces are over the paper above the wave: the pencil reads on that
    add<LineLedge>({ id, kind: 'line', points: pts, meet: true, acts: WAVE_ACTS, ink: inkOf(above) }, pts[pts.length >> 1][1]);
  }

  // --- the hero: the pill, the headline's two ends, the download block, the avatar row
  const hero = zoneEl('hero');
  const pillEl = hero && mark('pill', hero);
  const pill = page.rect(pillEl?.firstElementChild ?? pillEl);
  const headline = firstLine(page.glyphs(hero && mark('headline', hero)));
  const para = page.textRects(hero && mark('hero-text', hero));
  const paraFoot = para.length ? Math.max(...para.map(bottom)) : null;
  if (pill) content.push(pill);
  if (headline.length) {
    const inkL = headline[0].x0;
    const inkR = Math.max(...headline.map(g => g.x1));
    const lineTop = Math.min(...headline.map(g => g.top));
    content.push({ x: inkL, y: lineTop, w: inkR - inkL, h: Math.max(...headline.map(g => g.lineBottom)) - lineTop });
    // its two ends, clear of the pill over its middle (one at a time: across from each other, they greet)
    const mid = (inkL + inkR) / 2;
    const gap = preset.headlineGap;
    const spans: [number, number][] = [
      [inkL + 6, Math.min(pill ? pill.x - gap : mid - gap, inkR - 6)],
      [Math.max(pill ? right(pill) + gap : mid + gap, inkL + 6), inkR - 6],
    ];
    spans.forEach(([x0, x1], i) => {
      if (x1 - x0 < 24) return;
      const pts = inkTops(headline, x0, x1);
      if (pts.length < 2) return;
      add<EdgeLedge>({
        id: `headline-${'lr'[i]}`, kind: 'edge', points: pts, stance: 'stand', enter: 'pop', group: 'headline', weight: 0.5,
        partner: `headline-${'rl'[i]}`, clear: pill ? [armClear(pill)] : undefined, acts: ['look', 'wave', 'stretch', 'deco'],
      }, pts[0][1]);
    });
  }
  content.push(...para);
  if (pill) {   // standing on it like a little statue on its pedestal
    add<EdgeLedge>({
      id: 'pill-top', kind: 'edge', points: [[pill.x + 18, pill.y], [right(pill) - 18, pill.y]], stance: 'stand', enter: 'pop',
      ceiling: header + 4, weight: 0.8, acts: ['look', 'wave', 'stretch', 'hop', 'deco', 'reveal'],
    }, pill.y);
  }

  const qr = hero ? page.rect(visible(hero, '[data-mascot="qr"]', page)[0]) : null;
  const badges = hero ? visible(hero, '[data-mascot="badge"]', page).map(e => page.rect(e) as Rect) : [];
  const block = union(badges);
  const underPara = paraFoot != null ? paraFoot + 4 : undefined;   // nobody's head goes into the paragraph
  content.push(...badges);
  if (qr) {
    // a computer's download block: the QR code beside the badges. Peek past its left side, point at it from beside it,
    // or stand by the badges; across the block from each other, two greet (or one walks up)
    content.push(qr);
    const target: Point = [qr.x + qr.w / 2, qr.y + qr.h / 2];
    // most of it out past the code's side, only its far edge behind it (the owner, round 5: at 0.6 it still looked
    // hidden behind the code)
    add<PeekLedge>({
      id: 'qr-left', kind: 'peek', side: 'left', cover: { ...qr, radius: 16 }, ground: bottom(qr) - 2, reveal: 0.78, target, acts: PEEK_ACTS,
    }, bottom(qr));
    add<SpotLedge>({
      id: 'qr-point', kind: 'spot', meet: true, partner: block ? 'badges' : undefined, x: qr.x - 56, y: bottom(qr) - 1, from: 'left',
      clear: [qr], ceiling: underPara, target, acts: ['point', 'look', 'wave'],
    }, bottom(qr));
    if (block) {
      const last = badges.reduce((a, b) => (bottom(b) > bottom(a) ? b : a));
      add<SpotLedge>({
        id: 'badges', kind: 'spot', meet: true, partner: 'qr-point', x: right(block) + preset.badgeSide, y: bottom(block), from: 'right',
        clear: badges, reach: true, ceiling: underPara, target: [right(block), last.y + last.h / 2 - 20], acts: ['point', 'look', 'wave'],
      }, bottom(block));
    }
  } else if (block) {
    // a phone's or a tablet's: stand on either side of the badge, a little below its foot (the paragraph is close above),
    // and point at it; the two sides face each other across it
    const fy = bottom(block) + preset.badgeDrop;
    for (const side of ['l', 'r'] as const) {
      add<SpotLedge>({
        id: `badge-${side}`, kind: 'spot', meet: preset.walkUp || undefined,
        x: side === 'l' ? block.x - preset.badgeSide : right(block) + preset.badgeSide, y: fy, from: side === 'l' ? 'left' : 'right',
        clear: [grow(block, 4)], reach: true, ceiling: underPara != null ? underPara - 2 : undefined, partner: `badge-${side === 'l' ? 'r' : 'l'}`,
        target: [side === 'l' ? block.x + 6 : right(block) - 6, block.y + block.h / 2], acts: ['point', 'look', 'wave', 'hop'],
      }, fy);
    }
  }

  const avatars = hero ? page.rect(mark('avatars', hero)) : null;
  const proof = union(page.textRects(hero && mark('proof', hero)));
  if (proof) content.push(proof);
  if (avatars) content.push(avatars);
  if (preset.proofEnd && proof) {
    add<SpotLedge>({
      id: 'avatars-end', kind: 'spot', meet: true, x: right(proof) + 64, y: bottom(proof) + 5, from: 'right',
      clear: [proof, ...badges], acts: ['wave', 'look', 'hop', 'deco', 'reveal'],
    }, bottom(proof));
  }
  if (preset.proofPeek && avatars) {
    add<PeekLedge>({
      id: 'avatars', kind: 'peek', side: 'top', cover: { ...avatars, radius: Math.min(15, avatars.h / 2) }, ground: bottom(avatars) - 1,
      x: avatars.x + 36, show: 0.75, acts: ['wave', 'look', 'duck'],
    }, avatars.y);
  }

  // --- the feed: its title's two ends, the cards' tops (and the outer ones' sides), the browse button
  const feed = zoneEl('feed');
  const heading = feed && mark('feed-heading', feed);
  const headingRects: Rect[] = [];
  const titleEl = feed && mark('feed-title', feed);
  const first = heading?.firstElementChild;
  const feedPill = first && first !== titleEl ? page.rect(first) : null;   // the TagPill over the title
  if (feedPill) headingRects.push(feedPill);
  const title = firstLine(page.glyphs(titleEl));
  if (title.length) {
    const x0 = title[0].x0;
    const x1 = Math.max(...title.map(g => g.x1));
    const top = Math.min(...title.map(g => g.top));
    headingRects.push({ x: x0, y: top, w: x1 - x0, h: Math.max(...title.map(g => g.lineBottom)) - top });
    const reach = preset.titleReach;
    ([[x0 + 4, Math.min(x0 + reach, (x0 + x1) / 2 - 8)], [Math.max(x1 - reach, (x0 + x1) / 2 + 8), x1 - 4]] as [number, number][])
      .forEach(([a, b], i) => {
        if (b - a < 20) return;
        const pts = inkTops(title, a, b);
        if (pts.length < 2) return;
        add<EdgeLedge>({
          id: `feed-title-${'lr'[i]}`, kind: 'edge', points: pts, stance: 'stand', enter: 'pop', group: 'feed-title',
          partner: `feed-title-${'rl'[i]}`, clear: feedPill ? [armClear(feedPill)] : undefined, acts: ['read', 'look', 'wave', 'stretch'],
        }, pts[0][1]);
      });
  }
  headingRects.push(...page.textRects(feed && mark('feed-subtitle', feed)));
  content.push(...headingRects);

  const cards = feed ? Array.from(feed.querySelectorAll(CARD_ITEM)).map(item => {
    const article = item.querySelector('article');
    return { item: page.rect(item), card: page.rect(article), el: article };
  }).filter((c): c is { item: Rect; card: Rect; el: HTMLElement } => !!(c.item && c.card && c.el)) : [];
  const cols = new Set(cards.map(c => Math.round(c.item.x))).size;
  const minX = Math.min(...cards.map(c => c.item.x));
  const maxR = Math.max(...cards.map(c => right(c.item)));
  cards.forEach((c, i) => {
    content.push(...page.textRects(c.el.querySelector('h3')));
    // the card's drawn top: its outline (a computer's, a tablet's) or the wavy rule over its band (a phone's)
    const chrome = visible(c.el, '[data-mascot="card-edge"]', page)[0];
    const drawn = chrome ? Array.from(chrome.querySelectorAll<SVGGeometryElement>('path[stroke]'))
      .filter(p => !['none', 'transparent'].includes(p.getAttribute('stroke') || 'none'))
      .flatMap(p => page.pathPoints(p, 4)) : [];
    const top = topContour(drawn, c.card.x + 6, right(c.card) - 6, c.card.y);
    // the card right above it in its column: whoever sits here keeps off its author row and arrow
    const above = cards.filter(d => d !== c && Math.abs(d.item.x - c.item.x) < 20 && bottom(d.card) <= c.card.y + 4)
      .sort((a, b) => bottom(b.card) - bottom(a.card))[0];
    let span: [number, number] | null = [c.item.x + 54, right(c.item) - 54];
    let clear: Rect[] = [];
    // (an arm's width more each side: a sitter's mitten hangs beside its body, onto a phone's "29 min")
    if (above) clear = page.inkRects(above.el.querySelector('[data-mascot="card-foot"]'), 4).map(armClear);
    else {
      // under the feed's heading: not under its words (a seat there would cover them)
      const over = headingRects.filter(r => bottom(r) <= c.card.y && c.card.y - bottom(r) < unit * 1.6);
      span = longestPiece(span, over.map(r => [r.x - unit * 0.4, right(r) + unit * 0.4] as [number, number]));
      clear = over;
    }
    const seat = top.filter(p => span && p[0] >= span[0] && p[0] <= span[1]);
    if (span && span[1] - span[0] >= 60 && seat.length >= 2) {
      add<EdgeLedge>({
        id: `card-${i + 1}-top`, kind: 'edge', points: seat, stance: 'sit',
        cover: { ...c.card, top: top.length >= 2 ? top : undefined, radius: 18 } satisfies Cover, acts: CARD_ACTS,
        clear: clear.length ? clear : undefined,
      }, c.card.y);
    }
    if (preset.cardPeeks && cols > 1) {
      const side = Math.abs(c.item.x - minX) < 2 && minX >= 40 ? 'left' : Math.abs(right(c.item) - maxR) < 2 && W - maxR >= 40 ? 'right' : null;
      if (side) {
        add<PeekLedge>({ id: `card-${i + 1}-${side}`, kind: 'peek', side, cover: { ...c.card, radius: 18 }, ground: bottom(c.card) - 4, acts: PEEK_ACTS }, bottom(c.card));
      }
    }
  });

  const browseEl = feed && mark('browse', feed);
  const browse = page.rect(browseEl?.querySelector('button') ?? browseEl?.querySelector('a') ?? null);
  if (browse) {
    content.push(browse);
    const x = browse.x - preset.browseOffset;
    const over = cards.map(c => c.card).filter(r => r.x < x + 70 && right(r) > x - 70 && bottom(r) < browse.y).map(bottom);
    add<SpotLedge>({
      id: 'browse', kind: 'spot', meet: preset.walkUp, x, y: bottom(browse), from: 'left', clear: [browse],
      ceiling: over.length ? Math.max(...over) + 6 : undefined, target: [browse.x + 8, browse.y + browse.h / 2],
      acts: ['lean', 'look', 'wave', 'point'],
    }, bottom(browse));
  }

  // --- the CTA band: beckon to 寫下你的故事
  const cta = zoneEl('cta');
  content.push(...page.textRects(cta && mark('cta-title', cta)));
  const sub = page.textRects(cta && mark('cta-text', cta));
  content.push(...sub);
  const buttons = cta ? visible(mark('cta-buttons', cta) ?? cta, 'button', page).map(e => page.rect(e) as Rect) : [];
  content.push(...buttons);
  const wb = buttons[0];
  if (wb) {
    const stacked = buttons.length > 1 && buttons[1].y > wb.y + wb.h / 2;
    const subBox = union(sub);
    if (!stacked) {
      // beside its row, left of the line above it (a head beside the button would cover that line's words)
      add<SpotLedge>({
        id: 'write', kind: 'spot', meet: preset.walkUp, x: wb.x - 140, y: bottom(wb), from: 'left',
        clear: subBox ? [wb, subBox] : [wb], target: [wb.x + 10, wb.y + wb.h / 2], acts: ['beckon', 'write', 'wave'],
      }, bottom(wb));
    } else {
      // a phone's full-width button has nothing beside it: peek over its left end (no higher than the line above)
      add<PeekLedge>({
        id: 'write', kind: 'peek', side: 'top', cover: { ...wb, radius: wb.h / 2 }, ground: bottom(wb) - 1, show: 0.55,
        ceiling: subBox && bottom(subBox) < wb.y ? bottom(subBox) + 1 : undefined, x: wb.x + 42,
        target: [wb.x + wb.w / 2, wb.y + wb.h / 2], acts: ['beckon', 'look', 'wave', 'duck'],
      }, wb.y);
    }
  }

  // --- the footer: nap beside the logo (悄悄's place, above all)
  const footer = zoneEl('footer');
  if (footer) content.push(...visible(footer, '[data-mascot="badge"]', page).map(e => page.rect(e) as Rect));
  const logo = page.rect(footer && mark('footer-logo', footer));
  if (logo) {
    content.push(logo);
    add<SpotLedge>({
      id: 'footer-logo', kind: 'spot', x: right(logo) + preset.logoOffset, y: round1(bottom(logo) + 1), from: 'right', stance: 'floor',
      prefer: ['night'], target: [right(logo), logo.y + 6], clear: [armClear(logo)], acts: ['nap', 'look', 'twinkle'],
    }, bottom(logo));
  }

  // the page's own height, never a pixel more (a layer rounded up would add a pixel of scroll)
  const foot = sections.footer ? bottom(sections.footer) : doc.documentElement.scrollHeight - page.origin.y;
  return { ledges: L, content, height: Math.floor(foot), header, origin: page.origin, width: W };
}
