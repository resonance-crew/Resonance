// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Rect } from '../types';
import { measureReading, readingScene, translationOf } from './measure';
import { READING_PRESETS } from './presets';

/**
 * §E (round 25): the response bar is measured while ReadAfterArea still holds it 10 px low for its fade-in, and
 * nothing measures again when it rises — so the puppet came out of the bar's middle. The bar is now read at rest:
 * a measure before, during or after the rise gives the same box.
 */

type Box = [number, number, number, number];
const BOXES = new WeakMap<Element, Box>();

/** A browser's rect: the laid-out box moved by every translation on the way up (as getBoundingClientRect is). */
function drawn(el: Element): DOMRect {
  const box = BOXES.get(el);
  if (!box) return new DOMRect(0, 0, 0, 0);
  let dx = 0;
  let dy = 0;
  for (let n: Element | null = el; n; n = n.parentElement) {
    const t = translationOf(window, n);
    dx += t.x;
    dy += t.y;
  }
  return new DOMRect(box[0] + dx, box[1] + dy, box[2], box[3]);
}

let saved: { rect: typeof Element.prototype.getBoundingClientRect; rects: unknown; rrect: unknown; ctx: unknown } | null = null;

beforeEach(() => {
  const range = Range.prototype as unknown as Record<string, unknown>;
  const canvas = HTMLCanvasElement.prototype as unknown as Record<string, unknown>;
  saved = { rect: Element.prototype.getBoundingClientRect, rects: range.getClientRects, rrect: range.getBoundingClientRect, ctx: canvas.getContext };
  canvas.getContext = () => null; // no glyph metrics: the title's ink falls back to its line box
  Element.prototype.getBoundingClientRect = function (this: Element) {
    return drawn(this);
  };
  range.getClientRects = function (this: Range) {
    const el = this.startContainer.nodeType === 1 ? (this.startContainer as Element) : this.startContainer.parentElement;
    const r = el ? drawn(el) : new DOMRect();
    return r.width ? [r] : [];
  };
  range.getBoundingClientRect = function (this: Range) {
    const el = this.startContainer.parentElement;
    if (!el) return new DOMRect();
    const r = drawn(el);
    const len = (this.startContainer.textContent || '').length || 1;
    const w = r.width / len;
    return new DOMRect(r.x + this.startOffset * w, r.y, w, r.height);
  };
});

afterEach(() => {
  if (saved) {
    Element.prototype.getBoundingClientRect = saved.rect;
    const range = Range.prototype as unknown as Record<string, unknown>;
    range.getClientRects = saved.rects;
    range.getBoundingClientRect = saved.rrect;
    (HTMLCanvasElement.prototype as unknown as Record<string, unknown>).getContext = saved.ctx;
  }
  document.body.innerHTML = '';
});

/** A card page: the layer, the title, a story of two paragraphs, and the response bar under it. */
function install(width: number): { layer: HTMLElement; respond: HTMLElement; bar: Box } {
  const x = width > 640 ? 340 : 16;
  const w = width > 640 ? 760 : width - 32;
  document.body.innerHTML = `
    <div id="layer"></div>
    <article data-mascot-zone="card">
      <h1 data-mascot="story-title">雨中的散步</h1>
      <div data-mascot="story"><div class="story-prose"><p>一</p><p>二</p></div></div>
      <div data-mascot="respond"><div role="group">共振 紙條 收藏</div></div>
    </article>`;
  const q = (s: string) => document.querySelector(s) as HTMLElement;
  const bar: Box = [x, 1400, Math.min(w, 420), 56];
  BOXES.set(q('#layer'), [0, 0, width, 2400]);
  BOXES.set(q('article'), [x, 200, w, 1300]);
  BOXES.set(q('h1'), [x, 220, w, 48]);
  BOXES.set(q('[data-mascot="story"]'), [x, 300, w, 1040]);
  BOXES.set(q('.story-prose'), [x, 300, w, 1040]);
  BOXES.set(q('.story-prose p:nth-child(1)'), [x, 300, w, 500]);
  BOXES.set(q('.story-prose p:nth-child(2)'), [x, 820, w, 520]);
  BOXES.set(q('[data-mascot="respond"]'), [x, 1400, w, 56]);
  BOXES.set(q('[role="group"]'), bar);
  Object.defineProperty(document.documentElement, 'clientWidth', { configurable: true, value: width });
  Object.defineProperty(document.documentElement, 'scrollHeight', { configurable: true, value: 2400 });
  return { layer: q('#layer'), respond: q('[data-mascot="respond"]'), bar };
}

const respondLedge = (layer: HTMLElement, preset: keyof typeof READING_PRESETS) =>
  measureReading(document, layer, READING_PRESETS[preset]).ledges.find((l) => l.id === 'respond');

describe('translationOf', () => {
  it('reads a computed matrix, a 3-D one and what jsdom hands back as written', () => {
    const el = document.createElement('div');
    document.body.append(el);
    for (const [t, want] of [
      ['none', { x: 0, y: 0 }],
      ['matrix(1, 0, 0, 1, 3, 10)', { x: 3, y: 10 }],
      ['matrix3d(1,0,0,0, 0,1,0,0, 0,0,1,0, 4,6.5,0,1)', { x: 4, y: 6.5 }],
      ['translateY(10px)', { x: 0, y: 10 }],
      ['translate(2px, 5px)', { x: 2, y: 5 }],
    ] as const) {
      el.style.transform = t;
      expect(translationOf(window, el), t).toEqual(want);
    }
  });
});

describe.each([
  ['a phone', 390, 'phone'],
  ['a desktop', 1440, 'desktop'],
] as const)('the response bar on %s', (_name, width, preset) => {
  it('is measured at rest, whether its container is still 10 px low, half-way up or risen', () => {
    const { layer, respond, bar } = install(width);
    const at = (transform: string): { box: Rect | null | undefined; ceiling: number | null | undefined } => {
      respond.style.transform = transform;
      const { scene } = readingScene(document, layer);
      return { box: scene.respond, ceiling: scene.respondCeiling };
    };
    const rest = at('none');
    expect(rest.box).toEqual({ x: bar[0], y: bar[1], w: bar[2], h: bar[3] });
    for (const t of ['translateY(10px)', 'matrix(1, 0, 0, 1, 0, 4.2)']) expect(at(t), t).toEqual(rest);
  });

  it('gives the same respond ledge at translateY(10px) and at rest', () => {
    const { layer, respond, bar } = install(width);
    respond.style.transform = 'translateY(10px)';
    const low = respondLedge(layer, preset);
    respond.style.transform = 'none';
    const risen = respondLedge(layer, preset);
    expect(risen).toBeDefined();
    expect(low).toEqual(risen);
    // the puppet stands on the bar's drawn top, not 10 px into it
    expect(JSON.stringify(risen)).toContain(`"y":${bar[1]}`);
  });
});
