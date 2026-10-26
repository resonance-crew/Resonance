import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { PARAGRAPH_DELIMITER_LIMIT, STORY_NESTING_LIMIT, storyTooComplex } from './storyLimits';
import { passageBlocks } from './sharePassages';
import { soleLinkParagraphs } from '@/lib/links/storyLinks';
import { embeddedCardKeys } from '@/lib/api/v1/embeds';
import { StoryMarkdown } from '@/components/molecules/CardDetail/StoryMarkdown';

const STORY_MAX = 200_000;
const fit = (s: string) => s.slice(0, STORY_MAX);

// What a reader's parser builds recursively, or matches in quadratic time: each a story the rules take (≤ 200 000 characters).
const hostile: Record<string, string> = {
  'quotes opened on one line': '> '.repeat(5_000) + 'x',
  'list items opened on one line': '- '.repeat(5_000) + 'x',
  'numbered items opened on one line': '1. '.repeat(5_000) + 'x',
  'indentation lists nest by': ' '.repeat(STORY_NESTING_LIMIT * 4 + 1) + '- x',
  'indentation inside a quote': '> ' + ' '.repeat(STORY_NESTING_LIMIT * 4 + 1) + '- x',
  'strong opened thousands deep': '**'.repeat(5_000) + 'x' + '**'.repeat(5_000),
  'emphasis alternating thousands deep': '*_'.repeat(5_000) + 'x' + '_*'.repeat(5_000),
  'strikethrough that never pairs': fit('~~a '.repeat(25_000) + 'x' + ' a~~'.repeat(25_000)),
  'links inside emphasis': fit('*['.repeat(10_000) + 'x' + '](https://a.com)*'.repeat(10_000)),
  'code spans that never close': fit('`a ``b '.repeat(30_000)),
  'flat runs of emphasis delimiters': fit('a* *'.repeat(50_000)),
  'a wide table header over many short lines': '|' + 'a|'.repeat(1_000) + '\n|' + '-|'.repeat(1_000) + '\n' + 'a\n'.repeat(80_000),
  'a long table without a single pipe': 'a\n:-\n' + 'a\n'.repeat(90_000),
  'many small tables': Array.from({ length: 200 }, () => '|' + 'a|'.repeat(100) + '\n|' + '-|'.repeat(100) + '\n' + 'a\n'.repeat(48)).join('\n'),
  'a table written with CR line ends': '|' + 'a|'.repeat(1_000) + '\r|' + '-|'.repeat(1_000) + '\r' + 'a\r'.repeat(80_000),
  'quotes opened after a CR': 'x\r' + '> '.repeat(5_000) + 'x',
  'a table after an indented fence (indented code, not a fence)': '    ```\n\n|' + 'a|'.repeat(1_000) + '\n|' + '-|'.repeat(1_000) + '\n' + 'a\n'.repeat(1_000),
  'a table after a backtick fence with a backtick in its info (a paragraph)': '```a`\n\n|' + 'a|'.repeat(1_000) + '\n|' + '-|'.repeat(1_000) + '\n' + 'a\n'.repeat(1_000),
  'delimiters after an indented fence': '    ```\n\n' + Array.from({ length: 30 }, () => '*a '.repeat(2_000)).join('\n\n'),
  'a table after a quoted fence the quote leaves': '> ```\n\n|' + 'a|'.repeat(1_000) + '\n|' + '-|'.repeat(1_000) + '\n' + 'a\n'.repeat(1_000),
  'a table after a list fence the list leaves': '- ```\n  code\nx\n\n|' + 'a|'.repeat(1_000) + '\n|' + '-|'.repeat(1_000) + '\n' + 'a\n'.repeat(1_000),
  'a table inside a code fence': '```\n|' + 'a|'.repeat(1_000) + '\n|' + '-|'.repeat(1_000) + '\n' + 'a\n'.repeat(1_000) + '```',
  'many paragraphs each near the limit': Array.from({ length: 40 }, () => '*a '.repeat(PARAGRAPH_DELIMITER_LIMIT - 10)).join('\n\n'),
};

const ordinary: Record<string, string> = {
  'a long plain story': fit('今天走了很久的路，風很大。\n\n'.repeat(20_000)),
  'quotes and lists a few deep': '> 一\n> > 二\n> > > 三\n\n- a\n  - b\n    - c\n      - d\n\n1. one\n2. two',
  'a paragraph heavy with bold and italics': Array.from({ length: 18 }, (_, i) => `**粗體${i}** 與 *斜體* 與 ~~刪除~~`).join('，'),
  'every paragraph with some emphasis': fit('這段有 **重點** 和 *強調*，還有 [連結](https://example.com)。\n\n'.repeat(6_000)),
  'code fences full of underscores': '```python\n' + 'snake_case_name = other_value_here * __dunder__\n'.repeat(400) + '```\n\nafter',
  'a code fence in a list item': '- 步驟\n\n  ```js\n' + '  const snake_case = a_b * c_d;\n'.repeat(200) + '  ```\n\n- 下一步',
  'a quoted code fence': '> ```\n' + '> snake_case_name = __dunder__\n'.repeat(200) + '> ```',
  'a tilde fence and a longer backtick fence': '~~~\n' + 'a_b_c * d\n'.repeat(200) + '~~~\n\n````md\n```\n' + 'x_y * z\n'.repeat(200) + '````',
  'a table': '| a | b |\n| --- | --- |\n' + '| **x** | *y* |\n'.repeat(30),
  'a story with a few tables': Array.from({ length: 6 }, () => '| a | b | c |\n| --- | --- | --- |\n' + '| x | y | z |\n'.repeat(40)).join('\n'),
  'a story written with CRLF line ends': fit('> 一\r\n> > 二\r\n\r\n**粗體** 與 *斜體*\r\n\r\n'.repeat(5_000)),
  'a long poem with section rules': ('一行詩\n'.repeat(400) + '---\n').repeat(6),
  'a large ordinary table': '| ' + Array.from({ length: 8 }, (_, i) => `c${i}`).join(' | ') + ' |\n|' + ' --- |'.repeat(8) + '\n' + ('| ' + Array.from({ length: 8 }, () => 'v').join(' | ') + ' |\n').repeat(400),
};

describe('storyTooComplex', () => {
  for (const [name, story] of Object.entries(hostile)) {
    it(`refuses ${name}`, () => {
      expect(story.length).toBeLessThanOrEqual(STORY_MAX);
      expect(storyTooComplex(story)).toBe(true);
    });
  }
  for (const [name, story] of Object.entries(ordinary)) {
    it(`reads ${name} as Markdown`, () => expect(storyTooComplex(story)).toBe(false));
  }

  it('reads any story the rules take in a moment', () => {
    for (const story of [...Object.values(hostile), ...Object.values(ordinary), '*'.repeat(STORY_MAX), '>'.repeat(STORY_MAX), ' '.repeat(STORY_MAX)]) {
      const t = performance.now();
      storyTooComplex(story);
      expect(performance.now() - t).toBeLessThan(200);
    }
  });
});

// Each reader of a story on the server and in the browser, given each hostile story: no stack overflow, no minutes-long parse.
describe('the story parsers, given a story too costly to read as a tree', () => {
  for (const [name, story] of Object.entries(hostile)) {
    it(`draw and read ${name} as its words, quickly`, () => {
      const t = performance.now();
      const html = renderToStaticMarkup(createElement(StoryMarkdown, { source: story, script: 'latin' }));
      expect(html).toContain('story-prose');
      expect(soleLinkParagraphs(story + '\n\nhttps://example.com').size).toBe(0);
      expect(embeddedCardKeys(story + '\n\n[c](/card/abc)')).toEqual([]);
      passageBlocks(story);
      expect(performance.now() - t).toBeLessThan(3_000);
    });
  }

  it('still draw, quickly and without overflowing, the deepest a story within the limits can nest', () => {
    const half = PARAGRAPH_DELIMITER_LIMIT / 4 - 1;
    const deepest = [
      '> '.repeat(STORY_NESTING_LIMIT) + '*_'.repeat(half) + 'x' + '_*'.repeat(half),
      Array.from({ length: 3 }, () => '*['.repeat(half) + 'x' + '](https://a.com)*'.repeat(half)).join('\n\n'),
      '~~a '.repeat(half) + 'x' + ' a~~'.repeat(half),
    ];
    for (const story of deepest) {
      expect(storyTooComplex(story)).toBe(false);
      const t = performance.now();
      renderToStaticMarkup(createElement(StoryMarkdown, { source: story, script: 'latin' }));
      soleLinkParagraphs(story + '\n\nhttps://example.com');
      passageBlocks(story);
      expect(performance.now() - t).toBeLessThan(1_500);
    }
  });

  it('draws the words of such a story, and a share card quotes none of it (as the apps)', () => {
    const story = '> '.repeat(5_000) + '一段被引用了很多層的文字。\n\n第二段，平平常常的一段話，也值得被讀到。';
    expect(renderToStaticMarkup(createElement(StoryMarkdown, { source: story, script: 'cjk' }))).toContain('第二段');
    expect(passageBlocks(story)).toEqual([]);
  });
});
