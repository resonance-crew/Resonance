import { Extension, Node, elementFromString, type AnyExtension } from '@tiptap/core';
import Blockquote from '@tiptap/extension-blockquote';
import Image from '@tiptap/extension-image';
import Paragraph from '@tiptap/extension-paragraph';
import { DOMParser as PMDOMParser, Slice, type Node as PMNode } from '@tiptap/pm/model';
import { Plugin, PluginKey, Selection } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from 'tiptap-markdown';
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
 * A GFM table, held as its Markdown (round 8 §5.1): the editor shows the
 * source in the story's code type and writes it back exactly as it is — never
 * a grid to edit; the reader draws it as a table. It comes from a stored
 * story or a paste (markdown-it reads it, `readTablesAsSource` keeps its
 * lines); inside it Enter starts a new line, and two empty lines at its end
 * (or the down arrow there) leave it for a paragraph, as a code block's do.
 */
export const MarkdownTable = Node.create({
  name: 'markdownTable',
  group: 'block',
  content: 'text*',
  marks: '',
  code: true,
  defining: true,

  parseHTML() {
    return [{ tag: 'pre[data-md-table]', preserveWhitespace: 'full', priority: 60 }];
  },

  renderHTML() {
    return ['pre', { 'data-md-table': '', class: 'story-md-table', spellcheck: 'false' }, 0];
  },

  addKeyboardShortcuts() {
    return {
      Enter: ({ editor }) => {
        const { $from, empty } = editor.state.selection;
        if (!empty || $from.parent.type !== this.type) return false;
        const atEnd = $from.parentOffset === $from.parent.nodeSize - 2;
        if (!atEnd || !$from.parent.textContent.endsWith('\n\n')) return false;
        return editor
          .chain()
          .command(({ tr }) => {
            tr.delete($from.pos - 2, $from.pos);
            return true;
          })
          .exitCode()
          .run();
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
      // Emptied, it becomes a paragraph again.
      Backspace: ({ editor }) => {
        const { $anchor, empty } = editor.state.selection;
        if (!empty || $anchor.parent.type !== this.type || $anchor.parent.textContent.length > 0) return false;
        return editor.commands.clearNodes();
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
  const words = blocks.children.length === 1 && blocks.firstElementChild?.tagName === 'P';
  const slice = words
    ? schema.parseSlice(elementFromString(parser.parse(text, { inline: true })), { preserveWhitespace: true, context: $from })
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
    nodes.markdownTable ?? MarkdownTable,
    MarkdownPaste,
    Markdown.configure({ html: false, transformPastedText: true, transformCopiedText: true }),
  ];
}

/** tiptap-markdown augments `editor.storage` at runtime; read it through here. */
export function getMarkdown(editor: { storage: unknown }): string {
  return (editor.storage as { markdown: { getMarkdown: () => string } }).markdown.getMarkdown();
}
