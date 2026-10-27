// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { pathY } from '../geometry';
import type { Ledge, Rect } from '../types';
import { GLYPH_INK, installLanding, native } from './landingFixture';
import { measureLanding, type LandingLayout } from './measure';
import { PRESETS, type PresetName } from './presets';

let restore: (() => void) | null = null;
afterEach(() => {
  restore?.();
  restore = null;
});

function measured(name: PresetName) {
  const page = installLanding(name);
  restore = page.restore;
  const layout = measureLanding(document, page.layer, PRESETS[name]);
  return { layout, g: page.geometry, page };
}

function ledge<K extends Ledge['kind']>(layout: LandingLayout, id: string, kind: K): Extract<Ledge, { kind: K }> {
  const l = layout.ledges.find(x => x.id === id);
  if (!l) throw new Error(`no ledge ${id} (have ${layout.ledges.map(x => x.id).join(', ')})`);
  expect(l.kind).toBe(kind);
  return l as Extract<Ledge, { kind: K }>;
}
const ids = (layout: LandingLayout) => layout.ledges.map(l => l.id);
const covers = (outer: Rect, inner: Rect) =>
  inner.x >= outer.x - 0.5 && inner.y >= outer.y - 0.5 && inner.x + inner.w <= outer.x + outer.w + 0.5 && inner.y + inner.h <= outer.y + outer.h + 0.5;

describe('measureLanding on a desktop (1440)', () => {
  it('finds the prototype’s places on the page itself', () => {
    const { layout } = measured('desktop');
    expect(ids(layout).sort()).toEqual([
      'avatars-end', 'badges', 'browse', 'card-1-left', 'card-1-top', 'card-2-left', 'card-2-top', 'card-4-top', 'card-5-right',
      'card-5-top', 'card-6-right', 'card-6-top', 'cta-wave', 'feed-title-l', 'feed-title-r', 'footer-logo', 'headline-l',
      'headline-r', 'hero-wave', 'pill-top', 'qr-left', 'qr-point', 'write',
    ]);
  });

  it('walks the waves along the SectionEdge’s own path, through its stretched viewBox into page px', () => {
    const { layout, g } = measured('desktop');
    const wave = ledge(layout, 'hero-wave', 'line');
    // the path is 70 + 10·t over 1440 units; the section starts at the feed's top
    expect(wave.points[0][0]).toBeCloseTo(0, 0);
    expect(wave.points[wave.points.length - 1][0]).toBeCloseTo(g.width, 0);
    expect(pathY(wave.points, g.width / 2)).toBeCloseTo(g.feed[1] + 75, 0);
    expect(pathY(ledge(layout, 'cta-wave', 'line').points, g.width / 4)).toBeCloseTo(g.cta[1] + 72.5, 0);
  });

  it('stands on the headline’s ink, not its line box, at its two ends clear of the pill', () => {
    const { layout, g } = measured('desktop');
    const l = ledge(layout, 'headline-l', 'edge');
    const r = ledge(layout, 'headline-r', 'edge');
    for (const e of [l, r]) for (const [, y] of e.points) expect(y).toBeCloseTo(g.headline[1] + GLYPH_INK, 1);
    const [px, , pw] = g.pill;
    expect(l.points[l.points.length - 1][0]).toBeLessThanOrEqual(px - 20);
    expect(r.points[0][0]).toBeGreaterThanOrEqual(px + pw + 20);
    expect(l.points[0][0]).toBeGreaterThanOrEqual(g.headline[0]);
    expect([l.partner, r.partner, l.group, l.enter]).toEqual(['headline-r', 'headline-l', 'headline', 'pop']);
  });

  it('stands on the letters under the feet on a Latin line, not on a board across its ascenders', () => {
    const page = installLanding('desktop');
    restore = page.restore;
    const h1 = document.querySelector('[data-mascot="headline"]') as HTMLElement;
    h1.textContent = 'Let lives shape lives';   // 21 glyphs across the line's box, 24.6 px each
    const short = new Set(['e', 'v', 's', 'a', 'p']);
    (HTMLCanvasElement.prototype as unknown as Record<string, unknown>).getContext = () => ({
      font: '', measureText: (ch: string) => ({ fontBoundingBoxAscent: 20, actualBoundingBoxAscent: short.has(ch) ? 0 : 20 - GLYPH_INK }),
    });
    const l = ledge(measureLanding(document, page.layer, PRESETS.desktop), 'headline-l', 'edge');
    const top = page.geometry.headline[1];
    const v = page.geometry.headline[0] + 6.5 * (page.geometry.headline[2] / 21);   // the middle of the v of "lives"
    expect(pathY(l.points, v)).toBeGreaterThan(top + GLYPH_INK + 8);   // down on its x-height
    expect(pathY(l.points, page.geometry.headline[0] + 4.5 * (page.geometry.headline[2] / 21))).toBeCloseTo(top + GLYPH_INK, 0);   // up on the l
  });

  it('peeks past the QR code and points at it, with the badges across (a first-screen meeting)', () => {
    const { layout, g } = measured('desktop');
    const qr = g.qr as number[];
    const point = ledge(layout, 'qr-point', 'spot');
    expect(point).toMatchObject({ x: qr[0] - 56, y: qr[1] + qr[3] - 1, from: 'left', partner: 'badges', meet: true, meetChance: 0.7 });
    expect(point.ceiling).toBe(g.para[1][1] + g.para[1][3] + 4);   // under the paragraph
    expect(ledge(layout, 'badges', 'spot')).toMatchObject({ x: 714 + 148 + 62, y: 583 + 44, from: 'right', partner: 'qr-point' });
    expect(ledge(layout, 'qr-left', 'peek').cover).toMatchObject({ x: qr[0], y: qr[1], w: qr[2], h: qr[3] });
  });

  it('seats on the cards’ drawn tops, never on one under the feed’s subtitle, and keeps off the author row above', () => {
    const { layout, g } = measured('desktop');
    expect(ids(layout)).not.toContain('card-3-top');   // the middle one, right under the subtitle's words
    const c1 = ledge(layout, 'card-1-top', 'edge');
    const [, card1] = g.cards[0];
    expect(c1.stance).toBe('sit');
    expect(c1.cover).toMatchObject({ x: card1[0], y: card1[1], w: card1[2], h: card1[3] });
    // the outline's top wobbles 2 px either way: the seat follows it
    const ys = c1.points.map(p => p[1]);
    expect(Math.min(...ys)).toBeLessThan(card1[1] - 1);
    expect(Math.max(...ys)).toBeGreaterThan(card1[1] + 1);
    expect(c1.points[0][0]).toBeGreaterThanOrEqual(card1[0] + 54);
    // card 2 sits under card 1: its avatar, name and arrow are kept clear, an arm's width more each side (a sitter's
    // mitten hangs beside it)
    const c2 = ledge(layout, 'card-2-top', 'edge');
    const foot = card1[1] + card1[3] - 60;
    expect(c2.clear?.length).toBe(3);
    expect(c2.clear?.every(r => r.y >= foot - 4 && r.y < foot + 30)).toBe(true);
    const arm = Math.round(PRESETS.desktop.unitHeight * 0.12);
    const avatar = [...(c2.clear ?? [])].sort((a, b) => a.x - b.x)[0];
    expect(avatar.x).toBeCloseTo(card1[0] + 22 - 4 - arm, 5);   // the avatar's ink, 4 px of air, an arm
    expect(avatar.w).toBeCloseTo(30 + 8 + 2 * arm, 5);
  });

  it('reads every outline and wave from its own path data, never walking it through the browser', () => {
    native.calls = 0;
    const { layout } = measured('desktop');
    expect(ids(layout)).toContain('card-1-top');
    expect(native.calls).toBe(0);   // getPointAtLength: a quarter of a second for one measure of the live page
  });

  it('asks the browser, coarsely, only for a path it can’t read itself', () => {
    const page = installLanding('desktop');
    restore = page.restore;
    // the computer's outline (the card's second chrome; the first, a phone's rule, has no box here)
    const outline = document.querySelectorAll('[data-card-id="c0"] [data-mascot="card-edge"] path[stroke="var(--card-border-0)"]')[1] as SVGPathElement;
    outline.setAttribute('d', 'M 0 0 A 10 10 0 0 1 20 0');   // an arc: not this file's to flatten
    native.calls = 0;
    const layout = measureLanding(document, page.layer, PRESETS.desktop);
    expect(ledge(layout, 'card-1-top', 'edge').points.length).toBeGreaterThan(10);   // the browser's points serve
    expect(native.calls).toBeGreaterThan(0);
    expect(native.calls).toBeLessThanOrEqual(401);   // every 12 px of its 1808, not every 4
  });

  it('leans by the browse button under the cards, and beckons to the CTA’s write button in the band’s pencil', () => {
    const { layout, g } = measured('desktop');
    const browse = ledge(layout, 'browse', 'spot');
    expect(browse).toMatchObject({ x: g.browse[0] - 52, y: g.browse[1] + g.browse[3], meet: true });
    expect(browse.ceiling).toBe(1846 + 499 + 6);   // the foot of the card above it
    const write = ledge(layout, 'write', 'spot');
    expect(write).toMatchObject({ x: 542 - 140, y: 3201, zone: 'cta', ink: { light: 'light', dark: 'light' } });
    expect(ledge(layout, 'cta-wave', 'line').ink).toEqual({ light: 'dark', dark: 'light' });   // faces over the feed's paper
    expect(ledge(layout, 'footer-logo', 'spot')).toMatchObject({ stance: 'floor', prefer: ['night'], zone: 'footer' });
  });

  it('tells the engine the words and buttons to keep off, the header to stay under and the page’s height', () => {
    const { layout, g } = measured('desktop');
    expect(layout.header).toBe(82);
    expect(layout.height).toBe(g.footer[1] + g.footer[3]);   // whole px, never rounded up past the page's own foot
    const has = (b: number[]) => layout.content.some(r => covers(r, { x: b[0], y: b[1], w: b[2], h: b[3] }));
    for (const b of [g.pill, g.qr as number[], ...g.badges, g.browse, ...g.ctaButtons, g.logo]) expect(has(b)).toBe(true);
    // the titles by their ink: within their line box
    const [tx, ty, tw, th] = g.feedTitle;
    expect(layout.content.some(r => covers({ x: tx, y: ty, w: tw, h: th }, r) && r.y === ty + GLYPH_INK)).toBe(true);
  });

  it('measures in page px whatever the scroll', () => {
    const page = installLanding('desktop');
    restore = page.restore;
    page.scrollTo(1200);
    const layout = measureLanding(document, page.layer, PRESETS.desktop);
    expect(ledge(layout, 'qr-point', 'spot').y).toBe(631);
    expect(layout.origin).toEqual({ x: 0, y: 0 });
  });
});

describe('measureLanding on a phone (390)', () => {
  it('has the phone’s places: beside the badge, over the avatars, over the write button’s end', () => {
    const { layout, g } = measured('phone');
    expect(ids(layout).sort()).toEqual([
      'avatars', 'badge-l', 'badge-r', 'browse', 'card-2-top', 'card-3-top', 'card-4-top', 'card-5-top', 'card-6-top', 'cta-wave',
      'feed-title-l', 'feed-title-r', 'footer-logo', 'headline-l', 'headline-r', 'hero-wave', 'pill-top', 'write',
    ]);
    const [bx, by, bw, bh] = g.badges[0];
    expect(ledge(layout, 'badge-l', 'spot')).toMatchObject({ x: bx - 46, y: by + bh + 18, from: 'left', partner: 'badge-r' });
    expect(ledge(layout, 'badge-l', 'spot').meet).toBeUndefined();   // too narrow to walk up: they greet across
    expect(ledge(layout, 'badge-r', 'spot')).toMatchObject({ x: bx + bw + 46, from: 'right' });
    const write = ledge(layout, 'write', 'peek');
    const [wx, wy, , wh] = g.ctaButtons[0];
    expect(write).toMatchObject({ side: 'top', x: wx + 42, ground: wy + wh - 1, show: 0.55, ceiling: 4925 + 22 + 1 });
    expect(ledge(layout, 'avatars', 'peek')).toMatchObject({ side: 'top', x: g.avatars[0] + 36 });
  });

  it('seats on the wavy rule over each band (full width), from the second card on', () => {
    const { layout, g } = measured('phone');
    const c2 = ledge(layout, 'card-2-top', 'edge');
    const [item, band] = g.cards[1];
    expect(c2.cover).toMatchObject({ x: 0, w: band[2] });
    expect(c2.points[0][0]).toBeGreaterThanOrEqual(item[0] + 54);
    expect(c2.points[c2.points.length - 1][0]).toBeLessThanOrEqual(item[0] + item[2] - 54);
    for (const [, y] of c2.points) expect(Math.abs(y - band[1])).toBeLessThan(2);
  });
});

describe('measureLanding on a tablet (834)', () => {
  it('has the tablet’s own places: the badge’s two sides to walk up to, both avatar places, the cards’ outer sides', () => {
    const { layout } = measured('tablet');
    const list = ids(layout);
    for (const id of ['badge-l', 'badge-r', 'avatars', 'avatars-end', 'card-1-left', 'card-2-right', 'card-3-left', 'write']) expect(list).toContain(id);
    expect(list).not.toContain('qr-point');
    expect(ledge(layout, 'badge-l', 'spot').meet).toBe(true);
    expect(ledge(layout, 'badge-l', 'spot').y).toBe(697 + 44 + 24);
    expect(ledge(layout, 'write', 'spot').x).toBe(239 - 140);
  });

  it('keeps a first-row seat only where the feed’s heading words are not above it', () => {
    const { layout, g } = measured('tablet');
    const c1 = ledge(layout, 'card-1-top', 'edge');
    const words = g.feedSubtitle[0];
    expect(Math.max(...c1.points.map(p => p[0]))).toBeLessThanOrEqual(words[0] - PRESETS.tablet.unitHeight * 0.4);
    expect(c1.clear?.length).toBeGreaterThan(0);
  });
});
