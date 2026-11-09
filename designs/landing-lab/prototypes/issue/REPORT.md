# B · 對頁 Facing Pages (`issue`) — final report

REPORT.md was not updated: the harness refused the write (subagents may not write report files), so the full report is here.

Page: http://localhost:3200/zh-TW/lab/landing/issue (and /en/…). Code: /Users/ncchen/Documents/Resonance-landing/src/components/lab/landing/issue/ (no static assets; public/lab/issue/ is unused). Nothing committed.

## What the page is (section by section)

0. **Header and running head**
   - `SiteHeader`, then (desktop and tablet only) a small-caps running head between two INK_LIGHT wavy hairlines: 「共振 RESONANCE ～ 本期六篇新故事」.
   - The pause switch 「讓小紙團休息 / 叫醒小紙團」 sits at its end.
   - Folios 01–05 sit in Playfair italic in the left margin.

1. **01 Cover**
   - **zh title:** the h1 is set vertically in a 2 × 4 manuscript grid, 用故事｜回應故事, read right to left. 回應 is terracotta, with the pen wave down its left side.
   - **The fourth cell:** 摺摺 stands in the empty cell (悄悄 in dark mode). It is a still in the HTML and comes alive there: it reads, looks, waves on the first scroll, and lifts its corner on the second tap.
   - **The ripple:** a weight wave (700 → 900 → 700) runs through the seven glyphs once on idle, on a click of the title, and outward from the cell whenever the puppet hops.
   - **Beside the title:**
     - the kicker and the dek;
     - the cover line 「本期封面」, which is the cover story's *second* sentence: 「沒想到單純覺得好笑的模仿，跟了我將近十年」;
     - the badges and the QR code.
   - A sage blob sits behind the cell.
   - **en:** a big horizontal title with an empty cell drawn in the grid's pen before "with", and Tuck standing in it. A phone sets it in four lines: Answer / stories / ▢ with / stories.

2. **02 Contents (本期目次)**
   - The six real cards as words: a big italic numeral, the Ming title, the first sentence as a pull quote with a hanging 「, the byline (or 不署名), minutes, two tags, and a small cut-out cover.
   - Rows are separated by hand rules that draw in on scroll, and the h2 inks in character by character.
   - **Desktop with a mouse:** a sticky sidenote cross-fades (Motion) to the hovered row's cover and a passage from the *middle* of that story. 點點 stands on the sidenote's top edge and turns to the chosen row.
   - **Phone:** 點點 lives on a ≋ dinkus row instead.
   - 翻閱所有故事 is a link pill.

3. **03 The spread (對頁)**
   - **The pair (faked, marked 示意):**
     - Page A, 念誠's 〈放鬆的心，才接得住靈感〉: 「四篇其實在回答同一個問題——當一個人不再用力抓取結果，生命會不會反而把最好的東西交到他手上……」
     - Page B, Neo's 〈換我坐副駕駛〉: 「那些日子很開心，但我一直把它當成一段單向的付出。我是握方向盤的人，他們坐在副駕駛座。直到二〇二五年的夏天，位置對調了……」
   - **The fold:** a pen line with three terracotta waves across it, drawn in on scroll, and a sky blob inside the sheet behind the waves.
   - **The note:** at the foot rule (drawn once on view, before anyone stands on it), 牽牽 and 點點 meet and resonate. 牽牽 hands over the note, page B's title ripples, and the pair settle back as stills. This happens once per visit.
   - **The pull:** on a desktop with a mouse, page B pulls away up to 60 px, the waves stretch with it, and it hops back in five stop-motion steps.
   - **Phone:** the pages stack, with the meeting strip inset inside the paper between them.

4. **04 The last page**
   - **Left page:** a story printed nowhere else in the issue (〈一句「很早就買了」沒說的事〉), from its second sentence, trailing off with 讀完它.
   - **Right page:** blank paper ruled by hand. Every row is a whole number of rules tall and wears its own rules:
     - row 1: 聆聆's pencilled 「嗯，我在聽」;
     - the h2 「這一頁，等你來寫」, at the same scale as 本期目次 and with no ink-in. Each wrapped line gets its own rule, and the first line keeps room for 聆聆, who stands on that rule;
     - the line, then an empty rule;
     - each row of buttons on its own rule;
     - the badges on the last rule.
   - 聆聆 writes, then points at 寫下你的故事.
   - **Phone:** 聆聆 and its line share a rule of their own above the h2.

5. **05 Colophon (本期編輯部):** the five as stills with name, job and line, plus 認識小紙團 →.

6. **Back cover:** a night band with a wavy top, pinprick stars and 悄悄 asleep by the logo. It holds the tagline, 晚安……再說一個就好 →, the badges and trademark line, links, © and the pause switch.

## The review's fixes (all ten applied, one done differently)

1. **The empty fourth cell at 320.**
   - Cause: the cell's layers never set `--unit`, so the engine read 100 px. 摺摺 didn't fit at 320, and 點點 took the cell instead.
   - Fixes:
     - `--unit` is now set on the cell layers, at 0.8 × the cell (Tuck is about 83 % of the cell).
     - The still stands back up whenever the cell is empty between two visits.
     - On a phone the cell's cast is 摺摺 only, so there is never a second 點點 beside the ≋ one.
   - Checked: a puppet is in the cell at 3 s and at 20 s, at 320, 360 and 390.

2. **The last page's h2.**
   - The h2 wraps inside the rule column. A float keeps 聆聆's room on its first line only.
   - On phones, 聆聆 has its own rule above the h2.
   - Checked at en 320/390/1440 and zh 320/390/1440: the h2's word boxes never touch 聆聆's box, and `scrollWidth == clientWidth`.

3. **The ruled paper.**
   - Rules are now drawn per row: a mask of hand-drawn lines repeating at the row's line height, three seeds per tile. No rule crosses a button or a badge, and each wrapped line gets its own rule.
   - Stacked buttons and stacked badges each stand on a rule.
   - 「嗯，我在聽」 moved onto the right page's first rule.
   - en lines use a `--copy-serif` token that is Playfair in English, so the apostrophes are no longer the CJK font's full-width ones.

4. **The faked pair — done with a different pair.**
   - The reviewer's example pair is two cards by Neo, and a card can't answer its own author's card.
   - The spread uses 放鬆的心 (念誠) ↔ 換我坐副駕駛 (Neo) instead: both named, both zh, both set in Ming.
   - A quiet 「示意 / Example」 tag sits on page B's label row.
   - `pairOf` in data.ts still prefers a real pair whenever one of the six answers another. Its comment says the real version reads the newest resonance and its original (the owner's call).

5. **One story printed four times.**
   - Stories are now split into whole sentences (never inside 「」 or 〈〉), and each place prints a different passage:
     - contents rows: sentence 1;
     - the cover line: sentence 2;
     - the spread: the pairing sentences;
     - the last page: a story the cover and the spread don't print;
     - the sidenote: a passage from the middle of the story.
   - Checked by listing every passage on the page: none is repeated.

6. **The phone dek splitting 回應.**
   - The zh dek is set in units a line may only break between: 讀到｜打動你的故事，｜不必按讚——｜寫一張｜自己的故事｜回應它，｜兩個故事｜從此相連. It drops to 15 px under 360.
   - At 390 it reads 讀到打動你的故事，/不必按讚——寫一張/自己的故事回應它，/兩個故事從此相連.
   - No unit breaks at 320, 360 or 390.

7. **The puppets' floors.**
   - The spread's foot rule is drawn once, in one stroke, when the foot is 20 % in view; the meeting starts at 60 %.
   - The ≋ row's floor is static.
   - On phones the meeting strip is inset 20 px inside the page with faded ends, so 點點 comes out of the paper rather than across its outline. The pair settle back as stills afterwards.
   - Checked frame by frame at 390 and 1440.

8. **Blobs showing as slivers.**
   - The spread's sky blob is now inside the sheet: behind the fold's waves on wide screens, behind the ≋ between the stacked pages on a phone.
   - The cover's sage blob was raised: its body sits behind the cell, inside the 1440 × 900 first screen.

9. **en cover parity.**
   - A hand-drawn slot, one line tall and in the grid's pen, sits before "with", with Tuck at 0.8 em.
   - On phones the title runs in four big lines (17.4vw). At 390 the slot is about 68 px (just under the 70 px the review asked for), and Tuck fills about 83 % of it.

10. **The write CTA's headline.**
    - It no longer inks in, and it uses the issue's h2 scale.
    - The other h2s now finish inking by the time they reach the lower third of the screen. Each character's range is written out.
    - Each character is its own box, kept in no-break phrases, so a line still breaks only after 「，」.

**The reviewer's minor points:**
- **Cover gap:** the dek and the cover line now share the room between the kicker and the badges, which still line up with the title's foot. The 150 px dead gap is gone.
- **Dark back cover:** in the dark scheme the night is bluer and lighter (`oklch(27.5% 0.058 262)`), so its wave reads against the page.
- **Pause label:** the label still flips between 讓小紙團休息 and 叫醒小紙團, and I dropped `aria-pressed`. ARIA's guidance is that a toggle whose label changes should not also announce "pressed". This departs from BUILD.md's "(aria-pressed …)" note; the review asked for one or the other.
- **Nested buttons:** a new `LinkPill` (a link wearing OrganicButton's face, one tab stop) replaces `Link > OrganicButton` in the contents and on the last page.

## My own pass

- **Full-page captures.** They showed every scroll-linked mark in its unscrolled state: headings at 15 % ink, rules undrawn. Scroll effects now arm only on the reader's first scroll, and only for marks still below the screen at that moment (`ScrollArm`; `useDrawnOnView` does the same for the once-drawn rules).
  - Anything already being read never undraws itself.
  - The server HTML stays the finished page.
  - Whole-page PNGs show every rule and heading.
  - The demo videos show the real ink-in and draw-in.
- **Phone cover:** the dek now starts directly under the kicker instead of sitting vertically centred.
- **Last-page buttons:** the pills had inherited the ruled row's 68 px line height and grown tall. Fixed.
- **Last page in en:** the English h2 rule's line-height was overriding the ruled h2's, which pushed every row off its rule. Fixed.
- **Story text:**
  - A list after 「：」 picked up a stray 「，」. Fixed.
  - "Mr." was ending a Latin sentence. Fixed.
  - A cut could leave a 〈 or 「 open. Fixed.
- **Dark mode, tablet 820, en and 320:** checked; the issues found there are the en and phone fixes above.

## Faked or cut

- The spread's pair is faked, as the spec allows: two real cards, marked 示意.
- Cut:
  - any further night casting in the cell (dark mode simply casts 悄悄 in the cell);
  - the colophon's "hello" is only the still's own hover;
  - no switch to a horizontal zh title at 200 % zoom (`@container`).
- Development builds only: `window.__issueEvents` and `window.__issueStages` expose each stage's events and handle for probing. Production builds skip them.

## Known problems

- In the full-page **phone** PNGs, the cover shows the QR code stacked with the badges. A phone does not render that: the phone fold PNG and the video are correct. It appears to be an artifact of the full-page capture.
- The sidenote's cover picture can come out blank in a full-page desktop PNG. It is a lazy-loaded image the capture never scrolled near.
- At 320 and 360, 「讀到」 sits alone on the dek's first line. That is the cost of never splitting 回應它 or 自己的故事.
- On phones the en title's sage spotlight bleeds off the left edge of the screen. It still reads as a shape, not a sliver.
- On desktop, page A of the spread (one sentence) is shorter than page B, which leaves some air above its byline.

## Checks

- `npx tsc --noEmit -p .` prints nothing for lab/landing/issue, and `npx eslint src/components/lab/landing/issue` is clean.
- No console errors or page errors at 1440, 390 or 320, in zh or en.
- No horizontal scroll at 320, 390 or 1440.
- One h1, and no shadows.
- With reduced motion: no stages run, the five stills show, headings are in full ink and rules are drawn.

## Libraries

- **Motion 12** (vanilla `animate`, loaded with a dynamic import on first use): the ripple and the sidenote cross-fade.
- **Native CSS scroll-driven animations** (`animation-timeline: view()`, behind `@supports` and `prefers-reduced-motion: no-preference`): rules, h2 ink-in, the fold and its waves.
- **The house mascot engine** (`src/lib/mascots` `createStage`), mounted per section through liveStage.ts and useLiveStage.ts.
- **Pointer events** for pulling page B.
- No GSAP.

## Files changed in issue/

- **New:** LinkPill.tsx, ScrollArm.tsx, useDrawn.ts.
- **Rewritten:** LastPage.tsx, last.module.css.
- **Edited:** data.ts, Page.tsx, Cover.tsx, cover.module.css, Contents.tsx, contents.module.css, Spread.tsx, spread.module.css, marks.tsx, issue.module.css, back.module.css, RestToggle.tsx, copy.ts, liveStage.ts.
- **Outside the folder:** scratchpad/lab/issue/demo.mjs (the phone path now glides straight to the meeting strip; the cell tap targets the cell's own puppet).

## Final media

All in /private/tmp/claude-501/-Users-ncchen--claude-spares-spare-pZgTcm/84b65950-01bf-4833-b134-c3a6994644eb/scratchpad/lab/issue/final/

- **zh, light, at 1440 / 390 / 820:** zh-desktop-fold.png, zh-desktop-full.png, zh-phone-fold.png, zh-phone-full.png, zh-tablet-fold.png, zh-tablet-full.png
- **zh, dark, at 1440 / 390:** zh-dark-desktop-fold.png, zh-dark-desktop-full.png, zh-dark-phone-fold.png, zh-dark-phone-full.png
- **en, at 1440 / 390:** en-desktop-fold.png, en-desktop-full.png, en-phone-fold.png, en-phone-full.png
- **demo-desktop.mp4 (75 s):** the idle ripple, a click on the title, 摺摺 tapped, the contents with two rows hovered, the note at the fold and the answer's title ripple, page B pulled, then the last page, the staff and the night.
- **demo-phone.mp4 (63 s):** the same path on a phone, with the glide going straight to the meeting strip between the stacked pages.

Probes and working captures are in scratchpad/lab/issue/fin/.