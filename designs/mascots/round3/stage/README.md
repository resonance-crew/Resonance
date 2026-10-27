# 摺摺登場舞台（landing stage）

首頁上的紙偶訪客：引擎 `mascot-stage.js` ＋ 在首頁截圖上跑的原型 `index.html`。角色從 `cast/` 讀入（`sync-cast.sh` 從 `../<slug>/parts` 複製），還沒畫好時用 `placeholders/` 的三個替身。

## 這一版改了什麼（評審之後）

評審報告：`../review/critic-stage.md`、`../review/critic-series.md`。數字都是 `verify/sim.mjs` 量的（同評審的方法：每 1/12 秒推進、比對 DOM 外框、在按鈕上打點 `elementFromPoint`）。

| | 評審時 | 現在 |
|---|---|---|
| 兩隻疊在一起（相遇以外，含一起離開） | 頁尾 120 秒 101 格、CTA 17–53 格 | 0（桌機首屏 12×60 s、CTA／頁尾 12×120 s、手機首屏 12×60 s、手機 CTA／feed 8×120 s） |
| 角色搶走按鈕的點擊 | 瀏覽所有故事 60–68 格、Google Play 45/60 格 | 0／約 59 萬次探測 |
| 背面還有臉 | 有 | 引擎讀 `hides`：牽牽轉到「給：」那面臉、手、蝴蝶結都收起來 |
| 首屏有相遇或打招呼 | 三分鐘內：桌機 5/12（最早 54 s），手機 0/12 | 桌機 11/12 在 60 秒內（10/12 在 20 秒內），手機 11/12 在 60 秒內（5/12 在 20 秒內） |
| 首屏在標題上的拜訪 | 手機 82%、桌機 44% | 手機 25%、桌機 22% |
| 一次拜訪裡在「做事」的時間 | 31–58% | 首屏 78–81%，CTA／頁尾 73% |
| 減少動態（手機；桌機在頁中載入） | 沒有角色；靜止的摺摺留在首屏 | 首屏一隻；捲動停下後換到畫面裡 |
| 走過去的相遇（CTA、頁尾） | 三分鐘 2–5 次 | 每 60 秒最多一次 |

**必改**
- **不疊在一起**：挑地方時同時比對另一隻現在的位置和**要去的位置**；spot、peek、edge 一次只給一隻（`group`：標題兩端一次只用一端）；走進來的路上有人（同一高度）就從另一側來，遠的 spot 改用翻起來的；離開時那一側有人或有字／按鈕就走另一側，兩側都擋住就摺回頁面裡。一起離開時兩隻用較慢那隻的速度，後面那隻每格都不超過前面那隻減一步的距離（`follow`）。
- **點擊**：只有軀幹上一塊看不見的形狀吃指標（`build.mjs` 用 `outline.py` 從 `torso.png` 量出外框多邊形，寫進 manifest 的 `torso.hit`；沒有時用橢圓）。手、腳、頭飾、道具一律不吃。軀幹蓋到任何文字或按鈕（`env.content`、該落腳點的 `clear`）那一格就不吃。原型的「在元素後面」蓋片改成吃指標（跟真站元素在前面一樣），真站用引擎的 clip-path 或 z-index，不要用讓點擊穿過去的蓋片。
- **`hides`**：manifest 的 part 有 `hides`（kit 的 `data-hides`）時，那個變體出現的期間把列出的 part 設成 `visibility:hidden`，`face` 代表整個臉群組（含腮紅）。沒有 `hides` 的舊 manifest 照舊。背面（`hides` 含 `face`）的 reveal 是「轉身」：身體在換面那一刻收成一條邊。
- **一起離開不穿過對方**：見上。
- **相遇發生在有人看的地方**：
  - 新的「遠遠地打招呼」（`greet`）：兩隻都在畫面上、各在自己的地方、高度相近、中間放得下三條波浪（不蓋字、按鈕、卡片）時，轉向對方、揮手（用看得見的那隻手）、一起上下兩拍、三條波浪在兩者之間脈動。不走路。一對只決定一次（機率 `greetChance` 0.85，間隔至少 `greetEvery` 20 秒）；先空下來的那隻會等另一隻做完手上的事（最多約 4 秒）。
  - 落腳點可以有 `partner`（對面的那個）：手機上 App Store 徽章兩側、兩邊標題端、桌機 QR 旁與徽章旁。要相遇但走不過去（手機太窄、標題沒有地面）時，第二隻去對面，兩隻一定打招呼。桌機 QR／徽章旁走得過去時，35% 也改成隔著下載區打招呼。
  - 第一位訪客偏向可相遇的地方（×3），首屏落腳點的 `meetChance` 0.7；第二位訪客偏向第一位的對面（×4）或同一高度（×2）。
  - 走過去的相遇（含 CTA）最多每 60 秒一次（`meetEvery`）。

**應改**
- **首屏的地方**：手機加 App Store 徽章左右兩側（站在徽章腳下一點，指給你看）和「真實的人生故事」膠囊上（像站在小台子上），桌機也加膠囊上；標題權重 0.5；同一個落腳點不連用兩次。
- **標題字縫**：文字類落腳點（標題、「值得閱讀的故事」）改成**翻起來**進場（`pop`：以腳為軸 scaleY 0→1.07→1、0.42 秒，像立體書），離場摺回去；不再從字後面爬，所以沒有碎片。字頂改用上包絡線（reach 40 px、平滑），腳踩的高度取腳寬範圍內最高的那一點。
- **道具墨色**：每個落腳點量出背景後記 `ink: { light, dark }`（哪支鉛筆在那裡看得清楚）；道具依主人所在落腳點上色。頁尾、陶土色的 CTA 裡用淺色鉛筆。
- **走路吃掉拜訪**：遠的 spot（離畫面邊 340 px 以上）60% 改用翻起來；走的時候限制在約 2.6 秒內（小跑，最多 2.6 倍）。位置每秒動 24 次、姿勢仍每秒 12 格（紙偶感不變，位移不跳）。
- **揮手用看得見的手**：側邊探頭不用卡片後的那隻；從上緣探頭時找得到能舉過邊緣的角度才揮／招手，否則不做；滑鼠移上去的揮手也一樣。
- **不蓋內容**：第二排卡片（和手機每張卡片）坐的位置避開上一張卡片的作者列和箭頭（量出來的 `clear`）；「值得閱讀的故事」改成站在字頂；「瀏覽所有故事」旁有 `ceiling`（上方卡片的底），牽牽不去；QR／徽章旁、手機徽章旁的 `ceiling` 是段落底；坐在地上的腿張開角度依腿長縮小（長腿約 35°、往前縮短），`clear` 用坐下時的寬度。
- **減少動態**：`still()` 接受站的 spot、站的 edge、波浪線、坐的卡片邊、探頭，挑最靠近畫面中上方的；捲動停下 250 ms 後，那隻不在畫面裡就直接換到畫面裡（不動畫）。
- **大小**：見下方「大小」。
- **聆聆的帽子**：選離頭飾外框最近的那隻手、抓在帽緣；搆得到就掀帽，搆不到就點個頭讓帽子自己跳一下（`nod`），或晃一晃。
- **讀不出來的動作**：read 手上拿一本攤開的小書（看到一半翻一頁）；write 一手拿小紙條、一手拿鉛筆寫，寫完把紙條遞向按鈕；擊掌改叫「碰碰手」，碰到那一刻兩隻一起小跳、爆線用該處讀得清楚的墨色。
- **摺摺掀角**：`outline.py` 比對 `torso` 與 `torso-alt`，記下改變的地方貼著紙邊的那一點（`torso-alt.reveal.tip`）；改變範圍小（一個角）時，搆得到的那隻手先伸過去，角才翻開。整面都變（牽牽的背面、聆聆寫滿字的卡）就不伸手。

**可以更好**
- 一個錯誤不再讓舞台停住（`frame()` 用 try/finally 一定排下一格；`visit({ acts })` 會濾掉不認得的動作名）。
- 兩隻從兩側走來時，在畫面裡、距離少於畫面寬 55% 就「注意到」：o 嘴、小跳、加快腳步。
- 摺摺（以及現在手臂也在紙後面的聆聆、點點、悄悄）的手臂一隻一隻移到前面，而且要轉離垂下的角度 14° 以上才移，所以不會有一格突然出現紙條。
- 12 格模式不再每個畫面更新都叫 rAF：用計時器在該更新前 6 ms 叫醒，再等下一個畫面更新（60 Hz 螢幕上每秒約 24 次、間隔 33／50 ms 交替；舊版每秒 60 次）。
- 蓋片可以有 `radius`（QR 卡、故事卡、按鈕、頭像列的圓角）：原型蓋片與引擎內建的 clip-path 都會把上方兩角做成圓的。
- 原型「大小」旁註明頁面縮放：例如「這裡把 1440 px 寬的頁面縮成 75%：真站上摺摺高 120 px，在這個框裡看起來約 90 px」。

**系列評審的建議**：深色主題整層角色 `brightness(0.9)`（`nightDim`，`stars-glow` 不暗），四隻淺色紙不再比所有字都亮；悄悄白天少去首屏（權重 0.35）、多去頁尾與 CTA，深色主題時更常來（`traits.zones`、`traits.often`）；點點伸懶腰不閉眼（`openStretch`：閉上眼，淺色的臉就沒有深色記號了）。

## 大小

- **桌機 120（摺摺）不變**，兩位評審都同意：和 QR 卡片一樣高、比標題字高一半，已經比第二輪的 ~200 px 小了四成。
- **手機 88 → 80**：88 時摺摺是 41 px 標題字高的 2.1 倍、兩隻同在首屏就擠；業主說的「小一點點」主要落在手機。
- **系列高低差稍微壓縮**：舞台高 = unit ×（rig 高 ÷ 420）^0.75（`heightCurve`，1 = 等比）。評審建議 0.7；我取 0.75，比 0.7 溫和一點，讓角色自己的比例（聆聆這輪縮小、牽牽的高）仍看得出來。桌機：牽牽 150、悄悄 116、聆聆（309）約 95、點點 77；手機：牽牽 100、悄悄 77、聆聆 63、點點 51。最高的不再比 QR＋徽章那一塊高很多，最小的在淺色底上也不會只剩一點。
- 「大小」滑桿照舊（60–160%，乘在上面）。

## 檔案

| 檔案 | 用途 |
|---|---|
| `mascot-stage.js` | 引擎（ES module，無相依）。不知道截圖的存在，只認 env 介面與 cast |
| `prototype.js` | 原型：截圖放在可捲動的瀏覽器視窗／手機框裡，舞台跑在上面；`mountPrototype(container, { cast, base, ledges, flags })` |
| `index.html` | 獨立頁面；載入 `stage.bundle.js`（classic script，所以 file:// 也能開） |
| `ledges.json` | 落腳點與頁面內容（桌機、手機），由 `measure-ledges.py` 從 `../landing` 的截圖與 anchors.json 量出 |
| `outline.py` | 從角色的 part 圖量出軀幹的指標形狀（`torso.hit`）與掀開祕密的點（`torso-alt.reveal`），`build.mjs` 寫進 manifest |
| `cast.js` / `stage.bundle.js` | 由 `node build.mjs` 產生，勿手改 |
| `sync-cast.sh` | 複製畫好的角色 parts 到 `cast/<slug>/`，重建 cast.js 與 bundle |
| `placeholders/make-placeholders.mjs` | 三個替身 rig（高、跳、摺摺大小）＋ 用 kit 匯出 parts |
| `check.mjs` | headless Chrome 自我檢查，截圖寫到 `checks/` |
| `verify/sim.mjs` | 快轉模擬並計數：疊在一起、相遇／打招呼與第一次的時間、做事的比例、首屏落腳點分布、被搶走的點擊 |
| `verify/trace.mjs` | 某個 seed 的事件一行一行印出來（可帶一段 setup JS、限定角色） |
| `verify/idle.mjs` | 12 格模式每秒叫醒幾次；減少動態在頁中載入時角色在哪 |
| `captures/*.webp` | 首頁截圖（桌機 1440 寬 1×、手機 390 寬 2×，淺／深） |

```sh
./sync-cast.sh                 # 角色更新後：複製 parts、重建 cast.js 與 stage.bundle.js（也重量 outline）
node build.mjs                 # 改了引擎／原型／ledges.json 之後
python3 measure-ledges.py      # 首頁改版、重拍截圖之後（再 node build.mjs）
node check.mjs                 # 全部檢查；或 node check.mjs greet hides acts reduced-phone meet poke pause …
node check.mjs spots desktop "browse:card:lean,write:tuck:write" 3000,6000   # 指定角色在指定落腳點做指定動作
node verify/sim.mjs desktop 60 1-12 0          # 首屏 12 個 seed × 60 秒；手機用 mobile；可給多個 scroll：2500,2991
```

原型網址參數：`view=desktop|mobile`、`theme=light|dark`、`fps=smooth`、`size=60…160`、`reduced=0|1`、`ledges=1`、`scroll=<頁面 px>`、`meet=1`（`variant=none|note|five`）、`at=<ledge id>&who=<slug>&do=<act+act>`、`seed=<n>`。

## 引擎 API

```js
import { createStage, loadCast } from './mascot-stage.js';
const cast = await loadCast([{ slug: 'tuck', base: 'cast/tuck/', traits: { likes: ['read'] } }, …]);
const stage = createStage(env, cast, { size: 1, fps: 12, onEvent: e => {} });
```

**env**（引擎對頁面的全部認知）
- `layer`：蓋住整頁的元素（position relative/absolute），引擎在裡面畫，座標＝頁面 px
- `ledges`：落腳點陣列（或回傳陣列的函式），頁面座標
- `viewport()`：目前可見的頁面範圍 `{ x, y, w, h }`
- `unitHeight`：420 rig 單位（摺摺）高的角色要幾 px — 桌機 120、手機 80；其他角色依 `heightCurve`
- `content`（選用）：文字、按鈕的矩形（陣列或函式）。道具（相遇與打招呼的波浪）不蓋在上面、角色的軀幹在上面時不吃指標、離場不從上面走過
- `behind(root, cover)`（選用）：把角色放到某元素後面，回傳還原函式。沒給時引擎自己用 clip-path 裁掉元素範圍內（含下方 `depth` 的「槽」，`radius` 時上方兩角是圓的）的部分；clip-path 也裁掉點擊
- `theme`、`reducedMotion`、`clock`（`{ now, raf, caf, timers?: { set, clear } }`）、`random`

**options**：`size`（倍率）、`fps`（12＝紙偶感，0＝流暢）、`moveFps` 24（12 格模式時位置每秒動幾次）、`heightCurve` 0.75、`first` [1.2,2.5] 秒、`visit` [9,16]、`dwell` 4.5（到了之後至少待幾秒）、`gap` [3,7]、`meetChance` 0.45（落腳點的 `meetChance` 優先）、`pairChance` 0.2、`meetEvery` 60、`greetChance` 0.85、`greetEvery` 20、`farWalk` 340、`walkLimit` 2.6、`nightDim` 0.9、`seed`、`onEvent`、`autoplay`、`observe`。

**traits**（每隻角色，選用）：`pace`、`likes`、`naps`、`shuffle`、`openStretch`、`zones: { light|dark: { hero|feed|cta|footer: 倍率 } }`、`often: { light|dark: 倍率 }`。

**stage**：`start / pause / resume / destroy`、`next()`（現在的離開、下一位進來）、`meet(variant?)`（畫面裡有一隻：走得過去就叫一位走過去，否則叫一位去對面打招呼；都不行時清場後兩隻從兩側走進一條波浪線；回傳 false＝畫面裡沒有可相遇的地方）、`visit({ ledge, slug, acts })`、`setOptions({ size, fps, heightCurve, nightDim })`、`setTheme`、`setReducedMotion`、`advance(秒)`（不等真實時間直接推進，給測試／靜態圖用）、`visitors()`、`stats()`。

**事件**：`enter`（how: walk/pop/climb/rise/slide, side）、`arrive`、`act`（act, label；`greet` 是遠遠地打招呼、`five` 是碰碰手）、`meet`、`leave`；雙人事件帶 `pair: true`，label 已含兩個名字。

**角色＝DOM**：root → body → face，每個 part 一張 `<img>`，以 rig 的 pivot 為 transform-origin；每格只改 transform / opacity / visibility（只有在元素後面且沒有 env.behind 時才用 clip-path）。軀幹上一個 `<i class="ms-hit">` 是唯一吃指標的東西。不水平翻轉：往哪走，臉就往哪滑。

**manifest 欄位（引擎讀的，除了 kit 的那些）**：part 的 `hides`（字串，空白分隔；`face`＝整個臉群組）、`torso.hit`（`[[fx, fy], …]`，torso 圖框的比例）、`torso-alt.reveal`（`{ at, tip, frac, spread }`，rig 單位）。後兩個由 `build.mjs` 自動加。

## 行為怎麼選

- **排程**：第一位 1.2–2.5 秒後來；一次拜訪 9–16 秒（走進來太遠時，到了之後仍保證約 4.5 秒的活動）；走後隔 3–7 秒來下一位；畫面最多兩隻；不連續同一隻、不連續同一個地方。第一位站在可相遇的地方（`meet` 或 `partner`）時，`meetChance`（首屏 0.7）的機會 3.5–6 秒後叫第二位來相遇（距上次走過去的相遇至少 60 秒），否則 20% 機會（冷卻中則併入）來一位各自玩的。
- **挑地方**：在目前視窗內放得下的落腳點中隨機（波浪線 ×1.4、`prefer` 指定的角色 ×5、`weight`、第一位偏向可相遇的地方 ×3、第二位偏向第一位的對面 ×4 或同一高度 ×2、`traits.zones`），排除別人站著或要去的位置、別人佔著的 spot／peek／edge 與同 `group`；放不下（太高、`ceiling`、太寬會壓到 `clear`）就不選。
- **進場**：`line`／`spot` 從較近（或 `from` 指定）的一側走進來（約 2.6 秒內，遠時小跑）；遠的 spot 多半直接翻起來；文字類 `edge` 翻起來；卡片 `edge` 從卡片後面爬上來、坐下、腳垂在前面；`peek` 從元素頂端探頭（`show` 決定露多少，至少露出眼睛）或從側邊滑出來。跳跳型（`data-walk="hop"`）一路跳。離場倒過來。
- **活動**：落腳點的 `acts` ∩ 站姿可做的 ∩ 角色有的部件（reveal 要 torso-alt、twinkle 要 stars、nap 要 `traits.naps` 或 `prefer`；探頭時要有手能舉過邊緣才揮／招手）；`traits.likes` 權重 ×3、不連做同一件。read（小書）、swing、look、wave、stretch、hop、deco（掀帽／點頭帽子跳／晃）、reveal（手掀角，或轉身）、twinkle、point、beckon、lean、write（寫紙條遞出去）、nap（sleepy → nap 眼睛、zZ）、duck。手臂在紙後面的角色，手要越過身體時那隻手暫時移到前面。
- **打招呼（遠遠地）**：見上方。只在兩隻都在活動之間（不在半個動作裡）開始。
- **相遇（走過去）**：注意到（走一半就轉頭、o 嘴、加快）→ 走到約半個身體距離 → 揮手 → 共振 2–3 拍（同步上下、三條鉛筆波浪在中間脈動、臉紅、閉眼笑）→ 三選一：沒事／遞小紙條（對方拿到臉前看）／碰碰手（先走到手套搆得到的距離；手太短就改遞紙條）→ 各走各的（擋住的那隻摺回頁面）或一起走（同速、保持一步）。
- **訪客**：滑鼠移上去會看著指標、揮手（觸控不觸發）；點一下閉眼開心跳；第二下害羞（手套遮臉、臉紅）然後離開。
- **動態**：預設姿勢每秒 12 格、位置每秒 24 次，可切流暢；眨眼 2.5–6 秒一次；走路時腿繞髖擺、身體隨步伐起伏並往前傾、手臂與同側腿反向。
- **捲動**：角色活在頁面座標；落腳點離開視窗就加快離開，完全看不到就直接移除，新的在視窗內挑地方。
- **安靜**：`aria-hidden`、只有軀幹上的形狀吃指標、分頁隱藏或舞台不在畫面內就停。減少動態：一隻靜靜待在畫面裡，不走、不眨眼、不跑迴圈、不吃指標；捲動停下後換到畫面裡。深色：同一套圖整層稍暗、只多顯示 `stars-glow`，道具依落腳點換淺色鉛筆。

## 落腳點格式（ledges.json）

```jsonc
{ "desktop": { "page": {…}, "unitHeight": 120, "content": [{ x, y, w, h }, …], "ledges": [ … ] }, "mobile": { … } }
{ "id": "hero-wave", "kind": "line", "points": [[x, y], …], "meet": true, "acts": ["wave", …] }      // 沿著走（兩端到頁緣）
{ "id": "card-1-top", "kind": "edge", "points": […], "stance": "sit", "cover": { x, y, w, h, top: [[x, y], …], radius } } // 從 cover 後面爬上來坐
{ "id": "headline-l", "kind": "edge", "points": […], "stance": "stand", "enter": "pop", "group": "headline", "partner": "headline-r" } // 翻起來站
{ "id": "qr-left", "kind": "peek", "side": "left|right|top", "cover": {…}, "ground": y, "show": 0.6, "ceiling": y } // 躲在後面探頭
{ "id": "badges", "kind": "spot", "x": …, "y": …, "from": "left", "target": [x, y], "clear": [rect…], "stance": "stand|floor", "meet": true, "partner": "qr-point", "ceiling": y }
```
每個落腳點都可以有：`zone`（hero / feed / cta / footer）、`weight`、`group`、`partner`、`meetChance`、`ceiling`、`clear`（edge 也有：坐的位置不能蓋到的矩形）、`ink: { light, dark }`、`avoid: [slug]`、`enter: "pop" | "walk"`。
`target`：指、招手、靠、寫字對準的點；`clear`：站的時候要讓開的矩形（旁邊的按鈕、上方那行字）；`prefer`：偏好的角色 slug。

## 真站怎麼提供落腳點

- 元素加屬性，在 client 端用 `getBoundingClientRect() + scrollY` 換成頁面座標，resize／字型載入後重算：`data-mascot-ledge="edge" data-mascot-stance="sit" data-mascot-acts="read swing look"`、`data-mascot-ledge="spot" data-mascot-from="left" data-mascot-target`、`data-mascot-ledge="peek" data-mascot-side="left"`、`data-mascot-partner="…"` 等；cover 就是元素自己的矩形（卡片的手繪外框可以從 `HandDrawnBorder` 的 path 取樣上緣，`radius` 取 CSS 的圓角）。
- `content`：首屏的標題、段落、膠囊、QR、徽章、頭像列，卡片標題、按鈕、CTA 標題與按鈕、頁尾 Logo 的矩形（`data-mascot-content` 標記即可）。
- `ink`：每個區塊的背景是淺是深（CSS 變數知道，不必量）。
- 兩條波浪：從它們自己的 SVG path（`wavyPath` 產生的 d）用 `getPointAtLength` 每 8px 取樣，加上 SVG 在頁面上的位移與縮放，就是 `line` 的 points；不必掃圖。
- 「在元素後面」：真站不必複製截圖。最簡單是不給 `env.behind`，用引擎內建的 clip-path（連點擊一起裁掉）；或讓角色層在該元素之下（z-index，元素自然接住點擊）。不要用讓點擊穿過去的蓋片。
- `viewport()` 回傳 `{ x: scrollX, y: scrollY, w: innerWidth, h: innerHeight }`（扣掉固定 header 的高度更好）。

## 移植到 Next.js 首頁（之後；這輪不動 Resonance repo）

1. 圖：`cast/<slug>/*.png`（可轉 WebP）放 `public/mascots/<slug>/`；manifest（含 `build.mjs` 加上的 `hit`、`reveal`）用 import 進來（或 build 時內嵌）。
2. `src/components/sections/MascotStage.tsx`（client component）：`useEffect` 裡 `await import('@/lib/mascots/mascot-stage')`（landing 首屏不必等它），建立一個 `position:absolute; inset:0; pointer-events:none` 的層掛在 landing 的 `<main>`，`createStage(env, cast, { size })`，unmount 時 `destroy()`。`unitHeight` 用 `useMediaQuery` 決定 120 / 80，`theme` 跟 `data-theme`，`reducedMotion` 跟 `prefers-reduced-motion`。
3. 落腳點與 content 由各 section 用 data 屬性標記（見上），元件收集；波浪從 `HeroSection`／`CTASection` 的 path 取樣。
4. 已登入的 app 頁不放；只在 landing。只用 transform/opacity，不影響版面（no layout shift），CSP 不需新增來源。
5. 引擎已是無框架 ES module；改成 `.ts` 時型別照 README 的 env／options 寫即可。

## 我對舞台規格做的調整

- 一次拜訪仍以 9–16 秒為目標；走路限在約 2.6 秒內，遠的地方多半直接翻起來，到了之後至少保證約 4.5 秒的活動。
- QR 卡片頂端不探頭（上方段落只留 33px，連眼睛都露不出來）；改成 QR 左側探頭＋QR 旁邊的站點「指給你看」。手機的商店徽章：站在徽章兩側、比徽章底低 18 px（段落在上方 40 px，站得下的只有摺摺大小以下的角色）。
- 從元素頂端探頭時不做「指」（手會伸到元素後面看不見）。
- 桌機第一排中間那張卡、手機第一張卡不坐（會遮住「真實的人、真實的經歷…」那行）。
- 手機「寫下你的故事」是滿版按鈕，旁邊沒位置：從按鈕左端後面探頭招手，並用 `ceiling` 擋住太高的角色（牽牽只露頭和蝴蝶結，正好很可愛）。
- 相遇時先停在約半個身體的距離（中間要放三條波浪），碰碰手／遞紙條前再走近；手搆不到就改遞紙條。窄的地方（手機、標題）改成隔著東西遠遠地打招呼。
- 「手臂與腿反向擺」做成每隻手與同側腿反向（所以兩手是一開一合，幅度小）。

## 已知問題／還沒做

- 坐在卡片邊一定會蓋到上一張卡片底部的一點空白與分隔線；沒有「文字地圖」，只靠 `clear`／`ceiling`／`content` 避開。
- 原型的「在元素後面」是截圖裁片，真站要換成 clip 或 z-index。截圖是某一刻的首頁，首頁改版要重跑 `measure-ledges.py`。頭像列（手機）的蓋片仍是圓角矩形，不是四個圓。
- 12 格模式的叫醒間隔在 headless Chrome 裡不規則（它的畫面排程跟螢幕不同）；60 Hz 的模型與真機上應是 33／50 ms 交替，還沒在真的手機上量。
- 遠遠地打招呼只在兩隻高度相近、中間放得下波浪時發生；斜對角（一隻在標題、一隻在頭像列）不打招呼。
- 沒有聲音；不記住誰來過（重新整理就重來）。
