import { offlinePassages, passagesHash, PASSAGES_VERSION } from '@/lib/cards/tapPassages';

/**
 * A story long enough to offer tap passages (round 27), and the value the
 * server stores for it (`cards/{id}.tapPassages`): shared by the suites that
 * pick one.
 */
export const PASSAGE_TITLE = '一個人的城市';
const P1 = '那年我搬到台北，一個人住在頂樓加蓋的小房間，夏天熱得睡不著，我常常坐在樓梯間吹風。';
const P2 = '最難的是第一個冬天，工作做不好，也不敢打電話回家，怕媽媽聽出我的聲音在發抖。每天下班都繞遠路走回去。';
const P3 = '後來我學會了煮一鍋湯，分給隔壁的室友，原來一個人的城市，也可以慢慢長出一個家的樣子。';
const FILL = '日子一天一天過去，我把房間的牆刷成淡黃色，在窗邊種了幾盆香草，週末去市場買菜，跟攤販學說台語。';
export const PASSAGE_STORY = [P1, P2, FILL, FILL.replace('淡黃色', '淡藍色'), P3].join('\n\n');

export const passageItems = () => offlinePassages(PASSAGE_STORY, { title: PASSAGE_TITLE });
/** The card fields that make it offer them. */
export const withPassages = () => ({
  thoughtCore: PASSAGE_TITLE,
  story: PASSAGE_STORY,
  tapPassages: { of: passagesHash(PASSAGE_STORY), items: passageItems(), model: 'offline', v: PASSAGES_VERSION },
});
