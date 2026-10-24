// @vitest-environment jsdom
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import { Slice } from '@tiptap/pm/model';
import { getMarkdown, htmlAddsNothing, readsAsMarkdown, storyExtensions } from './editorSchema';

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

  it('leaves its block on Enter twice at its end, as a code block does', () => {
    const editor = new Editor({ extensions: storyExtensions(), content: '| a | b |\n| - | - |\n| 1 | 2 |' });
    editor.commands.setTextSelection(editor.state.doc.content.size - 1);
    // Two new lines inside it, then the third Enter leaves it.
    for (let i = 0; i < 3; i++) editor.commands.keyboardShortcut('Enter');
    const blocks: [string, string][] = [];
    editor.state.doc.forEach((n) => blocks.push([n.type.name, n.textContent]));
    // The two empty lines go with it: the table ends on its last row.
    expect(blocks).toEqual([
      ['markdownTable', '| a | b |\n| - | - |\n| 1 | 2 |'],
      ['paragraph', ''],
    ]);
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
