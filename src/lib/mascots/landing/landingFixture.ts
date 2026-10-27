/**
 * Test support (imported by the landing stage's tests only): the landing page's marked elements in jsdom, with the
 * boxes the live page has at 1440, 834 and 390 px (zh-TW, measured in Chrome), and the layout jsdom lacks stubbed —
 * element boxes, text ranges (a line's box split evenly among its characters), canvas glyph metrics (every glyph's ink
 * 6 px under its box's top) and the SVG paths' geometry (the waves, the cards' outlines, a phone's wavy rules).
 */
import type { PresetName } from './presets';

type Box = [number, number, number, number];

export interface FixtureGeometry {
  width: number;
  height: number;
  hero: Box;
  pill: Box;
  /** The headline's line of glyphs (its text runs across it evenly). */
  headline: Box;
  para: Box[];
  qr?: Box;
  badges: Box[];
  avatars: Box;
  proof: Box;
  feed: Box;
  feedPill: Box;
  feedTitle: Box;
  feedSubtitle: Box[];
  /** Each card: [the grid item, the card itself] (a phone's card is a full-bleed band, wider than its item). */
  cards: [Box, Box][];
  browse: Box;
  cta: Box;
  ctaTitle: Box[];
  ctaText: Box[];
  ctaButtons: Box[];
  footer: Box;
  logo: Box;
}

export const GLYPH_INK = 6;

/** How often the browser's getPointAtLength has been asked of the fixture's paths (a quarter-second each on a page). */
export const native = { calls: 0 };

export const GEOMETRY: Record<PresetName, FixtureGeometry> = {
  desktop: {
    width: 1440, height: 900, hero: [0, 0, 1440, 900], pill: [660, 264, 120, 22], headline: [462, 296, 516, 102],
    para: [[460, 412, 520, 34], [580, 446, 280, 34]], qr: [578, 520, 112, 112], badges: [[714, 525, 120, 44], [714, 583, 148, 44]],
    avatars: [590, 707, 102, 30], proof: [708, 713, 143, 19],
    feed: [0, 900, 1440, 1771], feedPill: [680, 1100, 80, 22], feedTitle: [558, 1142, 324, 61], feedSubtitle: [[558, 1191, 324, 17]],
    cards: [
      [[120, 1300, 384, 520], [120, 1300, 384, 520]], [[120, 1844, 384, 525], [120, 1844, 384, 525]],
      [[528, 1300, 384, 522], [528, 1300, 384, 522]], [[528, 1846, 384, 499], [528, 1846, 384, 499]],
      [[936, 1300, 384, 520], [936, 1300, 384, 520]], [[936, 1844, 384, 520], [936, 1844, 384, 520]],
    ],
    browse: [642, 2441, 156, 50], cta: [0, 2671, 1440, 665], ctaTitle: [[420, 2927, 600, 120]], ctaText: [[450, 3073, 524, 16]],
    ctaButtons: [[542, 3151, 156, 50], [712, 3151, 186, 50]], footer: [0, 3336, 1440, 555], logo: [660, 3517, 122, 26],
  },
  tablet: {
    width: 834, height: 1194, hero: [0, 0, 834, 1194], pill: [357, 476, 120, 22], headline: [234, 463, 366, 72],
    para: [[157, 601, 520, 28], [340, 629, 154, 28]], badges: [[357, 697, 120, 44]], avatars: [287, 789, 102, 30], proof: [405, 795, 143, 19],
    feed: [0, 1194, 834, 2184], feedPill: [377, 1330, 80, 22], feedTitle: [300, 1375, 234, 45], feedSubtitle: [[257, 1433, 320, 23]],
    cards: [
      [[42, 1513, 363, 507], [42, 1513, 363, 507]], [[429, 1513, 363, 532], [429, 1513, 363, 532]],
      [[42, 2044, 363, 507], [42, 2044, 363, 507]], [[429, 2069, 363, 535], [429, 2069, 363, 535]],
      [[42, 2575, 363, 486], [42, 2575, 363, 486]], [[429, 2629, 363, 507], [429, 2629, 363, 507]],
    ],
    browse: [339, 3236, 156, 50], cta: [0, 3378, 834, 465], ctaTitle: [[117, 3562, 600, 43]], ctaText: [[160, 3629, 514, 20]],
    ctaButtons: [[239, 3697, 156, 50], [409, 3697, 186, 50]], footer: [0, 3843, 834, 483], logo: [356, 3973, 122, 26],
  },
  phone: {
    width: 390, height: 844, hero: [0, 0, 390, 844], pill: [135, 313, 120, 22], headline: [66, 350, 258, 48],
    para: [[24, 420, 342, 27], [40, 447, 310, 27]], badges: [[141, 514, 109, 40]], avatars: [65, 602, 102, 30], proof: [183, 608, 143, 19],
    feed: [0, 844, 390, 3768], feedPill: [155, 985, 80, 22], feedTitle: [100, 1025, 190, 38], feedSubtitle: [[24, 1079, 342, 20], [60, 1101, 270, 20]],
    cards: [1179, 1721, 2265, 2784, 3331, 3852].map((y, i) => {
      const h = [542, 544, 519, 547, 521, 542][i];
      return [[24, y, 342, h], [0, y, 390, h]] as [Box, Box];
    }),
    browse: [117, 4442, 156, 50], cta: [0, 4612, 390, 561], ctaTitle: [[24, 4808, 342, 69]], ctaText: [[26, 4903, 340, 22], [40, 4925, 310, 22]],
    ctaButtons: [[51, 4997, 288, 50], [51, 5059, 288, 50]], footer: [0, 5173, 390, 481], logo: [134, 5300, 122, 26],
  },
};

interface Installed {
  /** The page's layer (where the stage would draw). */
  layer: HTMLElement;
  geometry: FixtureGeometry;
  /** Scrolls the stubbed page: every box moves up by y. */
  scrollTo(y: number): void;
  /** Takes the stubs away and empties the page. */
  restore(): void;
}

type Stubbed = Record<string, unknown>;

/** Builds the landing page's marked elements for a preset's geometry into `document.body`, with layout stubbed. */
export function installLanding(name: PresetName, doc: Document = document): Installed {
  const win = doc.defaultView as Window & typeof globalThis;
  const g = GEOMETRY[name];
  const boxes = new Map<Element, Box>();
  const lines = new Map<Element, Box[]>();
  let scrollY = 0;
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, box?: Box, text?: string) => {
    const e = doc.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    if (box) boxes.set(e, box);
    if (text) e.textContent = text;
    return e;
  };
  const svgNs = 'http://www.w3.org/2000/svg';
  /**
   * An SVG path whose geometry is `at(t)` for t in [0, 1] of `length`, drawn through matrix `m`: its `d` that line
   * as a polyline (a point every unit), and the browser's own geometry stubbed to match (counted: measure should
   * read `d` and never need it).
   */
  const path = (stroke: string, length: number, at: (t: number) => [number, number], m: () => number[]) => {
    const p = doc.createElementNS(svgNs, 'path');
    p.setAttribute('stroke', stroke);
    const n = Math.max(1, Math.ceil(length));
    const pts = Array.from({ length: n + 1 }, (_, i) => at(i / n).map(v => +v.toFixed(3)).join(','));
    p.setAttribute('d', `M ${pts[0]} L ${pts.slice(1).join(' ')}`);
    Object.assign(p as unknown as Stubbed, {
      getTotalLength: () => length,
      getPointAtLength: (l: number) => {
        native.calls++;
        const [x, y] = at(Math.max(0, Math.min(1, l / length)));
        return { x, y };
      },
      getScreenCTM: () => {
        const [a, b, c, d, e, f] = m();
        return { a, b, c, d, e, f: f - scrollY };
      },
    });
    return p;
  };
  /** A SectionEdge: its fill and its wave, 1440 user units wide stretched to the page, the line at 70 + 10·x/1440. */
  const edge = (top: number) => {
    const div = el('div', { 'aria-hidden': 'true' });
    const svg = doc.createElementNS(svgNs, 'svg');
    svg.append(doc.createElementNS(svgNs, 'path'), path('var(--soft-pen)', 1440, t => [1440 * t, 70 + 10 * t], () => [g.width / 1440, 0, 0, 1, 0, top]));
    div.append(svg);
    return div;
  };

  const header = el('header', { style: 'position: fixed' }, [0, 0, g.width, 82]);
  const hero = el('section', { 'data-mascot-zone': 'hero' }, g.hero);
  const pillWrap = el('div', { 'data-mascot': 'pill' });
  pillWrap.append(el('span', {}, g.pill, '真實的人生故事'));
  const h1 = el('h1', { 'data-mascot': 'headline' }, g.headline, '讓生命影響生命');
  const para = el('p', { 'data-mascot': 'hero-text' }, undefined, '一個讓世界各地的人生故事相互連結的空間');
  lines.set(para, g.para);
  const download = el('div', { id: 'download' });
  if (g.qr) download.append(el('div', { 'data-mascot': 'qr' }, g.qr));
  for (const b of g.badges) download.append(el('a', { 'data-mascot': 'badge', href: '#' }, b));
  const proofRow = el('div');
  proofRow.append(el('div', { 'data-mascot': 'avatars' }, g.avatars), el('span', { 'data-mascot': 'proof' }, g.proof, '成為一群最早說故事的人'));
  hero.append(pillWrap, h1, para, download, proofRow);

  const feed = el('section', { 'data-mascot-zone': 'feed' }, g.feed);
  const heading = el('div', { 'data-mascot': 'feed-heading' });
  const subtitle = el('p', { 'data-mascot': 'feed-subtitle' }, undefined, '真實的人、真實的經歷');
  lines.set(subtitle, g.feedSubtitle);
  heading.append(el('span', {}, g.feedPill, '最新故事'), el('h2', { 'data-mascot': 'feed-title' }, g.feedTitle, '值得閱讀的故事'), subtitle);
  const grid = el('div', { 'data-card-grid': '' });
  g.cards.forEach(([item, card], i) => {
    const wrap = el('div', { 'data-card-id': `c${i}` }, item);
    const article = el('article', {}, card);
    const [cx, cy, cw, ch] = card;
    // the drawn chrome: a computer's outline (its top wobbling 2 px either way) or a phone's wavy rule over its band
    const band = name === 'phone';
    const outline = el('div', { 'data-mascot': 'card-edge', 'aria-hidden': 'true' }, band ? undefined : card);
    const rule = el('div', { 'data-mascot': 'card-edge', 'aria-hidden': 'true' }, band ? card : undefined);
    const osvg = doc.createElementNS(svgNs, 'svg');
    osvg.append(
      path('transparent', 1, () => [0, 0], () => [1, 0, 0, 1, cx, cy]),
      path('var(--card-border-0)', 2 * (cw + ch), t => {
        const d = t * 2 * (cw + ch);
        if (d < cw) return [d, 2 * Math.sin(d / 40)];
        if (d < cw + ch) return [cw, d - cw];
        if (d < 2 * cw + ch) return [cw - (d - cw - ch), ch];
        return [0, ch - (d - 2 * cw - ch)];
      }, () => [1, 0, 0, 1, cx, cy]),
    );
    outline.append(osvg);
    const rsvg = doc.createElementNS(svgNs, 'svg');
    rsvg.append(path('var(--card-border-0)', 200, t => [200 * t, 3 + 1.5 * Math.sin(t * 10)], () => [cw / 200, 0, 0, 1, cx, cy - 3]));
    rule.append(rsvg);
    const foot = el('div', { 'data-mascot': 'card-foot' });
    const fy = cy + ch - 60;
    const name_ = el('div', {}, [cx + 60, fy + 6, 40, 16], 'Neo');
    const arrow = doc.createElementNS(svgNs, 'svg');
    boxes.set(arrow, [cx + cw - 40, fy + 6, 18, 18]);
    foot.append(el('img', { alt: '' }, [cx + 22, fy, 30, 30]), name_, arrow);
    article.append(rule, outline, el('h3', {}, [cx + 22, cy + 290, 300, 23], `故事 ${i + 1}`), foot);
    const link = el('a', { href: '#' });
    link.append(article);
    wrap.append(link);
    grid.append(wrap);
  });
  const browseWrap = el('div', { 'data-mascot': 'browse' });
  const browseLink = el('a', { href: '/home' });
  browseLink.append(el('button', {}, g.browse, '瀏覽所有故事'));
  browseWrap.append(browseLink);
  feed.append(edge(g.feed[1]), heading, grid, browseWrap);

  const cta = el('section', { 'data-mascot-zone': 'cta' }, g.cta);
  const ctaTitle = el('h2', { 'data-mascot': 'cta-title' }, undefined, '分享你的故事');
  lines.set(ctaTitle, g.ctaTitle);
  const ctaText = el('p', { 'data-mascot': 'cta-text' }, undefined, '每一個故事都有意義');
  lines.set(ctaText, g.ctaText);
  const row = el('div', { 'data-mascot': 'cta-buttons' });
  for (const b of g.ctaButtons) {
    const a = el('a', { href: '#' });
    a.append(el('button', {}, b, '按鈕'));
    row.append(a);
  }
  cta.append(edge(g.cta[1]), ctaTitle, ctaText, row);

  const footer = el('footer', { 'data-mascot-zone': 'footer' }, g.footer);
  footer.append(el('div', { 'data-mascot': 'footer-logo' }, g.logo, 'Resonance'));

  const main = el('main');
  main.append(hero, feed, cta);
  const layer = el('div', { 'data-landing-stage': '' }, [0, 0, g.width, 1]);   // at the page's top left: it scrolls
  doc.body.append(header, main, footer, layer);

  // --- layout, stubbed
  const rect = (b: Box | undefined, fixed = false) => {
    const [x, y0, w, h] = b ?? [0, 0, 0, 0];
    const y = b && !fixed ? y0 - scrollY : y0;
    return { x, y, left: x, top: y, width: w, height: h, right: x + w, bottom: y + h, toJSON() {} };
  };
  const proto = win.Element.prototype as unknown as Stubbed;
  const range = win.Range.prototype as unknown as Stubbed;
  const canvas = win.HTMLCanvasElement.prototype as unknown as Stubbed;
  const saved = {
    rect: proto.getBoundingClientRect, rects: range.getClientRects, rrect: range.getBoundingClientRect, ctx: canvas.getContext,
    width: Object.getOwnPropertyDescriptor(doc.documentElement, 'clientWidth'),
    scroll: Object.getOwnPropertyDescriptor(win, 'scrollY'),
  };
  proto.getBoundingClientRect = function (this: Element) {
    return rect(boxes.get(this), this === header);
  };
  /** A text node's or element's line boxes; a part of a text node, its characters' share of its line. */
  const rangeRects = (r: Range) => {
    const node = r.startContainer;
    const host = node.nodeType === 3 ? node.parentElement : (node as Element);
    if (!host) return [];
    const own = lines.get(host) ?? (boxes.get(host) ? [boxes.get(host) as Box] : []);
    if (node.nodeType !== 3 || (r.startOffset === 0 && r.endOffset === (node as Text).length) || !own.length) return own.map(b => rect(b));
    const [x, y, w, h] = own[0];
    const n = (node as Text).length;
    return [rect([x + (w * r.startOffset) / n, y, (w * (r.endOffset - r.startOffset)) / n, h])];
  };
  range.getClientRects = function (this: Range) {
    return rangeRects(this);
  };
  range.getBoundingClientRect = function (this: Range) {
    return rangeRects(this)[0] ?? rect(undefined);
  };
  canvas.getContext = () => ({ font: '', measureText: () => ({ fontBoundingBoxAscent: 20, actualBoundingBoxAscent: 20 - GLYPH_INK }) });
  Object.defineProperty(doc.documentElement, 'clientWidth', { configurable: true, get: () => g.width });
  Object.defineProperty(win, 'scrollY', { configurable: true, get: () => scrollY });

  return {
    layer,
    geometry: g,
    scrollTo(y: number) {
      scrollY = y;
    },
    restore() {
      proto.getBoundingClientRect = saved.rect;
      range.getClientRects = saved.rects;
      range.getBoundingClientRect = saved.rrect;
      canvas.getContext = saved.ctx;
      if (saved.width) Object.defineProperty(doc.documentElement, 'clientWidth', saved.width);
      else delete (doc.documentElement as unknown as Stubbed).clientWidth;
      if (saved.scroll) Object.defineProperty(win, 'scrollY', saved.scroll);
      else delete (win as unknown as Stubbed).scrollY;
      doc.body.innerHTML = '';
    },
  };
}
