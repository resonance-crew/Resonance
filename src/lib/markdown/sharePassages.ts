import { fromMarkdown } from 'mdast-util-from-markdown';
import { storyTooComplex } from './storyLimits';
import { cardKeyOfHref } from '@/lib/api/v1/embeds';
import { soleLinkParagraphs } from '@/lib/links/storyLinks';
import { plainText } from './plainText';

/**
 * What a share card quotes from a story — the apps' 9:16 share image and the
 * web's link-preview image (/api/og/card) both quote its opening. One rule on
 * the server and in both apps, pinned case by case by
 * native/fixtures/share-passages.json:
 *
 *   UPDATE_SHARE_PASSAGES=1 npx vitest run src/lib/markdown/sharePassages.test.ts
 *
 * The story's first PASSAGE_READ_CHARS characters are read as CommonMark
 * without GFM, as the apps' parsers read it, block by block in reading order:
 * every paragraph — at the top level, and inside quotes and list items (each
 * item on its own). Headings, code,
 * thematic breaks and HTML are not prose to quote, nor is a paragraph that is
 * only pictures, a standalone link (one that gets a link card,
 * `soleLinkParagraphs`) or an embedded card (`[title](/card/…)` alone in its
 * paragraph, the embeds' rule). A block's text is its `plainText` — Markdown
 * out, a link's text kept, a bare address left out, character references and
 * escapes read as what they stand for.
 */

/**
 * How much of a story is read, from its start: far more than an opening
 * needs, so a 200 000-character story is read in a moment. Cut between code
 * points (a lone surrogate would fail the apps' JSON decoding).
 */
export const PASSAGE_READ_CHARS = 20_000;
/** A block shorter than this, in graphemes, is left out (a line like 「嗯。」 is no passage). */
export const PASSAGE_MIN_GRAPHEMES = 6;
/** At most this many blocks are read. */
export const PASSAGE_MAX = 40;
/** A passage, and the opening, is cut at this many graphemes, with "…". */
export const PASSAGE_MAX_GRAPHEMES = 600;

interface MdNode {
  type: string;
  children?: MdNode[];
  url?: string;
  identifier?: string;
  value?: string;
  position?: { start: { offset?: number }; end: { offset?: number } };
}

const segmenter = new Intl.Segmenter('und', { granularity: 'grapheme' });

function graphemes(text: string): string[] {
  return Array.from(segmenter.segment(text), (s) => s.segment);
}

/** The text cut at `max` graphemes, with "…" when anything was cut. */
function cut(text: string, max = PASSAGE_MAX_GRAPHEMES): string {
  const g = graphemes(text);
  return g.length > max ? `${g.slice(0, max).join('')}…` : text;
}

/** The story's first PASSAGE_READ_CHARS UTF-16 units, one less when the last would split a surrogate pair. */
function head(story: string): string {
  if (story.length <= PASSAGE_READ_CHARS) return story;
  const end = /[\uD800-\uDBFF]/.test(story[PASSAGE_READ_CHARS - 1]) ? PASSAGE_READ_CHARS - 1 : PASSAGE_READ_CHARS;
  return story.slice(0, end);
}

const meaningful = (p: MdNode) => (p.children ?? []).filter((c) => !(c.type === 'text' && !String(c.value ?? '').trim()));

/** A paragraph of pictures alone (a linked picture counts as one). */
function picturesOnly(p: MdNode): boolean {
  const kids = meaningful(p);
  const picture = (n: MdNode): boolean =>
    n.type === 'image' || n.type === 'imageReference' || ((n.type === 'link' || n.type === 'linkReference') && meaningful(n).length > 0 && meaningful(n).every(picture));
  return kids.length > 0 && kids.every(picture);
}

/** A card link alone in its paragraph: the story embeds that card (lib/api/v1/embeds). */
function embedsCard(p: MdNode, definitions: Map<string, string>): boolean {
  const kids = meaningful(p);
  if (kids.length !== 1) return false;
  const only = kids[0];
  const href = only.type === 'link' ? only.url : only.type === 'linkReference' ? definitions.get(only.identifier ?? '') : undefined;
  return href != null && cardKeyOfHref(href) != null;
}

/**
 * The story's quotable blocks, in reading order, as plain text: at most
 * PASSAGE_MAX of them, each of at least PASSAGE_MIN_GRAPHEMES, whole (not
 * yet cut).
 */
export function passageBlocks(whole: string): string[] {
  const story = head(whole);
  if (!story.trim()) return [];
  // Too costly to read as a tree (lib/markdown/storyLimits): drawn as its words, quoted from nowhere — as the apps' SharePassages.
  if (storyTooComplex(story)) return [];
  const root = fromMarkdown(story) as MdNode;
  const definitions = new Map<string, string>();
  const collect = (node: MdNode) => {
    if (node.type === 'definition' && node.identifier && node.url != null && !definitions.has(node.identifier)) {
      definitions.set(node.identifier, node.url);
    }
    node.children?.forEach(collect);
  };
  collect(root);
  const links = soleLinkParagraphs(story);

  const blocks: string[] = [];
  const walk = (node: MdNode) => {
    if (blocks.length >= PASSAGE_MAX) return;
    if (node.type === 'paragraph') {
      const start = node.position?.start.offset;
      const end = node.position?.end.offset;
      if (start == null || end == null) return;
      if (links.has(start) || picturesOnly(node) || embedsCard(node, definitions)) return;
      const text = plainText(story.slice(start, end));
      if (graphemes(text).length >= PASSAGE_MIN_GRAPHEMES) blocks.push(text);
      return;
    }
    // Quotes and lists hold paragraphs; headings, code, rules, HTML and definitions hold no prose to quote.
    if (node.type === 'root' || node.type === 'blockquote' || node.type === 'list' || node.type === 'listItem') {
      node.children?.forEach(walk);
    }
  };
  walk(root);
  return blocks;
}

/** What a share card quotes. */
export interface SharePassages {
  /**
   * The story's opening: its quotable blocks joined by line breaks, cut at
   * PASSAGE_MAX_GRAPHEMES. A share card then truncates it by its own lines.
   * Empty when the story holds nothing to quote.
   */
  opening: string;
}

/**
 * What a share card quotes from `story`. The apps' card and the web's
 * link-preview image both take `opening`; a reader's own choice among the
 * passages (passageBlocks, each cut as `cut` does) may come later.
 */
export function sharePassages(story: string): SharePassages {
  return { opening: cut(passageBlocks(story).join('\n')) };
}
