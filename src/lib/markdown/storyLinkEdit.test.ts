// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import { NodeSelection, TextSelection } from '@tiptap/pm/state';
import { getMarkdown, storyExtensions } from './editorSchema';
import { applyStoryLink, canCard, removeStoryLink, storyLinkState } from './storyLinkEdit';

// The writer's link tool, as the web's link editor and the apps' island run
// it (round 16 §6): what it reads off the selection, and what 完成 / 移除連結
// leave in the stored Markdown.

let editor: Editor;
afterEach(() => editor?.destroy());

function open(md: string) {
  editor = new Editor({ extensions: storyExtensions(), content: md });
  return editor;
}

/** Selects the first occurrence of `words` (or puts the caret `at` characters into it). */
function select(words: string, at?: number) {
  let found = -1;
  editor.state.doc.descendants((node, pos) => {
    if (found >= 0 || !node.isText) return;
    const i = node.text!.indexOf(words);
    if (i >= 0) found = pos + i;
  });
  if (found < 0) throw new Error(`no “${words}”`);
  const sel = at == null ? TextSelection.create(editor.state.doc, found, found + words.length) : TextSelection.create(editor.state.doc, found + at);
  editor.view.dispatch(editor.state.tr.setSelection(sel));
}

/** Puts the caret on the paragraph at `index` (top level). */
function caretOnBlock(index: number) {
  let pos = 0;
  for (let i = 0; i < index; i++) pos += editor.state.doc.child(i).nodeSize;
  editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, pos + 1)));
}

/** Picks the block at `index` (top level) as a whole. */
function pickBlock(index: number) {
  let pos = 0;
  for (let i = 0; i < index; i++) pos += editor.state.doc.child(i).nodeSize;
  editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, pos)));
}

const md = () => getMarkdown(editor);

describe('what the link editor reads off the selection', () => {
  it('finds no link where there is none, and the caret’s link where there is one', () => {
    open('看 [這篇文章](https://example.com/rain) 吧');
    select('看', 0);
    expect(storyLinkState(editor.state)).toBeNull();
    select('這篇', 1);
    expect(storyLinkState(editor.state)).toEqual({ href: 'https://example.com/rain', display: 'text', standalone: false, words: '這篇文章' });
  });

  it('reads a picked card, and a lone link of the writer’s words as words standing alone', () => {
    open('前言\n\n<https://example.com/rain>\n\n[下雨天](https://example.com/rain)');
    pickBlock(1);
    expect(storyLinkState(editor.state)).toEqual({ href: 'https://example.com/rain', display: 'card', standalone: true, words: 'https://example.com/rain' });
    select('下雨', 1);
    expect(storyLinkState(editor.state)).toMatchObject({ display: 'text', standalone: true, words: '下雨天' });
  });

  it('offers 卡片 on an empty line, a whole line, a picked card — never inside a sentence or as a list item’s line', () => {
    open('第一段\n\n \n\n第三段有很多字\n\n- 項目');
    // A kept blank line (its no-break space) is an empty line.
    caretOnBlock(1);
    expect(canCard(editor.state)).toBe(true);
    select('第三段有很多字');
    expect(canCard(editor.state)).toBe(true);
    select('很多');
    expect(canCard(editor.state)).toBe(false);
    select('項目');
    expect(canCard(editor.state)).toBe(false);
  });
});

describe('完成', () => {
  it('turns an empty line into the address’s card, the caret on the line after it', () => {
    open('前言\n\n \n\n結尾');
    caretOnBlock(1);
    expect(applyStoryLink(editor, 'example.com/rain', 'card')).toBe(true);
    expect(md()).toBe('前言\n\n<https://example.com/rain>\n\n結尾');
    expect(editor.state.selection.$from.parent.textContent).toBe('結尾');
  });

  it('links selected words as those words', () => {
    open('看這篇文章吧');
    select('這篇文章');
    expect(applyStoryLink(editor, 'https://example.com/rain', 'text')).toBe(true);
    expect(md()).toBe('看[這篇文章](https://example.com/rain)吧');
  });

  it('words a link put on an empty line with its host and path — never the address — and selects them', () => {
    open('前言\n\n \n\n結尾');
    caretOnBlock(1);
    expect(applyStoryLink(editor, 'https://www.example.com/rain?x=1', 'text')).toBe(true);
    expect(md()).toBe('前言\n\n[example.com/rain](https://www.example.com/rain?x=1)\n\n結尾');
    const { from, to } = editor.state.selection;
    expect(editor.state.doc.textBetween(from, to)).toBe('example.com/rain');
  });

  it('takes a card to words and back: 文字 words it, 卡片 makes its words the address', () => {
    open('<https://example.com/rain>');
    pickBlock(0);
    expect(applyStoryLink(editor, 'https://example.com/rain', 'text')).toBe(true);
    expect(md()).toBe('[example.com/rain](https://example.com/rain)');
    expect(storyLinkState(editor.state)).toMatchObject({ display: 'text', standalone: true });
    expect(canCard(editor.state)).toBe(true);
    expect(applyStoryLink(editor, 'https://example.com/rain', 'card')).toBe(true);
    expect(md()).toBe('<https://example.com/rain>');
  });

  it('turns a whole line of the writer’s words into a card, the words giving way to the address', () => {
    open('下雨天\n\n結尾');
    select('下雨天');
    expect(applyStoryLink(editor, 'https://example.com/rain', 'card')).toBe(true);
    expect(md()).toBe('<https://example.com/rain>\n\n結尾');
  });

  it('changes the caret’s link: its address, and words that were the old address', () => {
    open('看 [這篇文章](https://example.com/a) 與 <https://example.com/b> 吧');
    select('這篇', 1);
    applyStoryLink(editor, 'https://example.com/c', 'text');
    select('https://example.com/b', 3);
    applyStoryLink(editor, 'https://example.com/d', 'text');
    expect(md()).toBe('看 [這篇文章](https://example.com/c) 與 [example.com/d](https://example.com/d) 吧');
  });

  it('refuses what we don’t link to, changing nothing', () => {
    open('看這篇文章吧');
    select('這篇文章');
    for (const bad of ['javascript:alert(1)', 'data:text/html,hi', 'mailto:a@b.co', 'https://user@example.com', 'localhost:3000', '  ']) {
      expect(applyStoryLink(editor, bad, 'text'), bad).toBe(false);
    }
    expect(md()).toBe('看這篇文章吧');
  });

  it('refuses 卡片 where no card can stand, and words an address that may not be a card', () => {
    open('看這篇文章吧\n\n ');
    select('這篇');
    expect(applyStoryLink(editor, 'https://example.com', 'card')).toBe(false);
    caretOnBlock(1);
    expect(applyStoryLink(editor, 'https://resonance.channel/en/u/alice', 'card')).toBe(true);
    expect(md()).toBe('看這篇文章吧\n\n[resonance.channel/en/u/alice](https://resonance.channel/en/u/alice)');
  });
});

describe('移除連結', () => {
  it('takes a card away, and a link’s address off its words', () => {
    open('前言\n\n<https://example.com/rain>\n\n看[這篇](https://example.com/a)吧');
    pickBlock(1);
    expect(removeStoryLink(editor)).toBe(true);
    select('這篇', 1);
    expect(removeStoryLink(editor)).toBe(true);
    expect(md()).toBe('前言\n\n看這篇吧');
    select('前言', 1);
    expect(removeStoryLink(editor)).toBe(false);
  });
});
