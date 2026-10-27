# 共振吉祥物設計紀錄

業主的完整需求在 [brief.md](brief.md)。業主看完第二輪後選定方向 C 摺摺，進入第二階段：以摺摺為準做一個系列，再做首頁的動態。第一輪在 `round1/`，第二輪在 `round2/`，第三輪（系列和首頁動態原型）在 `round3/`。

## 第一輪（2026-10-27）

[round1/](round1/)：三個方向，每個方向由一位子代理繪製，經兩位評審點評後各修訂一次（第一版也保留）。

| 方向 | 角色 | 資料夾 |
|---|---|---|
| A 色鉛筆小生物 | 聽芽 Tingya | [round1/a](round1/a) |
| B 蠟筆流體生命 | 漾漾 Plip | [round1/b](round1/b) |
| C 撕紙拼貼紙偶 | 摺摺 Tuck | [round1/c](round1/c) |

- 每個方向的資料夾都有：`character.svg`（可拆件的角色，部位以 `<g>` 分組並標出關節點）、`concept.svg`（概念圖）、`proposal.md`（完整提案）、`explore.svg`（探索草圖）、產生器程式，以及 `-v1` 第一版。
- [round1/proposal/index.html](round1/proposal/index.html)：提案頁（可切換第一版與第二版），線上版本在 https://claude.ai/artifact/Dd66iqCwmEmpLBd14WqA68 。
- [round1/review/](round1/review/)：兩位評審的報告和他們的實測圖（縮小、夜紙、首頁合成、動態姿勢）。
- [round1/mock/](round1/mock/)：三個角色放在首頁截圖上的合成圖。
- [round1/feedback.md](round1/feedback.md)：業主看完後的回饋。
- `workflow.js`：這一輪的工作流程腳本；`render.sh`：用無頭 Chrome 把 SVG 輸出成 PNG。

## 第二輪（2026-10-27）

[round2/](round2/)：保留業主喜歡的部分再試一次。簡報與形體守則在 [round2/brief.md](round2/brief.md)，其中也記下業主問的「為什麼 ChatGPT 的圖都有點像史迪奇或皮卡丘」和我們的回答。三個方向各由一位子代理繪製，兩位評審點評後各修訂一次（初版以 `-v1` 保留），最後再由四位子代理核對修訂結果，其中一位不讀評審意見、只看圖。

| 方向 | 角色 | 資料夾 |
|---|---|---|
| C′ 撕紙紙偶，只修手 | 摺摺 Tuck | [round2/c2](round2/c2) |
| B′ 色鉛筆小生物，新形體 | 漾漾 Tint | [round2/b2](round2/b2) |
| B×C 色鉛筆剪紙貼紙，新角色 | 片片 Flick | [round2/bc](round2/bc) |

- [round2/proposal/index.html](round2/proposal/index.html)：提案頁，線上版本在 https://claude.ai/artifact/Wu5Hz5q5Hk7KspbEfuLPZg 。兩位評審和只看圖的那位都推薦摺摺。
- [round2/reference/](round2/reference/)：業主請我們用 ChatGPT 生成的三張形體參考圖，只用來看原則。截圖裡的滑鼠游標已經塗掉。
- [round2/review/](round2/review/)：`critic-form.md`、`critic-production.md`（兩位評審，評的是初版）、`drafts.md`（畫者的初版自評）、`revisions.md`（修訂者的修改紀錄）、`verify.md`（修訂後的核對與只看圖的第一印象）；`checks/` 是他們的檢查圖。
- 每個方向的資料夾都有 `character.svg`、`concept.svg`、`proposal.md`、`explore.svg`、產生器和 `-v1` 初版。檢查圖轉成 WebP；由產生器重畫得出來的大型檢查 SVG 沒有收進來。
- `workflow.js`、`workflow-verify.js`：這一輪的兩段工作流程腳本。
- [round2/feedback.md](round2/feedback.md)：業主看完後的回饋：選定摺摺，並請我們把肩膀放低、銅釘往內移、手臂縮短，頭上那一根改成頭髮或頭飾，再做一個大約五隻的系列和首頁動態。

## 第三輪（2026-10-27／28）

[round3/](round3/)：照業主對第二輪的回饋（[round2/feedback.md](round2/feedback.md)）修好摺摺，做成五隻一組的系列，再做首頁動態的原型。系列的共同規則、每隻的設定、拆件規格和動態規格寫在 [round3/kit/kit.md](round3/kit/kit.md)。五隻各由一位子代理繪製；三位評審點評第一版（造型、首頁動態，以及一位不讀說明、只看圖的），再由五位修改者各改一隻、一位修動態引擎。第一版留在各角色的 `v1/`。

| 角色 | 紙 | 頭上 | 資料夾 |
|---|---|---|---|
| 摺摺 Tuck（業主選定） | 撕下來的鼠尾草綠紙，折一角 | 撕紙瀏海＋迴紋針 | [round3/tuck](round3/tuck) |
| 牽牽 Twine | 霧藍禮物吊牌，背面「給：」 | 紙繩蝴蝶結 | [round3/tag](round3/tag) |
| 聆聆 Nod | 淡紫橫線索引卡 | 紙貝雷帽 | [round3/card](round3/card) |
| 點點 Pip | 黃色筆記紙打洞的圓點 | 三圈捲紙 | [round3/dot](round3/dot) |
| 悄悄 Hush | 紙劇場的夜空紙，針孔星星 | 月亮髮夾 | [round3/night](round3/night) |

- 每個角色的資料夾：`rig.svg`（拆件角色，給動畫用）、`parts/`（由 `kit/export-parts.mjs` 匯出的部件 PNG 和 `manifest.json`）、`concept.svg`／`concept.webp`、`proposal.md`（最後一節是評審後的修改）、`gen/`（產生器：`node gen/build.mjs` 從同一組參數寫出 rig 和概念圖）、`checks/`、`v1/`（評審前的第一版）、`work/`（過程）。
- [round3/stage/](round3/stage/)：首頁動態的引擎和原型。`mascot-stage.js` 是引擎（沒有外部套件），`prototype.js` 把它放在首頁截圖（`captures/`）上，加上切換桌機／手機、深淺色、大小的控制。第一次打開前執行 `bash round3/stage/sync-cast.sh`，把各角色的 `parts/` 複製到 `stage/cast/`（不收進版本庫）並重建 `stage.bundle.js`；之後直接打開 `stage/index.html`。`node round3/stage/check.mjs` 跑無頭檢查，`round3/stage/verify/sim.mjs` 是模擬（重疊、擋住點擊、相遇頻率）。說明在 [round3/stage/README.md](round3/stage/README.md)。
- [round3/proposal/index.html](round3/proposal/index.html)：提案頁（用的是 `../stage/`，所以也要先執行上面的 sync-cast），線上版本在 https://claude.ai/artifact/6CuSFykF2LXugJTjTCmeQ6 。
- [round3/review/](round3/review/)：`critic-series.md`（造型）、`critic-stage.md`（首頁動態）、`blind.md`（只看圖）、`lead-notes.md`（評審讀完自己的意見後才讀的主持人筆記）；`checks/`、`blind/` 是他們的檢查圖，`critic/` 是動態評審的量測腳本。
- `workflow.js`（繪製）、`workflow-review.js`（評審與修改）：這一輪的兩段工作流程腳本。檢查圖都轉成 WebP；由產生器重畫得出來的檢查 SVG 沒有收進來。
