/**
 * The seed's pinned data: what the emulators' world shows that a model or an algorithm would otherwise make on
 * every seed, written out once so the release screenshots compare like with like (the owner, 2026-11-23:
 * 「這種資料應該要把它固定下來，不能每次都叫 AI 重標這些」).
 *
 * src/lib/cards/tapPassages.pinned.test.ts compares them with what the code makes today: when the pick changes on
 * purpose, update them here in the same change — and expect the screens that show them (card-passages,
 * card-picked-people, taps-author-list) to change, named in its `Visual:` trailer.
 */
import type { TapPassageItem } from '../../src/lib/cards/tapPassages';

/** rich-story's title and story (scripts/seed-emulator.ts): every kind of content a story can hold. */
export const RICH_STORY_TITLE = '搬家後的第一個安靜夜晚';
export const RICH_STORY = [
  '箱子堆滿了客廳，我坐在地上，第一次覺得**安靜是屬於自己的**。窗外有人在*慢慢地*收衣服。',
  '## 那些帶不走的東西',
  '有些東西在打包的時候就決定留下了：舊沙發、一面有裂痕的鏡子，還有 [一篇讀過很多次的文章](https://example.com/essay)。',
  '> 你不是失去了一個家，\n> 你是多了一個可以回去的地方。',
  ' ',
  '### 清單',
  '- 把書按照顏色排好\n- 在窗台放一盆薄荷\n- 寫信給十年前的自己',
  '1. 先睡一覺\n2. 再說',
  '延伸閱讀：',
  '[一場雨後的散步](/card/rain-walk)',
  '也可以看看 [第一杯自己沖的咖啡](/card/first-coffee) 這張，寫得很溫柔。',
  '---',
  'The quiet after moving out felt like mine — *finally*.',
].join('\n\n');

/** rich-story's tap passages: passages v2's offline pick of RICH_STORY (2026-11-23), written out. */
export const RICH_STORY_PASSAGES: TapPassageItem[] = [
  { id: '569526aa', text: '箱子堆滿了客廳，我坐在地上，第一次覺得安靜是屬於自己的。窗外有人在慢慢地收衣服。' },
  { id: '85007cbf', text: '你不是失去了一個家，你是多了一個可以回去的地方。' },
  { id: '8684820a', text: 'The quiet after moving out felt like mine — finally.' },
];
