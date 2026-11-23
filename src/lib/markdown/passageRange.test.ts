import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { offlinePassages } from '@/lib/cards/tapPassages';
import { CJK_RANGES, findPassage, findPassageIn, isCjk } from './passageRange';

// Where a picked sentence lies in one drawn text of the story (round 29 §P3):
// the cases file every renderer runs (the web here, iOS PassageMarksTests,
// Android PassageMarksTest), and what the rule must hold beyond it.

interface Case {
  name: string;
  leaf?: string;
  leaves?: string[];
  sentence: string;
  expect: { start: number; end: number; leaf?: number } | null;
}
const vectors = JSON.parse(readFileSync(resolve(__dirname, '../../../test/vectors/passageMarks.json'), 'utf8')) as {
  cjkRanges: [number, number][];
  cases: Case[];
};

describe('findPassage: the shared cases', () => {
  it.each(vectors.cases.map((c) => [c.name, c] as const))('%s', (_, c) => {
    const got = c.leaves ? findPassageIn(c.leaves, c.sentence) : findPassage(c.leaf!, c.sentence);
    expect(got).toEqual(c.expect);
  });

  it('holds every case the spec names', () => {
    const names = vectors.cases.map((c) => c.name).join('\n');
    for (const want of ['crossing bold', 'soft break', 'twice in the story', 'a Latin sentence', 'at the door', 'across two list items', 'not there']) {
      expect(names).toContain(want);
    }
  });

  it('reads CJK as the cases file says', () => {
    expect(vectors.cjkRanges).toEqual(CJK_RANGES.map(([a, b]) => [a, b]));
    for (const ch of '漢かカ한ㄅ，。「」：！？、；（）　𠮷') expect(isCjk(ch.codePointAt(0)!), ch).toBe(true);
    for (const ch of 'aZ09é—…’ ') expect(isCjk(ch.codePointAt(0)!), ch).toBe(false);
  });
});

describe('findPassage', () => {
  it('answers a range of the leaf’s own text, from the first character to one past the last', () => {
    const leaf = '  前面的話。\n我走了，\n  然後回來。後面的話。';
    const r = findPassage(leaf, '我走了，然後回來。')!;
    expect(leaf.slice(r.start, r.end)).toBe('我走了，\n  然後回來。');
  });

  it('never matches nothing, and never a sentence longer than the leaf', () => {
    expect(findPassage('箱子堆滿了客廳。', '')).toBeNull();
    expect(findPassage('箱子堆滿了客廳。', '   ')).toBeNull();
    expect(findPassage('客廳。', '箱子堆滿了客廳。')).toBeNull();
  });

  it('keeps word edges in a Latin match only: a CJK sentence may stand against anything', () => {
    expect(findPassage('this is the doorway', 'the door')).toBeNull();
    expect(findPassage('open the door, then', 'the door')).toEqual({ start: 5, end: 13 });
    expect(findPassage('我說OK了', 'OK')).toEqual({ start: 2, end: 4 });
    expect(findPassage('二〇二六年冬天', '年冬天')).toEqual({ start: 4, end: 7 });
  });

  it("finds each passage the server offers in its paragraph's words as drawn", () => {
    const story = [
      '那年我搬到台北，一個人住在**頂樓加蓋**的小房間，夏天熱得睡不著，我常常坐在樓梯間吹風。',
      '最難的是第一個冬天，工作做不好，\n也不敢打電話回家，怕媽媽聽出我的聲音在發抖。每天下班都繞遠路走回去。',
      '後來我學會了煮一鍋湯，分給隔壁的室友，原來一個人的城市，也可以慢慢長出一個家的樣子。日子一天一天過去。',
      // Wave 2 #3a: the passages together take at most 60 % of a story, so it reads on past them.
      '我把房間的牆刷成淡黃色，在窗邊種了幾盆香草，週末去市場買菜，跟攤販學說台語。',
      '後來的冬天，我會先打電話回家，聽媽媽說家裡的貓又胖了。',
    ].join('\n\n');
    // The leaves as a renderer draws them: the marks gone, the soft break kept.
    const leaves = story.split('\n\n').map((p) => p.replaceAll('**', ''));
    const items = offlinePassages(story);
    expect(items.length).toBeGreaterThanOrEqual(2);
    for (const item of items) {
      const at = findPassageIn(leaves, item.text);
      expect(at, item.text).not.toBeNull();
    }
  });
});
