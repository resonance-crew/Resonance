import { describe, expect, it } from 'vitest';
import { presentTapPassages } from '@/lib/api/v1/tapPassages';
import {
  PASSAGE_MAX_CJK,
  PASSAGE_MAX_CHARS,
  PASSAGES_MIN_UNITS,
  offersPassages,
  offlinePassages,
  passageId,
  passagesHash,
  passageUnits,
  verifyPassages,
} from './tapPassages';

// A CJK story of three paragraphs, past the floor of PASSAGES_MIN_UNITS.
const P1 = '那年我搬到台北，一個人住在頂樓加蓋的小房間，夏天熱得睡不著，我常常坐在樓梯間吹風。';
const P2 = '最難的是第一個冬天，工作做不好，也不敢打電話回家，怕媽媽聽出我的聲音在發抖。每天下班都繞遠路走回去。';
const P3 = '後來我學會了煮一鍋湯，分給隔壁的室友，原來一個人的城市，也可以慢慢長出一個家的樣子。';
const FILL = '日子一天一天過去，我把房間的牆刷成淡黃色，在窗邊種了幾盆香草，週末去市場買菜，跟攤販學說台語。';
const STORY = [P1, `## 冬天`, P2, FILL, FILL.replace('淡黃色', '淡藍色'), P3].join('\n\n');
const TITLE = '一個人的城市';

const LATIN = [
  'We moved to the coast the summer my father lost his job, and nobody said the word money out loud.',
  'The hardest part was the silence at dinner, the forks loud against the plates while the radio played the weather.',
  'Years later I understood that the silence was how he tried to keep the worry away from us.',
  'Every morning the fog came off the water and covered the road, and we walked to school inside it.',
  'My mother learned to bake bread that winter, and the kitchen smelled warm even on the darkest days of the year.',
].join('\n\n');

describe('tap passages: the pure rules (round 27 §P1)', () => {
  it('keeps only the story\'s own words, verbatim, whitespace read as one space', () => {
    expect(passageUnits(STORY)).toBeGreaterThanOrEqual(PASSAGES_MIN_UNITS);
    const kept = verifyPassages(
      STORY,
      [
        '最難的是第一個冬天，工作做不好',
        '  那年我搬到台北，一個人住在頂樓加蓋的小房間\n',
        '那年我搬到台北，一個人住在頂樓的小房間', // a word left out: not the story's
        '後來我學會了煮一鍋湯，分給隔壁的室友',
        42,
      ],
      { title: TITLE },
    );
    // In the story's order, whatever order they came in; the whitespace squashed.
    expect(kept.map((k) => k.text)).toEqual(['那年我搬到台北，一個人住在頂樓加蓋的小房間', '最難的是第一個冬天，工作做不好', '後來我學會了煮一鍋湯，分給隔壁的室友']);
    expect(kept[0].id).toBe(passageId('那年我搬到台北，一個人住在頂樓加蓋的小房間'));
  });

  it('drops one under the floor, over the cap, overlapping or repeating an earlier one, the title, and one across two blocks', () => {
    const tooLong = P2.slice(0, PASSAGE_MAX_CJK + 1);
    const kept = verifyPassages(
      STORY,
      [
        '夏天熱得睡不著', // 7: under the floor
        tooLong,
        '那年我搬到台北，一個人住在頂樓',
        '一個人住在頂樓加蓋的小房間', // overlaps the one before
        '那年我搬到台北，一個人住在頂樓', // repeats it
        '冬天\n\n最難的是第一個冬天', // across the heading and the paragraph
        '後來我學會了煮一鍋湯，分給隔壁的室友',
      ],
      { title: TITLE },
    );
    expect(kept.map((k) => k.text)).toEqual(['那年我搬到台北，一個人住在頂樓', '後來我學會了煮一鍋湯，分給隔壁的室友']);
    const titled = `${TITLE}的夏天很長很長很長\n\n${STORY}`;
    expect(verifyPassages(titled, ['一個人的城市的夏天很長很長很長', P3.slice(0, 20)], { title: '一個人的城市的夏天很長很長很長' })).toEqual([]);
  });

  it('keeps three at most, and offers none when fewer than two are left', () => {
    expect(verifyPassages(STORY, ['那年我搬到台北，一個人住在頂樓加蓋的小房間', 'not in the story at all, really'], { title: TITLE })).toEqual([]);
    const four = verifyPassages(STORY, [P1.slice(0, 15), P2.slice(0, 15), P3.slice(0, 15), FILL.slice(0, 15)], { title: TITLE });
    expect(four).toHaveLength(3);
  });

  it("caps a Latin story's passage at 4–20 words and 120 characters", () => {
    const kept = verifyPassages(LATIN, [
      'nobody  said\nthe word', // 4 words, its whitespace read as one: kept
      'the forks', // 2 words
      'The hardest part was the silence at dinner, the forks loud against the plates while the radio played the weather.', // 20 words, 115 chars
      'Years later I understood that the silence was how he tried to keep the worry away from us.',
    ]);
    expect(kept.map((k) => k.text)).toEqual([
      'nobody said the word',
      'The hardest part was the silence at dinner, the forks loud against the plates while the radio played the weather.',
      'Years later I understood that the silence was how he tried to keep the worry away from us.',
    ]);
    const long = 'My mother learned to bake bread that winter, and the kitchen smelled warm even on the darkest days of the year.';
    expect(long.split(' ').length).toBeGreaterThan(20);
    expect(verifyPassages(LATIN, [long, 'nobody said the word', 'the hardest part'.replace('the', 'The') + ' was the silence'])).toHaveLength(2);
    expect(PASSAGE_MAX_CHARS).toBe(120);
  });

  it('hashes the plain text: a formatting-only edit keeps the hash, a changed word does not', () => {
    const bold = STORY.replace('煮一鍋湯', '**煮一鍋湯**').replace('那年我搬到台北，', '那年我搬到台北，\n');
    expect(passagesHash(bold)).toBe(passagesHash(STORY));
    expect(passagesHash(STORY.replace('煮一鍋湯', '煮一碗湯'))).not.toBe(passagesHash(STORY));
    expect(passagesHash(STORY)).toHaveLength(22);
  });

  it('gives a sentence the same id whenever it is made again', () => {
    const a = verifyPassages(STORY, [P1.slice(0, 15), P3.slice(0, 15)], { title: TITLE });
    const b = verifyPassages(STORY.replace(FILL, `${FILL}又一年。`), [P3.slice(0, 15), P1.slice(0, 15)], { title: TITLE });
    expect(b.map((p) => p.id)).toEqual(a.map((p) => p.id));
    expect(a[0].id).toMatch(/^[0-9a-f]{8}$/);
  });

  it('makes an offline pick that passes its own check: a sentence of each of the three longest paragraphs, in order', () => {
    const picked = offlinePassages(STORY, { title: TITLE });
    expect(picked.length).toBeGreaterThanOrEqual(2);
    expect(picked.length).toBeLessThanOrEqual(3);
    expect(verifyPassages(STORY, picked.map((p) => p.text), { title: TITLE })).toEqual(picked);
    // The heading is never one.
    expect(picked.some((p) => p.text === '冬天')).toBe(false);
    const latin = offlinePassages(LATIN);
    expect(latin).toHaveLength(3);
    expect(verifyPassages(LATIN, latin.map((p) => p.text))).toEqual(latin);
  });

  it('offers passages only on a published, untrashed story long enough', () => {
    expect(offersPassages({ publishedAt: new Date(), story: STORY })).toBe(true);
    expect(offersPassages({ publishedAt: null, story: STORY })).toBe(false);
    expect(offersPassages({ publishedAt: new Date(), trashedAt: new Date(), story: STORY })).toBe(false);
    expect(offersPassages({ publishedAt: new Date(), story: P1 })).toBe(false);
  });

  it('shows stored passages only while they were made from the story as it is, two at least', () => {
    const items = offlinePassages(STORY, { title: TITLE });
    expect(presentTapPassages({ story: STORY, tapPassages: { of: passagesHash(STORY), items } })).toEqual(items);
    expect(presentTapPassages({ story: `${STORY}\n\n多一句。`, tapPassages: { of: passagesHash(STORY), items } })).toEqual([]);
    expect(presentTapPassages({ story: STORY, tapPassages: { of: passagesHash(STORY), items: items.slice(0, 1) } })).toEqual([]);
    expect(presentTapPassages({ story: STORY, tapPassages: { failed: { of: passagesHash(STORY), tries: 1 } } })).toEqual([]);
    expect(presentTapPassages({ story: STORY })).toEqual([]);
  });
});
