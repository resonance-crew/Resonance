# Review — Prototype A · 換你說 Your Turn (`answer`)

Independent critic pass, 2026-11-09. Looked at: 1440×900, 1920×1080, 1280×800, 1024×768, 820 (tablet), 390×844, 320 (zh-TW and en); dark; /en; JS off; pause control; keyboard order; the recorded demo at desktop and phone; timing of the send sequence measured with Playwright. Captures are in `lab/answer/review/`.

## Verdict

1. **Not plain, not SaaS: yes.** The centred pill/headline/badges/blobs template is gone. A left-aligned ~110 px Ming 用故事**回應**故事 has a pen wave that runs on as a thread down into a blank card next to a real story. The night ending replaces the terracotta band and the stock footer. Next to `shots/current-*` it looks like a different, much more specific site.
2. **The puppets now belong, with one big caveat.** Each one stands on ground the layout draws: 聆聆 and 牽牽 on the blank card's top, 點點 on the shelf's top rule, 摺摺 on the night wave, and 悄悄 napping on the footer rule. None of them stands on words. But their one meaningful act, the note handed over and carried across the thread, lands 19–21 s after 回應 (measured; the builder says ~14 s). On a phone it lands off-screen, so the moment that justifies them mostly goes unseen.
3. **A phone visitor in 5 s: mostly.** The h1, a subtitle that states the mechanic, the store badges and a real story are all in the first screen. The question 「這個故事讓你想起什麼？」 and the chips start just below the fold. Also, the ♥ next to 回應 looks like a like button for most of each cycle.

## What works (keep it)

- **The thread as the page's spine.** The pen wave under 回應 continues into the line that reaches the blank card, and after answering the gutter thread inks solid between the two cards. It is cheap and it means something.
- **The spread.** The hero story has no cover, so the h1 stays the LCP, and it has a byline, minutes, 讀完整個故事 and 換一個故事. The answer side is a dashed blank card, not the chat capsule: a Ming prompt, three starter chips, a borderless line field (17–18 px, so iOS won't zoom), the honesty line *above* a solid 回應, and 聆聆 reading on the card's corner.
- **The send sequence never blocks the page.** The line FLIPs into the card's title, the dashed outline redraws solid, a peach wash spreads and the thread inks. Captions arrive in a `role="status"` and focus moves to the new title (`P tabindex=-1`). 寫完這張卡, 再回應一個 and 在 App 裡繼續 with badges all appear at once.
- **The night ending remembers what you wrote.** After you answer, it says 「你剛剛寫了「我也曾經……」——把它寫完」 and its first button becomes 寫完這張卡. It is a good continuity touch, so keep it.
- **The stories shelf.** On desktop it has two bottom-aligned shelves on drawn pen lines that the scroll draws in, so paper moves and puppets don't, with real covers and 「回應這個」 on each card. On a phone it is a native scroll-snap row with the next card peeking in.
- **Hygiene is clean.**
  - One h1. No box-shadow or drop-shadow anywhere in computed styles. No console errors.
  - No horizontal page scroll at 320 in zh-TW or en.
  - The pause control 讓小紙團休息 / 叫醒小紙團 works: `aria-pressed` flips and every `.ms-stage` is removed.
  - With JS off the page is complete, and the stills stand on rules that draw as you scroll.
  - Dark mode is intact.
  - The night band's fixed colours follow the /paper-pals precedent (`colour-fixed` comments).

## Fixes, ordered by impact

1. **Have 牽牽 reach the story within about 6 s, not 14–21 s.**
   - *Where:* `deskScene.ts` lets the meeting run until a 24 000 ms cap (`setTimeout(() => finish(met), 24000)`).
   - *Measured:* from tapping 回應 to `[data-landed]`, 19.1 s at 390 and 20.7 s at 1440 on the shared lab server.
   - *Why it matters:* by then a phone visitor has scrolled on. This is the scene that makes the puppets belong.
   - *Fix:* drop the resonate beat and direct only the `note` beat. Start it within 0.5 s of the line landing. Cap the meeting at about 4 s, then carry regardless; the spec says no wait longer than 1.5 s.
   - *Check:* `[data-landed]` appears ≤ 6 s after 回應 at 1440 and 390.
2. **On a phone the payoff happens off-screen.**
   - *What happens:* in the stacked layout the walker steps 0.9 s off the card's left end and fades out. The landed 牽牽 then appears on the story card's *top*, at `top = −281 px` with an 844 px viewport, so the visitor just sees 牽牽 vanish.
   - *Fix:* when stacked, have it climb the margin thread that is already drawn, and land on the story card's bottom edge or bottom-left corner. That spot is in view just above the answer card.
   - *Check:* at 390, after 回應, the `[data-landed]` rect lies within 0–844.
3. **The ♥ next to 回應 reads as a like button.**
   - *What happens:* at every width the hint is a ~28 px heart outline right beside the solid 回應. It turns into a card for only about a third of each ~6 s cycle (see `review/heart-strip.png`). This is the one page whose promise is "you don't like it".
   - *Fix:* move it into the card's empty writing area, on the field line where the words will go, and make it about 48–56 px. Reverse the timing so it rests as the card and only briefly flashes as a heart, or plays heart → card once and stays a card. Keep it stopping on interaction and under pause.
4. **Bring the question into the phone's first screen.**
   - *What happens:* at 390×844 the fold cuts off at the puppets' heads above the blank card, and 「這個故事讓你想起什麼？」 is about 60–110 px below it.
   - *Fix:* show 3 lines of the hero story on a phone instead of 5 (each line is ~31 px at this tracking), and tighten the story card's foot padding and the gap under the badges.
   - *Check:* the prompt line, and ideally the first chip row, is inside `r-phone-fold`.
5. **Justified CJK excerpts open gaps between glyphs.**
   - *Cause:* `.story-prose` justifies CJK text. In these narrow, clamped excerpts full of Latin words and …… runs, that spreads the glyphs apart.
   - *Where it shows:*
     - 390 hero story: 「講 話 結 巴 很 嚴 重」 and 「啊 ……. . 你 ……… 考 試」
     - 820 hero: 「國 小 四 年 級 的 時 候」
     - 1440 shelf card 4: 「駕 駛 室 裡 的 把 手 第 一 次 聽 見 Ludwig」
     - 390 first shelf card
   - *Fix:* set `--s-align: start` on `.opening` (desk.module.css) and `.excerpt` (shelf.module.css).
6. **The result card looks like a posted comment.**
   - *What happens:* on the chip path, the main one on phones, the answer collapses into a wide, short peach box (about 520×180 at 1440) holding only 「我也曾經……」 and 「你 · 剛剛」. A comment looks exactly like that, and the critique warned against it.
   - *Fix:* make it read as an *unfinished card*. Keep card proportions, close to the blank card's pre-answer height, and draw 2–3 faint ruled pen lines (INK_LIGHT) under the title for the story still to write. Put 寫完這張卡 on the card's own foot instead of below the captions.
7. **Draw the link as the brand's link.**
   - *What happens:* the inked thread is a plain terracotta curve.
   - *Fix:* the picture of the product is two cards joined by the logo's three waves, so draw ≋ at the gutter midpoint on desktop, and on the margin thread on phones, as the thread inks (DrawSVG, terracotta, INK). "Your card is linked to this story" then reads at a glance, before any caption.
8. **The night ending at 1440 is half empty and its alignment is split.**
   - *What happens:* the CTA sits in a 120–600 px column with about 700 px of empty navy to its right. The footer under it is centred. 悄悄 naps on a full-width rule that relates to nothing.
   - *Fix:* align the CTA and the footer to one axis, either both centred or both in the CTA's column. Seat 悄悄 next to 「晚安，再讀一個就好 →」, which is its line.
   - *Check:* `review/v-d-3.png`, `v-d-4.png`.
9. **Smaller desktops and en.**
   - *1024×768:* 回應 falls below the fold (`review/w-1024x768.png`). The spread starts around y 350 because of the air left for the puppets above it. Tighten that gap at ≤ 1100 px.
   - *en at 1440×900:* the h1 wraps to two lines, which pushes 回應 below the fold. The headline-to-card thread is also not drawn there, because the wave ends left of the subtitle's right edge. Shorten the h1 (`clamp`) or the gap so the en hero also keeps its thread and its button in the fold.
10. **Small fixes.**
    - *Inherited:* `<Link><OrganicButton>` nests a button inside a link, which gives two tab stops and invalid nesting. Seen on 瀏覽所有故事 (Shelf.tsx), the night CTAs (NightEnd.tsx), 寫完這張卡 (Desk.tsx) and today's 登入 in the header. Style the Link as the button instead.
    - *Phone shelf:* stretched cards leave about 120 px of blank paper between the excerpt and the byline when a neighbour is taller. Let the foot follow the excerpt, or clamp the row height.
    - *Dark mode:* the shelf → night wave is barely visible, so 摺摺 stands on an edge you can hardly see. Give that wave's stroke a little more contrast.

## A note for whoever judges from screenshots

In the full-page captures (`review/r-desktop-full.png`, `r-phone-full.png`) the shelf cards look like blank-topped boxes and 點點 seems to float over nothing. This is only an artifact of the capture. The covers are `loading="lazy"`, and the shelf rules are drawn by scroll-driven animation, so neither exists until you scroll. Scrolled into view they look as intended: see `review/v-d-1.png`, `v-d-2.png` and `v-p-2.png`. Judge the shelf from those viewport shots.

## Files

- Static: `review/r-*.png` (light), `r-dark-*`, `r-en-*`, `r-tablet-*`; viewport per section `v-d-*.png`, `v-p-*.png`; `w-1024x768.png`, `w-1280x800.png`, `w-1920x1080.png`
- JS off: `x-nojs-*`. Paused: `x-paused-desktop.png`
- Demo: `review/demo-desktop.mp4`, `review/demo-phone.mp4`; frames `fr-desktop/`, `fr-phone/`; contact sheets `sh-*.png`
- Send timing: `s-desk-landed.png`, `s-phone-landed.png`
- Heart hint: `heart-strip.png`
- Scripts: `review/tools/`
