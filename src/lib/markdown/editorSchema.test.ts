// @vitest-environment jsdom
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import { Slice } from '@tiptap/pm/model';
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
