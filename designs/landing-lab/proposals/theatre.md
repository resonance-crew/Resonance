# 紙劇場 · Paper Theatre

**Pitch:** The landing page becomes a cut-paper toy theatre that plays one day as you scroll, from morning to goodnight. The 小紙團 come on from its wings, act out how a story is answered with a story, and take a bow under Hush's night sky.

## 1. Diagnosis: why it reads as a SaaS template

- **It is the stock sequence.** Centred hero stack (pill → headline → subtitle → badges → avatar row) → centred title over a 3×2 grid → "view all" → full-bleed CTA band with two buttons → dark footer. Every band is "a centred title over a block", and none has a reason to be where it is.
- **About 70 % of the 1440 fold is empty cream.** The two blobs float at the far edges, unrelated to anything. On the phone the bottom quarter of the fold is blank, and the big peach blob sits behind the pill doing nothing.
- **What makes us different is never shown.** "You answer a story with a story, there are no likes" is only *said*, in a subtitle. Four of the six feed cards show grey empty cover boxes, so the one block of real content looks like a template with its images missing.
- **The puppets have no ground.** In the desktop fold Pip sits on the corner of 「讓」 and Hush stands on 「響生」. On the phone, Tuck and Twine flank the pill over the blob. Their places were measured from text boxes never meant as places. There is no floor, no wings and nowhere to come from, so they appear and vanish like stickers.
- **Everything is on one plane.** Blobs, words, badges and puppets sit at one depth. A 120 px puppet beside an 84 px headline competes with it, because nothing gives it a "behind" or an "in front".
- **The page has no time.** Cream → cream-dark → terracotta → near-black is a sunset by accident, but nothing tells it as one. SaaS habits fill the gap: the four-initials proof row, an italic tagline repeated in the footer.

## 2. The idea in one rule

Every scene is a **stage**: its content, then a **puppet lane** (one character tall: 120 / 100 / 80 px), then a **floor** (the wavy pen line at the scene's foot).

- Puppets stand only on floors and on the tops of set pieces (the kamishibai frame, a card, a hill), **never on words**.
- Each wavy edge is a **scene change**: three paper flats slide past each other as you scroll.
- The sky moves through one day: 晨 hero → 午 stories → 黃昏 the answer → 夕陽 CTA → 夜 curtain call and footer.
- Scroll is the stage manager. It **calls cues** (enter, act, leave) and never scrubs a puppet, because they are 12 fps step-motion that plays in time. Only the paper planes are scrubbed.
- The set is the 30 % organic. What sits in it stays the 70 % functional: the usual components, fills as buttons, no shadows. Depth comes only from overlap, a pen line on every cut edge, grain and parallax.

## 3. The page, scene by scene

### Scene 0 · 開場 Opening (morning, the hero, `min-height: min(100svh, 920px)`)

**Purpose:** in 5 seconds, "a little theatre of real stories", and how to get it.

**Copy:**
- h1 用故事**回應**故事, with the pen wave under 回應. Two lines (用故事 / 回應故事) on the phone; en "**Answer** stories / with stories" on two lines everywhere.
- Around it: ✦ 真實的人生故事 · the subtitle as today (no full stop) · store badges with a QR **ticket stub** (用手機掃描下載) · 先讀讀大家的故事 → · 中場休息 (the pause control)

**Set:**
- A `wobRect` proscenium at INK: cream-dark grained pillars, and a scalloped terracotta-light **valance** (`SectionEdge` turned over). Desktop adds two tied-back cut-paper drapes.
- Inside, back to front: the cream sky with two `DriftingBlobs` *clouds* that drift and settle (the owner's "one or two"), a yellow cut-paper **sun**, lavender far hills, sage near hills, the floor.
- Beyond 1440 the frame stays 1440 and a cream-dark "house wall" fills the rest, so wide screens see one deliberate object.

```
1440  ≋ Resonance                                               ⊕ 繁體中文 (登入)
     ╭─┬︶︶︶︶︶︶︶︶︶︶︶︶︶︶︶︶ valance ︶︶︶︶︶︶︶︶︶︶︶︶︶︶︶︶︶┬─╮
     │▓│)        ☁ (drifting cloud)   ✦ 真實的人生故事          ◖ sun   (│▓│
     │▓│)drape           用 故 事 回 應 故 事   (h1 ≈ 112px)       drape(│▓│
     │▓│         一個讓世界各地的人生故事相互連結的空間——在這裡…          │▓│
     │▓│ ︵︵︵︵︵︵︵︵︵︵ far hills ︵︵︵︵︵︵︵︵︵︵︵︵︵︵︵︵︵︵︵︵︵︵︵︵︵︵︵︵    │▓│
     │▓│◀摺摺 ︵︵︵ near hills ︵︵︵       點點          ︵︵︵︵︵︵︵︵︵      │▓│ ← puppet lane
     ╰─┴≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈ floor (a line ledge) ≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈┴─╯
apron    [ App Store ] [ Google Play ]  ┊▦ QR ticket┊   先讀讀大家的故事 →      ⏸ 中場休息
```

```
820 (touch: no QR)                    390
╭┬︶︶︶︶︶︶︶︶︶︶︶︶︶︶︶┬╮                 ╭︶︶︶︶︶︶︶︶︶︶︶︶╮  pillars = the 16px gutters
│▓ ✦ 真實的人生故事    ◖ ▓│                 │ ✦ 真實的人生故事  ◖ │
│▓   用故事回應故事 (76) ▓│                 │ 用故事              │
│▓ 一個讓世界各地的…     ▓│                 │ 回應故事   (h1 64)  │
│▓ ︵︵︵︵ hills ︵︵︵︵︵  ▓│                 │ 一個讓世界各地的…   │
│▓◀摺摺         點點     ▓│                 │◀摺摺  ︵︵︵   點點 │  lane 88
╰┴≈≈≈≈≈≈≈ floor ≈≈≈≈≈≈≈┴╯                 ╰≈≈≈≈≈≈ floor ≈≈≈≈≈≈≈╯
 [App Store][Google Play]                  [App Store][Google Play]
 先讀讀大家的故事 →       ⏸                 先讀讀大家的故事 →    ⏸
```

**Motion:**
- **Load:** the drapes sway once (CSS, 2.4 s). Nothing covers the h1, which stays the LCP.
- **Idle:** at +0.8 s 摺摺 walks out from behind the left pillar (a **wing entrance**) and waves first, as it always does; at +2.5 s 點點 pops up from the floor like a pop-up-book figure and hops. Then scene-local idle visits of 12–18 s: Nod or Twine may drop by, Hush never by day. In the dark scheme the cast is 悄悄 and 摺摺, and the sun is a moon.
- **Fine pointer only:** the planes shift ±4 / 8 / 12 px with the pointer (tunnel-book depth). **Scroll:** the planes sink at 0 / 0.12 / 0.25 of the scroll, and the sun sets about 40 px (CSS `view()` timeline).

**Server HTML:** the whole set as inline SVG, every word, the badges, and 摺摺 and 點點 as stills on the floor. **Client:** the stills come alive, plus parallax and the pause control.

### Scene 1 · 上演中 Now showing (noon; the stories as a 紙芝居 kamishibai)

**Purpose:** read one real, recent story at a size that can move you.

**Copy:** h2 值得閱讀的故事; its subtitle as today; ‹ 上一張 / 下一張 ›; 瀏覽所有故事 →

**Layout:**
- A pen-drawn **butai** (the kamishibai's frame, terracotta pen at INK_STRONG) holds the newest card at stage size: a `StoryCard` "stage" variant with a wide cover and a six-line excerpt.
- The other five wait as a fanned **stack** behind its right edge, their coloured edges showing. On desktop the top edge names the next card (下一張：換我坐駕駛).
- A card without a cover gets a cut-paper landscape seeded by its id, never a grey box.

```
1440  ︵︵︵ scene change: three flats ︵︵︵
      值得閱讀的故事                                         聆聆 sits on the frame, reading
      真實的人、真實的經歷——每個聲音都承載著一個世界                ▁▁▁
             ╔═══════════════ butai (pen frame) ══════════════════╗▌▌▌▌▌ ← stack, 5 edges
             ║ ┌──────────┐  結巴影響我的事                        ║▌▌▌▌▌   下一張：換我…
             ║ │  cover   │  國小四年級的時候……(6 lines)          ║▌▌▌▌▌
             ║ └──────────┘  ◯ Starry · 4 分鐘          讀這個故事 →║▌▌▌▌▌  點點 peeks past it
             ╚══════════════════════════════════════════════════════╝
                         ‹ 上一張   ● ○ ○ ○ ○ ○   下一張 ›                瀏覽所有故事 →
≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈ floor ≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈
```

```
820: the frame 640 wide and centred,         390      值得閱讀的故事
the title centred above it, the stack                   真實的人、真實的經歷——…
3 edges deep, 點點 peeking past the               聆聆 ▁▁
stack's side                                    ╔══════════════════╗▌▌
                                                ║ [cover, full]    ║▌▌  swipe = scroll-snap
                                                ║ 結巴影響我的事    ║     (the leaving card
                                                ║ 國小四年級的時候… ║      tilts −2°)
                                                ╚══════════════════╝
                                                  ‹  ● ○ ○ ○ ○ ○  ›    點點 peeks over the corner
                                                  瀏覽所有故事 →
```

**Interaction:**
- The frame holds a **scroll-snap row of all six real card links**. That is also the no-JS version: all six are readable and reachable by keyboard.
- **下一張** (or a swipe) is the *kamishibai pull*: the front card slides out to the left (−108 %, −2°, 480 ms ease-in), uncovering the next, and tucks back in as the stack's last edge (320 ms).
- On touch the swipe is native snap with a scroll-linked tilt (no custom gesture). A live region says 第 2 張，共 6 張. Nothing advances on its own.

**Puppets:**
- 聆聆 Nod (the listener) **reads** on the frame's top, an edge ledge with the frame as its cover.
- 點點 Pip (「這是我的故事嗎？」, hunting for the rest of its story) peeks past the stack and hops on each pull. On the phone it peeks over the frame's top-right corner.

**Server HTML:** all six cards and the frame. **Client:** the pull, the dots and the puppets.

### Scene 2 · 回應 The answer (late afternoon, gold; the mechanic as a three-beat play)

**Purpose:** make "no likes; you answer with your own story" *seen*. Today's page never shows it.

**Copy:** h2 **這裡沒有讚，只有回應** (en "No likes here, only answers"), then the beats:

| | Beat | Sub-line |
|---|---|---|
| ① | 讀一個故事 | 有人把自己的一段人生寫成了一張卡片 |
| ② | 被觸動了，就寫下你的 | 回應一個故事，用的是你自己的故事 |
| ③ | 兩張卡片，從此相連 | 公開署名的回應會讓作者知道是你，你們就能開始聊聊 |
| ④ *(optional)* | 或者，留一張小紙條 | 只有作者看得到的幾句話 |

**The cards are illustrations, not records.** Card A is "a story": scribble lines over a cut-hill cover. Card B is a dashed blank, "yours". No real author is shown answering anyone.

**Layout:** a CSS **sticky stage** with the beats scrolling past. This is native sticky, not pinning or wheel-jacking; each beat is about 70 svh of plain scroll.
- **Desktop:** stage 60 % on the left, beats 40 % on the right.
- **Phone:** the stage sticks under the header at 46 svh, with the beats scrolling beneath it.
- **Height < 520 or landscape phone:** the comic version below.

```
1440   這裡沒有讚，只有回應
       ┌──────────── sticky stage (60%) ─────────────┐   ① 讀一個故事
       │    聆聆 reads ▁▁                             │      有人把自己的一段人生寫成了一張卡片
       │   ╭─────────╮              ╭ ─ ─ ─ ─ ╮       │
       │   │ card A  │   ≋≋≋ (③)    ┆ card B  ┆       │   ② 被觸動了，就寫下你的
       │   │ ≈≈≈ ≈≈  │              ┆ ✎ lines ┆       │      回應一個故事，用的是你自己的故事
       │   ╰─────────╯              ╰ ─ ─ ─ ─ ╯       │
       │ 摺摺 (corner folded)                 聆聆 ✎   │   ③ 兩張卡片，從此相連
       │≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈ floor ≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈│      公開署名的回應會讓作者知道是你…
       └──────────────────────────────────────────────┘
820: the same split at 55 / 45.       390: ┌ sticky 46svh ──────────┐
                                           │ ╭──╮  ≋≋  ╭──╮  聆聆   │
                                           │≈≈≈≈≈≈≈≈ floor ≈≈≈≈≈≈≈≈≈│
                                           └────────────────────────┘
                                            ① 讀一個故事 … (scrolls under)
```

**Cues** (an IntersectionObserver per beat sets `data-beat` and calls the stage):
1. 聆聆 climbs onto card A and **reads**.
2. 聆聆 climbs down, pops up by card B and **writes**. Card B's scribble lines draw in as its pencil moves (stroke-dashoffset, 2.4 s).
3. B slides next to A (600 ms), and the brand's own **three waves ≋** draw between them (900 ms), the logo becoming the link. 聆聆 and 摺摺 perform the **resonate** duet. Then 摺摺, whose story A is and who lifts its folded corner only for someone it trusts, **reveals** its hidden lines.
4. *(optional)* 牽牽 Twine, a gift tag with a blank "To:", walks in and hands 摺摺 a folded **note** (the note duet).

Scrolling back plays the earlier cue again. A beat must stay in view 400 ms before it fires, so flinging past costs nothing. **Why these puppets:** Nod is the one who "nods and writes down what it hears", so it is the reader who answers. Tuck is the shy author who opens up. Twine is a note still looking for its someone.

**Server HTML:** the beats' text, plus a **three-panel comic** (each beat's stills on a small stage). That is what JS off, reduced motion and short screens get. `@media (scripting: enabled) and (prefers-reduced-motion: no-preference) and (min-height: 520px)` makes it the sticky stage from the first paint, so the layout never shifts.

### Scene 3 · 換你上台 Your turn (sunset; today's CTA band)

**Copy:** h2 **下一個上台的是你** (en "You're on next"); the line as today; (寫下你的故事) solid cream on terracotta, (先讀讀大家的故事) tonal.

**Set:**
- Terracotta-light, then terracotta flats, with the **sun half sunk** behind the floor and setting as you scroll.
- A flat pale-yellow **spotlight** wedge on the floor: a fill, never a glow.
- In the pool stands the **blank sixth** (`BlankPal`: brads, mittens and a pencil face, nothing else). Hovering or focusing 寫下你的故事 makes it look up, its eyes appearing (CSS).

```
1440  ︵︵︵ dusk flats ︵︵︵           ◓ sun, half under the floor
                      下一個上台的是你
         每一個故事都有意義——你的故事，也許正是改變某個人那天的那個故事
              ( 寫下你的故事 )   ( 先讀讀大家的故事 )
      牽牽 ◀ wing          ⟋ spotlight ⟍
                          [ blank sixth ]
≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈ floor ≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈
820 the same, buttons in a row.       390: the buttons stack full width over the lane; the spotlight sits under them
```

**Puppet:** 牽牽 Twine (「這個……可以給你嗎？」) walks out of the left wing, **points** at 寫下你的故事, then **beckons**. Writing is giving your story to someone; the tag's "To:" is still blank. **Server HTML:** everything, plus 牽牽's still.

### Scene 4 · 晚安 Curtain call and footer (night: Hush's band, `--band-night`, colour-fixed in both schemes)

**Copy:**
- h2 **在 App 裡，故事不打烊** (en "In the app, stories never close")
- Badges, with the QR ticket on hover + mouse
- 認識小紙團 → /paper-pals
- Hush's line as a link: **「晚安……再說一個就好」→ /home**
- Then the footer, merged into the same night: ≋ Resonance, the five links, the trademark line, ©, 中場休息. No repeated italic tagline, no full stops.

**Set:**
- **Pinprick stars** (cream dots, holes in the night paper) appear one by one as the band scrolls in, beside a crescent **moon** Hush cut itself.
- In the sky's top-right, a **Hush-shaped hole**: a cream patch masked by Hush's own torso image, where Hush was cut from.
- The **curtain call**: the reunion stills from /paper-pals in a row on the floor, with 悄悄 under its hole.

```
1440  ·  ✦   ·    ✦     ·   ☾        ·    ✦        ▒ hole ▒   ·
                    在 App 裡，故事不打烊
         [ App Store ] [ Google Play ]  ┊▦ QR ticket┊    認識小紙團 →
           點點  摺摺  牽牽  聆聆                  悄悄  ← takes its bow last, under its hole
≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈ floor ≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈
                  「晚安……再說一個就好」→
   ≋ Resonance          關於我們 · 小紙團 · 聯絡我們 · 隱私政策 · 服務條款      ⏸ 中場休息
   Apple 與 App Store 是 Apple Inc. 的商標…               © 2026 Resonance 版權所有
820: the same, links wrapping.      390: the five at 64px in one row (≈ 300px), the badges stacked,
                                         the links in two columns
```

**Motion:** on entering view, each of the five **waves** in turn, 250 ms apart (five stages over one layer, as `PalsTitleScene` does). 悄悄 goes last with **twinkle**, and later **naps**. Tap 悄悄 four times: it turns shy and slips off, leaving the hole empty, then comes back.

### Day → night, and the dark scheme

- The scene paper is a ramp of tokens, `--sky-1…4`, set per scheme in `palette.ts`. **Light:** cream → cream-dark → gold (cream-dark with 18 % yellow) → terracotta → night.
- **Dark (the "evening show"):** dark paper → deeper paper → dark terracotta → the same night. The hero's inner stage is one step lighter (lamp-lit), stars appear from scene 1, every sun is a moon, and the cast leans to 悄悄.

## 4. The signature moments

1. **「害羞的摺摺掀開了角」 (the shy one opens up).** In three scrolls a puppet reads a story, writes its own, the two cards join with the Resonance waves, and Tuck lifts its folded corner. What a visitor repeats: *"There's no like button. A little paper puppet answers a story by writing one, and the shy one opens up."*
2. **天黑了 (night falls).** The page grows dark as you reach the end. Stars prick through, the cast bows, and there is a Hush-shaped hole in the sky. The last line is Hush yawning 「晚安……再說一個就好」, and it is a link to one more story.

## 5. Tech

**Layer 1: CSS, zero JS.**
- **Scroll-driven animations** (`animation-timeline: view()`, behind `@supports` and `prefers-reduced-motion: no-preference`): the flats at each edge (back flats rise up to 28 px desktop / 16 px phone), plane parallax, the suns setting, stars appearing.
- **Sticky** for the answer scene, **scroll-snap** for the kamishibai, and `data-beat` transitions for the cards and drawn lines.
- **Rule:** grain is baked into a tiled WebP on each plane. A filtered SVG (feTurbulence) is never animated, and a band has at most 4 composited layers.

**Layer 2: the existing engine, mounted per scene.**
- `mountScene(window, layer, { cast, ledges(w, h, unit), cues, pace })` generalises `mountPalStrip`: one stage per scene, in scene-local px, paused off-screen, with at most two scenes live at a time.
- The ledges come from **the set's own geometry** (we draw the floor and the frame, so we know their paths). The landing stops measuring glyph ink; `landing/measure.ts` and the `data-mascot` marks retire from the landing, and the reading stage keeps its own.
- **New:** a **wing entrance**, `LineLedge.wings?: { left?: Cover; right?: Cover }` (a walk starts and ends behind the pillar, clipped at its drawn edge, so a 12 px phone pillar works too); `stage.cue(request)` (`next()` then `visit()`, debounced); *(optional)* a **bow** act lifted from the note duet's bow.

**Layer 3: a ~3 KB gz cue controller.** IntersectionObservers per scene and per beat, pointer parallax, and the 中場休息 toggle. The toggle is `aria-pressed`, stored in `localStorage` inside try/catch, and sets `data-intermission` on `<html>`, which pauses the CSS animations and every stage.

**GSAP / Motion: not in v1.** Everything here is either a scroll-scrubbed paper plane (a compositor-only CSS job) or a cued puppet (the engine). **GSAP** (core + ScrollTrigger + DrawSVG, ~45 KB gz) is the escape hatch, only if the prototype shows (a) Firefox needs parity for the scrubbed layers (check scroll-timeline support at build time), or (b) the kamishibai wants desktop drag-to-pull (Draggable + Inertia, ~20 KB more). **Motion's** strengths (React layout and gestures) don't apply to paper planes.

**Load:** above the fold only the set's inline SVG (about 6 KB). At idle, the controller and the engine chunk (shipped already today). The cast loads per scene within one viewport of it (摺摺 and 點點 at idle, the others later). Stills are baked at `mascots:cast` as one small WebP per pose, lazy-loaded, not a stack of parts.

**Degrades:**

| Condition | What the visitor gets |
|---|---|
| JS off | The dressed set with stills, the snap row of six, the comic answer scene, all the stars |
| Reduced motion | The same as JS off, plus a 150 ms crossfade kamishibai. No parallax, scroll timelines or engine |
| Save-Data | No engine and no cast parts, only the baked stills |
| Slow phone | Stepped 12 fps and one live scene. The engine already stops on failing frames, leaving the stills |

## 6. Risks, costs, what to cut first

**Cost:** about 20 engineer-days.

| Work | Days |
|---|---|
| Set kit: proscenium, layered flats (`SectionEdge` gains `layers`), planes, sun / moon, stars, the hole | 4 |
| Hero and apron (ticket QR, badges, pause control) | 2 |
| Kamishibai (stage `StoryCard` variant, snap row, pull, tests) | 3 |
| The answer scene (sticky, beats, comic fallback, cues) | 3 |
| CTA, the night / footer merge, the curtain call | 2.5 |
| Engine: `mountScene`, wings, cue (+1 for a bow) | 3 |
| Dark ramp, en copy, a11y pass, `npm run visual` captures, tests | 3 |

**Risks:**
- **Kitsch.** A theatre can tip into theme-park. Keep it to pen lines, flat paper and grain: no velvet, gradients or shadows; the drapes are cut paper.
- **The kamishibai hides five of six stories.** Mitigated by naming the next card on the stack tab, the dots, and 瀏覽所有故事.
- **The answer scene's ~210 svh on a phone.** Cap each beat at 60–70 svh. It is plain scroll, so nothing is trapped.
- **Perf.** The engine's layer must follow the sticky box (needs a test). Never animate grain filters; use `content-visibility` on off-screen scenes, except the sticky one.
- **i18n.** The en lines run about 30 % longer. The h1 is on two lines everywhere, and the desktop beats column is 480 px.
- **a11y.** One h1, and one h2 per `<section aria-labelledby>`. The set and the puppets are `aria-hidden`. The kamishibai is a list of links with a live region. The ambient puppets move longer than 5 s, so 中場休息 (in the hero apron and the footer) is the WCAG 2.2.2 pause.
- **Maintenance.** Ledges are authored per set piece: fewer surprises than measuring the page, but a set change means updating its ledges. Add one ledge test per scene.

**Cut in this order:** the bow → beat ④ → pointer parallax → the drapes → the dark scheme's lamp-lit step. **Never cut** the puppet lane, the answer scene or the night band.

## 7. Prototype scope (one session, a lab route, 1440 and 390)

**Must show:**
1. **The hero:** proscenium, valance, planes, the real h1, subtitle and badges, and the floor with 摺摺 and 點點 stills coming alive. One wing entrance; it may be faked with today's side walk-in plus a clip at the pillar.
2. **One scene-change edge:** three flats with the CSS scroll-driven slide.
3. **The answer scene, all three beats:** sticky stage, `data-beat` states, B's lines drawing, the ≋ link, and the cues to 聆聆 / 摺摺 through `visit()` (pop entrances are fine), ending on Tuck's reveal.
4. **The night band:** stars on scroll, the moon, the Hush hole, the five stills waving in turn, badges, the merged footer and the 「晚安……再說一個就好」 link.

**May be faked or static:** the kamishibai (one card plus the stack edges, with buttons scrolling the snap row), the sun's set, the drapes, pointer parallax, tablet, en, the dark scheme (one screenshot), the CTA (today's band plus the blank sixth and the sun), the bow.

The owner should be able to scroll 390 and 1440 once and judge **ground, depth, and the day passing**.

## 8. References

- **Paper theatre itself:** 紙芝居 kamishibai and its *butai* (pulling one card reveals the next, which is what our story cards literally are); tunnel books and Engelbrecht's 18th-century peep-shows (layered planes seen through a frame); Pollock's toy theatres (proscenium, wings, paper flats).
- **Games and film:** Paper Mario: The Thousand-Year Door (every chapter a stage play, with curtain, wings and set changes); Tearaway (a paper world where cut edges give the depth); Lotte Reiniger's cut-paper films.
- **Depth and time of day:** Firewatch's site hero (layered parallax hills read by time of day); Alto's Odyssey (a day–night cycle in flat planes).
- **Sticky scrollytelling** (The Pudding, Apple product pages): a stage that stays while beats pass, used here without pinning.
- **From the owner's list:** scrolltide.co (scroll-driven templates, for the cue-not-scrub split), supahero.io (a hero that is a scene, not a stack), cta.gallery (the CTA as a stage moment), footer.design (the footer folded into the last scene).
