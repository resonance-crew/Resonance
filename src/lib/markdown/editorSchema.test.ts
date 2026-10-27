// @vitest-environment jsdom
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import { elementFromString } from '@tiptap/core';
import { DOMParser as PMDOMParser, Slice } from '@tiptap/pm/model';
import { getMarkdown, htmlAddsNothing, MarkdownTable, opensTable, readsAsMarkdown, storyExtensions } from './editorSchema';

// The story editor's storage format, pinned. Every case in the corpus is
// loaded into the editor schema and written back; the result must equal the
// case's recorded canonical form, and writing the canonical form back must
// not change it again. The native apps' editor island asserts against the
// same file (native/fixtures/markdown-corpus.json), so web and native agree
// on exactly how a story is stored.
//
// After an intentional schema change, regenerate and review the diff:
//   UPDATE_MARKDOWN_CORPUS=1 npx vitest run src/lib/markdown/editorSchema.test.ts

const FIXTURES = resolve(__dirname, '../../../native/fixtures');

interface Case {
  id: string;
  markdown: string;
  canonical?: string;
}

function roundtrip(markdown: string): string {
  const editor = new Editor({ extensions: storyExtensions(), content: markdown });
  const out = getMarkdown(editor);
  editor.destroy();
  return out;
}

if (process.env.UPDATE_MARKDOWN_CORPUS) {
  const input = JSON.parse(readFileSync(resolve(FIXTURES, 'markdown-corpus.input.json'), 'utf8')) as { note: string; cases: Case[] };
  const cases = input.cases.map((c) => ({ ...c, canonical: roundtrip(c.markdown) }));
  writeFileSync(resolve(FIXTURES, 'markdown-corpus.json'), `${JSON.stringify({ note: input.note, cases }, null, 2)}\n`);
}

const corpus = JSON.parse(readFileSync(resolve(FIXTURES, 'markdown-corpus.json'), 'utf8')) as { cases: Required<Case>[] };

describe('story Markdown round trip', () => {
  it.each(corpus.cases.map((c) => [c.id, c] as const))('%s', (_id, c) => {
    const canonical = roundtrip(c.markdown);
    expect(canonical).toBe(c.canonical);
    expect(roundtrip(canonical)).toBe(canonical);
  });

  it('keeps the text of every case (normalization only touches syntax)', () => {
    const text = (md: string) => {
      const editor = new Editor({ extensions: storyExtensions(), content: md });
      // Block atoms (card embeds, images) carry their text in attributes.
      const parts: string[] = [];
      editor.state.doc.descendants((n) => {
        if (n.isText) parts.push(n.text ?? '');
        else if (n.type.name === 'cardEmbed') parts.push(String(n.attrs.title));
        else if (n.type.name === 'linkCard') parts.push(String(n.attrs.href));
        else if (n.type.name === 'image') parts.push(String(n.attrs.alt));
      });
      editor.destroy();
      return parts.join('').replace(/\s+/g, '');
    };
    for (const c of corpus.cases) expect(text(c.canonical), c.id).toBe(text(c.markdown));
  });

  it('embeds a card only when its link stands alone, as the reader does', () => {
    const blocks = (md: string) => {
      const editor = new Editor({ extensions: storyExtensions(), content: md });
      const out: string[] = [];
      editor.state.doc.forEach((n) => {
        out.push(n.type.name === 'paragraph' && n.firstChild?.marks.some((m) => m.type.name === 'link') ? 'paragraph>link' : n.type.name);
      });
      editor.destroy();
      return out;
    };
    expect(blocks('[一場雨後的散步](/card/a-walk)')).toEqual(['cardEmbed']);
    expect(blocks('前言\n\n  [一場雨後的散步](/card/a-walk)  \n\n結尾')).toEqual(['paragraph', 'cardEmbed', 'paragraph']);
    expect(blocks('[一場雨後的散步](/card/a-walk) 是我最喜歡的一張')).toEqual(['paragraph>link']);
    expect(blocks('[一篇文章](https://example.com)')).toEqual(['paragraph>link']);
  });
});

describe('a link standing alone, shown as its card', () => {
  /** Presses Enter through the editor's own keymaps, as a keyboard does. */
  const enter = (editor: Editor) =>
    !!editor.view.someProp('handleKeyDown', (f) => f(editor.view, new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })));

  /** The story's blocks, with what a quote holds, and its Markdown. */
  function read(md: string) {
    const editor = new Editor({ extensions: storyExtensions(), content: md });
    const blocks: string[] = [];
    editor.state.doc.descendants((n) => {
      if (n.type.name === 'linkCard') blocks.push(`card ${n.attrs.href}`);
      else if (n.type.name === 'paragraph') blocks.push(n.firstChild?.marks.some((m) => m.type.name === 'link') ? 'paragraph>link' : 'paragraph');
      return n.type.name !== 'paragraph';
    });
    const out = { blocks, markdown: getMarkdown(editor) };
    editor.destroy();
    return out;
  }

  it('is a card only when its words are its address, as the reader draws it', () => {
    expect(read('<https://example.com/rain>').blocks).toEqual(['card https://example.com/rain']);
    expect(read('[https://example.com/rain/](https://example.com/rain)').blocks).toEqual(['card https://example.com/rain']);
    expect(read('[www.example.com](https://www.example.com)').blocks).toEqual(['card https://www.example.com']);
    expect(read('https://example.com/rain').blocks).toEqual(['card https://example.com/rain']);
    expect(read('www.example.com/rain')).toEqual({ blocks: ['card https://www.example.com/rain'], markdown: '<https://www.example.com/rain>' });
    expect(read('> <https://example.com/rain>').blocks).toEqual(['card https://example.com/rain']);
    // Words of the writer's own, a sentence, our own pages, an IP address, a picture: a link as before.
    expect(read('[下雨天](https://example.com/rain)').blocks).toEqual(['paragraph>link']);
    expect(read('看 <https://example.com/rain> 這篇').blocks).toEqual(['paragraph']);
    expect(read('<https://resonance.channel/en/u/alice>').blocks).toEqual(['paragraph>link']);
    expect(read('<https://203.0.113.9/rain>').blocks).toEqual(['paragraph>link']);
    expect(read('[![雨](https://img.example.com/rain.png)](https://example.com/rain)').blocks.join()).not.toContain('card');
    expect(read('<mailto:a@example.com>').blocks).toEqual(['paragraph>link']);
  });

  it('takes no address a pasted page’s markup names that may not be a card', () => {
    const editor = new Editor({ extensions: storyExtensions(), content: '' });
    const html = '<a data-link-card href="javascript:alert(1)">x</a><a data-link-card href="https://203.0.113.9/">y</a><a data-link-card href="https://example.com/ok">z</a>';
    const doc = PMDOMParser.fromSchema(editor.schema).parse(elementFromString(html));
    const cards: string[] = [];
    doc.descendants((n) => void (n.type.name === 'linkCard' && cards.push(String(n.attrs.href))));
    expect(cards).toEqual(['https://example.com/ok']);
    editor.destroy();
  });

  it('comes from Enter at the end of a line that is one address — typed bare or already linked — the caret on a new line', () => {
    const address = 'https://example.com/rain';
    for (const marks of [[], [{ type: 'link', attrs: { href: address } }]]) {
      const editor = new Editor({ extensions: storyExtensions(), content: '前言\n\n結尾' });
      // A new line after 前言, the address typed on it.
      editor.commands.setTextSelection(editor.state.doc.child(0).nodeSize - 1);
      editor.commands.splitBlock();
      editor.commands.insertContent({ type: 'text', text: address, marks });
      expect(enter(editor)).toBe(true);
      const blocks: string[] = [];
      editor.state.doc.forEach((n) => blocks.push(n.type.name));
      expect(blocks).toEqual(['paragraph', 'linkCard', 'paragraph', 'paragraph']);
      expect(editor.state.selection.$from.index(0)).toBe(2);
      expect(getMarkdown(editor)).toBe(`前言\n\n<${address}>\n\n\u00a0\n\n結尾`);
      editor.destroy();
    }
  });

  it('leaves Enter after words that are not one address alone to the editor', () => {
    const editor = new Editor({ extensions: storyExtensions(), content: '看 https://example.com/rain' });
    editor.commands.setTextSelection(editor.state.doc.content.size - 1);
    editor.commands.keyboardShortcut('Enter');
    expect(editor.state.doc.childCount).toBe(2);
    editor.destroy();
  });

  it('leaves Enter after a link of the writer’s words, or mid-address, to the editor', () => {
    const cards = (editor: Editor) => {
      let n = 0;
      editor.state.doc.descendants((node) => void (node.type.name === 'linkCard' && n++));
      return n;
    };
    const editor = new Editor({ extensions: storyExtensions(), content: '[下雨天](https://example.com/rain)' });
    editor.commands.setTextSelection(editor.state.doc.content.size - 1);
    enter(editor);
    expect(cards(editor)).toBe(0);
    editor.commands.setContent('前言');
    editor.commands.setTextSelection(editor.state.doc.content.size - 1);
    editor.commands.splitBlock();
    editor.commands.insertContent({ type: 'text', text: 'https://example.com/rain' });
    editor.commands.setTextSelection(editor.state.doc.content.size - 4);
    enter(editor);
    expect(cards(editor)).toBe(0);
    editor.destroy();
  });

  it('comes from an address pasted onto an empty line; pasted into a sentence it is a link there', () => {
    const paste = (content: string, text: string) => {
      const editor = new Editor({ extensions: storyExtensions(), content });
      editor.commands.setTextSelection(editor.state.doc.content.size - 1);
      const event = { clipboardData: { getData: (type: string) => (type === 'text/plain' ? text : '') } } as unknown as ClipboardEvent;
      const handled = !!editor.view.someProp('handlePaste', (f) => f(editor.view, event, Slice.empty));
      const out = { handled, markdown: getMarkdown(editor) };
      editor.destroy();
      return out;
    };
    expect(paste('前言\n\n\u00a0', ' https://example.com/rain ')).toEqual({ handled: true, markdown: '前言\n\n<https://example.com/rain>' });
    expect(paste('', 'www.example.com')).toEqual({ handled: true, markdown: '<https://www.example.com>' });
    expect(paste('看', 'https://example.com/rain').handled).toBe(false);
    // Into words, the clipboard's text is read as a link there, never as a card cutting the line.
    const editor = new Editor({ extensions: storyExtensions(), content: '看這篇' });
    editor.commands.setTextSelection(2);
    const pasted = Object.assign(new Event('paste', { bubbles: true, cancelable: true }), {
      clipboardData: { getData: (type: string) => (type === 'text/plain' ? 'https://example.com/rain' : ''), files: [], types: ['text/plain'] },
    });
    editor.view.dom.dispatchEvent(pasted);
    expect(getMarkdown(editor)).toBe('看<https://example.com/rain>這篇');
    // Markdown of one lone address pasted into words: the same.
    editor.commands.setTextSelection(2);
    const event = { clipboardData: { getData: (type: string) => (type === 'text/plain' ? '[https://example.com/a](https://example.com/a)' : '') } } as unknown as ClipboardEvent;
    expect(editor.view.someProp('handlePaste', (f) => f(editor.view, event, Slice.empty))).toBe(true);
    expect(getMarkdown(editor)).toBe('看<https://example.com/a><https://example.com/rain>這篇');
    editor.destroy();
    expect(paste('', 'https://resonance.channel/en').handled).toBe(false);
    expect(paste('', '兩個 https://a.example https://b.example').handled).toBe(false);
  });
});

describe('a table, kept as its Markdown', () => {
  const blocks = (md: string) => {
    const editor = new Editor({ extensions: storyExtensions(), content: md });
    const out: { type: string; text: string }[] = [];
    editor.state.doc.forEach((n) => out.push({ type: n.type.name, text: n.textContent }));
    editor.destroy();
    return out;
  };

  it('is one block holding its source, never cells to edit', () => {
    const md = '| 名稱 | 數量 |\n| --- | ---: |\n| 蘋果 | 3 |';
    expect(blocks(`前言\n\n${md}\n\n結尾`)).toEqual([
      { type: 'paragraph', text: '前言' },
      { type: 'markdownTable', text: md },
      { type: 'paragraph', text: '結尾' },
    ]);
  });

  it('leaves its block on Enter twice at its end: a new row, then Enter on it', () => {
    const editor = new Editor({ extensions: storyExtensions(), content: '| a | b |\n| - | - |\n| 1 | 2 |' });
    editor.commands.setTextSelection(editor.state.doc.content.size - 1);
    // A new, empty row inside it; Enter there leaves it (an empty line ends a GFM table).
    for (let i = 0; i < 2; i++) editor.commands.keyboardShortcut('Enter');
    const blocks: [string, string][] = [];
    editor.state.doc.forEach((n) => blocks.push([n.type.name, n.textContent]));
    // The empty row goes with it: the table ends on its last row.
    expect(blocks).toEqual([
      ['markdownTable', '| a | b |\n| - | - |\n| 1 | 2 |'],
      ['paragraph', ''],
    ]);
    editor.destroy();
  });

  it('wears its label only when the writer gives it one', () => {
    const pre = (extensions = storyExtensions()) => {
      const editor = new Editor({ extensions, content: '| a |\n| - |' });
      const el = editor.view.dom.querySelector('pre[data-md-table]');
      const out = { label: el?.getAttribute('data-label') ?? null, markdown: getMarkdown(editor) };
      editor.destroy();
      return out;
    };
    expect(pre()).toEqual({ label: null, markdown: '| a |\n| - |' });
    // The label is the writer's alone: the stored Markdown is the same.
    expect(pre(storyExtensions({ markdownTable: MarkdownTable.configure({ label: '表格' }) }))).toEqual({ label: '表格', markdown: '| a |\n| - |' });
  });
});

describe('a table typed by hand', () => {
  const mod = /Mac|iP(hone|[oa]d)/.test(navigator.platform) ? { metaKey: true } : { ctrlKey: true };

  /** An editor holding `content`, the caret at its end. */
  function editorWith(content = '') {
    const editor = new Editor({ extensions: storyExtensions(), content });
    editor.commands.setTextSelection(editor.state.doc.content.size - 1);
    return editor;
  }
  /** Types as a keyboard does: each character through the input rules, else into the text. */
  function type(editor: Editor, text: string) {
    for (const ch of text) {
      const { from, to } = editor.state.selection;
      const view = editor.view;
      if (!view.someProp('handleTextInput', (f) => f(view, from, to, ch, () => view.state.tr.insertText(ch, from, to)))) {
        view.dispatch(view.state.tr.insertText(ch, from, to));
      }
    }
  }
  /** Presses a key through the editor's own keymaps, as a keyboard does. */
  function press(editor: Editor, key: string, modifiers: KeyboardEventInit = {}) {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...modifiers });
    return !!editor.view.someProp('handleKeyDown', (f) => f(editor.view, event));
  }
  function blocks(editor: Editor) {
    const out: [string, string][] = [];
    editor.state.doc.forEach((n) => out.push([n.type.name, n.textContent]));
    return out;
  }
  /** The empty line TrailingNode keeps after a story's last block when that is no paragraph. */
  const REST: [string, string] = ['paragraph', ''];
  /** The block the caret is in, and whether it is at that block's end. */
  function caret(editor: Editor) {
    const { $from } = editor.state.selection;
    return { in: $from.parent.type.name, atEnd: $from.parentOffset === $from.parent.content.size };
  }
  /** How the reader (react-markdown with GFM) draws a story: its blocks' tags. */
  function readerBlocks(markdown: string) {
    const html = renderToStaticMarkup(createElement(Markdown, { remarkPlugins: [remarkGfm] }, markdown));
    return Array.from(new DOMParser().parseFromString(html, 'text/html').body.children, (el) => el.tagName.toLowerCase());
  }

  it('becomes one table block on Enter after its delimiter row, the caret on its new, empty row', () => {
    const editor = editorWith();
    type(editor, '| 地點 | 時間 |');
    press(editor, 'Enter');
    type(editor, '| --- | --- |');
    press(editor, 'Enter');
    expect(blocks(editor)).toEqual([['markdownTable', '| 地點 | 時間 |\n| --- | --- |\n'], REST]);
    expect(caret(editor)).toEqual({ in: 'markdownTable', atEnd: true });

    // Its rows are typed inside it; Enter on the empty row after the last leaves it, for the line below.
    type(editor, '| 台北 | 六點 |');
    press(editor, 'Enter');
    press(editor, 'Enter');
    expect(blocks(editor)).toEqual([['markdownTable', '| 地點 | 時間 |\n| --- | --- |\n| 台北 | 六點 |'], REST]);
    expect(caret(editor)).toEqual({ in: 'paragraph', atEnd: true });
    type(editor, '那天的雨。');
    expect(blocks(editor)).toEqual([
      ['markdownTable', '| 地點 | 時間 |\n| --- | --- |\n| 台北 | 六點 |'],
      ['paragraph', '那天的雨。'],
    ]);
    const markdown = getMarkdown(editor);
    expect(markdown).toBe('| 地點 | 時間 |\n| --- | --- |\n| 台北 | 六點 |\n\n那天的雨。');
    expect(readerBlocks(markdown)).toEqual(['table', 'p']);
    editor.destroy();
  });

  it('becomes one too when a line break (Shift+Enter) parts its header from its delimiter row', () => {
    const editor = editorWith('前言');
    press(editor, 'Enter');
    type(editor, '名稱 | 數量');
    press(editor, 'Enter', { shiftKey: true });
    type(editor, ':--- | ---:');
    expect(blocks(editor)).toEqual([
      ['paragraph', '前言'],
      ['paragraph', '名稱 | 數量:--- | ---:'],
    ]);
    press(editor, 'Enter');
    expect(blocks(editor)).toEqual([['paragraph', '前言'], ['markdownTable', '名稱 | 數量\n:--- | ---:\n'], REST]);
    expect(caret(editor)).toEqual({ in: 'markdownTable', atEnd: true });
    editor.destroy();
  });

  it('stays words when the rows are not a table’s header and delimiter', () => {
    /** Types each line as a paragraph of its own (Enter after each, the last one's Enter the one asked about). */
    const typed = (lines: string[], content = '') => {
      const editor = editorWith(content);
      for (const line of lines) {
        type(editor, line);
        press(editor, 'Enter');
      }
      const out = blocks(editor);
      editor.destroy();
      return out;
    };
    // The header has more cells than the delimiter row.
    expect(typed(['| a | b | c |', '| --- | --- |'])).toEqual([
      ['paragraph', '| a | b | c |'],
      ['paragraph', '| --- | --- |'],
      ['paragraph', ''],
    ]);
    // A delimiter row with no header row before it.
    expect(typed(['| --- | --- |'])).toEqual([
      ['paragraph', '| --- | --- |'],
      ['paragraph', ''],
    ]);
    // A header without a pipe, or a delimiter row that isn't one.
    expect(typed(['地點 時間', '| --- |']).map(([t]) => t)).toEqual(['paragraph', 'paragraph', 'paragraph']);
    expect(typed(['| a | b |', '| --- | -x- |']).map(([t]) => t)).toEqual(['paragraph', 'paragraph', 'paragraph']);
    // A header of two lines (a line break inside it).
    const editor = editorWith();
    type(editor, '前言');
    press(editor, 'Enter', { shiftKey: true });
    type(editor, '| a | b |');
    press(editor, 'Enter');
    type(editor, '| - | - |');
    press(editor, 'Enter');
    expect(blocks(editor).map(([t]) => t)).toEqual(['paragraph', 'paragraph', 'paragraph']);
    editor.destroy();
    // Inside a code block it is code.
    const code = editorWith('```\n| a | b |\n| - | - |\n```');
    press(code, 'Enter');
    expect(blocks(code)).toEqual([['codeBlock', '| a | b |\n| - | - |\n'], REST]);
    code.destroy();
    // Enter inside the delimiter row, not at its end, splits the line as ever.
    const middle = editorWith('| a | b |\n\n| - | - |');
    middle.commands.setTextSelection(middle.state.doc.content.size - 3);
    press(middle, 'Enter');
    expect(blocks(middle).map(([t]) => t)).toEqual(['paragraph', 'paragraph', 'paragraph']);
    middle.destroy();
  });

  it('comes undone in one step (Mod-z) back to the two rows as typed', () => {
    const editor = editorWith();
    type(editor, '| a | b |');
    press(editor, 'Enter');
    type(editor, '|:-|-:|');
    press(editor, 'Enter');
    expect(blocks(editor)).toEqual([['markdownTable', '| a | b |\n|:-|-:|\n'], REST]);
    press(editor, 'z', mod);
    expect(blocks(editor)).toEqual([
      ['paragraph', '| a | b |'],
      ['paragraph', '|:-|-:|'],
    ]);
    expect(caret(editor)).toEqual({ in: 'paragraph', atEnd: true });
    editor.destroy();
  });

  it('becomes a paragraph again on Backspace once emptied', () => {
    const editor = editorWith();
    type(editor, '| a |');
    press(editor, 'Enter');
    type(editor, '| - |');
    press(editor, 'Enter');
    expect(blocks(editor)).toEqual([['markdownTable', '| a |\n| - |\n'], REST]);
    // Emptied (the browser deletes characters itself), then one more Backspace at its start:
    // the block goes, the caret on the line below — one empty line, never two.
    editor.view.dispatch(editor.state.tr.delete(1, editor.state.selection.from));
    expect(blocks(editor)).toEqual([['markdownTable', ''], REST]);
    expect(press(editor, 'Backspace')).toBe(true);
    expect(blocks(editor)).toEqual([REST]);
    expect(caret(editor)).toEqual({ in: 'paragraph', atEnd: true });
    // Mid-story, an emptied one becomes a paragraph where it stood.
    const mid = editorWith('前言\n\n| a |\n| - |\n\n結尾');
    let start = 0;
    mid.state.doc.forEach((n, pos) => {
      if (n.type.name === 'markdownTable') start = pos + 1;
    });
    mid.view.dispatch(mid.state.tr.delete(start, start + '| a |\n| - |'.length));
    mid.commands.setTextSelection(start);
    press(mid, 'Backspace');
    expect(blocks(mid)).toEqual([['paragraph', '前言'], ['paragraph', ''], ['paragraph', '結尾']]);
    mid.destroy();
    editor.destroy();
  });

  // Round 9 §7: Enter while an input method is composing (zh-TW Zhuyin, Pinyin) picks a candidate, and is
  // never the writer's Enter — not the conversion, not leaving the block. ProseMirror's own keydown handler
  // guards it (`inOrNearComposition`): nothing reaches a keymap while a composition is open (Chrome and
  // Firefox send that Enter with isComposing, keyCode 229, before compositionend), nor Safari's keyCode
  // 229 Enter just after compositionend (once, within 500 ms). These events go through the editor's DOM, as
  // a keyboard's do (jsdom's navigator.vendor is Apple's, so ProseMirror reads it as Safari, as WKWebView is).
  describe('while an input method is composing', () => {
    let clock = 1_000_000;
    const realNow = Date.now;
    function key(editor: Editor, init: KeyboardEventInit & { keyCode?: number }) {
      editor.view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true, ...init }));
    }
    function compose(editor: Editor, phase: 'compositionstart' | 'compositionend') {
      editor.view.dom.dispatchEvent(new CompositionEvent(phase, { bubbles: true, data: '時間' }));
    }
    /** A header row, then its delimiter row typed as the paragraph after it, the caret at its end. */
    function rowsTyped() {
      const editor = editorWith();
      type(editor, '| 地點 | 時間 |');
      press(editor, 'Enter');
      type(editor, '| --- | --- |');
      return editor;
    }
    const AS_TYPED: [string, string][] = [
      ['paragraph', '| 地點 | 時間 |'],
      ['paragraph', '| --- | --- |'],
    ];

    it('never turns the rows into a table on the Enter that picks a candidate (isComposing, keyCode 229)', () => {
      Date.now = () => clock;
      try {
        const editor = rowsTyped();
        compose(editor, 'compositionstart');
        key(editor, { isComposing: true, keyCode: 229 });
        expect(blocks(editor)).toEqual(AS_TYPED);
        compose(editor, 'compositionend');
        // Long after, the writer's own Enter is the conversion, as ever.
        clock += 1000;
        key(editor, { keyCode: 13 });
        expect(blocks(editor)).toEqual([['markdownTable', '| 地點 | 時間 |\n| --- | --- |\n'], REST]);
        editor.destroy();
      } finally {
        Date.now = realNow;
      }
    });

    it("never turns them into one on Safari's keyCode 229 Enter just after the composition ends", () => {
      Date.now = () => clock;
      try {
        const editor = rowsTyped();
        compose(editor, 'compositionstart');
        compose(editor, 'compositionend');
        clock += 30;
        key(editor, { keyCode: 229 });
        expect(blocks(editor)).toEqual(AS_TYPED);
        clock += 1000;
        key(editor, { keyCode: 13 });
        expect(blocks(editor).map(([t]) => t)).toEqual(['markdownTable', 'paragraph']);
        editor.destroy();
      } finally {
        Date.now = realNow;
      }
    });

    it('never leaves the block from its empty last row while composing', () => {
      Date.now = () => clock;
      try {
        const editor = rowsTyped();
        key(editor, { keyCode: 13 });
        expect(blocks(editor)).toEqual([['markdownTable', '| 地點 | 時間 |\n| --- | --- |\n'], REST]);
        compose(editor, 'compositionstart');
        key(editor, { isComposing: true, keyCode: 229 });
        expect(blocks(editor)).toEqual([['markdownTable', '| 地點 | 時間 |\n| --- | --- |\n'], REST]);
        expect(caret(editor)).toEqual({ in: 'markdownTable', atEnd: true });
        compose(editor, 'compositionend');
        clock += 1000;
        key(editor, { keyCode: 13 });
        expect(blocks(editor)).toEqual([['markdownTable', '| 地點 | 時間 |\n| --- | --- |'], REST]);
        expect(caret(editor)).toEqual({ in: 'paragraph', atEnd: true });
        editor.destroy();
      } finally {
        Date.now = realNow;
      }
    });
  });

  it('reads a header and a delimiter row as markdown-it does, which reads the story back', () => {
    const editor = new Editor({ extensions: storyExtensions() });
    const parser = (editor.storage as unknown as { markdown: { parser: { parse(md: string): string } } }).markdown.parser;
    const pairs: [string, string][] = [
      ['| a | b |', '| --- | --- |'],
      ['a | b', '--- | ---'],
      ['| a |', '|-|'],
      ['| a |', '| :-: |'],
      ['a \\| b | c', '- | -'],
      ['a \\| b | c', '-- | --'],
      ['| a | b |', '| --- |'],
      ['| a | b |', '| --- || --- |'],
      ['a', '---'],
      ['|', '|-|'],
      ['| a | b |', '| ---  ---: |'],
      ['| a | b |', '|---|---|  '],
      ['| a | b |', '| -- | -:- |'],
    ];
    for (const [header, delimiter] of pairs) {
      const read = /^<pre data-md-table/.test(parser.parse(`${header}\n${delimiter}`));
      expect(opensTable(header, delimiter), `${header} / ${delimiter}`).toBe(read);
    }
    editor.destroy();
  });
});

describe('Markdown pasted', () => {
  /** Pastes as a browser would, with the clipboard's plain text and (optionally) its HTML. */
  function paste(content: string, clip: { text: string; html?: string }) {
    const editor = new Editor({ extensions: storyExtensions(), content });
    editor.commands.setTextSelection(editor.state.doc.content.size - 1);
    const event = {
      clipboardData: { getData: (type: string) => (type === 'text/plain' ? clip.text : type === 'text/html' ? (clip.html ?? '') : '') },
    } as unknown as ClipboardEvent;
    const handled = editor.view.someProp('handlePaste', (f) => f(editor.view, event, Slice.empty));
    const out = { handled: !!handled, markdown: getMarkdown(editor) };
    editor.destroy();
    return out;
  }
  const text = '## 那天\n\n- 第一件事\n- 第二件事\n\n**真的**很好';

  it('becomes formatting when the HTML beside it only wraps the same words (phones, notes apps, code editors)', () => {
    const html = `<meta charset="utf-8"><div><span style="color:#ccc">## 那天</span></div><div><br></div><div><span>- 第一件事</span></div><div><span>- 第二件事</span></div><div><br></div><div><span>**真的**很好</span></div>`;
    const out = paste('', { text, html });
    expect(out.handled).toBe(true);
    expect(out.markdown).toBe('## 那天\n\n- 第一件事\n- 第二件事\n\n**真的**很好');
  });

  it('splits the line it lands at the end of: the words before it stay theirs, the pasted blocks follow', () => {
    const out = paste('雨剛停，我慢慢走回家。', { text: '## 那天\n\n- 一\n- 二', html: '<div><span>## 那天</span></div>' });
    expect(out.handled).toBe(true);
    expect(out.markdown).toBe('雨剛停，我慢慢走回家。\n\n## 那天\n\n- 一\n- 二');
    const table = '| 地點 | 時間 |\n|:-----|-----:|\n| 台北 | 傍晚 |';
    expect(paste('雨剛停。', { text: table, html: `<div>${table}</div>` }).markdown).toBe(`雨剛停。\n\n${table}`);
    // Words alone join the line, as typed ones would.
    expect(paste('那天', { text: '**真的**很好', html: '<span>**真的**很好</span>' }).markdown).toBe('那天**真的**很好');
  });

  // A paste with plain text alone (a paste key, a long-press 貼上) was tiptap-markdown's: an open slice, its first
  // block merged into the line — a heading lost its ##, a table became words.
  it('puts plain text alone in as Markdown too, its blocks standing on their own', () => {
    const out = paste('雨剛停。', { text: '## 那天\n\n- 一\n- 二' });
    expect(out.handled).toBe(true);
    expect(out.markdown).toBe('雨剛停。\n\n## 那天\n\n- 一\n- 二');
    const table = '| 地點 | 時間 |\n| --- | --- |\n| 台北 | 傍晚 |';
    expect(paste('前言', { text: table }).markdown).toBe(`前言\n\n${table}`);
    // Words that read as no Markdown are left to the paste as it was.
    expect(paste('前言', { text: '只是兩行\n字而已' }).handled).toBe(false);
  });

  // Gboard's clipboard chip types its clip in (an insertText input) rather than pasting it.
  it('reads a typed run of lines that reads as Markdown as Markdown, as its paste would be', () => {
    const editor = new Editor({ extensions: storyExtensions(), content: '雨剛停。' });
    editor.commands.setTextSelection(editor.state.doc.content.size - 1);
    const typed = (data: string) => {
      const event = new InputEvent('beforeinput', { inputType: 'insertText', data, cancelable: true, bubbles: true });
      editor.view.dom.dispatchEvent(event);
      return event.defaultPrevented;
    };
    expect(typed('## 那天\n\n| a | b |\n| - | - |\n| 1 | 2 |')).toBe(true);
    expect(getMarkdown(editor)).toBe('雨剛停。\n\n## 那天\n\n| a | b |\n| - | - |\n| 1 | 2 |');
    // One line, or lines that read as no Markdown: typing as ever.
    expect(typed('**一行**')).toBe(false);
    expect(typed('兩行\n普通的字')).toBe(false);
    editor.destroy();
  });

  it('keeps a table pasted that way exactly as it was written', () => {
    const table = '| 地點 | 時間 |\n|:-----|-----:|\n| 台北 | 早上 |';
    const out = paste('', { text: table, html: `<pre style="font-family:monospace">${table}</pre>`.replace('<pre', '<div').replace('</pre>', '</div>') });
    expect(out.handled).toBe(true);
    expect(out.markdown).toBe(table);
  });

  it('leaves a paste whose HTML has formatting of its own to the HTML', () => {
    expect(paste('', { text, html: '<h2>那天</h2><ul><li>第一件事</li></ul>' }).handled).toBe(false);
    expect(paste('', { text: '**真的**', html: '<b>真的</b>' }).handled).toBe(false);
  });

  it('leaves plain words, and a paste into code, as they are', () => {
    expect(paste('', { text: '只是一段話', html: '<span>只是一段話</span>' }).handled).toBe(false);
    expect(paste('```\ncode\n```', { text: '## not a heading', html: '<span>## not a heading</span>' }).handled).toBe(false);
  });

  it('reads the signs of Markdown, and only them', () => {
    for (const md of ['# 標題', '1. 一', '> 引言', '```\nx\n```', '---', '| a | b |\n| - | - |', '這是**粗體**', '~~刪~~', '[連結](https://a.b)', '`code`']) {
      expect(readsAsMarkdown(md), md).toBe(true);
    }
    for (const plain of ['今天下雨了', '5 * 3 = 15', '#標籤', 'a|b']) expect(readsAsMarkdown(plain), plain).toBe(false);
    expect(htmlAddsNothing('<div><span style="font-weight:700">x</span><br></div>')).toBe(true);
    expect(htmlAddsNothing('<p>x <a href="https://a.b">y</a></p>')).toBe(false);
  });
});
