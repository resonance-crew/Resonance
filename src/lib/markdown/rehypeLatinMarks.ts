import type { Element, ElementContent, Root, RootContent, Text } from 'hast';
import { latinMarks } from '@/lib/text/script';

/** The hook class story.css sets an apostrophe inside a Latin word with (its element's Latin face). */
export const LATIN_MARK_CLASS = 'story-latin-mark';

/** Where no mark is wrapped: code keeps its own face, and its characters as typed. */
const SKIP = new Set(['code', 'pre', 'kbd', 'samp', 'script', 'style']);

/**
 * A text cut at its Latin marks (lib/text/script latinMarks: ‘ ’ with a Latin
 * letter on both sides, as in don’t): the runs between them as they are, each
 * mark on its own. Null when the text holds none, so a caller leaves it be.
 */
export function splitLatinMarks(text: string): { text: string; mark: boolean }[] | null {
  const at = latinMarks(text);
  if (!at.length) return null;
  const parts: { text: string; mark: boolean }[] = [];
  let from = 0;
  for (const i of at) {
    if (i > from) parts.push({ text: text.slice(from, i), mark: false });
    parts.push({ text: text[i], mark: true });
    from = i + 1;
  }
  if (from < text.length) parts.push({ text: text.slice(from), mark: false });
  return parts;
}

function markNode(value: string): Element {
  return { type: 'element', tagName: 'span', properties: { className: [LATIN_MARK_CLASS] }, children: [{ type: 'text', value }] };
}

function walk(node: Root | Element): void {
  let changed = false;
  const children: (RootContent | ElementContent)[] = [];
  for (const child of node.children) {
    if (child.type === 'text') {
      const parts = splitLatinMarks((child as Text).value);
      if (parts) {
        changed = true;
        for (const part of parts) children.push(part.mark ? markNode(part.text) : { type: 'text', value: part.text });
        continue;
      }
    } else if (child.type === 'element' && !SKIP.has(child.tagName)) {
      walk(child);
    }
    children.push(child);
  }
  if (changed) node.children = children as typeof node.children;
}

/**
 * A rehype plugin for a CJK story: wraps each apostrophe inside a Latin word
 * in `<span class="story-latin-mark">`, which story.css sets in the Latin face
 * of its element (DM Sans in the body, Playfair in a heading) — a CJK face
 * draws ‘ ’ full-width, a half-em hole inside don’t. Code is left as typed.
 * A Latin-script story needs none of it (its faces are Latin already), so the
 * reader adds the plugin for a CJK story only. Run it after rehype-slug, so a
 * heading's id is read from its words as they are.
 */
export function rehypeLatinMarks() {
  return (tree: Root) => walk(tree);
}
