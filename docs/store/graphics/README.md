# 商店圖片（App Store / Google Play）

從實機截圖產生上架用的行銷圖，繁體中文（zh-TW）與英文（en-US）各一組：每組 6 張 iOS、6 張 Android，加上 Play 的主題圖片與圖示。手繪形狀、顏色、筆觸都取自 App 本身（`src/lib/design/*`、`src/styles/tokens.css`），所以同樣的 seed 每次都畫出同樣的圖。

```
raw/ios/<key>.png          模擬器截圖（App 設成中文）  ─┐
raw/android/<key>.png      模擬器截圖（App 設成中文）  ─┤
raw/ios-en/<key>.png       模擬器截圖（App 設成英文）  ─┼─ npx tsx docs/store/graphics/render.ts ─→ out/…
raw/android-en/<key>.png   模擬器截圖（App 設成英文）  ─┘
```

`<key>` 依序是 `feed`、`card`、`write`、`resonance`、`messages`、`thoughtmap`。

| 輸出 | 尺寸 | 來源 |
| --- | --- | --- |
| `out/ios/<nn>-<key>.jpg` | 1320×2868（App Store 6.9"） | 只用 `raw/ios` |
| `out/android/<nn>-<key>.jpg` | 1080×1920（Play 手機 9:16） | 只用 `raw/android` |
| `out/ios-en/<nn>-<key>.jpg` | 1320×2868（App Store 6.9"，English (U.S.)） | 只用 `raw/ios-en` |
| `out/android-en/<nn>-<key>.jpg` | 1080×1920（Play 手機 9:16，en-US） | 只用 `raw/android-en` |
| `out/play/feature-graphic.jpg` | 1024×500（zh-TW） | 不用截圖 |
| `out/play/feature-graphic.en.jpg` | 1024×500（en-US） | 不用截圖 |
| `out/play/icon-512.png` | 512×512（32-bit PNG） | `AppIcon-1024.png` 縮小，沒有重繪 |
| `out/ipad/<nn>-<key>.jpg` | 2752×2064（App Store 13" iPad，橫向） | 只用 `raw/ipad`（iPad Pro 13-inch 模擬器，橫向） |
| `out/tablet/<nn>-<key>.jpg` | 2560×1440（Play 7 吋與 10 吋平板，16:9） | 只用 `raw/tablet`（Pixel Tablet AVD，橫向） |
| `out/ipad-en/`、`out/tablet-en/` | 同上（English） | `raw/ipad-en`、`raw/tablet-en` |
| `out/mac/<nn>-<key>.jpg` | 2880×1800（Mac App Store，16:10） | 只用 `raw/mac`（Mac 版視窗截圖，見下面「Mac」） |
| `out/mac-en/<nn>-<key>.jpg` | 同上（English (U.S.)） | 只用 `raw/mac-en` |

iOS 與 Android 一定各自用自己的截圖：商店會退回拿另一個平台截圖的版本。英文那組也一樣各用各的 `-en` 資料夾，上傳到各商店的 English 本地化。缺哪一張（中英文都一樣），就會用 `raw/_placeholder/` 的假畫面頂替（畫面上有紅色「PLACEHOLDER」標籤，英文那組是英文標籤），並在結尾警告；上傳前確認沒有警告。

## 重新截圖

換一張，只要覆蓋 `raw/<平台>/<key>.png`（PNG，直向，不必是特定尺寸，比例會保持不變形）。

- iOS：iPhone 6.9" 模擬器（例如 iPhone 17 Pro Max，1320×2868）：`xcrun simctl io booted screenshot docs/store/graphics/raw/ios/feed.png`
- Android：手機模擬器：`adb exec-out screencap -p > docs/store/graphics/raw/android/feed.png`
- 英文版：把 App 切到 English（設定裡的語言，或模擬器 / 手機的系統語言），用同一批資料和同樣的畫面各拍一次，存到 `raw/ios-en/`、`raw/android-en/`，檔名與 key 都和中文那組相同。
- 資料用 `npx tsx scripts/seed-emulator.ts` 灌進 Firebase emulator，只會碰到本機的 emulator。
- 平板（`ipad`、`tablet`）都拍橫向。iPad 的狀態列會被裁掉（模擬器覆寫的日期一律是英文），拍之前把 iPad 的多工設定改成「全螢幕 App」，右下角才不會有視窗縮放把手。思緒地圖那張用 `seed-store-demo.ts --wide-map`（兩個區域左右並排，填滿橫向畫面）；寫作那張用一般的上下排（地圖在編輯區旁邊）。平板有幾張換成專屬的副標（`SLIDES` 的 `tabletCopy`）。

## Mac

Mac 版（iOS target 用 Mac Catalyst 建）的五張，順序和 App Store Connect 上的一樣：`feed`、`card`、`write-map`、`messages`、`cardbox`（`raw/mac/<key>.png`、`raw/mac-en/<key>.png`）。版面參考主流 Mac App 的做法（`mac-research.md`）：四張是一欄文字在視窗旁、大視窗跑出另一側的邊，文字欄左右輪流；`write-map` 是一行標題在上、視窗在下，另外把地圖上一張卡片和它的連線放大放在左邊的紙上。每張一個淡主題色紙，視窗就是截圖本身加一圈手繪筆線，沒有筆電外框、沒有陰影。版面、文案與放大的範圍都在 `render.ts` 的 `MAC_SLIDES`（`win` 是視窗的左、上、寬，可以超出畫布；`zoom.src` 是視窗裡的範圍，單位是點）。標題和副標可以用 `\n` 自己斷行，`--check` 會確認每一行都沒有再被折行。

截圖是 1440×900 pt 視窗的 `screencapture -l`（2880×1800，四角透明，產圖時會補紙色再裁成手繪圓角）；`card` 和 `messages` 例外，各用 900×900 與 1000×900 pt 的窄視窗拍（`MAC_SLIDES` 的 `window`），閱讀欄與對話才會填滿視窗，不會一大片空白。缺哪一張就跳過那張並在結尾警告，不會用假畫面頂替。

1. 建一個開發簽章的 Mac 版，用自己的 bundle id（`RESONANCE_BUNDLE_SUFFIX=.macdev`），不會碰到這台 Mac 上 App Store 裝的那份：見 `apps/README.md` 的「The Mac app」。
2. 開一組自己的 emulator 和 dev server（不要動共用的 9099/8080 與 :3000）：`EMULATOR_AUTH_PORT=9299 EMULATOR_FIRESTORE_PORT=8280 npm run emulators:at`，另一個終端機 `EMULATOR_AUTH_PORT=9299 EMULATOR_FIRESTORE_PORT=8280 npm run dev:emulator -- --port 3300`（主 checkout 已經有 dev server 在跑時，從另一個 worktree 跑，兩個 `next dev` 不能共用 `.next`），然後灌資料：`EMULATOR_AUTH_PORT=9299 EMULATOR_FIRESTORE_PORT=8280 npx tsx scripts/seed-store-demo.ts`（英文用 `--lang=en`；它會先清空這組 emulator）。
3. 開 App：`open -n <dd>/Build/Products/Debug-maccatalyst/Resonance.app --args -emulator YES -emulatorAuthPort 9299 -emulatorFirestorePort 8280 -emulatorApiPort 3300 -email demo@resonance.test -password resonance-emulator-pw -macWindowSize 1440x900 -appearance.scheme light -appLanguage zh-TW`（英文：`-appLanguage en`）。不要加 `-AppleLanguages`：在中文系統上用它把 App 切成英文時，頁首會多出 20 pt，字標掉到分頁列下面。換語言重灌資料後，App 還記著上一組的帳號（另一個 uid），先在 設定 → 帳號 登出再重開，`-email` 才會登入新的那組。
4. 每張都先點一下視窗讓它在最前面（紅黃綠按鈕才有顏色），滑鼠移出視窗，再拍：`screencapture -o -x -l <windowid> docs/store/graphics/raw/mac/feed.png`。視窗編號可以用 `CGWindowListCopyWindowInfo` 依 PID 找（寬 1440、高 900 的那個）。
   - `feed`：共振場最上面。`card`：第一張卡片（凌晨兩點的便利商店／The Convenience Store at 2 a.m.），用 `-macWindowSize 900x900` 開，往下捲到封面下半、標題、作者列和幾段故事都在視窗裡。`write-map`：⌘4 卡片盒 → 思緒地圖 → 點「母親打來的電話／A Call from Mom」→ 它上面的「開啟／Open」，寫作頁開在地圖旁（`zoom.src` 對的就是這張卡片在地圖 62% 時的位置）。`messages`：用 `-macWindowSize 1000x900` 開，⌘2 → 和阿澄／June 的對話。`cardbox`：⌘4 已發布。

## 重新產圖

```bash
npx tsx docs/store/graphics/render.ts                    # 全部（中文 + 英文）
npx tsx docs/store/graphics/render.ts ios                # 只做 ios | android | ipad | tablet | mac | play | header（og 只在點名時做）
npx tsx docs/store/graphics/render.ts android --only=feed,card
npx tsx docs/store/graphics/render.ts mac --lang=en --only=write-map --check
npx tsx docs/store/graphics/render.ts --lang=en          # 只做一種語言：--lang=zh-TW | --lang=en（不寫就是兩種都做）
npx tsx docs/store/graphics/render.ts ios android --lang=en --check
npx tsx docs/store/graphics/render.ts --check            # 另外在 Chrome 量文字、字型有沒有載入、有沒有破版
```

`--lang` 決定要做哪組截圖（`raw/ios` → `out/ios`，`raw/ios-en` → `out/ios-en`），也決定 `play` 做哪一張主題圖片（`--lang=en` 只做 `feature-graphic.en.jpg`）；圖示每次都做。`--check` 的字型檢查依語言：中文要載到 Noto Serif TC / Noto Sans TC，英文要載到 Playfair Display / DM Sans，缺了就算失敗；標題或副標換行、被縮小才擠得進去、或離邊緣小於 4%，也都算失敗。

```bash
npx tsx docs/store/graphics/contact-sheet.ts             # out/contact-sheet.jpg（中文）與 out/contact-sheet.en.jpg（英文）：iOS 一列、Android 一列、主題圖片＋圖示，方便一眼檢查；平板與 Mac 做好了也各有一張：out/contact-sheet.tablet[.en].jpg、out/contact-sheet.mac[.en].jpg
npx tsx docs/store/graphics/contact-sheet.ts --lang=en   # 只做英文那張；--lang=zh-TW 只做中文那張
```

需要本機的 Google Chrome（headless）；字型（Noto Serif TC、Noto Sans TC、Playfair Display、DM Sans）第一次會從 Google Fonts 下載並快取在 `build/_cache`，之後離線也能跑。中間的 HTML / PNG 在 `build/`（不進 git）。

## 調整

- 文案、強調字、每張的主題色：`render.ts` 最上面的 `SLIDES`（短句結尾不加句號）；每張有 `'zh-TW'` 與 `en` 兩份 `{ headline, em, subline }`，`em` 必須在標題裡剛好出現一次（否則一開始就報錯）。英文標題用 Playfair Display 700、副標用 DM Sans 500，沒有中文用的字距；字級在 `TYPE`（英文標題比中文小一點，因為拉丁字母比方塊字窄）；強調字底下的波浪線依字母寬度縮放（`waveUnits`）。每句都要在該張的字級下排成一行，`--check` 會驗。
- 截圖底部要裁掉一點（例如手勢列、被切一半的最後一行）：`CROP_BOTTOM`：iOS 約 1.4%、Android 約 1.9%（再多就會切到底部的分頁列）；它也決定手機外框的比例，所以同一平台每張的手機一樣大。某一張要多裁一點（避免切在文字中間），寫在 `SLIDES` 那張的 `cropBottom`，兩側會等比例修掉一點，外框大小不變。換新截圖後要重新對一次。
- 螢幕圓角：`SCREEN_RADIUS`。
- `out/` 被專案根目錄 `.gitignore` 的 `out` 規則忽略；`raw/`（含 `raw/*-en/`）被這個資料夾的 `.gitignore` 忽略，截圖原檔需要時重拍。

## 頁首、搜尋結果與主題圖片用在哪裡（2026-10-27 備註）

- `header` 目標做的 `out/appstore/header[.en].png`（3840×1646）與 `search[.en].png`（5244×2950）是 App Store Connect「標題和搜尋結果」的兩張素材（iOS 27 產品頁的頁首與搜尋結果大圖），2.1.1 送審時上傳過。它們只在 iOS 27 的 App Store 出現，何時顯示由 Apple 決定；2026-10-27 擁有者在 App Store 上沒看到。
- `play` 目標的 `feature-graphic[.en].jpg`（1024×500）是 Play 商店資訊必填的主題圖片。手機的商店頁平常不顯示它，有宣傳影片時才當影片封面，被精選時也可能用到；目前沒有宣傳影片。
- 網站的分享圖 `og`（`public/og-cover[.en].jpg`）是從 `header` 的做法改出來的新版：品牌照 AppHeader 的樣子（波紋與 Resonance 字標），下面一行副標，左右各兩張完整的卡片（`OG_CARDS`，不切邊）。它比 `header` 好看。
- 所以這三張之後若要再用（重新上傳、App Store 開始顯示、Play 加了宣傳影片），先照 `og` 的版面重畫：品牌與副標照 `ogHtml`，卡片完整不切邊，只依各自的尺寸與安全區（`HEADER_SAFE`、`SEARCH_SAFE`、`FEATURE`）調整位置與張數。
- 2026-10-28 頁首重畫（2.2.1）：擁有者在 iPhone 產品頁看到它，那裡大約只露出中間四分之三的寬度、幾乎整個高度（返回與分享鈕壓在上面兩角，動態島在上緣中間），下面緊接著 App 的名稱與圖示。所以頁首**不放品牌**，只有那句話加副標，字縮小到中間泡泡寬度的大約七成；每邊兩張卡片飛進這個範圍、貼著文字，另外每邊一張只在 iPad／Mac 較寬的畫面才看得到；卡片完整不切邊，也沒有陰影（App 是平的）。檢查 iPhone 的樣子：把 header 裁中間 2840 px 寬來看。`search` 還是舊的版面（上面一句話、下面三台 iPad），沒有重畫。
