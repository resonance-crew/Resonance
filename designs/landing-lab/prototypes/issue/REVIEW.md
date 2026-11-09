# Review — B · 對頁 Facing Pages (`issue`)

Captured by the reviewer: `review/r-*` (shoot.mjs light, dark, en, tablet), `review/w-*` / `wen-*` (scrolled viewport walks at 1440, 390, 320 zh, 320 en), `review/demo-desktop.mp4` + `demo-phone.mp4` (builder's demo.mjs, frames in `review/fd/`, `review/fp/`), `review/cell*` (the fourth cell over 24 s at 320 and 390), `review/last-en-*` (en last page), `review/p-nojs-phone-full.png`. Scripts: `review/walk.mjs`, `cell.mjs`, `probe.mjs`, `lastpage.mjs`.
Checked: there were no console errors at any size. There was no horizontal page scroll at 320, 390 or 1440. Only one h1 (with sr-only text). No shadows (the only box-shadow found is OrganicButton's transparent inset reset). The ripple measured 700 → 900 → 700, staggered across the seven glyphs. The pause toggle flips both buttons, is stored (`resonance:issue-pals-rest`) and survives a reload. The page is complete with JS off.

## Verdict

1. **Complaint: yes.** The manuscript-cell vertical title, folio numerals, ruled contents and two facing pages read as a small literary issue, not a SaaS template. It is the calmest of the directions, and it is unmistakably ours.
2. **Puppets belong, mostly.** 摺摺 as the fourth character and the 牽牽 → 點點 note at the fold were made for them. 點點 on the sidenote and the colophon are lighter. But at 320 the cell is empty, and on the last page 聆聆 still stands on the h2 (en at every width, zh at 320).
3. **Phone in 5 s: yes at 390.** The phone shows 用故事｜回應故事 in its cells with 摺摺 in the gap, and the dek says 「不必按讚，寫一張自己的故事回應它」 with the badges above the fold. It is weaker at 320 (empty cell, chopped dek) and in en (small h1, tiny Tuck).

## What works — keep

- **「第四個字」 and the ripple.** The empty cell is drawn into the type, and the puppet stands in it. The ripple runs on idle, on a click, and from the cell outward on a hop: a real wave of weight, cheap, and on-name. 悄悄 takes the cell at night.
- **Contents as words.** Ming titles, first-sentence quotes in hanging 「」, italic folios, and hand rules that draw in. All six rows have small cut-out covers.
  - On a desktop, the sidenote cross-fades with a row wash on hover, with 點點 on its edge.
  - On the phone, the cover line folds into row 01 as 「本期封面」, which is clever and saves a block.
- **The note at the fold.** 牽牽 draws the note to its chest and hands it to 點點, who carries it off. It is the product's mechanic acted out by the cast. Page B pulls away and the gutter waves stretch (desktop).
- **The cast and the ending.** The night back cover with 悄悄, and the colophon crediting the five with jobs and linking /paper-pals. The pause toggle sits in both the running head and the footer.
- **The 820 tablet** is the most balanced composition of all. Dark mode holds throughout.

## Fixes, by impact (at most 10)

1. **The fourth cell is empty at 320 px (zh). The signature vanishes on small phones.**
   - What happens: at 320×640 the cell layer is 108×114 and the block says `data-staged`, so the still is hidden. But the stage never places a character there in 24 s; the only `.ms-char` is the dinkus 點點 (`review/cell320.json`, `cell-pair.png`).
   - Fix: size the cell puppet to the cell (unit ≈ 0.85 × the cell height). And if `askVisit` runs out of tries, clear `data-staged` so the still stays.
   - Check: a puppet or still is in the cell at 3 s and at 20 s, at 320, 360 and 390.
2. **Last page: the h2 is clipped, overlaps its line, and 聆聆 stands on it.**
   - What happens: 「This page is waiting for you」 doesn't wrap. At 390 and 320 it is cut at the page edge ("waiting f…"), 聆聆 stands on "for you", and its descenders hit 「It needn't be polished」 (`review/last-en-pair.png`, `wen-w320-s06.png`). At 1440 en it runs into 聆聆. At 320 zh, 聆聆 covers 「來寫」 (`sheet-320.png`).
   - Fix: let the h2 wrap inside the rule column, with 聆聆's width reserved at the line's end. On phones, put 聆聆 on its own rule above the h2. Seat the h2 on its rule (one rule per wrapped line).
   - Check: at en 320/390/1440 and zh 320, the h2's box intersects no puppet box, and `scrollWidth == clientWidth`.
3. **The ruled paper is messy, and the margin line lands on the wrong line.**
   - **Rules through the buttons.** The rules run through the two buttons at mid-height and strike through 「在手機上寫也可以」. On a phone, stubs poke out beside the badges. Seat every line, button and badge on a rule (bottom on the rule), and end each rule before a button or badge. On a phone, give each stacked button its own rule.
   - **「嗯，我在聽」 collides with the byline.** It sits on the left page's byline row, so on a phone it reads 「Starry · 讀完它 → 嗯，我在聽」, and in en at 390 it overlaps "Finish it →". Put it inside the right page just above 聆聆's head, or drop it under 640 px.
   - **en apostrophes.** The en lines show the CJK font's full-width apostrophes ("needn’ t", "I’ m"). Set en copy in the Latin serif (`lang="en"` plus the Playfair/DM stack).
4. **The faked pair reads false.**
   - What happens: the spread pairs the anonymous English 「from FOMO to soul Resonance…」, set in italic Playfair, with 念誠's zh card under 「回應〈from FOMO…〉」. The topics are unrelated, the left page isn't even set in Ming, and it claims a named person answered an anonymous card.
   - Fix: for judging, fake it with two named zh cards whose subjects are near (e.g. 換我坐副駕駛 ↔ 一句「很早就買了」…), and add a quiet 「示意」 tag while it is faked. The real version reads the newest resonance and its original (the owner's call, as the spec says).
5. **One story is printed four times.**
   - What happens: Starry's 〈結巴影響我的事〉 is the cover line, contents row 01, the sidenote's default and the last page's left page — and three times on a phone. It makes the issue feel thin.
   - Fix: give the last page's left page another story (the newest one used nowhere else), and give the cover line a different passage than row 01's pull quote.
   - Check: no opening appears twice on the page.
6. **The phone dek splits 回應.** At 390 it breaks 「寫一張自己的故事回／應它，」, and at 320 it breaks 「故／事」 and 「從此／相連」, chopping the very accent word of the h1.
   - Fix: make the nowrap phrase units smaller (「寫一張自己的故事」「回應它，」), or run the dek at full width under the title block on phones (title at the right, kicker at the left, dek below), or clamp it to 16–17 px under 400 px.
   - Check: no mid-word break at 320, 360 or 390.
7. **The puppets lose their floor.**
   - **On a phone.** The meet strip's floor rule runs only under 牽牽 (about x 45–200). 點點 enters from the right edge, where the page outline clips it, and after the note both leave, so the stacked spread ends with a lone ≋ (`w-phone-s03.png`, `fp-sheet2`). Draw the floor across the whole strip, enter from inside the page, and let the pair settle back as stills after the note.
   - **On a desktop.** The foot rule's draw-in is scrubbed by scroll. In the demo it is only partly drawn while the two stand on it, so they stand on nothing (`fd/full-56.png`). Draw the floor once on view, before the meet.
8. **The blobs show as slivers, not shapes.**
   - The spread's sky blob peeks out as a ~60 px crescent beyond the spread's right edge at 1440 (x ≈ 1330–1390) and a ~15 px sliver at the left edge at 390.
   - The cover's sage blob is cut by the fold at 1440×900.
   - A blob should read as a shape where there is room. Move the spread's blob inside the spread, behind the gutter top or foot strip, or drop it. Raise the cover blob so its body sits behind the cell.
9. **en cover parity is weak.**
   - What happens: in en, 摺摺 in the indent is about 40 px tall at 390 and about 110 px at 1440, beside 130 px letters, with no drawn cell. It reads as a sticker, not the missing word.
   - Fix: draw the slot (a hand-drawn cell the height of one line, in the zh grid's pen), and size Tuck to the line so the en h1 visibly has a gap a puppet fills.
   - Check: at 390 en, the slot is at least 70 px and Tuck fills about 80 % of it.
10. **The write CTA's headline is the weakest h2 on the page.**
    - What happens: 「這一頁，等你來寫」 is smaller than the other h2s. Its scroll ink-in leaves it at about 15 % opacity until it is well up the screen, so on a phone the buttons arrive before their headline is legible.
    - Fix: no ink-in here (or finish by `entry 100%`), and use the same h2 scale as 本期目次.
    - Also finish the other h2s' ink by the time they reach the lower third of the screen.

Minor, not in the ten:
- **Cover gap.** The 1440×900 cover has a ~150 px dead gap between the dek and 「本期封面」.
- **Dark mode back cover.** The night back cover's wavy edge nearly disappears against the dark page; a lighter star rim or a distinct night token would help.
- **Pause label.** The toggle both flips its label and sets `aria-pressed`, so a screen reader hears 「叫醒小紙團，pressed」. Keep one of the two.
- **Nested buttons.** `Link > OrganicButton` gives two tab stops for 翻閱所有故事 (the same pattern as today's CTA).
