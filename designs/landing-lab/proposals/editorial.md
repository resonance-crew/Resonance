# 對頁 · Facing Pages — the landing page as one issue of a literary magazine

**Pitch:** The landing becomes today's issue of a small literary magazine: real stories set in big Ming type, a story printed facing the story that answered it, and the 小紙團 as the issue's staff, living in the cells, margins and gutter the grid leaves for them.

---

## 1. Diagnosis: why today's page reads as a template

- **One centred axis, empty flanks.** Pill → headline → paragraph → badges → avatar row, all stacked on a ~640 px column. At 1440 about 60 % of the fold is bare cream, and two blobs are left to fill the sides without meaning anything. It is the default hero every builder produces.
- **The product never speaks in its own voice.** The first real human sentence is a 14 px excerpt inside a card, below the fold. The stories appear as a uniform 3 × 2 grid of equal cards (in the capture, four of the six show an empty pale cover frame), the same "latest posts" block a blog template has. On a phone the grid runs ~2,700 px of near-identical cards, about half the page.
- **The one thing that is different goes unsaid.** On Resonance you don't like a story, you answer it with one of your own. Neither the dek (「讓世界各地的人生故事相互連結的空間……」) nor the CTA (「分享你的故事，讓世界聽見你的聲音」) says that; both would fit any writing platform.
- **Hero → grid → coloured CTA band → dark footer** is the stock SaaS order, and the proof row of four team initials (念 蕭 方 TE) under 「成為一群最早說故事的人」 reads as a "trusted by" placeholder.
- **The puppets are stickers on leftover edges.** They get the ledges a layout made without them happens to have: the headline's top, card tops, the side of a badge. On the desktop fold, 點點 hangs off 讓's corner and 悄悄 stands on 響's shoulder, both crowding the pill and the ≋ mark in the 200 px above the h1. On the phone, 摺摺 and 牽牽 flank a 41 px headline they are twice as tall as, over a peach blob that belongs to neither. Nothing on the page is *theirs*, and they have no job in relation to the stories.

## 2. The idea in one paragraph

A magazine gives every element a role: masthead, contents, spread, last page, colophon. Resonance's core gesture (a story → a story that answers it) is exactly what a magazine **spread** is: two pages facing each other across a fold. So the page is built as **today's issue**. Its grid has a unit, `--pal-unit` (120 / 100 / 80 px, Tuck's height, already the stage's sizes), and the room for the puppets is *drawn into the type*: the masthead's empty fourth cell, the margin track, the gutter, the dinkus row. The puppets stop visiting ledges and get **casting**: each one works in one section, matching its personality, and it carries a small story across the page. Pip searches the contents for the rest of its story. Twine brings it a folded note across the fold. Nod waits on the blank last page with a pencil. The page is ink on cream with nearly no colour fields, so the pastel paper bodies *are* the colour.

## 3. The page, top to bottom

### 0 · The grid and the running head (all sections)

- **Grid:** `[margin] [text] [margin]`, where margin = `calc(var(--pal-unit) * 1.5)` (180 / 150 / 0). The page pad stays 16 px at 390. Folios (「01」「02」…, Playfair italic) and the puppets hang in the margin; text never sits there. On phones (margin 0) the puppets live in the **cell**, the **dinkus rows** (a 96 px ≋ row between sections) and the **fold**. A puppet never stands on words or covers a card.
- **Running head**, under SiteHeader, 13 px small caps between two INK_LIGHT wavy hairlines:
  zh `共振 RESONANCE　本期 11 月 9 日　六篇新故事`, en `RESONANCE · This issue, 9 November · Six new stories`.
  The date is the newest card's `publishedAt` (Asia/Taipei). The count is how many cards the read returned (fewer when blanks are skipped). Both are in the ISR HTML and refresh hourly. At its end is a small text button, 「讓小紙團休息」 / "Let the Pals rest", which pauses every puppet, ripple and loop on the page (WCAG 2.2.2) and is remembered per browser.
- **Rhythm:** sections are separated by white space and one hand-drawn hairline rule, not by colour bands. One SectionEdge wave remains, into the footer (the back cover). There is one blob on the whole page: the cover cell's spotlight.

### A · 封面 Cover (`#about`)

**Purpose:** say in five seconds that this is not another feed. A literary title, the one rule that makes Resonance different, and a real sentence from a real person.

**zh copy**
- Kicker: 「真實的人生故事」 (a text kicker with a short pen rule, no pill)
- h1, **set vertically (直排)** in two columns read right to left: 「用故事」｜「回應故事」. 回應 is in terracotta, with the pen wave down its **left** side, where a vertical text's 書名號 wave sits.
- Dek (new, proposed): 「讀到打動你的故事，不必按讚——寫一張自己的故事回應它，兩個故事從此相連」
- Cover line (desktop / tablet): 「本期封面」, then the newest card's first sentence in Ming, then the pen name or 「不署名」, title, minutes, and 「讀這篇」
- GetTheApp (badges, plus the QR code for hover + mouse), as today

**en copy:** h1 set horizontally, `Answer stories` / `with stories`, with "Answer" accented. Dek: "No likes here — when a story moves you, answer it with one of your own, and the two stay linked". Cover line: "Cover story · …".

**The cell (designed for the puppet).** The first column 用故事 is one character shorter than 回應故事, so its fourth cell is empty. The cell is sized `--cover-cell` (168 / 140 / 92 = 1.4u, 1.4u, 1.15u), and **that empty cell is the puppet's seat**: Tuck stands in it as if it were the fourth character of the column. In en the second line is indented by exactly one cell, and Tuck stands in the indent. The single sage DriftingBlob rests behind the cell as its spotlight.

```
DESKTOP 1440                                                   PHONE 390
┌────────────────────────────────────────────────────────┐    ┌───────────────────────┐
│ ≋ Resonance                           繁體中文  [登入]  │    │ ≋ Resonance     🌐 ☰  │
│ 共振 RESONANCE ～～ 本期 11 月 9 日 ～～ 六篇新故事  01 │    │ 共振 · 11.09 · 六篇 ～ │
│                                                         │    │            ┌───┬───┐  │
│ 真實的人生故事 ─                       ┌─────┬─────┐    │    │ 真實的     │ 回│ 用│  │
│                                        │  回 │  用 │    │    │ 人生故事 ─ │﹏應│ 故│  │
│ 讀到打動你的故事，不必按讚——           │﹏ 應 │  故 │    │    │            │ 故│ 事│  │
│ 寫一張自己的故事回應它，兩個故事從此相連 │  故 │  事 │    │    │            │ 事│摺 │  │
│                                        │  事 │ 摺摺 │◀ cell   │            └───┴───┘  │
│ 本期封面 ───                           └─────┴─────┘    │    │ 讀到打動你的故事，不必 │
│ 「（最新一篇的第一句，Ming 28）」        ( sage blob )   │    │ 按讚——寫一張自己的故事 │
│ — 筆名〈標題〉· 4 分鐘 · 讀這篇                         │    │ 回應它，兩個故事從此相連 │
│ [App Store] [Google Play]   [QR] 用手機掃描下載         │    │ [App Store][Google Play] │
└────────────────────────────────────────────────────────┘    └───────────────────────┘
```
- **Tablet 820:** the same as desktop with 140 px cells. The title block takes ~310 px at the right and the text column ~390 px at the left. The badges stack, and the QR code appears only with a mouse.
- **Phone:** the cover line moves out of the fold and becomes the first row of the contents. The title, dek and badges fit within 640 px of a 390 × 664 Safari viewport.
- **en 1440:** Playfair 800 at `clamp(56px, 9vw, 132px)`, left-aligned. Line 2 starts one cell in, with Tuck in that gap. The dek and cover line sit under it in two columns.

**Motion.** The h1 is painted at weight 700 and is never hidden (it is the LCP). The **ripple:** once the page is idle (≥ 1 s after load), a wave of weight runs through the seven characters, each going 700 → 900 → 700 over 480 ms with a 70 ms stagger and a 0.03 em sideways nudge, like a plucked string. 回應 peaks at 900 with scale 1.04. Ideographs keep their 1 em advance at any weight, so nothing reflows. The ripple runs again when a puppet **hops in the cell** (the stage's `act: hop` event) and when the h1 is tapped or clicked, at most once every 1.5 s. In en the ripple is a per-word baseline wave (transform only), because Playfair is not loaded as a variable font here.

**Puppets.** **摺摺 Tuck** by day, **悄悄 Hush** at night: the cast follows the theme (both stills are in the HTML and CSS shows one). Tuck acts `read` (its little book) and `look`. It `wave`s once when the visitor first scrolls. On the third tap it does `reveal`, lifting its folded corner, in keeping with 「信任你了，才會掀開」. Now and then **點點 Pip** hops into the cell instead: 「這是我的故事嗎？」. Its landing rings the title.

**Server vs client.** The server renders the h1 as `<span class="sr-only">用故事回應故事</span>` plus `aria-hidden` per-character spans (split at render with Intl.Segmenter, so no SplitText is needed), the dek, the cover line, GetTheApp, the blob stand-in and the PaperPalStill in the cell, which still breathes and blinks. The client adds the ripple and a one-ledge stage (a `spot`, floor stance, in the cell).

### B · 目次 Contents (`#stories`)

**Purpose:** the six latest real stories, shown as words rather than boxes.

**Copy.** Folio 「02」. h2 「本期目次」 / "In this issue". Dek, built from the read: 「六篇新故事，來自 Starry、Neo、念誠，和一位不署名的作者」 / "Six new stories, from Starry, Neo, 念誠 and one who chose not to sign". This replaces the four-initials proof row: the proof is the real authors. Footer link: tonal button 「翻閱所有故事」 → `/home`.

**Each row** is a link to `/card/{slug}`: a large folio numeral (Playfair italic, 56 / 44 / 32) hanging in the margin; the **title** in Ming 600 (34 / 28 / 22); the **pull quote**, i.e. the story's first sentence (see Tech), in Hei, muted, with hanging 「」; then the pen name (or 「不署名」), minutes and up to two TagPills. Rows are separated by hand-drawn wavy rules (INK_LIGHT). The quote and title carry the card's `lang` and script (`storyType`), so an English story on the zh page sets in Playfair.

```
DESKTOP 1440                                                          PHONE 390
 02  本期目次                                                           ≋ (dinkus: 點點 lands here)
     六篇新故事，來自 Starry、Neo、念誠，和一位不署名的作者             02 本期目次
┌margin┬──────────── list (760) ─────────────┬──── sidenote (360) ───┐   六篇新故事，來自……
│  01  │ 結巴影響我的事        Starry · 4 分 │ (點點 sits on its top) │  01 結巴影響我的事
│      │ 「第一句……」                       │ ┌───────────────────┐ │     「第一句……」
│      │～～～～～～～～～～～～～～～～～～ │ │ [cover cut-out]    │ │     Starry · 4 分鐘
│  02  │ 換我坐副駕駛            Neo · 6 分 │ │ 「pull quote, Ming  │ │  ～～～～～～～～～
│ ...  │ ...                                │ │  24, 4 lines」      │ │  02 換我坐副駕駛 …
│  06  │ from FOMO to soul …    不署名 · 2  │ │ #標籤 #標籤 讀這篇→ │ │  …
│      │            [ 翻閱所有故事 ]          │ └───────────────────┘ │  [ 翻閱所有故事 ]
└──────┴────────────────────────────────────┴───────────────────────┘
```
- **Desktop (≥ 1024, mouse):** pointing at or focusing a row puts a BrushWash over its band, turns its numeral to the accent, and cross-fades the **sidenote** (180 ms) to that story: its cover as a small cut-out (hand-drawn clip; omitted when there is none), a 4-line pull quote and its tags. The sidenote's top edge is fixed and never moves.
- **Tablet 820 / phone:** no sidenote. The quote shows inline under each title (two lines clamped), and the numerals keep the margin on tablet. The phone page gets **~2,000 px shorter** than with the card grid.

**Motion.** Each rule draws from the left as its row enters (a CSS view timeline on stroke-dashoffset, scroll-linked, so it is never left half-done). The h2 **inks in**: each character goes from weight 200 to 700 and opacity 0.15 to 1 on its own slice of the view range (`--i`). Words are never fully hidden, and since the reveal follows scroll position it is correct after an anchor jump.

**Puppet: 點點 Pip**, the hole-punch dot with only "ry" of "story" left, looking for the rest. It suits a table of contents. On desktop it sits on the sidenote's top edge and, whenever the reader's choice changes (debounced to 2 s), does a little `hop` and `look`. It also `point`s at the chosen title. Beside it, in pencil, is its handwritten line 「這是我的故事嗎？」. On tablet it hops down the margin from rule to rule (an itinerary of edge ledges at the rules' left ends). On phone it lands in the section's dinkus row. Pip is **client-only** here: the contents need no puppet to be complete.

### C · 跑字帶 Reading strip (optional — first to cut)

A full-bleed band between two static wavy rules. Inside it, one line of Ming at 32–44 px: a sentence from each of the six stories joined by ≋. It slides left **only with scroll** (`animation-timeline: view()`, about −30 %), so it never moves on its own and needs no pause control. It is `aria-hidden` because it repeats the contents. Without scroll-timeline support it is static, with fading edges.

### D · 對頁 Facing Pages — the centrepiece

**Purpose:** show how Resonance works with real data: a story, and the story that answered it.

**Copy.** Folio 「03」. h2 「一個故事，和回應它的故事」 / "A story, and the story that answered it". Dek: 「在這裡，喜歡一個故事的方式，是寫一個故事回它」 / "Here, the way to love a story is to write one back". The left page has the kicker 「故事」, its title (Ming 40), its opening (Ming 26/1.75, ≤ 90 graphemes, ending in 「……」), byline and 「讀全文」. The right page has the kicker 「回應」 and the line 「回應〈A 的標題〉」, then the same parts.

```
DESKTOP 1440 (one sheet, two pages, gutter = 1.6u)          PHONE 390 (pages stacked, the fold turns sideways)
┌────────────── page A ──────────┬gutter┬────────── page B ──────────┐   故事 〈A〉
│ 故事                            │  ╎   │ 回應 · 回應〈A〉            │   「opening……」 — 筆名 · 讀全文
│ 〈A 的標題〉                    │  ╎   │ 〈B 的標題〉                │  ～～～～～～ fold ～～～～～～
│ 「opening, Ming 26 ……」         │ ≋≋≋  │ 「opening, Ming 26 ……」     │   (牽牽)  ≋≋  (點點)  ← meet strip
│ — 筆名 · 6 分鐘 · 讀全文        │  ╎   │ — 不署名 · 3 分鐘 · 讀全文   │  ～～～～～～～～～～～～～～～
│                     (牽牽)→ ╎ ←(點點)                    │   回應 〈B〉 …
└──────────────── foot rule: the puppets' floor ──────────────────────┘
```
- **Tablet 820:** two pages of ~300 px with a 156 px gutter and 20 px quotes. Below 720 the pages stack as on the phone.
- **The gutter** is a hand-drawn vertical pen line with the three resonance waves crossing it. They draw scroll-linked (CSS dashoffset over `entry 10%–60%`).

**Puppets: 牽牽 Twine → 點點 Pip.** Twine is the gift tag whose "To:" is still blank, so carrying a note across the fold is its job. Pip, who spent the contents asking 「這是我的故事嗎？」, is the one who receives it. In the HTML both are **stills at the foot, facing each other** across the gutter with the waves between them, and that picture already tells the story. When the spread is 60 % in view, the section's stage (a meet strip, exactly `mountPalStrip`'s `{kind:'meet'}` ledges laid on the foot rule) runs `meet('note')`: they notice each other, close in to the gutter, wave, `resonate` (three pencil waves, blush), and Twine hands Pip the folded note, which Pip draws to its chest. On the stage's `act: note` event, page B's title **ripples** (the same weight wave as the h1): the answer has been received. The scene runs once per visit and then rests. Taps get each one's line.

**Data and privacy (owner's call).** No new index is needed. `latestForLanding` reads the newest **40** public cards (one query per ISR hour) instead of 9, keeps 6 for the contents, and picks the newest one with a `referenceCardId` whose original (one `get`) is public, published, listed, not trashed and not blank. Anonymous cards on either side show 「不署名」 and leave out the author, as today. A signed-out reader can already see all of this on either card's page, but it goes beyond "the six", so the owner should OK it. **If there is no pair, the section is omitted** and the page goes straight to E.

### E · 最後一頁 The blank page (replaces the terracotta CTA band)

**Copy.** Folio 「04」. Kicker 「最後一頁」 / "The last page". h2 「這一頁，等你來寫」 / "This page is waiting for you". Line: 「不必寫得很好，只要是真的——你的故事，也許正好回應了某個人」 / "It needn't be polished, only true — your story may be the answer someone was waiting for". Buttons: solid 「寫下你的故事」 → `/write`, tonal 「先讀讀大家的故事」 → `/home`. Under them, small: the badges and 「在手機上寫也可以」.

**Layout:** the same spread geometry as D, so the issue ends on a spread. **Left:** the newest story's opening (from the six) ending 「……」, with 「讀完它」. **Right:** a blank ruled page. The rules are hand-drawn at the story leading (`--story-leading`), INK_LIGHT in `--soft-pen`; the h2 sits on the first rule and the buttons on the last. On the phone the left page shrinks to a three-line excerpt above the ruled page, and the buttons go full width.

**Motion.** The rules draw in one by one as the page enters (scroll-linked). The h2 inks in like the other h2s.

**Puppet: 聆聆 Nod**, the index card that nods and writes down what it hears. It stands at the right end of the first rule with its pencil. On view it does `write` (pencil + paper props), with its line in pencil: 「嗯，我在聽」. Its pencil points at 「寫下你的故事」 (`point`, target = the button). It is a still in the HTML and comes alive on view.

### F · 本期編輯部 Colophon, then the back cover

**Copy.** h2 「本期編輯部」 / "This issue's staff". Five slots, each holding a PaperPalStill (0.6u), the name, a role and the character's line:
摺摺「封面」(cover), 點點「找稿」(story finder), 牽牽「傳信」(post), 聆聆「旁註」(margin notes), 悄悄「夜班」(night shift).
A link reads 「認識小紙團」 → `/paper-pals`. This states openly that every puppet on the page has a job, which explains the page after the fact.
**Layout:** a ruled box, 5 × 1 at desktop and tablet, 5 small columns on the phone (64 px each). The stills say hello on hover/tap (existing `data-hello-hover`), and a tap shows the line.
**Footer (封底)** stays as today: dark, wavy top edge, tagline 「用故事回應故事」, badges, trademark line, links, ©, and Hush napping by the logo at night.

## 4. Signature moments

1. **「第四個字」 The fourth character.** The masthead's first column is one character short, and a paper puppet stands in the gap as if it were the missing character. When it hops, the whole title *rings*: a wave of ink weight passes through 用故事回應故事. Resonance, the brand's name, happens to its own headline.
2. **「對頁」 The fold.** A real story faces the real story that answered it. Three waves cross the gutter, a gift tag carries a folded note across the fold to the little dot who has been looking for its story all page, and the answer's title rings. In four seconds it explains the product without a feature list.

(A third, quieter one: the last page is literally blank and ruled, with a listener holding a pencil. It is the CTA.)

## 5. Tech

- **CSS first.** Type ink-in, rule draws, gutter waves and the strip use native scroll-driven animations (`animation-timeline: view()`, `animation-range`). They sit inside `@supports (animation-timeline: view())` and `prefers-reduced-motion: no-preference`. Chrome/Edge and Safari 26 support them; Firefox gets the static page. No JS is involved, and they cannot get stuck, because progress is the scroll position.
- **Motion (motion.dev), vanilla, not React:** `animate` + `stagger` + `inView`, about 3–5 KB gzip, for the time-based beats: the weight ripple (WAAPI on `font-weight`, valid because Noto Serif TC is already a *variable* font here, one file per unicode slice, so animating weight fetches nothing new) and the sidenote cross-fade. **No GSAP.** Nothing here pins, scrubs a timeline or morphs. SplitText is unnecessary because the server splits CJK by grapheme and en by word. GSAP plus ScrollTrigger is ~40 KB for things CSS already does. It becomes worth it only if the prototype wants a scrubbed, pinned spread, which I argue against.
- **The engine, reused, re-cast.** The free-roaming LandingStage (measure.ts reading marks across the whole page) gives way to **section beats**, `lib/mascots/issue/`: one small stage per section, built like `pals/stage.ts` (ledges in section px: the cover cell spot, the sidenote edge, the margin itinerary, the meet strip on the spread's foot, the first rule of the blank page). A director (IntersectionObserver) keeps **one live section at a time** and leaves the rest as stills. Stage `onEvent` drives the type: `hop` in the cell or `note` in the spread → ripple. No new acts are needed. New code is the itinerary (Pip hopping rule to rule, tablet) and theme casting for the cell.
- **Pull quotes:** at render, `passageBlocks(story)` from `lib/markdown/sharePassages` gives the first quotable block. Its first sentence (cut at 。！？.!?, ≤ 36 graphemes CJK / ≤ 110 chars Latin) is the quote, falling back to the title. Stories already ship in the landing HTML (`LANDING_CARD_FIELDS`), so nothing new is exposed, and `storyTooComplex` stories quote nothing. Tested with fixtures.
- **Handwritten marginalia:** `--font-handwritten` (辰宇落雁體 Thin) is a multi-MB TTF from jsDelivr today. Subset it at build time to the few dozen glyphs of the puppets' lines (as `scripts/linkImage/build-fonts.py` does) and self-host it at ~15 KB, after checking its licence (OFL). If that proves annoying, use Noto Serif TC 300 in pencil grey.
- **Weight and loading:** first paint is HTML, CSS and fonts only, with the h1 as the LCP, as today. After `load` and idle (and not with Save-Data or reduced motion): Motion ~4 KB, the existing engine chunk, and the beats module ~6 KB. Still images are `loading="lazy"` except the cover cell's (`fetchpriority="low"`, in a reserved box, so no CLS).
- **Degrading:** *JS off* gives the complete magazine with stills in the cell, the spread and the colophon, and the gutter waves drawn. *Reduced motion* gives the same with no ripple, no scroll effects and no stage. *Save-Data* gives the stills (they are layout) and no engine. On a *slow phone*, one stage runs at a time, the engine's own stop-on-failing-frames still applies, and the ripple animates 7 spans. *Dark mode:* every colour is a token, and Hush takes the cell.

## 6. Risks, costs, what to cut first

- **Engineering, roughly 18 days:** grid, running head and cover with both scripts' compositions plus the ripple: 3.5 d. Contents, pull-quote extraction and sidenote: 2.5 d. Spread, pair pick and fallback: 2.5 d. Last page: 1 d. Colophon: 1 d. Section beats, director and events → type: 3 d. Scroll CSS, pause toggle and dark mode: 1.5 d. Tests (pull quote, pair privacy, marks), visual-harness slices (`landing` at phone, tablet and desktop, both locales), and zh/en QA on devices: 3 d.
- **Vertical h1 risk.** It is the boldest bet: very zh, and it splits zh and en into two compositions to maintain. Screen readers get the sr-only string; per-character spans are `aria-hidden`. At 320 px the cell shrinks to 76. At 200 % zoom the title switches to horizontal (a `@container` query on its own width).
- **Losing the card grid** means fewer images on the page. The sidenote and the spread carry covers, and `/home` keeps the grid. If the owner misses colour, the contents rows can take tiny tipped-in cover thumbnails.
- **Pair data** depends on the owner's OK and on a recent resonance existing. The section hides cleanly when it can't run.
- **Performance:** animated `font-weight` repaints glyphs (7 large ones, briefly). Scroll timelines run off the main thread where supported.
- **Maintenance:** `landing/measure.ts` and `marks.test.tsx` are rewritten as per-section ledges. Fixed geometry (cells, gutters, rules) is easier to test than measured ledges.
- **Cut first, in order:** (1) the reading strip; (2) the desktop sidenote (quotes inline everywhere); (3) the handwritten face (Ming light instead); (4) the night casting in the cell; (5) Pip's tablet itinerary; (6) the colophon's live hello (stills and a link only). **Never cut:** the cell plus ripple, the spread, the blank last page.

## 7. Prototype scope (one session)

Build a throwaway route, `/[locale]/issue` (no index, not linked), reading the same `latestForLanding` data. It must show:
1. **The zh cover at 1440, 820 and 390:** the vertical h1 in real cells, Tuck *live* in the cell (a one-spot stage like a `mountPalStrip` solo), the idle ripple, and the ripple on tap and on Tuck's hop. *This is the bet the owner judges first: does it read as "not SaaS" in five seconds on a phone, and does the puppet look like it belongs?*
2. **The contents** with real titles and server-made pull quotes, rules drawing in on scroll. The sidenote may be static (first entry, no hover sync) and Pip may be omitted.
3. **The spread** with two of the six cards *faked as a pair*, the stills at the foot, gutter waves drawing, and the `meet('note')` duet live plus the answer's ripple.
4. **The last page**, static, with Nod as a still.
5. **The en cover**, static only, to judge parity.
It may fake or skip: the pair query, the strip, the colophon (static stills), the pause toggle, the handwritten font, dark mode beyond one look at the cover.

## 8. References

- **Medieval marginal drolleries** (the Gorleston Psalter, Books of Hours): small creatures living in a book's margins, busy with the text. This is the model for puppets as marginalia.
- **Edward Tufte's sidenotes** (and tufte-css): the margin as a working column for notes beside the text.
- **The New Yorker's spot illustrations and dinkus:** small drawings dropped between paragraphs and sections. This is the phone's ≋ dinkus row.
- **Vertical (直排) magazine and book covers:** 《印刻文學生活誌》, 《幼獅文藝》, Japanese 縦書き covers (BRUTUS, 文藝春秋); and the MOE rule placing the 書名號 wave to the left of vertical text.
- **Hobonichi (ほぼ日刊イトイ新聞):** a website framed as *today's issue*, behind the running head and the date as the edition.
- **報導者 The Reporter and 端傳媒 features:** big Ming CJK headlines on the web, restraint and white space.
- **Variable-font weight motion** (Fraunces / Recursive demos) and **scroll-driven animations** (Bramus's scroll-driven-animations.style), for the ink-in and the ripple.
- **Picture-book spot illustration** (Quentin Blake for Roald Dahl): the figure as part of the page's typography, not a sticker on it.
- From the owner's galleries: patterns, not single entries. The editorial and typographic heroes on godly.website and land-book, and scrolltide's scroll-linked text, are why the strip and the ink-in are scroll-linked rather than time-based.
