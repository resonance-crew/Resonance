---
paths:
  - "src/components/**"
  - "src/app/**/*.tsx"
  - "src/app/**/*.css"
  - "src/styles/**"
  - "apps/ios/**/*.swift"
  - "apps/android/**/*.kt"
---

# Phone, tablet and Mac — zero exceptions

The owner's layout rules, for every platform. They load with any UI file on the web, iOS, the Mac or Android.

## Phone, tablet and Mac (the owner's layout rules)

The owner reads three kinds of device, each with its own look — decide by the kind, not only by a width class, and keep the twins (web where it has the screen, iOS, Android) the same at the same kind. Restated here so the owner never has to say them again (rounds 5, 15, 23, 24):

- **Phone** (iPhone, Android phone, web ≤ 720): **bands, not cards.** The feed's cards are full-bleed bands parted by their wavy pen rule; a list's rows (the bell, the conversations) are bands parted by curves seen only when pressed; an aside on a list (a notification invite) is one more band in a grey of its own (`bubble-theirs`) — never a framed card, which reads as "one more card" on a phone.
  Edge to edge, the content on the page's margin (rows 20, a card's words 38).
  The first band's top is the bar's pen line: its paper runs up under the bar's wave, no rule of its own, and when the page is pulled past its top the gap wears that band's paper (`pullPaper` / its Android twin) — the page's cream never shows between them.
  A margin or padding the owner changes "on phones" changes on phones only.
- **Tablet** (iPad, Android tablet; portrait or landscape, one pane or two): **cards, in wider margins.** The feed is a grid of framed cards (landscape) or bands whose content keeps the reading column (portrait); lists sit in a column.
  An aside is a **borderless card** — filled (the grey, the card grain), the card's outline, no pen line — inside the content's margins, its edges aligned with the content's edges (the cards' content column, the rows' boxes), with more air above it than a phone gives.
  The first content stands `clamp(width × 4 %, 32, 56)` under the header's pen line (round 15); the header is full width with the tabs as the centred capsule (round 5).
  A banded list (the bell) is cut at the reading column's sides, never run to the window's edges (round 24).
  An iPad in a window narrow enough for a phone's layout is still an iPad: its brand bar never slides away under the status bar (round 24: the window's controls stood over the stories).
- **Mac** (Mac Catalyst): the iPad's layouts at 77 % with the story boost (round 21), except where a pane is a sidebar: the conversations list beside the thread is one, and an aside there is a **band filling the pane** — from the window's edge to the pane's divider, its top the header's pen line (no rule of its own), its foot a rule that meets the divider.
- **Lines meet, fills fill**: a band or panel reaches every line next to it — the bar's pen line, a pane divider, the next band's rule — with no strip of another paper or a gap between; a rule ends on the line it meets; anything a scroll or a pull reveals past an edge continues the paper at that edge.
- Check every such change on a phone, a tablet in both orientations and the Mac (the screenshots' iPhone, iPad, Android phone/tablet and Mac captures), and make it on every platform in the same change.

## The end of a story (round 26)

- **The end row** (the capsule 共振 · 寄小紙條 · 用卡片回應 and the faces' line under it, 0 apart, 44 tall — Android 48): full words, then short (寫卡片; English is short on both apps: Resonate · Note · Card), then two lines with 共振 alone on the first (8 between); no segment ever hidden or reduced to a glyph. A content width ≤ 340 starts from the short words, the same threshold on the three platforms (web `NARROW_ROW`, iOS `EndRowLabels.narrowRow`, Android `EndRowLayout.NARROW`).
- **Who resonated**: a reader's list is a centred dialog on every device, no title, its rows the same (a face 36 and a pen name), the small 關閉 at the foot's end as every one-exit dialog — on a phone the width it always had, 400 or the column less 16 a side, and 480 on a tablet, the Mac and the desktop, as the author's list (the web's `TAP_LIST_DIALOG_WIDTH` under `TAP_LIST_PHONE_QUERY`, iOS's `TapListMetrics.readerWidth`, Android's `readerListWidth`); the owner, 2026-11-19, after the screens: 「我在想这个直接做成这个 model 会不会好一点呢」 and 「手机上已经是这个 model 的设计了，所以可能只有平板和电脑网页和 Mac APP 需要更改」 — the popover at the faces that tablets, the Mac and the desktop opened is gone. The author's list is a centred dialog 480 wide on every device.
- **The author's picked sentences' faces** (round 29 §S1, §S9): one rule by room on every platform — the **right margin** when the white right of the story's column is ≥ 70 (to the contents rail when one stands, always 80, else to the window's edge): every layout with a rail (a story with headings at ≥ 900: tablets turned, the 1024 tablet too, the Mac, the desktop), and without one from 820 wide (the 820 / 834 / 1032 iPads upright, Android tablets, the web); **in the line** after the sentence everywhere else (every phone, a 744 iPad mini or any 768 window upright). The group stands 8 right of the column, so beside a rail three faces end 16 short of it at 1×; at exactly 820 with no rail three stand 6 from the window's edge (accepted, §S8). A window crossing 70 changes place at once, no animation. The paper puppets take no place on the right side of a page with faces in its margin (`measure.ts` reads `[data-passage-margin]` as a rail).
- **The note in place** (design-system.md, Dialogs): phone = the column; tablet, Mac, desktop = min(the story's column, 680) from where the capsule starts; 3 lines on a phone (2 in a short window), 5 elsewhere, then it scrolls inside. On focus the page scrolls the field's block to 12 above the keyboard and nothing floats: Android's card page `LazyColumn` carries `imePadding`, so the field rises over the keyboard; iOS gives the block no bottom spacing in the layout and keeps the 12 with the scroll target's transparent range (`noteScrollTarget(_:)`, `NoteInPlace.keyboardGap`), the next section 40 under the field.

## Never a bottom sheet

No bottom sheets, on any platform (the owner, round 17: 「button sheet 现在不在我们的整个设计里面……应该要做成 model」): what would rise from the foot is the modal dialog, a popover at its control on a wide screen, or a panel in the keyboard's place — `src/lib/design/noBottomSheets.test.ts` refuses the apps' system sheets (SwiftUI `.sheet` / `presentationDetents`, UIKit's sheet controller, Compose's `ModalBottomSheet`).
