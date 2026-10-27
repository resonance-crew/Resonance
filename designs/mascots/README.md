# 共振吉祥物設計紀錄

業主的完整需求在 [brief.md](brief.md)。目前還在第一階段（提出角色方向，等業主選定），還沒有進入系列設計或動畫。第一輪在 `round1/`，第二輪在 `round2/`。

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

還沒有選定方向。業主選定之前，不做完整系列、其他角色或動畫。
