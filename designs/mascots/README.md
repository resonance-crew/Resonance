# 共振吉祥物設計紀錄

業主的完整需求在 [brief.md](brief.md)。目前還在第一階段（提出角色方向，等業主選定），還沒有進入系列設計或動畫。

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
