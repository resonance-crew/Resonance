# C · 一天的戲 One Day (`oneday`) — final report

The harness refused to write `scratchpad/lab/oneday/REPORT.md` (subagents may not write report files). This is its intended content; please save it there.

Page: http://localhost:3200/zh-TW/lab/landing/oneday (and /en/…).
Code: `/Users/ncchen/Documents/Resonance-landing/src/components/lab/landing/oneday/`. Nothing is in `public/lab/oneday/`, no shared file was edited, and nothing is committed. One new file, `hushOutline.ts`, holds 悄悄's outline taken from its rig.

## What it is, section by section

The page plays one day as it scrolls: morning, noon, late afternoon, dusk, night. Every scene is content, then a lane, then a drawn floor. Each floor is a scene change: two paper flats slide past each other with the scroll (CSS scroll-driven). Puppets stand only on floors and on things the scene drew (card tops, a frame, a shelf), never on words.

1. **Morning · the cover plate (hero).**
   - The h1 用故事／回應故事, with 回應 accented by the pen wave (en "Answer stories / with stories").
   - The mechanic in plain words, the official badges (QR on hover+mouse only), and 先讀讀大家的故事 →.
   - Beside it (under it on phones and portrait tablets) is **one set standing on the hero floor**: story card A and answer card B, joined by the logo's ≋. The cards are pictures of cards, not real records.
   - 摺摺 walks in from the left edge to A's side and waves first. 點點 rises over B's top from behind it, looks about and ducks.
   - Words, cards, puppets and floor all fit in the first screen at 1440×900, 1366×768 and 390×844.
   - The pause sits quietly on the strip under the floor's right end: a glyph plus 讓小紙團休息, muted ink, no fill, a 44 px target.
   - A fine pointer slides card A and the waves a few px along the floor.
2. **Noon · 值得閱讀的故事 (the six real cards).**
   - Desktop: two drawn shelves, each an INK_STRONG pen line over a lip band running edge to edge of the view. Three cards stand on each shelf, bottom-aligned, with slightly different widths so their heights differ like books.
   - 聆聆 reads sitting on the first card's top. 點點 walks in along the top shelf from the right and stands at its end.
   - Tablet (720–1023): three shelves of two.
   - Phone: the 紙芝居. A pen frame holds a native scroll-snap row, the next cards' coloured edges are stacked at its side, with ‹ 上一張 / 下一張 › and a polite live region 「第 2 張，共 6 張」. 聆聆 reads on the frame's top and 點點 peeks over it.
   - A cover appears only where the card has one (no grey boxes). Titles and excerpts use the reading type.
3. **Late afternoon · 這裡沒有讚，只有回應 (the answer, three beats).** A native-sticky stage, with the beats scrolling beside it (desktop) or under it (phone).
   - ① 聆聆 climbs onto story card A and reads.
   - ② A hand-drawn ♥ appears and cross-fades into a dashed blank card B. 聆聆 pops up beside it and writes, and B's lines draw in.
   - ③ B goes solid and slides beside A, and the ≋ draw between them (scroll-scrubbed). 摺摺 and 聆聆 walk in and meet at the gutter, a note changes hands, then 摺摺 comes back and lifts its folded corner.
   - A beat must stay in view 400 ms before its cue fires, and scrolling back replays it. Scroll scrubs only the paper; the puppets are cued.
   - JS off, reduced motion and short screens (< 520 px tall) get the same three beats as a printed three-panel comic.
4. **Dusk · 下一個上台的是你.**
   - 寫下你的故事 (solid) and 先讀讀大家的故事 (tonal).
   - Right beside the words, one set on the floor: 牽牽 walks in, faces the write button, points at it and beckons. The dashed blank card 「最後一頁，留給你」 stands on the floor, and the blank sixth (BlankPal) leans on it.
   - When the write button is hovered or focused, BlankPal tips back and turns its face up.
5. **Night · curtain call and footer in one band** (a fixed night colour in both schemes).
   - Pinprick stars come out one by one with the scroll: above the heading, at the band's sides on wide screens, and in the sky over the curtain call — never on the words. A cut-paper crescent moon.
   - The hole 悄悄 was cut from: its own outline (from its rig) at its own size, right above it, as a dashed cut line around the dusk paper showing through.
   - The five stand on the floor and wave in turn as the row comes into view. 悄悄 (a live stage) twinkles, looks and naps.
   - 在 App 裡，故事不打烊, the badges, 認識小紙團 →, and 「晚安……再說一個就好」 → /home. Then the footer in the same night, with the pause pill.

**How the puppets run.** Each scene mounts its own small stage(s) from the geometry it drew (`scene.ts` `mountScene`, the `mountPalStrip` pattern generalised). A scene runs only while it is in view, so at most one or two run at once. Stills (`PaperPalStill`) are in the server HTML and stand wherever no stage is running: out of view, resting, Save-Data, reduced motion, or a stage that failed.

## Review fixes, in order — all applied, none skipped

1. **The pause made puppets vanish — fixed.**
   - The rest rule now outweighs the staged rule, and a scene counts as showing stills whenever it isn't running.
   - Checked at 1440 and 390 with the pause stored before load: hero 2, dusk 1 and night 5 all stand.
   - Also new: if a stage never brings a character on (a refused place, parts that never loaded), its still appears after 14 s instead of staying hidden for good.
2. **Hero as one tableau on its floor — applied.**
   - Both cards stand on the floor line. 摺摺 walks up to A and waves; 點點 peeks over B from behind it.
   - The hero is `min(100svh, 940px)` and the h1 size is capped by `svh`, so at 1366×768 the floor, both puppets and both cards are in the first screen.
   - On the phone the cards touch the floor, and the space above B is 點點's peek, so there is no dead gap.
3. **The pause pill read as a call to action — applied.** The hero's copy is now the quiet glyph-and-label button on the strip under the floor's end. The action row holds only 先讀讀大家的故事 →. The footer keeps its pill.
4. **Seam above the phone's sticky stage — fixed.** The stage's paper reaches 32 px up under the header's wave. Scrolling beats 1→3 at 390 and 320 shows nothing between the header and the stage.
5. **Desktop stories didn't read as a shelf — applied.** Real planks, bottom-aligned cards whose heights differ naturally, and 點點 standing at the top shelf's end instead of half-hidden behind card 3.
6. **Sparse desktop answer stage — applied.**
   - Each card is 37 % of the stage's width and stands on a floor raised to just under it.
   - Puppets play at the desktop unit (about 118–120 px).
   - The stage is 500 px tall and centred vertically against the beat being read. The ≋ keep the logo's proportions.
7. **Dusk: 牽牽 pointed off the page and the blank card floated — applied.**
   - 牽牽 now stands between the call to action and the blank card, facing the button. It aims at the button's near end, so on a phone it points up at the button rather than across at the card.
   - The blank card stands on the floor with BlankPal leaning on it.
   - The look-up is now visible: a −9° tip-back plus the face moving about 10 px up.
8. **Night: phone collision and the hole — applied.**
   - On phones the moon sits in the sky's corner above the heading, and stars stay out of the text column.
   - The hole is 悄悄's exact outline at its size, directly above it: a dashed cut line around muted dusk paper, no longer the brightest object in the band.
   - 悄悄's still shows from the first moment until its stage takes over.
9. **Tablet 820 — applied.** The blob sits behind the set, the h1 is larger on portrait tablets (10.5vw), and the dusk stacks below 900 px so its set never overflows.
10. **zh typography — fixed.**
    - 悄悄's line is set in Noto Serif TC first in zh-TW, so …… is centred, and it does not wrap.
    - 「第 1 張，共 6 張」 no longer wraps (checked at 320; the buttons are a little narrower at ≤ 359 px).

**Lower notes from the review:**
- Dark mode is applied: the night is deeper and bluer, the afternoon warmer, and the stage frame and shelf pens are at full strength, so the day still reads.
- I skipped a night-coloured copy of the shared header; it would mean copying `SiteHeader` for one look, so the header stays cream over the night band.
- I skipped running the 回應 pen wave into the ≋; the spec allows skipping it.

## My own pass

- Story covers load at low priority with the page and are decoded once the browser is idle. Before this they were plain coloured blocks in full-page captures.
- Scenes mount only while in view (`rootMargin -1%`), so a whole-page view shows every still in place.
- The stories scene starts at 4 % visible, because the section is very tall on tablets.
- No horizontal overflow at 320 / 360 / 390 / 820 / 1024 / 1440 in zh-TW and en.
- 0 console errors or warnings in every capture; `tsc` prints nothing for the folder; `eslint` is clean.

## Faked or cut

- The hero and stage cards are fictional pictures of cards (scribble lines, no names), as the spec asks. The six stories are the real latest cards.
- ♥ → card is a cross-fade, not MorphSVG. The note hand-over is the engine's existing `note` duet, and 摺摺's reveal is its existing act.
- The curtain call's wave in turn is stills plus CSS (`data-hello`). Only 悄悄 is a live stage there.
- **Libraries: no GSAP and no Motion.** Native sticky, CSS scroll-driven animations (`view()`, and `view-timeline` + `timeline-scope` for the beat scrub, with a transition fallback where unsupported) and the existing mascot engine covered everything. Only the page loads before first paint; the engine and cast load on idle.

## Known problems

- In a desktop full-page picture the answer section is a long gold run with the stage at beat ①. It is a sticky scroll scene; the videos show it playing.
- Phone full-page pictures show the QR code beside the badges. That is the shared `GetTheApp`'s decision; phone viewport captures show badges only.
- On desktop, 摺摺's walk-in crosses most of the hero floor from the left edge, taking a few seconds before it waves.
- The header stays cream over the night band (see the skipped item above).
- The 「N」 in every capture is the Next dev indicator.
- I raised the stories threshold to 4 % after the videos were recorded. It only changes when that scene starts; the tablet captures were re-shot after the change.

## Final media

All in `/private/tmp/claude-501/-Users-ncchen--claude-spares-spare-pZgTcm/84b65950-01bf-4833-b134-c3a6994644eb/scratchpad/lab/oneday/final/`:

- **Screenshots:**
  - zh: `zh-desktop-fold.png`, `zh-desktop-full.png`, `zh-phone-fold.png`, `zh-phone-full.png`, `zh-tablet-fold.png`, `zh-tablet-full.png`
  - zh dark: `zh-dark-desktop-fold.png`, `zh-dark-desktop-full.png`, `zh-dark-phone-fold.png`, `zh-dark-phone-full.png`
  - en: `en-desktop-fold.png`, `en-desktop-full.png`, `en-phone-fold.png`, `en-phone-full.png`
- **Demo videos:** `demo-desktop.mp4` (127 s) and `demo-phone.mp4` (117 s). A slow scroll through the day: the hero entrances, the shelf (two 紙芝居 pulls on the phone), about 5–6 s on beats ① and ②, 22 s on beat ③ (meeting, note, 摺摺's corner), the dusk with the write button hovered, about 7 s at the night band, then the footer. `demo.mjs` still fits the page and was not changed.
- **Reduced-motion full pages** (the printed version, every still in place), in `scratchpad/lab/oneday/fix/`: `rm-1440.png` and `rm-390.png`.