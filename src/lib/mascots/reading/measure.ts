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

/** The cards under `root`, as the scene takes them: id, drawn box and top, pen, author row, title words. */
function cardsIn(root: ParentNode, page: Page): SceneCard[] {
  return Array.from(root.querySelectorAll(CARD_ITEM))
    .map((item): SceneCard | null => {
      const article = item.querySelector('article');
      const frame = page.rect(article);
      if (!article || !frame) return null;
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
    scene.rail = rail ? page.rect(rail) : null;
    const respond = mark('respond', article);
    scene.respond = page.rect(respond?.querySelector('[role="group"]') ?? null);
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
