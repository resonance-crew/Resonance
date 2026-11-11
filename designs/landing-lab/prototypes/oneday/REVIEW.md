# Review · C 一天的戲 One Day (`oneday`)

Reviewed 2026-11-09 at http://localhost:3200/zh-TW/lab/landing/oneday and /en. I captured these sizes myself: 1440×900, 1366×768, 1920×1080, tablet 820, phone 390, 320 in zh and en, 844×390 landscape, dark, reduced motion, JS off, the paused state, and the demo video at desktop and phone.
Evidence is in `review/`: `r-*` (shoot.mjs), `w/` (viewport walk), `c/` (checks), `demo-*.mp4`, `fd*/fp*` (video frames).

## Verdict

1. **The complaint: answered from the second screen down, not yet in the first.** The day ramp, the drawn floors, the sticky answer stage and the night curtain call make the page feel told, not templated. The fold is still the classic "headline left, illustration right" hero, though, and the desktop stories are today's 3×2 grid with a hairline.
2. **The puppets: they belong where they have a job, and that is most of the page.**
   - **Where they belong:** 聆聆 reads on the 紙芝居 frame, the ♥ becomes a card, 摺摺 and 聆聆 hand over the note at the gutter, and the five take a bow at night.
   - **Where they don't:** in the hero and the dusk they stand at the edges of a floor, apart from the cards and the CTA.
   - **Bug:** the pause control makes them vanish in the hero, dusk and night.
3. **A phone visitor in 5 seconds: yes.** The 390×844 first screen holds the h1, the plain-words mechanic, both badges, two cards linked by ≋, and 摺摺 and 點點 on a floor. The loudest button there is 讓小紙團休息, which a newcomer cannot parse yet.

## What works (keep it)

- **The day as structure.** Cream → gold → terracotta → night, each scene ending on a pen floor with layered flats. It gives the dark footer a reason.
- **Hero copy.** 「讀到觸動你的故事，不必按讚——寫一張自己的卡片回應它」 says the mechanic plainly. The two scribble cards joined by the logo's ≋ are the product in one picture. The badges are official and the same height; the QR shows on desktop only.
- **The phone 紙芝居 is the best phone story treatment in the round.** One real card at full size in a pen frame with the stack's edges showing, and ‹ 上一張 / 下一張 › with a polite live region (「第 2 張，共 6 張」). 聆聆 reads on the frame top and 點點 peeks over it.
- **The answer stage.** It ends where the story's meaning is, and it is the strongest part of the page.
  1. The ♥ cross-fades into the dashed card.
  2. 聆聆 climbs down and writes, and B's lines draw in.
  3. B goes solid and slides over, the waves draw, 摺摺 and 聆聆 meet at the gutter and hand over the envelope, and 摺摺 is left with its corner.
- **The reduced-motion and JS-off comic** (`c/rm-desktop-answer.png`). Three panels tell the whole mechanic at one glance. Keep it exactly.
- **The night.** The five in a row each wave in turn, 悄悄 twinkles then naps (zz), the stars come out with the scroll, Hush's line links to /home, and the footer sits in the same night.
- **Engineering.**
  - Native sticky and CSS scroll-driven animation, with no GSAP or Motion.
  - **0 console errors** in my walks.
  - No horizontal page scroll at 320 in zh or en.
  - One h1, and the badge links are named by their alt text.
  - The pause control has `aria-pressed`, both toggles stay in sync, and it is remembered across reloads (`resonance:oneday-rest`).
  - Stills are correct under reduced motion and with JS off.
  - No shadows.

## Fixes, ordered by impact

1. **The pause makes the puppets disappear (bug, every width).**
   - **What happens:** after 讓小紙團休息 (and after a reload while paused), these puppets go to opacity 0 and the floors stand empty: the hero's 摺摺 and 點點, the dusk's 牽牽, and the night's 悄悄, so only four take the bow. Only the answer stage shows its stills. See `c/pz-d-sheet.png` and `c/pz-p-sheet.png`.
   - **Cause** (`oneday.module.css`): the rest rule `html[data-pals-rest] [data-scene] .still[data-managed] { opacity: 1 }` has specificity 0,4,1. It loses to `[data-scene][data-staged]:not([data-stills]) .still[data-managed] { opacity: 0 }` at 0,5,0.
   - **Fix:** raise the rest rule (e.g. `html[data-pals-rest] [data-scene][data-staged] .still[data-managed]`), or have `stagedAttrs` emit `data-stills` while resting.
   - **Check:** pause at 1440 and 390. All 2 + 1 + 5 stills must show, before and after a reload. The report says the pause "shows the still poses", which is not true today.

2. **The hero is one tableau on its floor, inside the first screen.**
   - **What happens:** at 1440×900 the cards float at y≈445–705 while the floor and puppets sit at 780–870. At **1366×768 the hero is 844 px tall, so the puppets fall below the fold** and only two heads show (`c/fold-1366.png`). That first screen is exactly the plain SaaS hero the owner described.
   - **Fix:**
     - Stand cards A and B on the hero floor, their bottoms on the pen line.
     - Put 點點 behind B (peeking or hopping) and have 摺摺 walk up to A and wave.
     - Cap the hero so the floor is inside 100svh at 1366×768 and 1440×900.
     - On the phone, close the ~60 px gap between the cards and the floor (`w/p-0hero-b.png`).
   - **Check:** at 1366×768, 1440×900 and 390×844 the floor and both puppets are fully visible and the cards touch the floor.

3. **The hero's pause pill reads as a call to action.**
   - **What happens:** 讓小紙團休息 is a peach tonal pill right beside 先讀讀大家的故事 at every width. At 390 in en it becomes a full-width "Let the Paper Pals rest" pill. It is the most prominent action after the badges, shown before the visitor knows who the pals are.
   - **Fix:** make the hero's instance a quiet glyph + text control (muted ink, no fill, a ≥44 px target) at the hero floor's end beside the puppets, or in the header row. Keep the footer toggle. That still meets WCAG 2.2.2, and the action row is left to 先讀讀大家的故事 →.

4. **The phone sticky stage has a seam that shows text.**
   - **What happens:** at 390 and 320, the beat titles scrolling behind the stuck stage show as cut glyph fragments in the ~10 CSS px between the header's pen line and the stage (`w/z-p-2beat2-b.png`, `w/z-p-2beat3.png`).
   - **Fix:** give the sticky stage a backing in the section's paper from the header's bottom edge (padding-top + background, or a `::before` band), or set its sticky `top` exactly at the header's bottom.
   - **Check:** scroll beats 1→3 at 390 and 320. Nothing shows between the header and the stage.

5. **The desktop stories don't read as a shelf.**
   - **What happens:** at 1440 it is today's 3×2 grid with a faint hairline under each row (`w/d-1stories-b.png`). Of all the sections it changes the least, though it is the second thing a visitor sees.
   - **Fix:** draw a real shelf: an `INK_STRONG` pen line plus a lip band in the section's darker paper, like the hero floor. Bottom-align the cards and let their heights vary naturally (no equal row heights). Stand 點點 on the shelf's end instead of half-hidden behind card 3.
   - **Check:** at 1440 it reads as cards standing on shelves.

6. **The desktop answer stage is sparse.**
   - **What happens:** the cards are ~220×280 inside a ~690×600 framed box, roughly half the stage is empty at every beat, and the puppets are ~70 px tall. The stage hangs at the top with ~190 px of empty gold under it at 1440×900 (`w/d-2beat1-b.png`, `w/d-2beat3-c.png`). The reduced-motion comic panel 3 is a tighter, better composition than any live moment.
   - **Fix:** scale the cards to ~35–40 % of the stage width each and raise the floor to just under them. Play the puppets at the desktop unit (120). Centre the stage vertically against the beat text.
   - **Check:** at beat 3, the cards, the waves and the meeting fill the stage the way comic panel 3 fills its panel.

7. **Dusk: 牽牽 doesn't point at 寫下你的故事, and the blank card floats.**
   - **What happens:** at 1440, 牽牽 stands at x≈155 and its `point` aims horizontally left, off the page edge (demo frames ~105–109, `fdf/dusk-strip.png`). The button is ~100 px above and to its right. The blank card hangs in the sky with BlankPal standing ~80 px below it, unconnected. The hover look-up is barely visible.
   - **Fix:**
     - Put 牽牽 between the CTA and the blank card, facing the button.
     - Stand the blank card on the floor with BlankPal beside it or holding it, so 「最後一頁，留給你」, the CTA and the two pals read as one set piece.
     - Make the look-up a visible head tilt.
   - **Check:** at 1440 and 390.

8. **Night: a collision on the phone, and the Hush hole doesn't read as a hole.**
   - **Collision:** at 390 the crescent moon overlaps 「在」 of 在 App 裡，故事不打烊, and stars land on the heading and the subtitle (`w/p-4night-b.png`).
   - **The hole:** it reads as a blank beige tombstone or an empty speech bubble. It is also the brightest object in the band and pulls the eye from the curtain call.
   - **Fix:**
     - Below 640, move the moon clear of the heading and keep stars out of the text column.
     - Make the hole read as one: Hush's exact outline at Hush's size, directly above it, drawn as a dashed cut line like the blank card's, filled with the dusk-peach paper "behind the sky". Or cut it, as the spec's cut order allows.
     - Show 悄悄's still until its stage takes over: today it appears 1–4 s after the band enters, so a fast scroller sees four pals and an empty hole (`c/w320-*-sheet.png`).

9. **Tablet 820 hero is unbalanced.** The sage blob sits alone in the upper right with nothing on it, and the cards stack below the text (`r-tablet-fold.png`).
   - **Fix:** at 640–1023, put the cards beside the text, or move the blob behind the cards as on desktop.

10. **zh-TW typography details.**
    - 「晚安……再說一個就好」 renders Playfair's baseline dots ("......") because Playfair precedes Noto Serif TC in the stack. In zh-TW, put the CJK serif first for that line so …… is centred.
    - 「第 1 張，共 6 張」 wraps onto two lines at 320 (`c/w320-zh-TW-sheet.png`); use `white-space: nowrap` or a smaller size there.

### Lower, noted only

- **Dark mode is coherent but loses the day.** The hero is near-black, the answer stage's frame is almost invisible, and the night navy barely differs from the hero (`r-dark-desktop-*`). Keep each step's hue shift legible in the dark palette.
- **The shared header stays a cream bar over the night band.** A copy whose background follows the scene would finish the "one day".
- The pen wave under 回應 does not continue into the hero cards' ≋ link; the spec allowed skipping it.
- `BlankPal.tsx` carries raw OKLCH values. It is a copy of the existing /paper-pals puppet art and colour-fixed like the cast images, so it is acceptable.
