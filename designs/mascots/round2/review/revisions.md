# 第二輪 · 修訂紀錄（修訂者回報的原文）

每個方向的 proposal.md 文末也有中文的「修訂紀錄」。

## B′ 漾漾 Tint

**修訂後的一句話：** 一隻用色鉛筆畫出來的小傢伙：頭頂斜插一片有六角硬折角、一端捲起的鉛筆木屑，胸口留著一滴鉛筆繞開的空白，等故事來把它塗上顏色。

### 改了什麼

- Arms (form must-fix 1 and brand must-fix 1): replaced the soft-hose arms with a three-piece arm: upper arm 100, forearm 108 and a mitten. Both arms are the same length and taper from 58 to 45 wide, about 1.45x thicker than before. Each piece is drawn once in its own frame and posed only by rotating at the shoulder, elbow and wrist, with no stretching or scaling.
- Shoulder pivots sit at 309,443 and 491,443, at the outer side of the head-body junction and just inside the head's lower corners. Both arms are layered in front of the head. The visible shoulder joint is the round top of the upper arm with one light pencil arc round the pivot. The forearm's round top covers the elbow and is outlined lightly so it reads as a bend, not a bolt.
- Main pose: the right arm goes up and outward with its mitten top at 218, level with the head top at 217. There is a 40-60 unit gap between the forearm and the head, and the raised hand is still readable in the brightness(0) silhouette at 48 and 96 px. The resting left arm has its elbow out and its mitten on the belly, with the mitten bottom at 634, above the hip line at 646.
- Rotate-only rig test: checks/rig.svg and checks/rig.png show arms at rest, both arms raised, a left-hand wave and a right-hand wave. All four frames use the same arm layers, and faint ghosts show the forearm's 32-degree swing.
- Crest (form must-fix 2 and brand must-fix 3): removed the point and the stalk. The pencil shaving is now an annular fan whose base arc is pushed into the top of the head: the base chord is about 37% of head width, and the visible crest is about 72% of head width.
- Its outer edge is five straight facets with hard corners (the hexagonal pencil barrel laid flat), with a fold line from each corner and a scalloped lavender paint band. The whole crest leans 27 degrees to the viewer's left, and the end near the middle of the head is rolled into a small tube that stays inside the outline. Open and shut now means how many facets stand up and how upright they are (moved: 7 facets, upright, warm rim; read: 3 facets, folded low).
- Gradient (form must-fix 3): the hue now runs from 308 at the top of the head to 155 at the toes, about 150 degrees (it was 300 to 248). That is a lavender head, a periwinkle head edge and body top, mist-blue body and arms, a hint of grey-green at the bottom of the body, and sage toes. Head pencil outline oklch(48% 0.068 292), body and arms oklch(47% 0.06 250), legs and feet oklch(47% 0.05 205). Lavender head and blue body read as two separate colour areas at 96 px.
- Fewer white paper-tooth dots: raised the threshold of the paper-tooth mask (f-tooth1) from 0.6 to 0.665, which by my estimate roughly halves the partly see-through dots. Halved the light hatch strokes on the lit side of the head and body.
- Opaque material (brand must-fix 2): the underpaint is now always on, day and night, eroded 3 units instead of 6. By day it is paper cream, with a breath of the part's own colour on the head and body. Measured inside the figure, pixels with alpha below 235 dropped from 26% to 2.4%. The brightness(0) silhouette is solid, nothing bleeds through on the peach or sage blobs, and the day bake also works on night paper (checked).
- prefers-reduced-motion is specified in proposal section 5: show a static pose, with no walking, breathing, waving or line boil.
- Face (brand must-fix 3, plus the overlapping weakness): the eyelid line now stops at the outer eye corner with no upward flick. It is thinner and drawn with the denser ink filter, so it no longer looks like eyelashes. The main pose's open mouth with a red tongue became a lopsided line smile.
- Supporting adjustments: head tilted 4 degrees left and enlarged slightly to 304x248 so it stays about 50% of total height; raised mitten's thumb turned toward the head; the reading card made smaller and lower so the chest drop shows; the ground shaving in the concept redrawn with the same faceted edge and rolled end.
- Concept side text and caption updated. character.svg header comment documents the rig and the underpaint, and pivot comments give the shoulder, elbow and wrist for both arms.
- New and updated checks: checks/forms.html and checks/forms.png (colour, brightness(0), flip, upside down, 48 and 96 px, peach and sage blobs, night) and checks/silhouette.png. The earlier checks moved to checks/round2-v1/.
- Backups made before any edit and left untouched: concept-v1.png, concept-v1.svg, character-v1.svg, proposal-v1.md, plus gen-r2v1.py and character-v1.png. Re-rendered character.png (800x800) and concept.png (1600x1000) and viewed both. xmllint --noout passes for character.svg, concept.svg, checks/rig.svg and checks/silhouette.svg, and no comment contains a double hyphen.
- proposal.md rewritten to match the images. It ends with a revision log (修訂紀錄) covering what changed, why, and what was not changed. Cost estimate revised to about 12-12.5 person-days.

### 沒照做的部分與原因

- Brand must-fix 2, partly: the brand reviewer asked for pure paper-cream underpaint by day. The mittens and the crest use paper cream; the head and body use paper cream with a breath of their own colour (oklch(94.5% 0.018 300) and oklch(94.5% 0.016 238)). Reason: pure cream turns the paper-tooth holes into bright white sparkle at 48-96 px, which works against the form reviewer's request to halve the white dots. The figure is still fully opaque, so the goal of that must-fix is met.
- Brand must-fix 1, '垂手' frame: the arms do not hang straight down at the sides. With a fixed length long enough to bring the mitten level with the head top, a straight hanging arm would drop below the hip line, which the form reviewer forbids. Following the form reviewer's other option, the rest frame has both hands held in front of the belly with elbows out.
- Not done because they are not must-fix (noted in the proposal instead): a breathing parent group around body, head and arms, and a darker ground shadow on night paper.

## C′ 摺摺 Tuck

**修訂後的一句話：** 一張被撕下來的色紙，一直折著一個角，因為折角底下藏著幾行字。它的兩條寬紙條手臂用銅釘釘在撕邊上，末端是撕出拇指的奶油色連指手套，舉起手來就到頭頂。

### 改了什麼

- 手臂改短、改寬（形體評審必修 1）：肩釘到手套中心從 194 縮到 164；紙條從寬 38、手腕 33，改成寬 50、往手腕收到 43。手套和手臂的寬度比從約 1.75 降到約 1.4（連拇指一起算）。剪影不再是「細棍＋圓球」。
- 銅釘移到身體的撕邊輪廓上（形體評審必修 2）：左邊從 276,412 移到 249,420，右邊從 532,414 移到 565,430。手臂大部分落在身體外，垂下時不再像吊帶褲的背帶；臉兩側空出來，也沒有螺絲的感覺。
- 主姿勢「嗨」改成舉左手（畫面左側），身體往右傾 4°、抬起左腳。右上角現在只留折角這個標誌。右手最多往外上舉到 −45°，剛好不碰到折角下尖，rig2.png 已驗證。
- 手套改成連指手套（形體評審必修 3、品牌評審必修 2）：在靠身體那側撕出一個往指尖斜出的小拇指和一道 V 形缺口；手掌部分約 63×57，比原本小約 5%，連拇指寬約 66。三行字跡和右下的排線全部拿掉。
- 左上紙舌（品牌評審必修 1）：從圓頭改成更窄的平頭斜切撕口，根部約 36、露出的長度約 40，頂端加一個小缺口，保留往外斜出的方向；pivot 改到 305,289。
- 風琴腿從玫瑰色改成麥黃色（品牌評審必修 3）：亮面 oklch(86% 0.066 88)、摺面 oklch(75.5% 0.075 82)，腳仍是綠色，全身不再有粉色。和玫瑰、深鼠尾草的比較在 work/legs-test.png。
- 概念圖重新擺姿勢：「一起看嗎？」的右手改成 80°，留在身體外；「被故事打動」的雙手改成 30°／150°，紙條從嘴巴下方交叉，不再遮住嘴。揮手的短線、說明文字、縮小測試的置中都跟著新輪廓調整。
- 產生器 gen/tuck.mjs 新增 MAIN 姿勢常數和 mitten 手型，character、concept、formcheck 三份產生器都已更新。初版產生器留在 work/tuck-v1.mjs，explore.mjs 改成引用它，重跑會產生和原本相同的 explore.svg。
- 重新渲染 character.png（800×800）、concept.png（1600×1000），以及 work/formcheck.png、work/rig2.png（只轉群組、不重畫的五個姿勢）、work/before-after-r2.png。用 xmllint 檢查 character.svg 和 concept.svg 都通過；所有 id 都有 c2- 前綴，沒有引用任何外部檔案。
- proposal.md 全面改寫，和新圖一致：比例、色值、拆件表的 pivot 與角度限制、形體自我檢查、避免仿作的對照表都已更新。文末新增「修訂紀錄」，寫明改了什麼、為什麼、哪些沒改。v1 備份是 concept-v1.png、concept-v1.svg、character-v1.svg、proposal-v1.md，都沒有動過。

### 沒照做的部分與原因

- 形體評審必修 2 裡「右臂舉起時整條紙條要完全落在折角外、不碰折角下尖」：沒有照字面做，改用舉左手處理。理由是這句話和另外三個條件在幾何上不能同時成立：肩到手套 155–165、手套中心要到頭頂、銅釘要在撕邊上且高度不變。右肩銅釘就在折角下尖（566,386）正下方 28–44 的位置，寬 50 的紙條要舉到頭頂一定會蓋住下尖；要讓開下尖，最多只能舉到 −45°，那樣手套就到不了頭頂。所以「嗨」改用左手，右手只往外上方張開到 −45°。代價是右手不能大幅舉高，這條規則已寫進拆件表。
- 品牌評審建議手套直徑縮小約 10%：只縮了約 5%。手掌部分 63，連拇指 66。理由是形體評審要求手套約為紙條寬的 1.3–1.4 倍，紙條寬 50 時是 65–70，兩位評審的數字有衝突，所以取中間值。
- 形體評審的「手套上最多留一行很淡的線」：最後一行都沒留。試過兩種都不行：一行連筆字的兩段弧線在圓紙片上像一張閉著眼的小臉；一條橫過手套的直線則像繃帶或袖口（Mr. Bump）。
- 腮紅（形體評審列為非必修，請業主決定）：維持三道赤陶色斜線，沒有畫變體。兩個選項寫在提案裡請業主選：一是平常不畫、害羞時才出現；二是回到柔和圓形，改用低彩度赤陶色。
- 風琴腿的顏色兩位評審意見不同：形體評審認為玫瑰色可以維持，品牌評審列為必修要改。最後依品牌評審的必修改成麥黃色，並在提案說明：業主如果想換回玫瑰色，只要覆寫 --c2-leg、--c2-leg-fold 兩個變數。

## B×C 片片 Flick

**修訂後的一句話：** 一個用色鉛筆上色的剪紙小傢伙。腦後用一顆銅釘別著三張故事卡，聽到故事時，卡片會繞著那顆銅釘扇開。

### 改了什麼

- Card fan (form critic must-fix 1): the cards are now 58×164 (the middle one 182) with square corners, against 74×128 rounded in v1. The fan opens 88° in the main pose and 104° fully open. All three cards turn on one brass brad on the head's upper right (bc-fan-brad, pivot 500,306). Closing, half-open and full-open are rotations only; the old slide-along-axis lift is gone. In the 48px pure-black silhouette, the top of the head is three separate square tips, not the two round bumps that read as bear ears in v1.
- Card face (form critic must-fix 1): each card carries a light wash of its family colour, a band only 17% of the card height, and straight horizontal pencil lines below it, like an index card. The cursive loops that read as little faces, the wave doodle and the two-tone popsicle look are gone.
- Face (both critics' face must-fixes): the eyes are round punched holes of radius 17, about 26% shorter than v1's 40×46 ellipses. They are matte, with no gloss highlight. The paper's thickness shows as a darker inner crescent on the top wall and a thin pale paper-core lip on the bottom wall, with a few fibres on the rim. The resting mouth is a single pencil arc. Only the 'moved by a story' face has a small punched open mouth, and the tongue has been removed entirely.
- Chest (form critic must-fix 3 and brand critic must-fix 2): the cream pocket is removed. In its place is a pencil-cut slit, off-centre and slanted, with a small mist-blue story card tucked into it. The card is clipped at the cut, so only its upper part shows. This breaks the pocket + white round hand + big head Doraemon set.
- Body hue (brand critic must-fix 2): the lavender moves from hue 288–296 to 298–304. The mist-blue second pencil (hue 245) is replaced by a grey-mauve (hue 335), so the colour no longer reads as periwinkle.
- Arm mechanism (brand critic must-fix 1): a short paper sleeve (−24…+50 from the brad, 48 wide) is pinned at each shoulder. The forearm strip slides out from under it: 0 at rest gives a wrist 124 from the brad, 64 when raised gives 188, with the mitt at head-top height. Each part is drawn once in the arm's own frame and placed only by rotate and translate, never scaled. Both arms now sit in front of the head. Directional shadows moved to a bc-lift filter on the outer wrapper, so they stay consistent at any rotation.
- Rig test: bc/checks/rig.png shows four frames: arms down at 124, both raised at 188, left wave and right wave. A script check confirmed that the arm and card paths are byte-identical across main, moved and all rig poses; only the transforms differ.
- Pencil texture (the owner likes the soft gradient of B v1; overlaps both critics' 'yarn/plush' weakness and the must-fix to break the plush set): the lifted-out cream highlight strokes are halved, the first pencil layer covers more, and the fading at piece edges is halved. The soft gradient now shows instead of snowy noise. Path count went from 1428 to 1236, and gzip size from 132KB to 114KB.
- Shy and moved poses rebuilt with the new parts. Shy turns the stacked cards into the back of the head (−122/−116/−110°) so one corner peeks out, with half-moon punched eyes. Moved fans the cards fully open with sparks, crescent-cut eyes and a small punched mouth.
- concept.svg/png (1600×1000) re-rendered with updated captions: one brad holds three cards; the forearm slides out from the sleeve. character.svg/png, checks/sheet.png (48/96/silhouette/upside-down/mirrored/night), checks/poses.png and checks/zoom.png were also regenerated. character.svg, concept.svg and all checks/*.svg pass xmllint --noout. Every id has the bc- prefix, with no duplicates and no external references.
- proposal.md was rewritten to match the art: colours with oklch values, new proportions, the rig table with pivots and the new arm parts (bc-sleeve-*, bc-forearm-*, bc-fan-brad, bc-chest), the self-check, references, and a cost estimate of about 9–11 person-days. It ends with a 修訂紀錄 (revision log) section covering what changed, why, and what was not changed. Backups are concept-v1.png, concept-v1.svg, character-v1.svg and proposal-v1.md, plus a copy of the v1 generators in gen-v1/.

### 沒照做的部分與原因

- Brand critic must-fix 2, part: 'pin a small story card to the chest with a brad or paperclip'. The two critics prescribed different chest solutions. I used the form critic's pencil-cut slit and tucked a story card into it, which still meets the brand critic's aim of continuing the card vocabulary. I did not add a brad or paperclip: the two shoulders and the head already carry three brass brads, and a fourth metal fastener at the centre of the chest would bring back the spacesuit/Danbo feel the form critic warned about. A slit is also a paper operation that belongs to this character.
- Form critic must-fix 1, part: 'make the cards bigger'. This was done by making them longer (128 → 164/182), not wider. Width went from 74 to 58, because wider cards fanned from one common pivot overlap back into a single block and cannot separate into three square tips at 48px. Card area is equal to or larger than v1's, and much more of each card shows outside the head.
