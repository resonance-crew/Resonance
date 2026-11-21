/**
 * The reading pages measured for the stage: the home feed (`data-mascot-zone="home"`) and a card's page
 * (`data-mascot-zone="card"`), found by their marks and read into a ReadingScene (./scene.ts gives its places), in
 * the stage layer's px — cards from their drawn outline (StoryCard's `card-edge` and `card-foot` marks, as the
 * landing page reads them), a story's title from its glyphs' ink, the rest from their boxes.
 *
 * Run it on a resize, once fonts are in and when the page's height changes — never per frame: it reads layout.
 */
import { CARD_ITEM, HEADER, Page, topContour, visible, type LandingLayout } from '../landing/measure';
import type { Rect } from '../types';
import type { ReadingPreset } from './presets';
import { readingLedges, type ReadingScene, type SceneCard } from './scene';

/** The marks this file finds the reading pages by (marks.test renders the pages' parts and checks each resolves). */
export const READING_MARKS = {
  zones: ['home', 'card'],
  home: ['feed-foot'],
  card: ['story-title', 'story', 'respond'],
  card_item: ['card-edge', 'card-foot'],
} as const;

/** Whether the browser is skipping `el`'s content (a `content-visibility: auto` ancestor off screen): style alone. */
function skipped(el: Element): boolean {
  const check = (el as Element & { checkVisibility?: (o?: { contentVisibilityAuto?: boolean }) => boolean }).checkVisibility;
  return typeof check === 'function' && !check.call(el, { contentVisibilityAuto: true });
}

/** The cards under `root`, as the scene takes them: id, drawn box and top, pen, author row, title words. */
function cardsIn(root: ParentNode, page: Page): SceneCard[] {
  return Array.from(root.querySelectorAll(CARD_ITEM))
    .map((item): SceneCard | null => {
      const article = item.querySelector('article');
      if (!article) return null;
      // A card the feed skips while it is far off screen (content-visibility: auto, the perf audit's W8) is read by
      // its box alone: reading its outline, foot or title would lay out what the browser skipped. Its box's top
      // line stands in for its drawn top (the scene's default), its key keeps its places named.
      if (skipped(article)) {
        // the item's own box (not skipped), less the reach its padding gives the card
        const outer = page.rect(item);
        if (!outer) return null;
        const cs = (item.ownerDocument.defaultView as Window).getComputedStyle(item);
        const [t, r, b, l] = [cs.paddingTop, cs.paddingRight, cs.paddingBottom, cs.paddingLeft].map((v) => parseFloat(v) || 0);
        const box = { x: outer.x + l, y: outer.y + t, w: Math.max(0, outer.w - l - r), h: Math.max(0, outer.h - t - b) };
        return { key: item.getAttribute('data-card-id') || undefined, box, radius: 18 };
      }
      const frame = page.rect(article);
      if (!frame) return null;
      const chrome = visible(article, '[data-mascot="card-edge"]', page)[0];
      const strokes = chrome
        ? Array.from(chrome.querySelectorAll<SVGGeometryElement>('path[stroke]'))
            .filter((p) => !['none', 'transparent'].includes(p.getAttribute('stroke') || 'none'))
        : [];
      const drawn = strokes.flatMap((p) => page.pathPoints(p, 4));
      // the outline's own extent: its wobble swings a little past the frame it is laid out in
      const xs = drawn.map((p) => p[0]);
      const box = drawn.length ? { ...frame, x: Math.min(...xs), w: Math.max(...xs) - Math.min(...xs) } : frame;
      const top = topContour(drawn, box.x + 1, box.x + box.w - 1, frame.y);
      const pen = strokes.length ? parseFloat(strokes[0].getAttribute('stroke-width') || '') || undefined : undefined;
      return {
        key: item.getAttribute('data-card-id') || undefined,
        box,
        top: top.length >= 2 ? top : undefined,
        pen,
        // a bordered card's sides (a phone's band has none: its outline is the rule across its top)
        outline: drawn.length && drawn.some(([, y]) => y > frame.y + frame.h / 2) ? drawn : undefined,
        foot: page.inkRects(article.querySelector('[data-mascot="card-foot"]')),
        words: page.textRects(article.querySelector('h3')),
        radius: 18,
      };
    })
    .filter((c): c is SceneCard => !!c);
}

/**
 * The translation an element's own transform carries at this moment, px — the computed value (a browser gives
 * `matrix(…)` / `matrix3d(…)`, mid-transition too; jsdom hands back what was written, so `translate…()` reads too).
 */
export function translationOf(win: Window, el: Element | null | undefined): { x: number; y: number } {
  if (!el) return { x: 0, y: 0 };
  const t = win.getComputedStyle(el).transform || '';
  if (!t || t === 'none') return { x: 0, y: 0 };
  const nums = (body: string) => body.split(',').map((v) => parseFloat(v));
  const m3 = /^matrix3d\(([^)]*)\)/.exec(t);
  if (m3) {
    const v = nums(m3[1]);
    return { x: v[12] || 0, y: v[13] || 0 };
  }
  const m = /^matrix\(([^)]*)\)/.exec(t);
  if (m) {
    const v = nums(m[1]);
    return { x: v[4] || 0, y: v[5] || 0 };
  }
  let x = 0;
  let y = 0;
  for (const [, fn, body] of t.matchAll(/(translate(?:X|Y|3d)?)\(([^)]*)\)/g)) {
    const v = nums(body);
    if (fn === 'translateX') x += v[0] || 0;
    else if (fn === 'translateY') y += v[0] || 0;
    else {
      x += v[0] || 0;
      y += v[1] || 0;
    }
  }
  return { x, y };
}

/** The home feed's or a card page's scene, measured now. */
export function readingScene(doc: Document, layer: HTMLElement): { scene: ReadingScene; page: Page; header: number } {
  const win = doc.defaultView as Window;
  const page = new Page(doc, win, layer);
  const W = doc.documentElement.clientWidth || win.innerWidth;
  const mark = (name: string, root: ParentNode = doc) => root.querySelector(`[data-mascot="${name}"]`);

  let header = 0;
  const hd = doc.querySelector(HEADER);
  if (hd && win.getComputedStyle(hd).position === 'fixed') header = Math.max(0, hd.getBoundingClientRect().bottom);

  const scene: ReadingScene = { width: W, height: Math.floor(doc.documentElement.scrollHeight - page.origin.y), content: [] };
  const home = doc.querySelector('[data-mascot-zone="home"]');
  if (home) {
    scene.cards = cardsIn(home, page);
    const foot = mark('feed-foot', home);
    const button = foot?.querySelector('button');
    scene.more = button ? page.rect(button) : null;
    const endLine = !button ? foot?.querySelector('p') : null;
    scene.end = endLine ? page.rect(endLine) : null;
    scene.column = page.rect(home);
  }

  const article = doc.querySelector('[data-mascot-zone="card"]');
  if (article) {
    const titleEl = mark('story-title', article);
    scene.title = { glyphs: page.glyphs(titleEl) };
    // the cover is what stands right before the title (an OrganicImage with its picture)
    const before = titleEl?.previousElementSibling;
    scene.cover = before && before.querySelector('img') ? page.rect(before) : null;
    scene.column = page.rect(article);
    const story = mark('story', article);
    // the story's blocks: the prose's own children (a paragraph, a heading, a quote, a list, a picture)
    const prose = story?.querySelector('.story-prose') ?? story;
    scene.paragraphs = prose
      ? Array.from(prose.children).map((el) => page.rect(el)).filter((r): r is Rect => !!r)
      : [];
    const rail = article.parentElement?.querySelector('aside');
    // The faces of who picked a sentence, in the right margin on the author's page (round 29 §S1.1), stand there
    // as a rail does: no puppet's place on that side.
    scene.rail = (rail ? page.rect(rail) : null) ?? page.rect(article.querySelector('[data-passage-margin]'));
    const respond = mark('respond', article);
    // The bar at rest: ReadAfterArea holds its container at translateY(10px) until it fades in, and nothing
    // measures again when it rises — so take away whatever translation the container carries right now.
    const bar = page.rect(respond?.querySelector('[role="group"]') ?? null);
    const lift = translationOf(win, respond);
    scene.respond = bar ? { ...bar, x: bar.x - lift.x, y: bar.y - lift.y } : null;
    if (scene.respond) {
      const above = [story, respond?.previousElementSibling].map((el) => page.rect(el)).filter((r): r is Rect => !!r && r.y < scene.respond!.y);
      scene.respondCeiling = above.length ? Math.max(...above.map((r) => r.y + r.h)) + 2 : null;
    }
    // the cards under the story (resonances, related): after the article
    const box = page.rect(article);
    scene.cards = box ? cardsIn(doc, page).filter((c) => c.box.y > box.y + box.h) : [];
  }
  return { scene, page, header };
}

/** The reading page's places for this preset, measured now (the landing stage's layout shape, for mountPageStage). */
export function measureReading(doc: Document, layer: HTMLElement, preset: ReadingPreset): LandingLayout {
  const { scene, page, header } = readingScene(doc, layer);
  const { ledges, content } = readingLedges(scene, preset);
  return { ledges, content, height: scene.height, header, origin: page.origin, width: scene.width };
}
