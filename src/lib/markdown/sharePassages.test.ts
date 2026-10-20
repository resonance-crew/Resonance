import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PASSAGE_MAX, PASSAGE_MAX_GRAPHEMES, PASSAGE_MIN_GRAPHEMES, PASSAGE_READ_CHARS, passageBlocks, sharePassages } from './sharePassages';

// What a share card quotes from a story: the web's link-preview image and the
// apps' share image both take the opening. The apps' twins read the same
// cases (native/fixtures/share-passages.json). After an intentional change to
// the rule, regenerate the openings and review the diff:
//   UPDATE_SHARE_PASSAGES=1 npx vitest run src/lib/markdown/sharePassages.test.ts

const FIXTURE = resolve(__dirname, '../../../native/fixtures/share-passages.json');

interface Case {
  id: string;
  story: string;
  opening?: string;
}
interface Fixture {
  note: string;
  limits: { readChars: number; minGraphemes: number; max: number; maxGraphemes: number };
  cases: Case[];
}

const LIMITS = { readChars: PASSAGE_READ_CHARS, minGraphemes: PASSAGE_MIN_GRAPHEMES, max: PASSAGE_MAX, maxGraphemes: PASSAGE_MAX_GRAPHEMES };
const read = () => JSON.parse(readFileSync(FIXTURE, 'utf8')) as Fixture;

if (process.env.UPDATE_SHARE_PASSAGES) {
  const fixture = read();
  fixture.limits = LIMITS;
  fixture.cases = fixture.cases.map(({ id, story }) => ({ id, story, opening: sharePassages(story).opening }));
  writeFileSync(FIXTURE, `${JSON.stringify(fixture, null, 2)}\n`);
}

const fixture = read();
const opening = (story: string) => sharePassages(story).opening;

describe('share passages (native/fixtures/share-passages.json, shared with the apps)', () => {
  it('states the limits the code uses', () => {
    expect(fixture.limits).toEqual(LIMITS);
  });

  it.each(fixture.cases.map((c) => [c.id, c] as const))('%s', (_id, c) => {
    expect(c.opening, 'run with UPDATE_SHARE_PASSAGES=1 to fill in a new case').toBeTypeOf('string');
    expect(opening(c.story)).toBe(c.opening);
  });
});

describe('the opening', () => {
  it('quotes the prose, a paragraph a line, without Markdown', () => {
    expect(opening('那天我**終於**明白。\n\n> 人要曬過太陽才會甜\n\n- 梅子要先用鹽搓過')).toBe('那天我終於明白。\n人要曬過太陽才會甜\n梅子要先用鹽搓過');
  });

  it("skips what isn't prose: headings, code, pictures, link cards and embedded cards", () => {
    const story = [
      '## 第一章：出發之前',
      '```\nconsole.log(1)\n```',
      '![青梅](https://img.example/plums.webp)',
      'https://example.com/rain',
      '[外婆的醃梅子](/card/grandmas-plums)',
      '雨停了，我出門散步。',
    ].join('\n\n');
    expect(opening(story)).toBe('雨停了，我出門散步。');
  });

  it('keeps a link inside a sentence as its text, and leaves a bare address out', () => {
    expect(opening('我在[那篇文章](https://example.com/essay)讀到的。')).toBe('我在那篇文章讀到的。');
    expect(opening('資料都在 https://example.com/notes 裡面，有空看看。')).toBe('資料都在 裡面，有空看看。');
  });

  it('reads character references and escapes as what they stand for, never as syntax', () => {
    expect(opening('從台北 -&gt; 台中，再 \\*慢慢\\* 走。')).toBe('從台北 -> 台中，再 *慢慢* 走。');
  });

  it(`drops a block under ${PASSAGE_MIN_GRAPHEMES} graphemes, counting graphemes rather than UTF-16 units`, () => {
    expect(opening('嗯。\n\n好吧，我承認我錯了。')).toBe('好吧，我承認我錯了。');
    // Five family emoji are 55 UTF-16 units but five graphemes: too short. Six flags are six.
    expect(opening('👨‍👩‍👧‍👦'.repeat(5))).toBe('');
    expect(opening('🇹🇼'.repeat(6))).toBe('🇹🇼'.repeat(6));
  });

  it(`is cut at ${PASSAGE_MAX_GRAPHEMES} graphemes with an ellipsis`, () => {
    const long = '梅'.repeat(PASSAGE_MAX_GRAPHEMES + 50);
    expect(opening(`${long}\n\n第二段不會出現。`)).toBe(`${'梅'.repeat(PASSAGE_MAX_GRAPHEMES)}…`);
    // A cut never splits a grapheme.
    const flags = opening('🇹🇼'.repeat(PASSAGE_MAX_GRAPHEMES + 1));
    expect(flags).toBe(`${'🇹🇼'.repeat(PASSAGE_MAX_GRAPHEMES)}…`);
  });

  it(`reads at most ${PASSAGE_MAX} blocks`, () => {
    const story = Array.from({ length: PASSAGE_MAX + 5 }, (_, i) => `第 ${i + 1} 段文字`).join('\n\n');
    const blocks = passageBlocks(story);
    expect(blocks).toHaveLength(PASSAGE_MAX);
    expect(blocks.at(-1)).toBe(`第 ${PASSAGE_MAX} 段文字`);
  });

  it(`reads only the story's first ${PASSAGE_READ_CHARS} characters, never splitting a surrogate pair`, () => {
    const filler = `${'```\n'}${'x'.repeat(PASSAGE_READ_CHARS)}${'\n```'}`;
    expect(opening(`${filler}\n\n讀不到的這一段。`)).toBe('');
    const pairs = `${'a'.repeat(PASSAGE_READ_CHARS - 1)}🇹🇼 之後的字`;
    expect(opening(pairs)).toBe(`${'a'.repeat(PASSAGE_MAX_GRAPHEMES)}…`);
    const block = passageBlocks(pairs)[0];
    expect(block.length).toBe(PASSAGE_READ_CHARS - 1);
    expect(block.endsWith('a')).toBe(true);
  });

  it('is empty for a story with nothing to quote', () => {
    expect(opening('')).toBe('');
    expect(opening('## 只有標題\n\nhttps://example.com/only-a-link')).toBe('');
  });
});
