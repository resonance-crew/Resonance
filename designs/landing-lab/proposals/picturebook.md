# 在書縫相遇 · Meet at the Fold

> The landing page becomes a five-spread picture book: a shy sheet writes a story, a lost dot finds itself in it and answers with a card of its own, and the two meet at the book's fold. The visitor's scroll turns the pages, the 小紙團 are the cast, and the last page is left blank for you.

---

## 1. The idea in one paragraph

Resonance's mechanic (write → someone reads → they answer with a card, not a like → the two cards are linked → two people meet) is a *story*, and the brand already owns the cast to tell it and an engine that can perform its climax (`duet`: notice, wave, three pencil waves, blush, a folded note). So the page stops describing the product in sentences and *performs* it as a short picture book. The layout is built around one device borrowed from picture books, Suzy Lee's *Wave* and *Mirror* most of all: **the gutter**. Each spread has a drawn fold down the middle. 摺摺 lives on the left page and 點點 on the right. The fold is the distance between two strangers. On page 4 a thread crosses it, and on page 5 the two walk in from their own pages and meet *on* the fold. The puppets are the reason the page has a fold, two sides and room on the floor. They are not decoration placed on top of it.

## 2. Diagnosis: why today's page reads as a template

- **The fold is a centred stack with nothing on it.** Pill → giant centred headline → grey two-line subtitle → badges → four-avatar social proof → a blob in each corner. About 40% of the 1440×900 fold is empty cream, and nothing on it shows a card, a story or the one thing that makes Resonance different. This is the default hero of every SaaS starter.
- **The feed is a features grid.** It has a centred "tag + h2 + subtitle" header, an even 3×2 grid, tops aligned, and a "瀏覽所有故事" pill. In the screenshot four of the six cards show a grey placeholder where a cover would be, so the grid looks like a wireframe. On a phone it is six full-width cards stacked, about 7,000 px or 60% of the whole page.
- **CTA band + dark footer is the stock ending.** The terracotta band's copy (分享你的故事，讓世界聽見你的聲音) would fit any blogging app, and the dark footer is dark for no reason the page explains.
- **The puppets are tourists, not cast.** 點點 and 悄悄 perch on the headline's two ends and crowd the pill. On the phone, 摺摺 squeezes against 讓 with its feet on the headline's ascenders. They visit *ledges measured from a layout that never planned for them*: no room is reserved and they have nothing to do there. That is why they look bolted on: they act beside the content rather than acting it out.
- **The brand's best material never reaches the page.** Answering instead of liking, the three resonance waves, the folded note and two cards linked all live in the app and in the engine's `duet`. The landing compresses them into one abstract sentence.
- **The rhythm is flat.** Every section is centred, has the same max-width and gets the same padding. The wavy edges separate sections but don't sequence anything.

## 3. The page, top to bottom

Order: **Cover** (hero) → **The book**, five spreads on sticky sheets → **The shelf** (6 real cards) → **The last page** (blank: write) → **Back cover** (night footer, 悄悄). Header: `SiteHeader` as today, sliding away on scroll-down while inside the book and coming back on any scroll-up, like the apps' tab bar.

### 3.1 Cover (the hero)

**Purpose.** Pass the 5-second test on its own: title, one sentence that states the mechanic, one picture that shows it, a way to get the app.
**Copy.**
- h1 (vertical in zh): **用故事回應故事**, with 回應 in the accent and the pen-wave drawn *beside* it (vertical-rl: `text-underline-position: right`, the same squiggle path rotated). en: horizontal, "**Answer** stories with stories".
- Subtitle: 「讀到打動你的故事，不必按讚，寫一張自己的卡片回應它——兩個故事就連在一起了」 / "When a story moves you, don't like it — answer it with a card of your own, and the two stories are linked"
- Badges + QR (`GetTheApp`, unchanged), a tonal fill button 「開始讀故事」 → /home, and a quiet 「往下翻 ↓」 → #book.
- The ✦ pill goes. A pill above a headline is one of the template's tells.

**Picture.** The whole tale in one cover plate, as a picture book's cover is. Two small hand-drawn cards, A 〈那年夏天沒說出口的話〉 and B 〈我也有一個沒說完的夏天〉, joined by a sagging pen thread with the three resonance waves riding it. 摺摺 stands at card A and 點點 peeks over card B. The plate is `aria-hidden`; the subtitle carries the meaning.

```
DESKTOP 1440×900                                          PHONE 390 (zh)
┌──────────────────────────────────────────────────┐      ┌────────────────────┐
│ ≋ Resonance                       繁體中文 [登入] │      │≋ Resonance    ◎  ≡ │
│                                                  │      │               用   │
│   ┌────────┐   ~≋~≋~   ┌────────┐         用     │      │ ┌──────┐摺摺   故   │
│   │那年夏天│╲_________╱│我也有一│         故     │      │ │那年夏│       事   │
│   │ ～～～ │   (waves) │個沒說完│         事     │      │ └──────┘╲      回┃  │
│   └────────┘           └────────┘         回┃    │      │  ≋≋≋     ╲     應┃  │
│    摺摺 ↑                 ↑ 點點 peeks     應┃    │      │       ┌──────┐ 故   │
│                                           故     │      │  點點 │我也有│ 事   │
│  讀到打動你的故事，不必按讚，寫一張自己    事     │      │       └──────┘     │
│  的卡片回應它——兩個故事就連在一起了               │      │讀到打動你的故事，不│
│  [App Store][Google Play] [QR]  (開始讀故事)      │      │必按讚，寫一張自己…  │
│                    往下翻 ↓                      │      │[App Store][G Play] │
└──────────────────────────────────────────────────┘      │(開始讀故事) 往下翻↓ │
TABLET 820: as the phone, picture 1.4:1, title column     └────────────────────┘
at the right edge, unit 100.   en (all widths): two-line horizontal title above the plate, left-aligned.
```

**Motion.** On idle after load: 摺摺 `reveal` (lifts its corner: the hidden lines) then `wave`. 點點 does a `hop` and points at card A. The waves on the thread pulse three times (0.6 s each) and rest. After that the cover is still except for blinks, which stop after 20 s.
**Server vs client.** Server: everything, including the cards, the thread and waves as inline SVG in their final state, and the two puppets as `PaperPalStill` (eager, `fetchpriority="low"`). The h1 text stays the LCP. Client: one stage over the plate in the plate's own px, as `mountPalStrip` does, plus the waves' pulse.

### 3.2 The book: the shared frame

**Sheets that turn by scrolling, with no scroll-jacking.** Each spread is a `position: sticky` sheet, `height: 100svh`, with a hold spacer after it. The next sheet scrolls up *over* it, its top edge a torn `SectionEdge` wave, so every page turn is a new sheet of paper laid on the last. The slide-over is plain native scrolling, pure CSS, works with JS off, and on a phone is identical to scrolling.

```css
.book  { position: relative }
.sheet { position: sticky; top: 0; height: 100svh }   /* each a <section>, later ones stack on top */
.hold  { height: 40svh }                              /* 30svh on phones: the time a page holds */
```

**Each sheet is a spread with a fold.** The fold is one vertical wavy pen line (`INK_LIGHT`, `--soft-pen`) beside a 20 px strip of the paper's one-step-darker tone. It is a crease, never a shadow. 摺摺 belongs to the left page and 點點 to the right. Text sits on the page *opposite* the action, bottom-aligned, in the story type (Ming 34–40 px desktop, 22 px phone), with a hand-drawn page number in the outer corner. **Each sheet's paper is its lead's band** (`--band-tuck`, `--band-dot`, `--band-tag` from the Paper Pals page, with dark variants already there), so the book changes colour as it goes, like a picture book's palette.

```
DESKTOP spread 1440×900               TABLET 820×1180 (portrait)       PHONE 390×~780svh
┌───────────────────┃────────────────┐ ┌─────────────┃─────────────┐  ┌───────────┃──────────┐
│                   ┃                │ │   picture   ┃   picture   │  │  picture  ┃ picture  │
│  picture (left)   ┃     picture    │ │   (left)    ┃   (right)   │  │  (left)   ┃ (right)  │
│  摺摺 lives here  ┃  點點 lives here│ │             ┃             │  │ 摺摺 80px ┃ 點點     │
│                   ┃                │ │─────────────┸─────────────│  │───────────┸──────────│
│                   ┃  text on the   │ │ 2 lines of text, 26px     │  │ 2–3 lines, 22px Ming │
│ 1            [↻] ┃  opposite page │ │ 1                    [↻] │  │ 1                [↻] │
└───────────────────┃────────────────┘ └───────────────────────────┘  └──────────────────────┘
 unit 120                               unit 100; picture 1.3:1        unit 80; picture ~1.15:1
```

Phones keep the fold. The picture is a miniature spread (195 px a side, cards about 150 px wide, puppets 80 px) and the text drops below it onto the page. Landscape tablets (≥ 1024) use the desktop spread.

**Scroll vs. time: the rule that keeps this humane.** *The scroll turns the page; the puppets keep their own time.* Stop-motion at 12 fps never scrubs: a puppet dragged backwards by a trackpad looks broken. What scroll *does* scrub is the paper: a thread drawing, lines writing themselves onto a card, a heart unfolding into a card, always during the last 40% of a sheet's slide-over. The puppets' scene starts once the sheet is stuck (+150 ms) and lasts 5–8 s. **Every page ends on its printed picture.** The scene settles exactly into the still pose the server drew, as `DriftingBlobs` returns to where it began. A fast scroller who never sees a scene still sees the full picture, and scrolling back up to a page shows the picture, not a replay.

**Controls.** Each sheet has one 44 px control by the page number: ⏸ 暫停 while the scene plays, ↻ 再看一次 afterwards. That covers WCAG 2.2.2 and makes replays a choice. A skip link 「跳過繪本，直接看故事」 sits before the book (→ #shelf) and is visible on focus and in the cover's 往下翻 row. A covered sheet gets `inert`, so focus never lands under another page.

### 3.3 The five spreads

| # · paper | Lead | Text (zh-TW; en follows the same lines) | Picture's final state (the server's still) | Scrubbed by the slide-over | Scene (time, once stuck) |
|---|---|---|---|---|---|
| **1 寫** · sage | 摺摺 | 「摺摺的右上角一直折著，底下藏著幾行字」 / 「有一天，它把那幾行字，寫進了一張卡片」 | Left page: card A on the floor, its title written; 摺摺 beside it, corner lifted. Text on the right page. | Card A's three pen lines write themselves left to right (`pathLength` dash) | `pop` beside the card → `reveal` (1.2 s: the hidden lines) → `write` (2.5 s, the slip) → `look` at the card → settle. ~5 s |
| **2 讀** · yellow | 點點 | 「點點身上只剩 story 的 ry，它到處跳，想找回其餘的故事」 / 「在摺摺的卡片前，它停了下來：這是我的故事嗎？」 | Right page: four small cards in a loose row; 點點 peeking over card A, which has crossed the fold to its page. Text on the left. | Cards drift into their row (≤ 24 px, transform only) | `hop` across two card tops (edge ledges) → `peek` over card A → `read` (2 s) → mouth-o → settle. ~5 s |
| **3 回應** · yellow → terracotta-light at the end | 點點 | 「在這裡，被一個故事打動，不是按一顆愛心」 / 「點點寫了一張自己的卡片，回應摺摺」 | Right page: card B, titled, beside 點點 holding its pencil; no heart left. | **The heart becomes a card**: a hand-drawn ♥ (the like everyone expects) unfolds into card B's wobbly outline (MorphSVG, ~0.4 of the slide) | `look` at the heart → `write` (2.5 s) while card B's lines write in → `hop` → settle. ~6 s |
| **4 連起來** · sky | 牽牽 | 「兩張卡片，就這樣連在一起」 / 「摺摺收到一聲輕輕的通知：有人用故事回應了你」 | Card A on the left page, card B on the right, a pen thread sagging *across the fold*, three waves on it; 牽牽 at the thread's low point; a small notification sheet over card A: 「點點 用一張卡片回應了〈那年夏天沒說出口的話〉」 | **The thread draws across the fold** (DrawSVG, A → B) | 牽牽 walks the thread as a `line` ledge (a tightrope over the fold, 2.5 s) → `reveal` (turns to its blank 「給：」 side) → the waves pulse ×3 → the notification `PaperSheet` drops in (300 ms) → settle. ~6 s |
| **5 相遇** · cream; full double-page spread, text at the bottom across both pages | 摺摺 + 點點 | 「不一樣的紙，也能共振」 (the Paper Pals' own line) / 「他們從一張小紙條開始，慢慢聊」 | Both standing *on the fold*, facing each other, blushing; the folded note between them; the three waves above. The fold's pen line stops under their feet. | The fold's crease fades from both ends toward the middle, so the pages become one | The engine's existing `duet`, mode `'pair'`, variant `'note'`: walk in from the two pages (2.5 s) → notice → close in → wave → **resonate** (three pencil waves, blush) → 點點 hands 摺摺 the folded note → hold. ~8 s |

Notes:
- **Why these leads.** 摺摺 hides lines under its corner and only lifts it once it trusts you, which is what publishing a story feels like. 點點 is literally missing the rest of its story ("ry"), which is what reading someone's story and finding your own in it feels like. 牽牽's name means *to join*, and its 「給：」 is still blank because it is looking for that someone, so it is the one who walks the link. Each character's personality *is* its page's beat, taken from `pals.*`, with no new characters or redraws.
- **The tale is fiction and says so.** The book's hidden h2 is 「一個小故事：在書縫相遇」, and the card titles belong to the puppets, never to users.
- **Puppet sizes:** 120 / 100 / 80 as today. On phones page 4's thread is shallower and 牽牽 walks it only if the slope is under about 20°; otherwise it stands at the low point (one `if` in the scene).
- **Server HTML** per sheet: the text as `<p>`s inside an `<article>` per page in an `<ol>`; the plate's cards (`HandDrawnBorder` + real text), props in their final state (inline SVG) and the lead's `PaperPalStill` (`loading="lazy"`). **Client:** one stage per sheet in the sheet's own px (the `mountPalStrip` pattern: a sticky sheet doesn't move while it plays), started when stuck, paused at 30% covered and destroyed at 100%. Only one sheet's stage lives at a time.

### 3.4 The shelf (real stories): 「下一頁，是真的人寫的」

**Purpose.** The bridge from fiction to the product: the tale was puppets, and the next pages are real people. It also gets read stories (/home) in front of the visitor.
**Copy.** h2 「下一頁，是真的人寫的」, sub 「真實的人、真實的經歷，每個聲音都承載著一個世界」, link 「瀏覽所有故事 →」. en: "The next pages are written by real people"
**Layout: a bookshelf, not a grid.** Cards stand *bottom-aligned on a drawn shelf line* (one `wavyLine` pen stroke that runs to both edges of the viewport). Their heights differ (with or without a cover) the way books on a shelf do. The template's top-aligned rows go, and the shelf line is a lane the puppets walk on, designed for them. The 6 latest cards are reused as they are (`latestForLanding`, `StoryCard`, no new data or privacy surface). A card with no cover has its empty cover box removed: the grey placeholder is what made today's grid look like a wireframe.

```
DESKTOP: two shelves of 3                      PHONE: one shelf, native horizontal swipe
 ┌──┐      ┌────┐                               ┌──────────┐┌───
 │  │ ┌──┐ │    │                               │  card 1  ││ ca…   78vw cards, scroll-snap
 │  │ │  │ │    │   點點 hops along             │          ││       (no JS), shelf line under
═╧══╧═╧══╧═╧════╧═══════════════════            ═╧══════════╧╧═══    the whole row; 7th tile
 ┌────┐ ┌──┐  ┌──┐                    悄悄 naps                      = 「瀏覽所有故事 →」
═╧════╧═╧══╧══╧══╧══════════════════z z          TABLET: two shelves of 3, narrower
```

**Puppets.** 點點 is still searching («這是我的故事嗎？»): it walks onto the top shelf from the view's side and peeks past or over real cards. These are the landing engine's existing `peek`/`edge` ledges, now on a layout made for them. 悄悄 naps at the bottom shelf's end and wakes into the back cover. The phone shelf removes about 6,000 px of stacked cards from the page. **Server:** all cards and links. **Client:** the existing landing stage on this section only (`data-mascot-zone="feed"` marks, shelf line as a `line` ledge).

### 3.5 The last page: 「最後一頁，留給你」 (write)

**Purpose.** The write CTA as the book's ending: the last page is blank. Picture books have a dedication and endpapers; this page has both.
**Copy.** h2 「最後一頁，留給你」, sub 「每一個故事都有意義——你的故事，也許正是改變某個人那天的那一個」, buttons **寫下你的故事** (solid → /write) · **先讀讀大家的故事** (tonal → /home), and under them the team avatars with 「成為一群最早說故事的人」 (`StorytellerProof`, as the dedication line). en: "The last page is yours"
**Picture.** A blank card with faint ruled lines. Beside it stands `BlankPal`, the sixth puppet on blank paper from /paper-pals, which has brads, mittens and a pencil face but no colour or story, because *it is the visitor*. 聆聆 comes and stands by it with its pencil: it is the listener, 「嗯，我在聽」, which appears as its spoken line on a tap (`placeSaid`).

```
DESKTOP: cream sheet, no fold (the book is over)      PHONE: picture top, text + buttons below
┌────────────────────────────────────────────┐      ┌──────────────────────┐
│   ┌──────────┐                              │      │  ┌───────┐  ○   聆聆  │
│   │ ________ │   ○      聆聆                 │      │  │ _____ │ BlankPal  │
│   │ ________ │ BlankPal  ✎                   │      │  └───────┘           │
│   └──────────┘                              │      │ 最後一頁，留給你       │
│        最後一頁，留給你                       │      │ 每一個故事都有意義…    │
│  [寫下你的故事] (先讀讀大家的故事)              │      │ [  寫下你的故事   ]   │
│  ●●●● 成為一群最早說故事的人                  │      │ (先讀讀大家的故事)    │
└────────────────────────────────────────────┘      └──────────────────────┘
```

**Motion.** 聆聆 walks in, nods (`deco`), `point`s at the blank card (target = card) and settles. BlankPal never moves. It is a still, inline, not in the cast. Terracotta appears only in the solid button: the old full terracotta band retires so the ending reads as a quiet page rather than a banner.

### 3.6 Back cover: the night footer (悄悄)

**Purpose.** It gives the dark footer a reason to be dark: the book is closed and it is bedtime. **Copy.** The footer as today (tagline 用故事回應故事, badges, trademark line, links, ©, no full stops anywhere) plus one line above the tagline: 「晚安……再說一個就好 →」 → /home ("Goodnight… just one more story"), which is 悄悄's own line and a second door to reading.
**Picture.** The footer's paper takes the Paper Pals night (`--band-night`, colour-fixed in both schemes) with about 40 pinprick stars (1–2 px dots, server SVG). 悄悄 sits on the footer's top wave. **Motion.** 悄悄 `twinkle`s and then `nap`s (z's). Stars twinkle by CSS, 3 at a time and staggered, stopping after 20 s. Reduced motion shows static stars and a still.

## 4. The signature moments

1. **They meet on the fold.** The fold divides every spread, and the visitor feels it as the space between two pages and two people. On page 4 a thread crosses it and a paper tag tightropes over it. On page 5 摺摺 and 點點 walk in from their own pages and meet *on the crease*: three pencil waves, a blush, a folded note. The crease fades and the two pages become one. People will describe it as *"the two little paper guys meet in the middle of the book"*, and in doing so they will have described the product.
2. **The heart becomes a card.** As page 3 slides in, the ♥ that every other platform asks you to tap unfolds under your scroll into a blank card, and 點點 starts writing on it. "Don't like it, answer it" is said without a word.

## 5. Tech

| Need | Tool | Why |
|---|---|---|
| Page turns (pin + slide-over) | **CSS `position: sticky`** stacked sheets | No library, no scroll-jacking, native momentum on phones, works with JS off |
| Scrubbed paper (lines writing, thread, heart→card) and scene cues | **GSAP 3 core + ScrollTrigger + DrawSVGPlugin + MorphSVGPlugin** | MorphSVG handles heart→wobbly-rect with different point counts, which nothing light does. ScrollTrigger re-measures after the CJK webfont swap and on resize. `gsap.matchMedia()` gives each breakpoint and `prefers-reduced-motion` its own setup and reverts it cleanly. No ScrollSmoother, no snap. |
| The puppets | **The existing engine**, one stage per sheet (`mountPalStrip` pattern) | Its duets, props and stills already exist. Two additions are needed (below). |
| Fallback scrubs | CSS `animation-timeline: view()` for the outgoing sheet's slight dim, where supported | Pure enhancement; nothing depends on it |

Motion (motion.dev) would cover `inView` and simple scrubs at about 15 KB, but it has no morph and we'd end up shipping two libraries. Use **one library: GSAP**.

**Engine additions** (the real cost):
- A *directed scene*: `stage.play(script)` with cues (`enter {slug, ledge, how}`, `acts`, `duet {a, b, variant}`, `hold`).
- A *hold* mode: stay and idle (breathe, blink) instead of leaving after `visit`.
- *Settle to still*: end on exactly the pose `stillOf` draws, so the hand-off back to the server still is invisible.
- A few new still poses in `pals/still.ts`: facing left/right (mirrored), holding the note, blush.

**Weight and loading.** GSAP + the three plugins is about 47 KB gz, plus the book's glue at about 6 KB. Both are dynamically imported on `requestIdleCallback` *and* only when the book is within one viewport of the fold (IntersectionObserver, `rootMargin: 100%`). Nothing loads before first paint. The engine chunk and cast parts are today's (already lazy). Stills in the HTML are small WebP parts: the cover's two load eagerly at low priority, the rest lazily.

**Degradation.**
- **JS off:** the sticky slide-over still works (CSS), every page shows its finished still and finished props, and all text, cards, badges and links are present.
- **`prefers-reduced-motion`:** the *printed book*. Sheets fall back to normal flow (no stacking), stills only, no scrubs, no stage, no star twinkle.
- **Save-Data:** no GSAP, no stages; stills still load lazily, since they are the book's pictures.
- **Slow phone:** one live stage at a time, at 12 fps; scrubs touch only `transform`, `opacity` and `stroke-dashoffset`; grain is static; ScrollTrigger `fastScrollEnd`.
- **Unsupported `svh`:** `vh` fallback.

## 6. Risks and costs

**Engineering: about 15–18 days.**

| Work | Days |
|---|---|
| Cover with vertical zh title | 2 |
| Book frame: sheets, folds, text placement, controls, `inert`, skip link, header behaviour | 3 |
| Five plates, stills and props in server HTML | 3 |
| Engine directed-scene, hold and settle-to-still | 3–4 |
| Choreography and GSAP scrubs | 2–3 |
| Shelf | 1.5 |
| Last page and night footer | 1.5 |
| Mark tests, visual-harness screens (`landing` × phone/tablet/desktop, dark), a11y pass | 2 |

- **Length.** The book adds about 6 screens of scroll. This is the main risk. Mitigations: the cover alone passes the 5-second test; holds are short (40 / 30svh); the skip link sits on the cover row; and stacking sheets *feel* faster than long sections because there is always something arriving. Measure the share of visitors who reach the shelf; if it falls below about 50%, cut pages.
- **Scenes missed by fast scrollers** is accepted by design: every page's still tells the beat.
- **a11y.** The book is an `<ol>` of `<article>` pages with real `<p>` text. Plates are `aria-hidden`. Covered sheets are `inert`. Pause and replay controls are per page. Only one h1 (the cover). Focus order matches reading order. Risk: sticky stacking with keyboard focus. Test with VoiceOver, TalkBack and keyboard-only.
- **i18n.** The vertical title is zh only, while en is horizontal (a `:lang()` branch in CSS, not two components). en page text runs about 1.4× longer, so allow 3 lines on phones. The in-plate card titles are translated too.
- **Perf.** The LCP stays the h1 text. Stills add image requests below the fold, but all are lazy. Watch INP on low-end Android during the sheet transitions.
- **Maintenance.** Scenes are tied to plate geometry. Keep each plate's ledges as `data-mascot` marks so `marks.test.tsx`-style tests catch a renamed or removed mark. Copy lives in `src/messages` (`book.*`), so the apps are unaffected.

**Cut first, in this order:**
1. MorphSVG heart (crossfade heart → card instead; saves about 8 KB).
2. 牽牽's tightrope (it stands at the thread instead).
3. Merge pages 3 + 4 into four pages.
4. The vertical title (horizontal everywhere).
5. The phone shelf carousel (keep a two-column grid).

**Never cut:** page 5 at the fold and the blank last page. Those two are the direction.

## 7. Prototype scope (one focused session)

Build on a branch, at a dev-only, `noindex`, unlinked route (e.g. `/[locale]/lab/book`), zh-TW, light mode, at 1440 and 390.

**It must show:**
1. The **cover**: vertical 用故事回應故事, the two-card plate with stills, subtitle, badges.
2. **Five sticky sheets** sliding over each other, each with its band paper, fold, page number and final still.
3. **Page 5 live**: the real engine `duet` with variant `'note'` between 摺摺 and 點點, meeting on the fold. Use today's meet strip with its cast limited to those two; the directed-scene API can wait.
4. **Page 4's thread** drawing across the fold, scrubbed by scroll (DrawSVG).
5. **Page 3's heart → card** morph, scrubbed.
6. **The shelf**, bottom-aligned on its line (desktop) and as a swipe row (phone).
7. **The blank last page** with `BlankPal`.
8. **The night footer.**

**It may fake:**
- Pages 1–3 puppets as stills with a CSS bob.
- 牽牽 standing instead of walking the thread.
- The notification as static.
- No pause controls, no `inert`, no en, no dark mode, no tests.
- Settle-to-still faked by a crossfade.

**What the owner judges:** does scrolling feel like turning pages on a phone, and does the meeting on the fold land?

## 8. References

- **Suzy Lee, *Wave* / *Mirror* / *Shadow*** (the "Border Trilogy"): the book's gutter as the boundary characters cross. The core device here.
- **Oliver Jeffers, *Lost and Found*:** two lonely characters, one journey, few words per spread; and the picture-book convention of the climax as a double-page spread.
- **Scrollytelling with a sticky graphic and text steps** (The Pudding, NYT; the scrollama pattern), with steps that are just native scrolling.
- **The "stacking cards" sticky-section pattern** common on godly.website / land-book picks: here the cards are sheets with torn wavy tops.
- **Apple product pages:** scrub only objects, never characters.
- **GSAP showcase:** DrawSVG / MorphSVG demos for scrubbed line work.
- **Kamishibai (紙芝居)**, 悄悄's paper theatre: a picture changed for each beat by the storyteller's hand, here the reader's scroll.
- **Duolingo / Headspace marketing pages:** a mascot that *performs the product's action* rather than decorating it.
