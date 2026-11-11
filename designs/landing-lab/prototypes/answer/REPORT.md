# Prototype A · 換你說 Your Turn (`answer`): finishing report

The harness refused to let this subagent write `scratchpad/lab/answer/REPORT.md` ("Subagents should return findings as text"), so the report is here. The lead can save it as REPORT.md.

Code is in `/Users/ncchen/Documents/Resonance-landing/src/components/lab/landing/answer/`; there are no `public/lab/answer/` assets. Nothing is committed. Page: http://localhost:3200/zh-TW/lab/landing/answer (and /en/…).

## What the page is now

1. **Header.** Today's `SiteHeader`.

2. **The desk (hero).**
   - **Headline.** A left-aligned Ming 用故事**回應**故事, about 102 px at 1440. Its pen wave runs on as a thread down to the blank card's corner. The subtitle states the mechanic.
   - **Badges.** On every width; the QR code shows only with hover and a mouse.
   - **Left page: a real story.** No cover, a Ming title, a ragged opening (6 lines on desktop, 3 on a phone), the byline or 匿名, the minutes, 讀完整個故事 → and 換一個故事 ↻.
   - **Right page: a dashed blank card.**
     - 換你說 and 這個故事讓你想起什麼？
     - three starter chips
     - a borderless line field of 16 px or more
     - a small ruled-card doodle at the end of that line; for about 0.3 s in every 6.5 s it folds into a heart and back
     - the honesty line above a solid 回應
   - **Puppets.** 聆聆 sits on the card's top right and nods while you type. 牽牽 stands at the thread's end. Both are stills in the server HTML that come alive on idle.

3. **The answer.** Never waited on; about 4 s in all.
   - **The card.**
     - Your line FLIPs into the card's title.
     - The dashed outline is redrawn solid with DrawSVG, and a colour wash spreads from 回應.
     - The card keeps the blank card's height and reads as an unfinished card: ruled pen lines fill it, with 你 · 剛剛 and a solid 寫完這張卡 on its own foot.
   - **The thread.** It inks across the gutter, and the logo's three waves (≋) are drawn where it sags.
   - **Captions.** Three captions arrive in a `role="status"`, and focus moves to the new title.
   - **The hand-over.**
     - 聆聆 and 牽牽 step toward each other.
     - The folded note passes in an arc into 牽牽's mittens; 牽牽 shuts its eyes, glad. 聆聆 walks back and waves.
     - **Desktop and tablet:** 牽牽 carries the note along the card's top and across the gutter thread, onto the story's top. It says hello there, holding the note.
     - **Phone:** 牽牽 climbs the margin thread and tucks the note on the story card's foot, where the note stays in view. Then it climbs back down to its own card.
     - 聆聆 then pops back onto its seat, alive.
   - **Below the card.** 再回應一個 and 在 App 裡繼續 with the badges.
   - **Reduced motion, or GSAP not loaded in time.** The finished state in a 150 ms fade, with the wash instant.

4. **The stories.** 還有人在等一個回應 shows the five other real cards.
   - **Desktop:** two bottom-aligned shelves on drawn pen lines.
   - **Phone:** a native scroll-snap row.
   - 點點 hops on the top rule (its own stage).
   - Each card has 回應這個, which brings it to the desk.
   - 瀏覽所有故事 → goes to /home.

5. **The night ending.**
   - **One night band** on one centred axis.
     - The title 每個人都有幾行，一直折著的字 and its line.
     - If you answered: 你剛剛寫了「…」——把它寫完, and the first button becomes 寫完這張卡.
     - 寫下你的故事 (solid) and 先讀讀大家的故事 (tonal).
   - **The corner.** A folded paper corner at the top right lifts further as you scroll. 摺摺 stands on the band's wave (reveal).
   - **Footer, merged into the same night:**
     - ≋ Resonance and 用故事回應故事
     - 悄悄 napping on the pen line under its own words 晚安，再讀一個就好 →
     - the badges and trademark line, the links, ©
     - the pause control 讓小紙團休息 / 叫醒小紙團, which is also at the desk's foot

## Review fixes

All ten are applied. Only the shared header's 登入 (under fix 10) is not.

1. **牽牽 reaches the story in about 4 s, not 19–21 s. Applied, faked.**
   - **Timing:** measured from tapping 回應 to `[data-landed]` it is 4.3 s at 1440, 3.6 s at 820 and 3.8 s at 390. These are upper bounds, sampled with screenshots.
   - **Why it is faked:** the engine's duet (`lib/mascots/scenes.ts` `duet`) always runs notice → close in → wave → resonate before the note, about 12 s, and it can't be shortened without editing the shared engine.
   - **What I did instead:** on 回應 both stages are put away (`deskScene.release()`). The hand-over is played with the server's own stills, in 12 fps steps with a 3 px bob, using GSAP MotionPath. The spec allows this ("fake the whole hand-over with stills + GSAP").

2. **The phone payoff is now on screen. Applied.**
   - 牽牽 climbs the margin thread that is already drawn and tucks the note on the story's foot, then comes home.
   - **Check:** at 390, the `[data-landed]` rect is top 157 / bottom 182 in an 844 px view.

3. **The ♥ beside 回應. Applied.**
   - **Where:** at the end of the field line, 52 px.
   - **Timing:** it rests as a small ruled card and flashes a heart for about 0.3 s per 6.5 s cycle.
   - **Stops:** it is removed on first interaction, and stops under pause and off-screen.

4. **The question in the phone's first screen. Applied.**
   - The phone story shows 3 lines, with a tighter foot, label and gaps.
   - **Check:** the prompt and the first chip row are inside the 390×844 fold.

5. **Justified CJK gaps. Applied.** `--s-align: start` on `.opening` (desk) and `.excerpt` (shelf).

6. **The result card looked like a posted comment. Applied.** It keeps the blank card's height (measured on submit), is filled with faint INK_LIGHT ruled lines, and has 寫完這張卡 on its own foot.

7. **The link drawn as the brand's link. Applied.** The ≋ (ResonanceIcon's paths, terracotta, INK) is drawn with DrawSVG as the thread inks. It sits on the gutter thread's sag on desktop and tablet, and beside the margin thread on a phone.

8. **The night ending at 1440. Applied.** The CTA and the footer are both centred. 悄悄 is seated beside 晚安，再讀一個就好 → on its pen line, with its own stage measured from that zone.

9. **Smaller desktops and en. Applied.**
   - **≤ 1100 px:** a tighter top, less air above the cards, and the prompt on one line. At 1024×768 the bottom of 回應 is at 701 px (zh) and 738 px (en).
   - **en at 1440:** the h1 is `clamp(40px, 7.6vw − 31px, 68px)`, so "Answer stories with stories" is on one line. The thread is drawn, and the bottom of 回應 is at 854 px.
   - **The connector's test:** it was "the wave must end past the subtitle". It now samples the actual curve against the subtitle's clauses and the badges.

10. **Small fixes. Applied, except the header.**
    - **Link-buttons.** Each `<Link><OrganicButton>` in my folder is now one `LinkButton.tsx`, a link wearing OrganicButton's solid or tonal face. That covers 寫完這張卡, 瀏覽所有故事 and the two night buttons. Not done: the header's 登入, because SiteHeader is shared. It is the only nested button left on the page.
    - **Phone shelf.** Cards without a cover show 7 lines, so the row's heights match and there is no blank paper mid-card.
    - **Dark mode.** The shelf → night wave's pen is stronger (`--night-edge-pen`).

## My own pass

- **Full-page captures showed blank covers, and puppets floating over missing rules.**
  - **Covers:** they are warmed and decoded on idle (never under Save-Data).
  - **Scroll-drawn lines** (`view()`) now fill `forwards` only. A line is simply drawn until it enters the view, then draws in from there.
  - **The night corner's** keyframes now start from its 16° rest lift, so there is no jump.
- **Margin thread.** It is drawn in measured px rather than a stretched viewBox. Its pen keeps its width, and DrawSVG's non-scaling-stroke warning is gone.
- **Reduced motion:** the card's wash is instant.
- **The pause control mid-answer** finishes the hand-over at once, and the stages wait while a hand-over plays.
- **en subtitle clauses** are balanced (no orphan "your own").
- **Phone footer:** 悄悄 and its words fit on one line.

**Checks:**

| Check | Result |
| --- | --- |
| Overflow at 320 (zh and en) | none |
| Console errors or warnings (load, and the send at 1440 / 820 / 390) | none |
| Tab order | header → badges → 讀完整個故事 → 換一個故事 → chips → field → 回應 → rest → shelf |
| `npx tsc --noEmit -p . \| grep lab/landing/answer` | prints nothing |
| `npx eslint src/components/lab/landing/answer` | clean |

## Faked or cut

- **The hand-over is stills, not the engine's duet.**
  - **The note:** the engine's note prop, redrawn in tokens (`note.ts`).
  - **The pose:** there is no arm reach, no note drawn to the chest and no blush. The still's own hello pose (eyes shut, mouth open, one arm waving) stands in for both receiving and waving goodbye.
  - **After the carry:** 聆聆 comes back with the engine's pop. The still lies flat for a moment and stands up again, the same way the page comes alive on load.
- **寫完這張卡 is a link only.** It goes to /write; the seed hand-off is out of scope.
- **Nothing is stored or sent.** With JS off, the form opens the story's page.

## Known problems

- On a phone, 牽牽 passes over 讀完整個故事 for under a second while it climbs.
- At 820 the hero's wave-thread isn't drawn: the badges sit under the subtitle and the curve would cross them, so the check leaves it out. The gutter thread and ≋ are still there.
- **Capture artifacts, not page bugs:**
  - Playwright's mobile full-page capture shows the QR code; the critic's capture shows it too. Fold captures and real phones don't.
  - The dev server's "N" badge appears bottom-left in every capture.

## Libraries

- **GSAP 3.15** core, with DrawSVGPlugin and MotionPathPlugin, imported dynamically on first touch of the blank card or 2 s after idle. No ScrollTrigger.
- **The mascot engine** (`createStage`): one small stage per section, from that section's own geometry. The old LandingStage is not mounted.
- **CSS scroll-driven animations** (`view()`).
- motion.dev is not used.

## Files changed

- `Desk.tsx` (hand-over rewrite)
- `deskScene.ts` (duet removed; `release` / `settle` / `reset`)
- `LinkButton.tsx` (new)
- `Paper.tsx`
- `Shelf.tsx`
- `NightEnd.tsx`
- `desk.module.css`, `shelf.module.css`, `night.module.css`, `answer.module.css`

## Media and scripts

Final PNGs and videos are in the `shots` and `video` fields. The demo script (`scratchpad/lab/answer/demo.mjs`) now pauses at the shelf, the night wave and the footer, using measured positions.

Supporting files in `scratchpad/lab/answer/`:

| File | What it is |
| --- | --- |
| `send.mjs` | the send-timing script |
| `pass.mjs` | the checks above |
| `fix/s1-desktop-sheet.png` | send-sequence frames, desktop |
| `fix/s2-sheet.png` | send-sequence frames, phone and tablet |
| `fix/vid/desktop-sheet.png`, `fix/vid/phone-sheet.png` | contact sheets of the demo videos |
