# 首頁紙偶舞台：程式碼審查（唯讀）

範圍：`src/lib/mascots/**`、`src/components/sections/LandingStage/*`、`scripts/mascots/*`、`public/mascots/**`，以及首頁各元件只加的 `data-mascot` 屬性、`page.tsx` 的 `<LandingStage />`、CLAUDE.md 的「Landing stage」一段。我沒有改任何 repo 檔案；探針腳本與輸出都在
`/private/tmp/claude-501/-Users-ncchen-Documents-Resonance/3169a3a1-407a-43b9-a40d-6b2f52c2622f/scratchpad/mascots/r3/r4/reviewlogs/`，對象是 http://localhost:3000 上已在跑的 dev server（自己開的 headless Chrome，結束時都已關閉）。

## 自己跑的檢查

| 指令 | 結果 |
| --- | --- |
| `npx vitest run src/lib/mascots src/components/sections` | 29 個檔案、286 個測試全部通過（mascot 相關：measure 13、engine 11、LandingStage 5、stage 7、rig 2、cast.generated 3、presets 4）。stderr 只有既有的 jsdom canvas 與 ThreadView act() 警告，跟這次改動無關 |
| `npm run typecheck` | 通過（exit 0） |
| `npm run lint` | 0 errors、85 warnings；85 個全在已追蹤的 `designs/mascots/round1–3` 舊檔，新程式碼沒有任何 warning |

## must（照現在上線會出 bug）

### M1. 舞台 chunk 載入失敗或掛載時丟錯 → 整個首頁變成錯誤頁
- **在哪**：`src/components/sections/LandingStage/LandingStage.tsx:7`（`dynamic(() => import('./StageLayer'), { ssr: false })`）和 `StageLayer.tsx:38`（在 useEffect 裡呼叫 `mountLandingStage`，沒有 try/catch）。
- **證據**：`probe3.mjs` 讓 `_app-pages-browser_src_components_sections_LandingStage_StageLayer_tsx.js` 的請求失敗。頁面載入時 hero 和標題都在（「讓生命影響生命」），但 9 秒後 `<main>` 只剩「沒能載入，請再試一次／再試一次」，hero 不見了，console 記到 `ChunkLoadError`（`reviewlogs/probe3-chunkfail.json`）。原因：在 Next 15.5 裡，`next/dynamic` 加 `ssr:false` 其實就是包在 Suspense 裡的 `React.lazy`，外面沒有 error boundary（見 `node_modules/next/dist/shared/lib/lazy-dynamic/loadable.js`），所以 import 被拒絕時會一路往上丟到 `[locale]/error.tsx`。effect 裡同步丟出的錯誤也會走同一條路。
- **會發生的情境**：Vercel Hobby 沒有 skew protection，所以頁面開著時剛好部署，舊 hash 的 chunk 會回 404；手機網路斷掉一下也會；`measureLanding` 或 `createStage` 遇到沒預料到的 DOM 也會。為了一層裝飾，把整個行銷首頁賠進去。
- **修法**：`<StageLayer />` 外面包一個失敗時渲染 `null` 的小 class error boundary（或不用 `next/dynamic`，改在 effect 裡 `import('./StageLayer').then(set).catch(() => {})`）；`mountLandingStage` 包 try/catch，只在 dev 印一次 log。再補一個測試：lazy import 被拒絕時，頁面還在。

### M2. 每次量版面要 0.25–0.3 秒，主執行緒被卡住，而且一開始至少量兩次
- **在哪**：`src/lib/mascots/landing/measure.ts:159-177`（`pathPoints`）、`:431-435`（每張卡片外框的每條有描邊的 path 每 4 px 取一點）；`stage.ts:175-176`（ResizeObserver 觀察 body）。
- **證據**（這台 Mac，dev build；時間幾乎都花在原生 API 上，所以 production 也快不了多少）：
  - 桌機 1440：`measure()` 跑 5 次是 282/253/249/250/250 ms（`probe1-desktop.json`）。
  - 平板 834：240/230/228/230/228 ms；手機 390：24/18/16/15/15 ms。
  - `probe2-desktop.json`：一次 measure 呼叫 `SVGGeometryElement.getPointAtLength` 3,024 次，總共 262 ms（整次 measure 266 ms）。Range、元素的 `getBoundingClientRect` 和 `getClientRects` 加起來不到 1 ms。
  - `probe4-desktop.json`：舞台起來後，layout 在 2094 ms 和 2493 ms 各換一次。第一次是掛載時量的；第二次是 ResizeObserver 一開始一定會送的那次觀察，150 ms 後觸發 `remeasure`，這次其實多餘。之後每次寬度改變、body 高度改變、字型 `loadingdone` 都會再量一次。
- **影響**：桌機和平板在舞台出現那一刻，主執行緒被佔約 0.5 秒，在真的 iPad 或中階筆電上會更久。這時讀者點擊或捲動，INP 就直接吃到這段延遲。
- **修法**（可以合併做）：
  1. 卡片只需要外框的頂端（`topContour` 只取離 `card.y` 24 px 以內的點），取樣間距改成 12–16 px，或只取頂端那一段。
  2. 用 path 的 `d` 加 CTM 當 key 快取 `pathPoints`，什麼都沒變的重量就幾乎不花時間。
  3. 跳過 ResizeObserver 的第一次回呼（或先比對 body 尺寸和上次量的一不一樣）。
  4. `measure.test` 的 fixture 加一條斷言，限制 `getPointAtLength` 的呼叫次數。

## should（明顯該改）

### S1. 舞台上沒有角色時，迴圈還是每秒跑 24 格
- `engine.ts:272-301`（`wake`/`loop`）。`probe1-desktop.json` 裡 visitors 為 0 的那幾秒，每秒格數是 [18, 24, 24, 24, 24]：每格都有一次 timer 加一次 rAF，只要分頁看得到就一直這樣。讀者捲到沒有落腳點的地方時也一樣（`place()` 每 1.5 秒重試一次，迴圈照跑）。
- 引擎雖然有 IntersectionObserver，但它觀察的是整頁高的 layer，永遠不會「離開畫面」，所以註解說的「layer 不在畫面中就停」在首頁上從不成立。
- 每格大約只要 0.08 ms，但手機會一直被喚醒，耗電。
- **修法**：`chars` 空了而且不是減少動態模式時，改成只設一個計時器睡到 `plan.at`；捲動（viewport 改變）或頁面重新顯示時再叫醒。

### S2. 部件圖還沒載完，角色就已經上台
- `puppet.ts:179-189`：建立 `<img>` 後馬上開始拜訪，沒有等 `complete` 或 `decode()`。
- `probe5.mjs` 把每張 `/mascots/*` 圖延遲 1.5 秒，結果在畫面內、opacity 1 的角色身上，看得到的 12 個部件全都還在載入，前後輪詢到 29 次（約 2.9 秒，`probe5-slowpics.json`）。
- 慢速手機網路上會先只看到身體沒有眼睛，部件再一片一片冒出來。
- **修法**：每個角色第一次上場前先 preload 加 `img.decode()`（可以在兩次拜訪之間的空檔先暖下一位）；圖還沒好就先不選它。

### S3. 帶 `?v=` 的角色圖沒有長快取，同一隻角色每次回來都重新請求
- dev 回應的是 `Cache-Control: public, max-age=0`（`probe2` 記到）；Vercel 預設給 `public/` 的是 `max-age=0, must-revalidate`。
- 每次拜訪都會建新的 `<img>`：60 秒內有 78 次圖片請求，但只有 62 個不同的網址（在 production 就是一堆 304）。
- `?v=` 本來就是內容版本，正好可以設成 immutable。
- **修法**：在 `next.config.ts` 的 `headers()` 加 `{ source: '/mascots/:path*', headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] }`，安全標頭那一條要保留。

### S4. 只要有一格丟錯，之後每一格都會再丟
- `engine.ts:302-327` 的 `frame()` 只有 `try/finally`、沒有 catch。只要是固定會發生的錯（例如落腳點幾何不對、DOM 參照已經過期），每秒會丟 24 次到 window.onerror，永遠不停。
- `stage.ts:109` 的 `remeasure()` 在 timer 裡丟錯時，監聽器全都還掛著，之後每次 resize 都會再丟一次。
- **修法**：`frame()` 加 catch 並計數，連續失敗 N 次就停下或銷毀舞台；`remeasure()` 包 try/catch。

### S5. 沒有測試把標記綁在真正的元件上
- `measure.test` 和 `stage.test` 都用 `landingFixture` 手刻的 DOM。所以就算有人：把 GetTheApp 的 `data-mascot="qr"` 改名、改了 CardLinkGrid 的 `data-card-id`、改了卡片的 `<article>`／`<h3>`、改了 SectionEdge 的 `:scope > div[aria-hidden="true"] > svg > path[stroke]` 結構，或拿掉第一個 `<header>`，對應的落腳點都會無聲無息消失，測試卻還是全綠。
- **修法**：加一個 jsdom 測試，用 `renderWithIntl` 渲染真正的 HeroSection、CardFeedSection、CTASection 和 SiteFooter，斷言 `measure.ts` 用到的每個 selector 都找得到元素。

### S6. commit 時 `designs/mascots/cast` 一定要一起進
- `cast.generated.test.ts` 會讀 `designs/mascots/cast`（`castSlugs()` 裡的 `readdirSync`，還有 `sourceHash()`），但這個資料夾目前沒被追蹤（1.2 MB：82 張 PNG 加 5 份 manifest）。
- 只 commit `src/lib/mascots` 和 `public/mascots` 的話，CI 會因為 ENOENT 失敗。
- 要跟 `scripts/mascots` 和 `package.json` 的 `mascots:cast` 一起 commit。

## nice（可選）

- **N1** body 高度改變、讓某個訪客的落腳點移動時，整個舞台會重建：角色演到一半直接消失（沒有退場），1.2–2.5 秒後才來下一位。在模擬器把手機高度減 80 px 就會發生：hero 是 `min-height: 100vh`，body 從 5654 變 5574，舞台跟著重建（`probe4-phone.json`，`sameStageAfterHeightOnly: false`）。真的 Safari／Chrome 的 vh 用大視窗算，所以工具列收放不會觸發；但後來才長出來的內容，或會改 layout viewport 的 in-app 瀏覽器會。可以把現有訪客整體平移，或讓他們先走完再換。
- **N2** layer 高度用 `Math.ceil(footer 底)`，頁面可能多出最多 1 px 可以捲（桌機：layer 3892 px，body 3891 px）。
- **N3** 引擎往 `<head>` 塞的 `<style id="ms-style">` 不會移除，離開首頁後還留著，而且它靠 CSP 的 `style-src 'unsafe-inline'` 才能生效（現在的 CSP 有這一項）。把 STYLE 移進 `LandingStage.module.css` 兩個問題都沒了。
- **N4** `puppet.ts` 的 `onMove` 每次 pointermove 讀 3 個 `getBoundingClientRect`，會在剛寫完 transform 之後逼瀏覽器重算樣式。其實 `facePage()`／`pagePoint()` 已經算得出眼睛在哪。
- **N5** 會一直動的裝飾沒有頁內的暫停方式，只有系統的「減少動態」能讓它停（對照 WCAG 2.2.2 Pause, Stop, Hide，A 級）。hero 的漂浮色塊現在也是一樣。可以考慮一個不顯眼的「這次先別來」。
- **N6** StoryCard 的 `card-edge`／`card-foot` 標記會出現在所有畫故事卡的頁面（動態牆、個人頁），不只首頁。不會出問題，只是多幾個位元組；可以改成由 CardFeedSection 傳進去。

## 確認沒問題的部分

- **引擎不在首頁的初始 chunk 裡**：
  - dev 的 `app/[locale]/page.js` 只有 `LandingStage.tsx`，`StageLayer` 是 lazy 參照；HTML 的 10 個 script 和 RSC 列出的 9 個 chunk 裡都找不到 `ms-stage`、`mountLandingStage`、`MASCOT_CAST`。
  - 舞台 chunk 在 load 事件之後才請求（桌機 load 3142 ms、chunk 3303 ms；手機 828 ms／846 ms）。
  - 用 esbuild 估 production 大小：約 107 KB min、37 KB gzip（含角色清單）。
- **SSR／hydration**：伺服器 HTML 只多了 `data-mascot*` 屬性；`LandingStage` 在伺服器和第一次 client render 都輸出 null；import 時不碰 `window`。
- **無障礙**：
  - layer 是 `aria-hidden`，用 portal 掛在 `<body>`，裡面沒有可聚焦的元素，`pointer-events: none`，z 50 在 header 的 100 下面。
  - 只有軀幹會接指標，而且只在沒蓋到文字和按鈕時才接；上一輪 live 檢查連結中心被擋住的次數是 0。
  - 減少動態和主題（`data-scheme` 的 MutationObserver 加 media query）都會即時跟隨；Save-Data 時完全不載入。
- **效能**：
  - 每格不讀版面：`viewport()`、`ledges()`、`content()` 都回傳上次量的結果。每格平均 0.08 ms、最多 2.1 ms（dev）。
  - ResizeObserver 不會自己觸發自己：一開始只有一筆 body 的 entry。
  - 分頁隱藏時用 visibilitychange 停下迴圈（有測試）。
- **清理**：`stage.ts` 的 destroy 會拆掉 window、mql、MO、RO、fonts 的監聽和 timer（有測試）；引擎的 destroy 會拆 rAF、timer、IO、document 和 window 的監聽、角色和道具；`whenIdle` 的取消有測試；卸載後 layer 會被移除。
- **安全和 repo 規則**：
  - 圖片同源（`/mascots/…`）；`innerHTML` 只用常數 SVG；沒有新依賴（`sharp` 本來就有）。
  - TS strict，沒有 `any`。
  - 沒有新增 i18n 字串，標點規則不受影響。
  - 角色清單過期時 `cast.generated.test` 會失敗。
  - CLAUDE.md 那段的描述和程式碼一致。
- **頁高**：layer 高度等於 footer 底，`scrollHeight` 和 body 一致（差距見 N2）。
