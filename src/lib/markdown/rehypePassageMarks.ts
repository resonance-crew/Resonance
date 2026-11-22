import type { Element, ElementContent, Root, RootContent, Text } from 'hast';
import { findPassage } from './passageRange';

/**
 * The author's picked sentences in their own story (round 29 §U2, §S1): each found sentence's words wrapped in
 * `<mark class="story-passage" data-passage={id}>`, one piece per text it runs through — so a range crosses bold,
 * italic, a link's words and a latin mark (`.story-latin-mark`) by splitting at their edges, never by moving them.
 * The marks draw nothing themselves: the card page lays the wash under their lines (CardDetail/PassageMarks), so a
 * link's wave stays over it and two pieces of one line meet with no seam.
 *
 * With `inline`, the sentence's faces stand in the line right after its last character (§S1.2): the plugin puts an
 * empty `<span data-passage-slot={id}>` there, inside a `.story-passage-glue` span that holds the last character's
 * piece and the slot together (no line break between them, so a group never begins a line alone). Without it (the
 * left margin, §S10) nothing but the marks is added: nothing in the story moves.
 *
 * A sentence is found as passageRange's rule says (§P3: the first leaf in the story's order that holds it); one not
 * found, or one overlapping a sentence found before it, gets nothing (§P3.4). Code blocks keep their characters.
 */
export interface PassageMarkInput {
  id: string;
  text: string;
}

export interface PassageMarksOptions {
  passages: readonly PassageMarkInput[];
  inline?: boolean;
}

export const PASSAGE_CLASS = 'story-passage';
export const PASSAGE_GLUE_CLASS = 'story-passage-glue';

/** The drawn texts of a story (§P3's leaves): a paragraph, a heading, a table cell, a tight list item's words. */
const LEAF = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'td', 'th']);
/** Blocks inside a leaf's element (a tight list item's nested list): walked as blocks of their own, not as its words. */
const BLOCK = new Set(['p', 'ul', 'ol', 'li', 'blockquote', 'table', 'pre', 'div', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
/** Never marked: code keeps its own face and its characters as typed. */
const SKIP = new Set(['pre', 'script', 'style']);

/** One text node of a leaf, where it starts in the leaf's text. */
interface Seg {
  node: Text;
  parent: Element;
  at: number;
}

interface Leaf {
  text: string;
  segs: Seg[];
}

const isElement = (n: RootContent | ElementContent): n is Element => n.type === 'element';

function isLeaf(el: Element): boolean {
  if (LEAF.has(el.tagName)) return true;
  // A tight list item holds its words itself; a loose one holds paragraphs (each a leaf).
  return el.tagName === 'li' && !el.children.some((c) => isElement(c) && c.tagName === 'p');
}

function collectLeaf(el: Element): Leaf {
  const leaf: Leaf = { text: '', segs: [] };
  const visit = (node: Element) => {
    for (const child of node.children) {
      if (child.type === 'text') {
        leaf.segs.push({ node: child, parent: node, at: leaf.text.length });
        leaf.text += child.value;
      } else if (isElement(child)) {
        if (child.tagName === 'br') leaf.text += '\n';
        else if (child.tagName === 'img' || BLOCK.has(child.tagName) || SKIP.has(child.tagName)) continue;
        else visit(child);
      }
    }
  };
  visit(el);
  return leaf;
}

/** Every leaf of the tree, in the story's order (a tight list item's nested list after its own words). */
function leavesOf(root: Root | Element, out: Leaf[] = []): Leaf[] {
  for (const child of root.children) {
    if (!isElement(child) || SKIP.has(child.tagName)) continue;
    if (isLeaf(child)) {
      out.push(collectLeaf(child));
      // A leaf's own blocks (a tight list item's nested list) come after its words.
      for (const inner of child.children) if (isElement(inner) && BLOCK.has(inner.tagName)) leavesOf({ type: 'root', children: [inner] }, out);
    } else {
      leavesOf(child, out);
    }
  }
  return out;
}

interface Range {
  id: string;
  start: number;
  end: number;
}

function mark(id: string, value: string): Element {
  return { type: 'element', tagName: 'mark', properties: { className: [PASSAGE_CLASS], dataPassage: id }, children: [{ type: 'text', value }] };
}

/** The last piece of a sentence and its faces' slot, held on one line. */
function glued(id: string, value: string, inline: boolean): ElementContent[] {
  if (!inline) return [mark(id, value)];
  const chars = Array.from(value);
  const last = chars.pop()!;
  const head = chars.join('');
  const glue: Element = {
    type: 'element',
    tagName: 'span',
    properties: { className: [PASSAGE_GLUE_CLASS] },
    children: [mark(id, last), { type: 'element', tagName: 'span', properties: { dataPassageSlot: id }, children: [] }],
  };
  return head ? [mark(id, head), glue] : [glue];
}

/** One text node cut at the ranges that run through it. */
function cut(seg: Seg, ranges: readonly Range[], inline: boolean): ElementContent[] | null {
  const { value } = seg.node;
  const from = seg.at;
  const to = from + value.length;
  const hits = ranges.filter((r) => r.start < to && r.end > from);
  if (!hits.length) return null;
  const out: ElementContent[] = [];
  let i = 0;
  for (const r of hits) {
    const s = Math.max(r.start - from, 0);
    const e = Math.min(r.end - from, value.length);
    if (s > i) out.push({ type: 'text', value: value.slice(i, s) });
    const piece = value.slice(s, e);
    // The piece that holds the sentence's last character carries the faces' slot.
    out.push(...(r.end <= to ? glued(r.id, piece, inline) : [mark(r.id, piece)]));
    i = e;
  }
  if (i < value.length) out.push({ type: 'text', value: value.slice(i) });
  return out;
}

/** The marks, as a rehype plugin (after rehypeLatinMarks, so a range is cut at a latin mark's edges as at any element's). */
export function rehypePassageMarks(options: PassageMarksOptions) {
  const { passages, inline = false } = options;
  return (tree: Root) => {
    if (!passages.length) return;
    const leaves = leavesOf(tree);
    const texts = leaves.map((l) => l.text);
    const byLeaf = new Map<number, Range[]>();
    for (const p of passages) {
      for (let leaf = 0; leaf < texts.length; leaf++) {
        const r = findPassage(texts[leaf], p.text);
        if (!r) continue;
        const list = byLeaf.get(leaf) ?? [];
        // A sentence over one already marked gets nothing (never two washes on one word).
        if (!list.some((o) => o.start < r.end && o.end > r.start)) {
          list.push({ id: p.id, ...r });
          byLeaf.set(leaf, list);
        }
        break;
      }
    }
    for (const [leaf, ranges] of byLeaf) {
      ranges.sort((a, b) => a.start - b.start);
      for (const seg of leaves[leaf].segs) {
        const parts = cut(seg, ranges, inline);
        if (!parts) continue;
        const at = seg.parent.children.indexOf(seg.node);
        if (at >= 0) seg.parent.children.splice(at, 1, ...parts);
      }
    }
  };
}
