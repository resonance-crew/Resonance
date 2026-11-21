// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createElement, type ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import type { Element, Root, Text } from 'hast';
import { renderWithIntl } from '@/../test/render';
import { StoryMarkdown, StoryPassagesContext } from '@/components/molecules/CardDetail/StoryMarkdown';
import { PASSAGE_CLASS, PASSAGE_GLUE_CLASS, rehypePassageMarks, type PassageMarkInput } from './rehypePassageMarks';

// Round 29 §U2 / §S1.2: the author's picked sentences in their own story — the marks the wash is laid under, cut at
// every element's edge, and (in the line) the faces' slot glued to the sentence's last character. Run on the shared
// cases file (test/vectors/passageMarks.json) as each leaf the renderer draws, then on real stories through the
// card page's renderer (StoryMarkdown).

interface Case {
  name: string;
  leaf?: string;
  leaves?: string[];
  sentence: string;
  expect: { start: number; end: number; leaf?: number } | null;
}
const vectors = JSON.parse(readFileSync(resolve(__dirname, '../../../test/vectors/passageMarks.json'), 'utf8')) as { cases: Case[] };

const text = (value: string): Text => ({ type: 'text', value });
const p = (...children: Element['children']): Element => ({ type: 'element', tagName: 'p', properties: {}, children });
const plain = (n: Element | Text | Root): string => (n.type === 'text' ? n.value : (n.children as (Element | Text)[]).map(plain).join(''));

function marks(tree: Root | Element, out: Element[] = []): Element[] {
  for (const c of tree.children) {
    if (c.type !== 'element') continue;
    if (c.tagName === 'mark') out.push(c);
    marks(c, out);
  }
  return out;
}

describe('rehypePassageMarks: the shared cases', () => {
  it.each(vectors.cases.map((c) => [c.name, c] as const))('%s', (_, c) => {
    const leaves = c.leaves ?? [c.leaf!];
    const tree: Root = { type: 'root', children: leaves.map((l) => p(text(l))) };
    rehypePassageMarks({ passages: [{ id: 'aa11bb22', text: c.sentence }] })(tree);
    const found = marks(tree);
    if (!c.expect) {
      expect(found).toHaveLength(0);
      return;
    }
    const leaf = leaves[c.expect.leaf ?? 0];
    expect(found.map(plain).join('')).toBe(leaf.slice(c.expect.start, c.expect.end));
    // Nothing moves: every leaf still says exactly what it said.
    expect(tree.children.map((n) => plain(n as Element))).toEqual(leaves);
    for (const m of found) expect(m.properties).toEqual({ className: [PASSAGE_CLASS], dataPassage: 'aa11bb22' });
  });
});

const ZH = '箱子堆滿了客廳，**我坐在地上，第一次覺得**安靜是屬於自己的。窗外有人在慢慢地收衣服。\n\n> 夜裡很靜。\n\n第二段，[一盞燈](https://example.com/lamp)亮了起來。';
const PICKS: PassageMarkInput[] = [
  { id: '00000001', text: '我坐在地上，第一次覺得安靜是屬於自己的。' },
  { id: '00000002', text: '一盞燈亮了起來。' },
];

function story(source: string, passages: readonly PassageMarkInput[] | null, inline = false, slot: (id: string) => ReactNode = () => null) {
  return renderWithIntl(
    createElement(
      StoryPassagesContext.Provider,
      { value: passages ? { passages, inline, slot } : null },
      createElement(StoryMarkdown, { source, script: 'cjk' as const, lang: 'zh-TW' }),
    ),
    { locale: 'zh-TW' },
  );
}

describe('rehypePassageMarks in the story', () => {
  it('cuts a sentence at the bold run’s edge and a link’s, each piece its own mark — the words, their order and their elements as they were', () => {
    const before = story(ZH, null).container.innerHTML;
    const { container } = story(ZH, PICKS);
    const one = [...container.querySelectorAll('mark[data-passage="00000001"]')];
    expect(one.map((m) => m.textContent).join('')).toBe(PICKS[0].text);
    // One piece inside the bold run, one after it.
    expect(one.map((m) => m.parentElement!.tagName)).toEqual(['STRONG', 'P']);
    const two = [...container.querySelectorAll('mark[data-passage="00000002"]')];
    expect(two.map((m) => m.textContent).join('')).toBe(PICKS[1].text);
    expect(two[0].closest('a')).toHaveAttribute('href', 'https://example.com/lamp');
    // The quote's sentence no one picked wears nothing.
    expect(container.querySelector('blockquote mark')).toBeNull();
    // Without the marks, the very same markup.
    const unmarked = container.cloneNode(true) as HTMLElement;
    for (const m of unmarked.querySelectorAll('mark')) m.replaceWith(...m.childNodes);
    unmarked.querySelector('.story-prose')!.removeAttribute('data-passages');
    unmarked.normalize();
    const fresh = document.createElement('div');
    fresh.innerHTML = before;
    fresh.normalize();
    expect(unmarked.innerHTML).toBe(fresh.innerHTML);
  });

  it('cuts at a latin mark’s edges, as at any element’s', () => {
    const source = '他說 don’t worry，然後就走了。';
    const { container } = story(source, [{ id: '0000000a', text: '他說 don’t worry，然後就走了。' }]);
    const pieces = [...container.querySelectorAll('mark')];
    expect(pieces.map((m) => m.textContent).join('')).toBe('他說 don’t worry，然後就走了。');
    expect(pieces.some((m) => m.parentElement!.classList.contains('story-latin-mark'))).toBe(true);
  });

  it('in the line: the faces’ slot right after the last character, glued to it — and no slot in the margin', () => {
    const { container } = story(ZH, PICKS, true, (id) => createElement('i', { 'data-faces-for': id }));
    const slots = [...container.querySelectorAll('[data-passage-slot]')];
    expect(slots.map((s) => s.getAttribute('data-passage-slot'))).toEqual(['00000001', '00000002']);
    for (const s of slots) {
      const glue = s.parentElement!;
      expect(glue).toHaveClass(PASSAGE_GLUE_CLASS);
      // The glue holds the sentence's last character's piece and the slot, nothing else.
      expect(glue.children).toHaveLength(2);
      expect(glue.firstElementChild!.tagName).toBe('MARK');
      expect(glue.firstElementChild!.textContent).toBe('。');
      expect(s.querySelector('[data-faces-for]')!.getAttribute('data-faces-for')).toBe(s.getAttribute('data-passage-slot'));
    }
    expect(container.querySelector('.story-prose')).toHaveAttribute('data-passages', 'inline');

    const margin = story(ZH, PICKS, false).container;
    expect(margin.querySelector('[data-passage-slot]')).toBeNull();
    expect(margin.querySelector(`.${PASSAGE_GLUE_CLASS}`)).toBeNull();
    expect(margin.querySelector('.story-prose')).toHaveAttribute('data-passages', 'margin');
  });

  it('finds a sentence in a tight list item and a table cell, never across two items', () => {
    const source = '- 第一項的句子。\n- 第二項的句子。\n\n| 欄 |\n| --- |\n| 格子裡的句子。 |';
    const { container } = story(source, [
      { id: '0000000b', text: '第二項的句子。' },
      { id: '0000000c', text: '格子裡的句子。' },
      { id: '0000000d', text: '第一項的句子。第二項的句子。' },
    ]);
    expect(container.querySelector('li mark[data-passage="0000000b"]')!.textContent).toBe('第二項的句子。');
    expect(container.querySelector('td mark[data-passage="0000000c"]')!.textContent).toBe('格子裡的句子。');
    expect(container.querySelector('mark[data-passage="0000000d"]')).toBeNull();
  });

  it('marks nothing without passages, nothing in a code block, and nothing twice over one word', () => {
    expect(story(ZH, []).container.querySelector('mark')).toBeNull();
    expect(story(ZH, []).container.querySelector('.story-prose')).not.toHaveAttribute('data-passages');
    const code = story('```\n程式裡的句子。\n```', [{ id: '0000000e', text: '程式裡的句子。' }]).container;
    expect(code.querySelector('mark')).toBeNull();
    const twice = story(ZH, [PICKS[0], { id: '0000000f', text: '第一次覺得安靜' }]).container;
    expect(twice.querySelector('mark[data-passage="0000000f"]')).toBeNull();
  });
});
