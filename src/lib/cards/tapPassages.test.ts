import { describe, expect, it } from 'vitest';
import { presentTapPassages } from '@/lib/api/v1/tapPassages';
import {
  PASSAGE_MAX_CJK,
  PASSAGE_MAX_CHARS,
  PASSAGE_MAX_WORDS,
  PASSAGES_MAX_SHARE,
  PASSAGES_MIN_UNITS,
  PASSAGES_VERSION,
  offersPassages,
  offlinePassages,
  passageId,
  passagesCurrent,
  passagesHash,
  passageUnits,
  quotedSpeech,
  verifyPassages,
  wholeSentences,
} from './tapPassages';

// A CJK story of paragraphs past the floor of PASSAGES_MIN_UNITS: P2 holds two sentences, P4 three.
const P1 = '那年我搬到台北，一個人住在頂樓加蓋的小房間，夏天熱得睡不著，我常常坐在樓梯間吹風。';
const P2 = '最難的是第一個冬天，工作做不好，也不敢打電話回家，怕媽媽聽出我的聲音在發抖。每天下班都繞遠路走回去。';
const P3 = '後來我學會了煮一鍋湯，分給隔壁的室友，原來一個人的城市，也可以慢慢長出一個家的樣子。';
const FILL = '日子一天一天過去，我把房間的牆刷成淡黃色，在窗邊種了幾盆香草，週末去市場買菜，跟攤販學說台語。';
const P4 = '我以為長大是學會不需要任何人。可是那個冬天教會我，願意開口求助，也是一種勇氣。現在的我，不再假裝自己什麼都扛得住。';
const STORY = [P1, `## 冬天`, P2, FILL, FILL.replace('淡黃色', '淡藍色'), P4, P3].join('\n\n');
const TITLE = '一個人的城市';
const cp = (s: string) => [...s].length;

const LATIN = [
  'We moved to the coast the summer my father lost his job, and nobody said the word money out loud.',
  'The hardest part was the silence at dinner. The forks were loud against the plates while the radio played the weather.',
  'Years later I understood that the silence was how he tried to keep the worry away from us.',
  'Every morning the fog came off the water and covered the road, and we walked to school inside it.',
  'My mother learned to bake bread that winter, and the kitchen smelled warm even on the darkest days of the year.',
].join('\n\n');

describe('tap passages: the pure rules (round 27 §P1, Wave 2 #3a: 2–3 whole sentences, ~100 characters)', () => {
  it("keeps only the story's own whole sentences, verbatim, whitespace read as one space, in the story's order", () => {
    expect(passageUnits(STORY)).toBeGreaterThanOrEqual(PASSAGES_MIN_UNITS);
    const kept = verifyPassages(
      STORY,
      [
        '每天下班都繞遠路走回去。',
        `  ${P1}\n`,
        P3.replace('慢慢', ''), // a word left out: not the story's
        42,
      ],
      { title: TITLE },
    );
    expect(kept.map((k) => k.text)).toEqual([P1, '每天下班都繞遠路走回去。']);
    expect(kept[0].id).toBe(passageId(P1));
  });

  it('takes two or three sentences in a row of one paragraph as one passage, up to the cap', () => {
    expect(cp(P4)).toBeLessThanOrEqual(PASSAGE_MAX_CJK);
    const kept = verifyPassages(STORY, [P4, P2], { title: TITLE });
    expect(kept.map((k) => k.text)).toEqual([P2, P4]);
    // Past the cap (a paragraph of four sentences here) it is dropped whole, never cut.
    const long = `${P4}${'所以我開始每天寫一點東西，寫給以後的自己看，也寫給那個還在樓梯間吹風、不敢打電話回家的女孩。'}`;
    expect(cp(long)).toBeGreaterThan(PASSAGE_MAX_CJK);
    expect(verifyPassages(STORY.replace(P4, long), [long, P1, P3], { title: TITLE }).map((k) => k.text)).toEqual([P1, P3]);
  });

  it('drops a piece that starts or ends inside a sentence, one under the floor, overlapping or repeating one, the title, one across blocks', () => {
    const kept = verifyPassages(
      STORY,
      [
        '那年我搬到台北，一個人住在頂樓加蓋的小房間', // ends inside its sentence
        '一個人住在頂樓加蓋的小房間，夏天熱得睡不著，我常常坐在樓梯間吹風。', // starts inside it
        '夏天熱得睡不著', // under the floor, and a clause
        P2,
        '每天下班都繞遠路走回去。', // inside P2, taken already
        P2, // repeats it
        '冬天\n\n最難的是第一個冬天，工作做不好，也不敢打電話回家，怕媽媽聽出我的聲音在發抖。', // across the heading and the paragraph
        P3,
      ],
      { title: TITLE },
    );
    expect(kept.map((k) => k.text)).toEqual([P2, P3]);
    const titled = `${TITLE}的夏天很長很長很長。\n\n${STORY}`;
    expect(verifyPassages(titled, ['一個人的城市的夏天很長很長很長。', P3], { title: '一個人的城市的夏天很長很長很長。' })).toEqual([]);
    expect(wholeSentences('甲乙丙。丁戊己。', 4, 8, 'cjk')).toBe(true);
    expect(wholeSentences('甲乙丙。丁戊己。', 0, 3, 'cjk')).toBe(false);
    expect(wholeSentences('She left. I stayed.', 10, 19, 'latin')).toBe(true);
    expect(wholeSentences('She left. I stayed.', 4, 19, 'latin')).toBe(false);
  });

  it('never offers dialogue: a passage that is one quotation from end to end', () => {
    expect(quotedSpeech('「我沒事，你們先走吧。」')).toBe(true);
    expect(quotedSpeech('"I am fine, go on without me."')).toBe(true);
    expect(quotedSpeech('“I’m fine,” she said, and I believed her.')).toBe(false);
    expect(quotedSpeech('「好。」他說「明天見。」')).toBe(false);
    expect(quotedSpeech('媽媽說：「回來就好。」那一刻我才哭出來。')).toBe(false);
    const said = '「你不用一直這麼堅強，累了就回家。」';
    const story = STORY.replace(P3, `${said}\n\n${P3}`);
    expect(verifyPassages(story, [said, P1, P3], { title: TITLE }).map((k) => k.text)).toEqual([P1, P3]);
  });

  it(`keeps three at most, within ${PASSAGES_MAX_SHARE * 100} % of the story, and offers none when fewer than two are left`, () => {
    expect(verifyPassages(STORY, [P1, 'not in the story at all, really'], { title: TITLE })).toEqual([]);
    const four = verifyPassages(STORY, [P1, FILL, P4, P3], { title: TITLE });
    expect(four).toHaveLength(3);
    // A short story: the passages together never take more than the share of it.
    const short = [P1, P3, FILL].join('\n\n');
    const total = cp([P1, P3, FILL].join(' '));
    const kept = verifyPassages(short, [P1, P3, FILL]);
    expect(kept.reduce((n, k) => n + cp(k.text), 0)).toBeLessThanOrEqual(total * PASSAGES_MAX_SHARE);
    expect(kept.length).toBeLessThan(3);
  });

  it(`caps a Latin story's passage at 4–${PASSAGE_MAX_WORDS} words and ${PASSAGE_MAX_CHARS} characters, whole sentences only`, () => {
    const kept = verifyPassages(LATIN, [
      'The hardest part was the silence at dinner.  The forks were loud\nagainst the plates while the radio played the weather.', // two sentences
      'nobody said the word', // inside a sentence
      'Years later I understood that the silence was how he tried to keep the worry away from us.',
    ]);
    expect(kept.map((k) => k.text)).toEqual([
      'The hardest part was the silence at dinner. The forks were loud against the plates while the radio played the weather.',
      'Years later I understood that the silence was how he tried to keep the worry away from us.',
    ]);
    expect(PASSAGE_MAX_CHARS).toBe(360);
  });

  it('hashes the plain text: a formatting-only edit keeps the hash, a changed word does not', () => {
    const bold = STORY.replace('煮一鍋湯', '**煮一鍋湯**').replace('那年我搬到台北，', '那年我搬到台北，\n');
    expect(passagesHash(bold)).toBe(passagesHash(STORY));
    expect(passagesHash(STORY.replace('煮一鍋湯', '煮一碗湯'))).not.toBe(passagesHash(STORY));
    expect(passagesHash(STORY)).toHaveLength(22);
  });

  it('gives a sentence the same id whenever it is made again', () => {
    const a = verifyPassages(STORY, [P1, P3], { title: TITLE });
    const b = verifyPassages(STORY.replace(FILL, `${FILL}又一年。`), [P3, P1], { title: TITLE });
    expect(b.map((p) => p.id)).toEqual(a.map((p) => p.id));
    expect(a[0].id).toMatch(/^[0-9a-f]{8}$/);
  });

  it('makes an offline pick that passes its own check: whole sentences of the three longest paragraphs, in order', () => {
    const picked = offlinePassages(STORY, { title: TITLE });
    expect(picked.length).toBeGreaterThanOrEqual(2);
    expect(picked.length).toBeLessThanOrEqual(3);
    expect(verifyPassages(STORY, picked.map((p) => p.text), { title: TITLE })).toEqual(picked);
    // The heading is never one; P4's three sentences fit and come whole.
    expect(picked.some((p) => p.text === '冬天')).toBe(false);
    expect(picked.map((p) => p.text)).toContain(P4);
    const latin = offlinePassages(LATIN);
    expect(latin.length).toBeGreaterThanOrEqual(2);
    expect(verifyPassages(LATIN, latin.map((p) => p.text))).toEqual(latin);
  });

  it('offers passages only on a published, untrashed story long enough', () => {
    expect(offersPassages({ publishedAt: new Date(), story: STORY })).toBe(true);
    expect(offersPassages({ publishedAt: null, story: STORY })).toBe(false);
    expect(offersPassages({ publishedAt: new Date(), trashedAt: new Date(), story: STORY })).toBe(false);
    expect(offersPassages({ publishedAt: new Date(), story: P1 })).toBe(false);
  });

  it('calls stored passages current only for the same text made by this version (round 27 ones are v1)', () => {
    const of = passagesHash(STORY);
    expect(passagesCurrent({ of, v: PASSAGES_VERSION }, of)).toBe(true);
    expect(passagesCurrent({ of }, of)).toBe(PASSAGES_VERSION <= 1);
    expect(passagesCurrent({ of, v: PASSAGES_VERSION }, passagesHash(`${STORY}。`))).toBe(false);
    expect(passagesCurrent(undefined, of)).toBe(false);
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
