import { Extension, Node, elementFromString, type AnyExtension } from '@tiptap/core';
import Blockquote from '@tiptap/extension-blockquote';
import Image from '@tiptap/extension-image';
import Paragraph from '@tiptap/extension-paragraph';
import { closeHistory } from '@tiptap/pm/history';
import { DOMParser as PMDOMParser, Fragment, Slice, type Node as PMNode, type NodeType, type ResolvedPos } from '@tiptap/pm/model';
import { Plugin, PluginKey, Selection, TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from 'tiptap-markdown';
import { cardableLink, wordsAreTheAddress } from '../links/soleLink';
import { findLinks, normalizeLink } from '../links/url';
import { BLANK_PARAGRAPH } from './blankLines';

/**
 * The story editor's document schema and its Markdown mapping, with no UI.
 *
 * A story is stored as Markdown, so what the editor can hold — and exactly
 * how each node is written back — *is* the storage format. The web editor
 * (MarkdownEditor) adds React node views on top of these nodes; the native
 * apps' editor island (native/editor) adds plain DOM ones. Both serialize
 * through this module, so a story round-trips identically everywhere
 * (checked against native/fixtures/markdown-corpus.json).
 */

/** The slice of prosemirror-markdown's serializer state these nodes use. */
interface MarkdownSerializerState {
  write(content: string): void;
  closeBlock(node: PMNode): void;
  esc(text: string): string;
  /** Writes text line by line (a quote's or a list's marker before each), escaped unless told not to. */
  text(text: string, escape?: boolean): void;
}

/**
 * Paragraph, with one addition: an empty one is written out as a line holding
 * a single non-breaking space instead of vanishing.
 *
 * Markdown collapses any run of blank lines into a single paragraph break, so
 * a writer who pressed Enter to give a photo room saw that room disappear the
 * moment the card rendered — and again when they reopened the editor. The
 * marker is ordinary Markdown text, so it survives every parser on the way to
 * the reader, where {@link isBlankParagraph} turns it back into space.
 *
 * The last block is exempt: a trailing empty paragraph is just where the
 * cursor happens to rest, not a decision about spacing.
 */
export const SpacedParagraph = Paragraph.extend({
  addStorage() {
    return {
      markdown: {
        serialize(state: MarkdownSerializerState & { renderInline(node: PMNode): void }, node: PMNode, parent: PMNode, index: number) {
          if (node.content.size === 0 && index < parent.childCount - 1) {
            state.write(BLANK_PARAGRAPH);
            state.closeBlock(node);
            return;
          }
          state.renderInline(node);
          state.closeBlock(node);
        },
        parse: {
          // handled by markdown-it
        },
      },
    };
  },
});

/**
 * Images are block nodes here, so they serialize as their own Markdown block.
 * tiptap-markdown's default is the *inline* image serializer, which writes the
 * link and leaves the block open — whatever came next then ran onto the same
 * line as the photo.
 */
export const BlockImage = Image.extend({
  addStorage() {
    return {
      markdown: {
        serialize(state: MarkdownSerializerState, node: PMNode) {
          const alt = state.esc(String(node.attrs.alt ?? ''));
          const src = String(node.attrs.src ?? '');
          const title = node.attrs.title ? ` "${state.esc(String(node.attrs.title))}"` : '';
          state.write(`![${alt}](${src}${title})`);
          state.closeBlock(node);
        },
        parse: {
          // handled by markdown-it
        },
      },
    };
  },
});

/**
 * Block atom for a link to one of the author's cards. Serializes to plain
 * markdown `[title](/card/slug)` on its own line — the stored format is
 * unchanged, so existing stories round-trip.
 *
 * Only a card link that stands alone in its paragraph comes back as this
 * node, which is exactly when the reader (StoryMarkdown) draws it as an
 * embedded card. A card link inside a sentence stays an ordinary link:
 * turning it into a block would cut the writer's sentence in three.
 */
export const CardEmbed = Node.create({
  name: 'cardEmbed',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      href: { default: '' },
      title: { default: '' },
    };
  },

  parseHTML() {
    return [
      {
        // Marked by `updateDOM` below (Markdown) or by renderHTML (copy and
        // paste inside the editor). Select in the selector itself: matching
        // every `a[href]` and declining the rest in getAttrs made ProseMirror
        // split the paragraph around *any* link.
        tag: 'a[data-card-embed]',
        priority: 100,
        getAttrs: (el) => {
          const a = el as HTMLAnchorElement;
          return { href: a.getAttribute('href') ?? '', title: a.textContent ?? '' };
        },
      },
    ];
  },

  renderHTML({ node }) {
    return ['a', { href: node.attrs.href, 'data-card-embed': '' }, node.attrs.title];
  },

  addStorage() {
    return {
      markdown: {
        serialize(state: Pick<MarkdownSerializerState, 'write' | 'closeBlock'>, node: PMNode) {
          const title = String(node.attrs.title).replace(/[[\]]/g, '\\$&').replace(/\n+/g, ' ');
          state.write(`[${title}](${node.attrs.href})`);
          state.closeBlock(node);
        },
        parse: {
          // markdown-it renders a lone card link as `<p><a href="/card/…">`;
          // lift it out of its paragraph and mark it, so it parses as this block.
          updateDOM(element: HTMLElement) {
            for (const p of Array.from(element.querySelectorAll('p'))) {
              const kids = Array.from(p.childNodes).filter((n) => !(n.nodeType === 3 && !n.textContent?.trim()));
              const a = kids.length === 1 && kids[0].nodeName === 'A' ? (kids[0] as Element) : null;
              if (a?.getAttribute('href')?.startsWith('/card/')) {
                a.setAttribute('data-card-embed', '');
                p.replaceWith(a);
              }
            }
          },
        },
      },
    };
  },
});

/** What an address may not hold to be written as an autolink (`<url>`): CommonMark ends one there. */
const NOT_IN_AUTOLINK = /[\s<>]/;

/**
 * The address a link card keeps, from a link whose words are its address: the
 * writer's own spelling when it names exactly the same address as the href
 * (a path in Chinese stays Chinese, not percent-escaped as markdown-it hands
 * it over), else the href.
 */
function cardAddress(words: string, href: string): string {
  const said = words.trim();
  return /^https?:\/\//i.test(said) && !NOT_IN_AUTOLINK.test(said) && normalizeLink(said) === normalizeLink(href) ? said : href;
}

/**
 * The address a run of words is when it is nothing but one link (`findLinks`,
 * from its first character to its last) — a `www.` one with its `https://` —
 * or null.
 */
function bareAddress(text: string): string | null {
  const words = text.trim();
  const found = findLinks(words);
  if (found.length !== 1 || found[0].start !== 0 || found[0].end !== words.length) return null;
  return /^www\./i.test(words) ? `https://${words}` : words;
}

/**
 * The address a parsed paragraph stands for when the reader draws it as a
 * link card (lib/links/storyLinks' rule): its only child a link whose words
 * are its address (`<url>`, `[url](url)`, `[www.x.com](http://www.x.com)`),
 * with no picture in it, or words that are exactly one bare address — and an
 * address that may be a card at all (`cardableLink`: not our own pages, not
 * an IP address). Null for anything else.
 */
function soleCardAddress(p: Element): string | null {
  const kids = Array.from(p.childNodes).filter((n) => !(n.nodeType === 3 && !n.textContent?.trim()));
  if (kids.length !== 1) return null;
  const only = kids[0];
  if (only.nodeName === 'A') {
    const a = only as Element;
    const href = a.getAttribute('href') ?? '';
    if (!/^https?:\/\//i.test(href) || a.querySelector('img')) return null;
    const words = a.textContent ?? '';
    return wordsAreTheAddress(words, href) && cardableLink(href) ? cardAddress(words, href) : null;
  }
  if (only.nodeType !== 3) return null;
  const address = bareAddress(only.textContent ?? '');
  return address && cardableLink(address) ? address : null;
}

/**
 * The address a paragraph of the editor is, as `soleCardAddress` reads a
 * parsed one: its words nothing but one link — carried by one link mark whose
 * words are its address, or plain words that are one bare address — and an
 * address that may be a card. Null for anything else (a line break, a
 * picture, words of the writer's own).
 */
export function paragraphCardAddress(paragraph: PMNode): string | null {
  if (paragraph.type.name !== 'paragraph' || paragraph.childCount === 0) return null;
  let href: string | null = null;
  let plain = false;
  let other = false;
  paragraph.forEach((child) => {
    if (!child.isText) {
      other = true;
      return;
    }
    const link = child.marks.find((m) => m.type.name === 'link');
    if (!link) {
      if ((child.text ?? '').trim()) plain = true;
      return;
    }
    const target = String(link.attrs.href ?? '');
    if (href != null && href !== target) other = true;
    href = target;
  });
  if (other) return null;
  const words = paragraph.textContent;
  if (href == null) {
    const address = bareAddress(words);
    return address && cardableLink(address) ? address : null;
  }
  if (plain || !/^https?:\/\//i.test(href)) return null;
  return wordsAreTheAddress(words, href) && cardableLink(href) ? cardAddress(words, href) : null;
}

/** Parsed Markdown going into a line of words: a link card in it is the plain link it was written as. */
function asWords(element: HTMLElement): HTMLElement {
  for (const a of Array.from(element.querySelectorAll('a[data-link-card]'))) a.removeAttribute('data-link-card');
  return element;
}

/** A link card as the story keeps it: `<url>` on its own line — the address the reader draws as a card. */
function linkCardMarkdown(href: string): string {
  const address = NOT_IN_AUTOLINK.test(href) ? (normalizeLink(href) ?? href) : href;
  return `<${address}>`;
}

/**
 * Where the caret goes once a link card has taken a line (from `from`, the
 * card `size` long): the start of the paragraph after it, an empty one made
 * there when the next block is no paragraph — or, `newLine`, an empty one
 * made there unless the next is empty already (Enter asked for a new line).
 */
function caretAfterCard(tr: Transaction, from: number, size: number, newLine: boolean) {
  const after = from + size;
  const next = tr.doc.nodeAt(after);
  const paragraph = tr.doc.type.schema.nodes.paragraph;
  const fits = next?.type === paragraph && (!newLine || next.content.size === 0);
  if (!fits) tr.insert(after, paragraph.create());
  tr.setSelection(TextSelection.create(tr.doc, after + 1));
  return tr;
}

/**
 * Puts a link card for `href` in place of the block from `from` to `to` (a
 * paragraph, or a card being changed), the caret on the line after it.
 */
export function placeLinkCard(state: EditorState, from: number, to: number, href: string, newLine = false) {
  const card = state.schema.nodes.linkCard.create({ href });
  const tr = state.tr.replaceWith(from, to, card);
  return caretAfterCard(tr, from, card.nodeSize, newLine).scrollIntoView();
}

/** Whether a paragraph is an empty line: no words but white space (a kept blank line's no-break space), nothing else. */
export function emptyLine(paragraph: PMNode): boolean {
  return paragraph.type.name === 'paragraph' && paragraph.textContent.trim() === '' && paragraph.childCount === (paragraph.textContent ? 1 : 0);
}

/** Whether the paragraph holding `$pos` could stand as a link card where it is (not as a list item's first line, not in a table's source). */
export function holdsLinkCard($pos: ResolvedPos): boolean {
  const type = $pos.doc.type.schema.nodes.linkCard;
  if (!type || $pos.parent.type.name !== 'paragraph' || $pos.depth < 1) return false;
  const index = $pos.index($pos.depth - 1);
  return $pos.node($pos.depth - 1).canReplaceWith(index, index + 1, type);
}

/**
 * A link standing alone on its line, shown as its page's card (round 16 §6):
 * the reader draws it so (lib/links/storyLinks), and here the writer sees the
 * same — a block like CardEmbed (draggable, its own ✕ in the web's view),
 * written back as `<url>` on its own line. It comes from a paragraph whose
 * only child is a link whose words are its address, or a bare address alone
 * (not one of our own pages — `/card/…` is CardEmbed's — nor an IP address,
 * which stay plain links); from an address pasted onto an empty line; from
 * Enter at the end of a line that is one; and from the link editor's 卡片.
 * A link the writer gave words of its own stays a link in their sentence.
 */
export const LinkCard = Node.create({
  name: 'linkCard',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      href: { default: '' },
    };
  },

  parseHTML() {
    return [
      {
        // Marked by `updateDOM` below (Markdown) or by renderHTML (copy and paste inside the editor) —
        // and only an address that may be a card: a pasted page's markup can say anything.
        tag: 'a[data-link-card]',
        priority: 100,
        getAttrs: (el) => {
          const href = (el as HTMLElement).getAttribute('href') ?? '';
          return cardableLink(href) ? { href } : false;
        },
      },
    ];
  },

  renderHTML({ node }) {
    return ['a', { href: node.attrs.href, 'data-link-card': '' }, node.attrs.href];
  },

  addKeyboardShortcuts() {
    return {
      // Enter at the end of a line that is one address, alone: the line becomes its card, as the reader
      // will draw it, and the caret goes on to a new line.
      Enter: ({ editor }) => {
        const { state, view } = editor;
        const { $from, empty } = state.selection;
        if (!empty || $from.parentOffset !== $from.parent.content.size || !holdsLinkCard($from)) return false;
        const href = paragraphCardAddress($from.parent);
        if (!href) return false;
        view.dispatch(placeLinkCard(state, $from.before(), $from.after(), href, true));
        return true;
      },
    };
  },

  addProseMirrorPlugins() {
    const type = this.type;
    return [
      new Plugin({
        key: new PluginKey('linkCardPaste'),
        props: {
          // An address pasted into words is a link among them — never a card cutting the line in three
          // (tiptap-markdown reads a pasted text as Markdown, where a lone address is its card; a card
          // copied in the story pastes the same).
          transformPasted(slice, view) {
            const only = slice.content.childCount === 1 ? slice.content.firstChild : null;
            const link = view.state.schema.marks.link;
            if (only?.type !== type || !link || emptyLine(view.state.selection.$from.parent)) return slice;
            const href = String(only.attrs.href);
            return new Slice(Fragment.from(view.state.schema.text(href, [link.create({ href })])), 0, 0);
          },
          // An address pasted onto an empty line is its card (the link editor's default there); pasted
          // over words it links them (the Link mark's own paste), and into a sentence it stays inline.
          handlePaste(view, event) {
            const { state } = view;
            const { $from, empty } = state.selection;
            if (!empty || !emptyLine($from.parent) || !holdsLinkCard($from) || !state.schema.nodes[type.name]) return false;
            const address = bareAddress(event.clipboardData?.getData('text/plain') ?? '');
            if (!address || !cardableLink(address)) return false;
            view.dispatch(placeLinkCard(state, $from.before(), $from.after(), address).setMeta('paste', true).setMeta('uiEvent', 'paste'));
            return true;
          },
        },
      }),
    ];
  },

  addStorage() {
    return {
      markdown: {
        serialize(state: Pick<MarkdownSerializerState, 'write' | 'closeBlock'>, node: PMNode) {
          state.write(linkCardMarkdown(String(node.attrs.href)));
          state.closeBlock(node);
        },
        parse: {
          // markdown-it renders a lone link as `<p><a href="…">`, and a bare address as `<p>words</p>`
          // (the story's Markdown is read without linkify); lift each one the reader draws as a card out of
          // its paragraph and mark it, so it parses as this block. Not a list item's line: an item opens
          // with a paragraph.
          updateDOM(element: HTMLElement) {
            for (const p of Array.from(element.querySelectorAll('p'))) {
              if (p.parentElement?.tagName === 'LI') continue;
              const href = soleCardAddress(p);
              if (!href) continue;
              const a = p.ownerDocument.createElement('a');
              a.setAttribute('href', href);
              a.setAttribute('data-link-card', '');
              a.textContent = href;
              p.replaceWith(a);
            }
          },
        },
      },
    };
  },
});

/** The slice of a markdown-it token the table rule reads and writes. */
interface MdToken {
  type: string;
  level: number;
  map: [number, number] | null;
  content: string;
  block: boolean;
  attrGet(name: string): string | null;
}

/** The slice of markdown-it (its core state, its rules, its renderer) the table rule uses. */
interface MdLike {
  core: {
    ruler: {
      after(after: string, name: string, fn: (state: { src: string; tokens: MdToken[]; Token: new (type: string, tag: string, nesting: number) => MdToken }) => void): void;
    };
  };
  renderer: { rules: Record<string, (tokens: MdToken[], idx: number) => string> };
  utils: { escapeHtml(text: string): string };
}

/** The markdown-it instances already reading tables as their source: tiptap-markdown runs every `setup` on every parse. */
const tableSourced = new WeakSet<object>();

/** A cell's alignment as markdown-it writes it (`style="text-align:…"`). */
function alignOf(token: MdToken): string {
  return /text-align:\s*(left|center|right)/.exec(token.attrGet('style') ?? '')?.[1] ?? '';
}

/**
 * A table written again from its tokens, for one whose lines can't be taken
 * as they are (inside a quote or a list, where each line carries its
 * container's marker): its rows, each cell's source (a pipe in it escaped
 * again), and the alignments of its delimiter row.
 */
function tableFromTokens(tokens: MdToken[]): string {
  const rows: string[][] = [];
  const aligns: string[] = [];
  let row: string[] | null = null;
  let head = false;
  for (const t of tokens) {
    if (t.type === 'thead_open') head = true;
    else if (t.type === 'thead_close') head = false;
    else if (t.type === 'tr_open') row = [];
    else if (t.type === 'tr_close') {
      if (row) rows.push(row);
      row = null;
    } else if (t.type === 'th_open' && head) aligns.push(alignOf(t));
    else if (t.type === 'inline' && row) row.push(t.content.replace(/\|/g, '\\|'));
  }
  const line = (cells: string[]) => `| ${cells.join(' | ')} |`;
  const delimiter = aligns.map((a) => (a === 'center' ? ':---:' : a === 'right' ? '---:' : a === 'left' ? ':---' : '---'));
  return [line(rows[0] ?? []), line(delimiter), ...rows.slice(1).map(line)].join('\n');
}

/**
 * markdown-it reads a GFM table as rows and cells; the story editor keeps it
 * as its Markdown instead (MarkdownTable): after the block rules, each table's
 * tokens become one `md_table` token holding its source — its own lines as
 * written when it stands at the top of the story, written again from its
 * cells inside a quote or a list — drawn as `<pre data-md-table>`.
 */
function readTablesAsSource(md: MdLike) {
  if (tableSourced.has(md)) return;
  tableSourced.add(md);
  md.core.ruler.after('block', 'md_table_source', (state) => {
    if (!state.tokens.some((t) => t.type === 'table_open')) return;
    const lines = state.src.split('\n');
    const out: MdToken[] = [];
    for (let i = 0; i < state.tokens.length; i++) {
      const open = state.tokens[i];
      if (open.type !== 'table_open') {
        out.push(open);
        continue;
      }
      let end = i + 1;
      for (let depth = 1; end < state.tokens.length; end++) {
        const type = state.tokens[end].type;
        if (type === 'table_open') depth++;
        else if (type === 'table_close' && --depth === 0) break;
      }
      const token = new state.Token('md_table', 'pre', 0);
      token.block = true;
      token.level = open.level;
      token.map = open.map;
      token.content =
        open.level === 0 && open.map
          ? lines.slice(open.map[0], open.map[1]).join('\n').replace(/\s+$/, '')
          : tableFromTokens(state.tokens.slice(i, end + 1));
      out.push(token);
      i = end;
    }
    state.tokens = out;
  });
  md.renderer.rules.md_table = (tokens, idx) => `<pre data-md-table>${md.utils.escapeHtml(tokens[idx].content)}</pre>\n`;
}

/**
 * How many cells a GFM delimiter row has (`| --- | :-: |`, its end pipes
 * optional, a colon at either end of a cell, spaces around), or null for a
 * line that is no delimiter row — markdown-it's rule, which reads the story
 * back: only `-`, `:`, `|` and spaces, at least one `-` in every cell, no
 * empty cell between two others, and no `-` then a space first (a list).
 */
export function delimiterCells(line: string): number | null {
  const text = line.trim();
  if (text.length < 2 || !/^[-:|][-:| \t]*$/.test(text) || /^-[ \t]/.test(text)) return null;
  const cells = text.split('|');
  let count = 0;
  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i].trim();
    if (!cell) {
      if (i === 0 || i === cells.length - 1) continue;
      return null;
    }
    if (!/^:?-+:?$/.test(cell)) return null;
    count++;
  }
  return count || null;
}

/** How many cells a GFM header row splits into — at each pipe not escaped, its end pipes optional — or 0 for a line with no pipe. */
export function headerCells(line: string): number {
  const text = line.trim();
  if (!text.includes('|')) return 0;
  const cells = [''];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '|' && text[i - 1] !== '\\') cells.push('');
    else cells[cells.length - 1] += text[i];
  }
  if (cells[0] === '') cells.shift();
  if (cells.length > 0 && cells[cells.length - 1] === '') cells.pop();
  return cells.length;
}

/** Whether a header line and a delimiter line open a GFM table: a pipe in the header, and as many cells in it as the delimiter row has. */
export function opensTable(header: string, delimiter: string): boolean {
  const cells = delimiterCells(delimiter);
  return cells != null && headerCells(header) === cells;
}

/**
 * A paragraph's lines (split at its line breaks), as plain text — its marks
 * dropped, a no-break space read as the space it was typed as — or null when
 * it holds anything but words and line breaks.
 */
function linesOf(paragraph: PMNode): string[] | null {
  const lines = [''];
  let plain = true;
  paragraph.forEach((child) => {
    if (child.isText) lines[lines.length - 1] += (child.text ?? '').replace(/\u00a0/g, ' ');
    else if (child.type.name === 'hardBreak') lines.push('');
    else plain = false;
  });
  return plain ? lines : null;
}

/**
 * A table typed by hand, as Enter at the end of its delimiter row finds it:
 * the header row the paragraph before (one line of words), or the line before
 * in the same paragraph (Shift+Enter between them, the delimiter row its last
 * line). What one table block replaces, and that block's source — both rows,
 * then the empty row the caret goes on to; null for anything else.
 */
function typedTable(state: EditorState, table: NodeType): { from: number; to: number; source: string } | null {
  const { $from, empty } = state.selection;
  const paragraph = $from.parent;
  if (!empty || paragraph.type.name !== 'paragraph' || $from.parentOffset !== paragraph.content.size) return null;
  const lines = linesOf(paragraph);
  if (!lines || lines.length > 2) return null;
  const container = $from.node($from.depth - 1);
  const index = $from.index($from.depth - 1);
  let header: string;
  let first = index;
  let from = $from.before();
  if (lines.length === 2) {
    header = lines[0];
  } else {
    const before = index > 0 ? container.child(index - 1) : null;
    const above = before?.type === paragraph.type ? linesOf(before) : null;
    if (!before || !above || above.length !== 1) return null;
    header = above[0];
    first = index - 1;
    from -= before.nodeSize;
  }
  const delimiter = lines[lines.length - 1];
  if (!opensTable(header, delimiter) || !container.canReplaceWith(first, index + 1, table)) return null;
  return { from, to: $from.after(), source: `${header.trim()}\n${delimiter.trim()}\n` };
}

/**
 * Whether the block after the one holding `$pos` is an empty paragraph that
 * ends their container: the line TrailingNode keeps after a story's last
 * block when that is a table, where the caret goes on leaving one (never a
 * second empty line beside it, which would be stored as a blank line).
 */
function restingLineBelow($pos: ResolvedPos): boolean {
  const container = $pos.node(-1);
  const last = container.lastChild;
  return $pos.indexAfter(-1) === container.childCount - 1 && last?.type.name === 'paragraph' && last.content.size === 0;
}

export interface MarkdownTableOptions {
  /** A word the writer's block wears (`data-label`, drawn by story.css) so it reads as a table the reader will draw, not code. */
  label?: string;
}

/**
 * A GFM table, held as its Markdown (round 8 §5.1): the editor shows the
 * source in the story's code type and writes it back exactly as it is — never
 * a grid to edit; the reader draws it as a table. It comes from a stored
 * story, a paste (markdown-it reads it, `readTablesAsSource` keeps its
 * lines), or a table typed by hand: Enter at the end of a delimiter row under
 * a header row turns the two into this block (typedTable), one undo step.
 * Inside it Enter starts a new row, and Enter on an empty last row (or the
 * down arrow at its end) leaves it for a paragraph — an empty line ends a GFM
 * table, so the block never holds one.
 */
export const MarkdownTable = Node.create<MarkdownTableOptions>({
  name: 'markdownTable',
  group: 'block',
  content: 'text*',
  marks: '',
  code: true,
  defining: true,

  addOptions() {
    return { label: undefined };
  },

  parseHTML() {
    return [{ tag: 'pre[data-md-table]', preserveWhitespace: 'full', priority: 60 }];
  },

  renderHTML() {
    const label = this.options.label;
    return ['pre', { 'data-md-table': '', class: 'story-md-table', spellcheck: 'false', ...(label ? { 'data-label': label } : {}) }, 0];
  },

  addKeyboardShortcuts() {
    return {
      Enter: ({ editor }) => {
        const { state, view } = editor;
        const { $from, empty } = state.selection;
        if (!empty) return false;
        if ($from.parent.type !== this.type) {
          const typed = typedTable(state, this.type);
          // Only what markdown-it reads back as a table, so the block is still one when the story is opened again.
          const parser = (editor.storage as { markdown?: { parser?: MarkdownParserLike } }).markdown?.parser;
          if (!typed || (parser && !/^<pre data-md-table/.test(parser.parse(typed.source)))) return false;
          const tr = state.tr.replaceWith(typed.from, typed.to, this.type.create(null, state.schema.text(typed.source)));
          tr.setSelection(TextSelection.create(tr.doc, typed.from + 1 + typed.source.length)).scrollIntoView();
          // One undo step of its own: the rows' typing before it and after it are other steps.
          view.dispatch(closeHistory(tr));
          view.dispatch(closeHistory(view.state.tr));
          return true;
        }
        const atEnd = $from.parentOffset === $from.parent.nodeSize - 2;
        if (!atEnd || !$from.parent.textContent.endsWith('\n')) return false;
        // The empty row goes, and the caret to the resting line below, else to a new paragraph.
        const resting = restingLineBelow($from);
        const after = $from.after();
        const chain = editor.chain().command(({ tr }) => {
          tr.delete($from.pos - 1, $from.pos);
          if (resting) tr.setSelection(Selection.near(tr.doc.resolve(tr.mapping.map(after)), 1)).scrollIntoView();
          return true;
        });
        return resting ? chain.run() : chain.exitCode().run();
      },
      ArrowDown: ({ editor }) => {
        const { state } = editor;
        const { $from, empty } = state.selection;
        if (!empty || $from.parent.type !== this.type || $from.parentOffset !== $from.parent.nodeSize - 2) return false;
        const after = $from.after();
        if (state.doc.nodeAt(after)) {
          return editor.commands.command(({ tr }) => {
            tr.setSelection(Selection.near(state.doc.resolve(after)));
            return true;
          });
        }
        return editor.commands.exitCode();
      },
      // Emptied, it becomes a paragraph again — or goes, the caret on the resting line below.
      Backspace: ({ editor }) => {
        const { $anchor, empty } = editor.state.selection;
        if (!empty || $anchor.parent.type !== this.type || $anchor.parent.textContent.length > 0) return false;
        if (!restingLineBelow($anchor)) return editor.commands.clearNodes();
        return editor.commands.command(({ tr }) => {
          tr.delete($anchor.before(), $anchor.after());
          tr.setSelection(Selection.near(tr.doc.resolve($anchor.before()), 1));
          return true;
        });
      },
    };
  },

  addStorage() {
    return {
      markdown: {
        serialize(state: MarkdownSerializerState, node: PMNode) {
          state.text(node.textContent, false);
          state.closeBlock(node);
        },
        parse: {
          setup(md: MdLike) {
            readTablesAsSource(md);
          },
        },
      },
    };
  },
});

/** What makes HTML say more than its plain text: a heading, a list, a quote, emphasis, a link, a picture, a table, code. */
const FORMATTING = 'h1,h2,h3,h4,h5,h6,strong,b,em,i,u,s,del,strike,a[href],img,ul,ol,li,blockquote,pre,code,table,hr,sub,sup,mark';

/**
 * Whether a clipboard's HTML carries no formatting of its own — only words,
 * paragraphs, line breaks and styled `div`s or `span`s: what a phone, a notes
 * app or a code editor puts beside the plain text it copied.
 */
export function htmlAddsNothing(html: string): boolean {
  return elementFromString(html).querySelector(FORMATTING) == null;
}

/** The signs of Markdown in plain text: a heading, a list, a quote, a fence, a rule, a table, emphasis, strikethrough, a link or picture, code. */
const MARKDOWN_SIGNS: readonly RegExp[] = [
  /^ {0,3}#{1,6}[ \t]+\S/m,
  /^ {0,3}(?:[-*+]|\d{1,9}[.)])[ \t]+\S/m,
  /^ {0,3}>/m,
  /^ {0,3}(?:```|~~~)/m,
  /^ {0,3}(?:[-*_][ \t]*){3,}$/m,
  /^ {0,3}\|?[^\n|]*\|[^\n]*\n {0,3}\|?[ \t]*:?-+:?[ \t]*(?:\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/m,
  /\*\*[^*\s][^*\n]*\*\*|__[^_\s][^_\n]*__/,
  /~~[^~\s][^~\n]*~~/,
  /!?\[[^\]\n]+\]\([^)\s]+\)/,
  /`[^`\n]+`/,
];

/** Whether plain text reads as Markdown (any one sign of it). */
export function readsAsMarkdown(text: string): boolean {
  return MARKDOWN_SIGNS.some((sign) => sign.test(text));
}

/** tiptap-markdown's parser, as it hangs on the editor's storage. */
type MarkdownParserLike = { parse(content: string, opts?: { inline?: boolean }): string };

/**
 * Markdown put in at the selection as its own formatting: words alone
 * (emphasis, a link) join the line they land in, as typed ones would; blocks
 * — a heading, a list, a table — stand on their own, the line split before
 * them, never merged into it (a table would turn to words).
 */
function insertMarkdown(view: EditorView, parser: MarkdownParserLike, text: string, uiEvent: string) {
  const { $from } = view.state.selection;
  const schema = PMDOMParser.fromSchema(view.state.schema);
  const blocks = elementFromString(parser.parse(text));
  const only = blocks.children.length === 1 ? blocks.firstElementChild : null;
  // A lone address is its card on a line of its own; into words already there it is a link among them.
  const words = only?.tagName === 'P' || (only?.matches('a[data-link-card]') === true && !emptyLine($from.parent));
  const slice = words
    ? schema.parseSlice(asWords(elementFromString(parser.parse(text, { inline: true }))), { preserveWhitespace: true, context: $from })
    : new Slice(schema.parse(blocks, { preserveWhitespace: true }).content, 0, 0);
  view.dispatch(view.state.tr.replaceSelection(slice).scrollIntoView().setMeta('paste', uiEvent === 'paste').setMeta('uiEvent', uiEvent));
}

/**
 * Markdown pasted becomes formatting wherever it is copied from (round 8 §4).
 * tiptap-markdown reads a paste with plain text alone as Markdown, but as an
 * open slice — its first block merged into the line it lands in — and a paste
 * that brings HTML too (what phones, notes apps and code editors put on the
 * clipboard) was taken as that HTML, its ## and ** left on the page as
 * characters. Here a paste whose text reads as Markdown, with no HTML or HTML
 * that says nothing the text doesn't (htmlAddsNothing), goes in as Markdown
 * (insertMarkdown); one whose HTML has formatting of its own keeps it, and
 * inside a code block or a table's source it stays text. Gboard's clipboard
 * chip types its clip in rather than pasting it (an `insertText` input of
 * several lines, each line break a new paragraph): such an input that reads
 * as Markdown goes in the same way, as its paste would have.
 */
export const MarkdownPaste = Extension.create({
  name: 'markdownPaste',

  addProseMirrorPlugins() {
    const editor = this.editor;
    const parserOf = () => (editor.storage as { markdown?: { parser?: MarkdownParserLike } }).markdown?.parser;
    return [
      new Plugin({
        key: new PluginKey('markdownPaste'),
        props: {
          handlePaste(view, event) {
            const text = event.clipboardData?.getData('text/plain');
            const html = event.clipboardData?.getData('text/html');
            if (!text || view.state.selection.$from.parent.type.spec.code) return false;
            if (!readsAsMarkdown(text) || (html && !htmlAddsNothing(html))) return false;
            const parser = parserOf();
            if (!parser) return false;
            insertMarkdown(view, parser, text, 'paste');
            return true;
          },
          handleDOMEvents: {
            beforeinput(view, event) {
              const input = event as InputEvent;
              const text = input.data;
              if (input.inputType !== 'insertText' || !input.cancelable || !text || !/\r?\n/.test(text)) return false;
              if (view.state.selection.$from.parent.type.spec.code || !readsAsMarkdown(text)) return false;
              const parser = parserOf();
              if (!parser) return false;
              input.preventDefault();
              insertMarkdown(view, parser, text.replace(/\r\n?/g, '\n'), 'paste');
              return true;
            },
          },
        },
      }),
    ];
  },
});

export interface StorySchemaNodes {
  paragraph?: AnyExtension;
  blockquote?: AnyExtension;
  image?: AnyExtension;
  cardEmbed?: AnyExtension;
  linkCard?: AnyExtension;
  markdownTable?: AnyExtension;
}

/**
 * Every extension that shapes the stored Markdown. Pass node-view variants of
 * the nodes to render them differently; their Markdown stays the base's.
 */
export function storyExtensions(nodes: StorySchemaNodes = {}): AnyExtension[] {
  return [
    StarterKit.configure({ blockquote: false, paragraph: false }),
    nodes.paragraph ?? SpacedParagraph,
    nodes.blockquote ?? Blockquote,
    nodes.image ?? BlockImage,
    nodes.cardEmbed ?? CardEmbed,
    nodes.linkCard ?? LinkCard,
    nodes.markdownTable ?? MarkdownTable,
    MarkdownPaste,
    Markdown.configure({ html: false, transformPastedText: true, transformCopiedText: true }),
  ];
}

/** tiptap-markdown augments `editor.storage` at runtime; read it through here. */
export function getMarkdown(editor: { storage: unknown }): string {
  return (editor.storage as { markdown: { getMarkdown: () => string } }).markdown.getMarkdown();
}
