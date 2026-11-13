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

## Never a bottom sheet

No bottom sheets, on any platform (the owner, round 17: 「button sheet 现在不在我们的整个设计里面……应该要做成 model」): what would rise from the foot is the modal dialog, a popover at its control on a wide screen, or a panel in the keyboard's place — `src/lib/design/noBottomSheets.test.ts` refuses the apps' system sheets (SwiftUI `.sheet` / `presentationDetents`, UIKit's sheet controller, Compose's `ModalBottomSheet`).
