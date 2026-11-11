# 換你說 · Your Turn

**Pitch:** the landing page hands you a real story and a blank card: write one line back, and watch 聆聆 fold it and 牽牽 carry it across a pen thread to the story, so you get 用故事回應故事 by doing it, in about ten seconds, with nothing stored.

The page is built like an exchange diary (交換日記) laid open on a desk. Someone else's page is on the left and yours is on the right, with one pen thread (the "twine") running from the headline's underline down the whole page. Every section hangs from that thread, and each puppet lives where the thread gives it a job. None of them drop by at random.

---

## 2. Diagnosis: why today reads as a SaaS template

- **It's the stock hero stack, centred.** Pill tag, big centred headline, two-line subtitle, store badges with a QR code, an avatar row as social proof, and a blob in each corner. That is the 2019 template order, and nothing in it is a story. On the 1440 fold you don't see a single word of anyone's writing; the first real card starts about 1,000 px down.
- **It tells you the verb but never lets you do it.** The whole idea is "you don't like a story, you answer it with a card". Here that's one accented word (回應) and a descriptive subtitle. A visitor never touches an answer, a link between two cards, or a reason to write.
- **"Latest posts" is a blog grid.** It's a uniform 3×2 grid where 4 of the 6 cards show the empty striped placeholder, which is the most template-looking frame on the page. On a phone it turns into a single column about 5,000 px tall, so the CTA only arrives after roughly 45% of an 11,000 px scroll.
- **There's dead air where layout should be.** About 250 px of empty cream under 成為一群最早說故事的人, an empty band under 瀏覽所有故事, and a CTA band that's mostly padding. The blobs and puppets end up filling leftover space; they aren't composed into it.
- **The puppets have no job, so they look bolted on.** They stand on the tops of headline glyphs (悄悄 on 響 at 1440; on the phone, 摺摺's feet are on the headline's cap line and 牽牽 is jammed against the pill), and they peek over cards chosen by a random ledge picker. They're small next to an 84 px headline, and nothing on the page needs them. The Paper Pals page shows the fix: once each band was drawn around a character, they look at home.
- **The closing band talks like a broadcast.** 「讓世界聽見你的聲音」 is about one voice reaching everyone, which is the opposite of what the product actually does (one card answering one card). The terracotta band plus the dark footer is the generic SaaS ending.

---

## 3. The page, top to bottom

**Spine.** One pen thread, drawn with the INK pen in `--soft-pen`, runs the whole page. It starts as the wave under 回應 in the h1, crosses the desk's gutter, becomes the clothesline the stories hang from, drops to the CTA's folded corner, and ends in the footer holding a cut-paper moon. Each section renders its own stretch of it as server SVG (`vector-effect: non-scaling-stroke`), and the endpoints meet at agreed fractions of the width across the wavy edges. `measure.ts` reads those stretches as line ledges the same way it already reads SectionEdge paths. **Casting is by meaning, one home per character:** desk is 聆聆 + 牽牽, clothesline is 點點, CTA is 摺摺, footer is 悄悄. Each section mounts its own small stage once it is 50% in view, as the Paper Pals strips already do (`mountPalStrip`). The random ledge picker is retired on the landing page.

### 3.0 Header
Same as today: ≋ Resonance · 繁體中文 · 登入. Nothing gets added. On an iPhone the Smart App Banner already offers the app above it, which is one reason the phone hero can skip the badges (3.1).

### 3.1 The desk (hero + try it): 「換你說」
**Purpose:** say what the product is in one line, then hand over the pen.

**Copy (zh-TW / en):**
- h1: 用故事**回應**故事 / **Answer** stories with stories. The accent stays on 回應, and its pen wave is drawn a little long so it carries on into the thread.
- Subtitle: 「在這裡，你不按讚——讀完一個故事，就用自己的故事回應它」 / "No likes here — read a story, then answer it with one of your own"
- Story card label: 「有人寫下」 / "Someone wrote". Control: 「換一個故事 ↻」 / "Another story". Link: 「讀完整個故事 →」
- Answer card title: 「換你說」 / "Your turn". Prompt: 「這個故事讓你想起什麼？用一句話開始」 / "What does it bring back? Start with one line"
- Starter chips (each inserts its words and puts the caret at the end): 「我也曾經……」「這讓我想起一個人……」「讀完，我想說……」 / "I once…" "This reminds me of someone…" "Reading this, I want to say…"
- Field placeholder 「寫下第一句」. The send segment says 「回應」 / "Answer"
- Honesty line, always visible: 「只是試試看，不會發布、也不會送出」 / "Just trying — nothing is posted or sent"

**Featured story:** the server picks one of the 6 latest cards. It must be listed (not thin or a placeholder), not trashed, and have at least 120 characters of excerpt, with a cover preferred. It's set in the reading design's type (Ming title over Hei body, `storyType`). An anonymous card shows 匿名 and never an author. ISR (`revalidate = 3600`) rotates it naturally. 「換一個故事」 cycles through the other five client-side, since they're already in the HTML.

**Layout:**
```
1440 ─────────────────────────────────────────────────────────────────────
 ≋ Resonance                                               繁體中文 (登入)
 用故事回應故事                                       [ App Store ]
       ‾‾‾~~~~~~~~~~~~~~~╮                            [Google Play] [QR]
 在這裡，你不按讚——讀完一個故事，就用自己的故事回應它   ╰╮
                                       牽牽●            │   聆聆● (sits)
 ┌─ 有人寫下 ─────────────────┐ ~ ~ ~ ~ ~ ~ ~ ~ ┌ ─ 換你說 ─ ─ ─ ─ ─ ─ ┐
 │ 結巴影響我的事              │  the thread,     ¦ 這個故事讓你想起什麼？ ¦
 │ 國小四年級的時候，有個同學…  │  dashed until    ¦ (我也曾經…)(這讓我…)  ¦
 │ …(7 lines, story type)      │  you answer      ¦ [寫下第一句…  ║ 回應 ] ¦
 │ Starry · 4 分鐘   讀完 →     │  gutter 160      └ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘
 └──────────── 換一個故事 ↻ ──┘                  只是試試看，不會發布、也不會送出
   left page: theirs (−0.6°)                       right page: yours (+0.6°)
```
- **1440:** 12 columns. The h1 is left-aligned, 96–112 px (bigger than today's 84, because it's no longer centred over empty space). Badges and QR sit right-aligned on the h1's row. The spread underneath is two pages of about 520 px each with a 160 px gutter, slightly tilted the way paper on a desk is. Layering is shown by pen lines only; there are no shadows. The spread's top sits around y 430 so both cards and both puppets fit inside a 900 px fold.
- **820:** the same spread with two pages of about 360 px and a 56 px gutter. The badges move under the subtitle.
- **390:** stacked layout. The h1 fits one line at 44 px. Under the 2-line subtitle comes the story card (5 lines, then 讀完 →), then a 56 px stretch of thread down the left margin, then your card. Both puppets stand on your card's top edge, which lands at the bottom of the first screen, so they're what invites the scroll. There are no badges in the phone hero (see 3.2 and the sticky pill).
```
390 ───────────────────
 ≋ Resonance     ◎  ≡
 用故事回應故事
     ‾‾‾~~~
 在這裡，你不按讚——讀完一個
 故事，就用自己的故事回應它
 ┌ 有人寫下 ───────────┐
 │ 結巴影響我的事       │
 │ 國小四年級的時候……   │
 │ Starry · 4 分 讀完 → │
 └──────── 換一個 ↻ ──┘
 ╰~╮
 牽牽●            ●聆聆   ← first-screen bottom
 ┌ ─ 換你說 ─ ─ ─ ─ ─ ┐
 ¦ (我也曾經…)(這讓…) ¦
 ¦ [寫下第一句 ║回應]  ¦
 └ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘
```
**The answer card** is drawn with `HandDrawnDashedBorder` (an empty page). Its field is the app's own composer capsule (`segmentCapsuleShape`, with 回應 as the end segment behind the wavy seam), so the landing page teaches the app's real UI.

**Puppets.** These two were picked by meaning, not decoration:
- **聆聆 Nod**, the listener 「嗯，我在聽」. It climbs onto the right end of your card's top edge and sits there. While you type it nods, at most once per 600 ms (a new cue, `listen`). It writes with its pencil (`write`) when you pick a chip. When you send, it is the giver of the note.
- **牽牽 Twine**, a gift tag whose "To:" line is still blank and who is looking for its someone. It pops up at the gutter end of the thread. After 6 s with no input while the desk is in view, it beckons once toward the field. When you send, it receives your note and carries it to the story.
- Nothing else visits the desk, and there are no hops or high-fives: stories here can be about grief.

**Server HTML vs client:**
- **Server HTML:** every word, both cards, the badges, and the dashed thread. It also includes `PaperPalStill` stills of 聆聆 and 牽牽 at their places, so the composition is complete with JS off, as on the Paper Pals page. The form is `<form method="get" action="/{locale}/card/{slug}#respond">`, and its input has **no `name`**. With JS off, 回應 therefore opens the real story's page where 共振 lives, and the words never go into a URL.
- **Client:** a ~5 KB island that makes the chips, the send action and the cycling work. The stage starts on idle, with the stills coming alive through their own entrances (`data-staged`). GSAP loads on intent (§5).

### 3.2 The answer (the result state of 3.1)
When you press 回應, the right page turns into a card while you watch, and three captions (`role="status"`) arrive in step with the puppets:
1. 「你的卡和它連在一起了」 / "Your card is linked to it"
2. 「真的寫的時候，作者會收到你的回應」 / "For real, its writer would get your answer"
3. 「回應被接住，你們就連上了，可以開始聊」 / "Once it lands, you're connected — and can talk"

The actions come up at once; nobody waits for a puppet:
- **寫完這張卡** (solid). It opens the writer as a resonance to *this* card, with your line seeded through `leaveWriteSeed` (sessionStorage, never the address). Sign-in is asked first.
- **在 App 裡繼續**: the badges, plus the QR on hover+mouse devices.
- 「再回應一個」 (quiet). It loads the next story into the left page.

On a phone, a fill pill 「用 App 繼續」 then docks at the screen's foot until the CTA band scrolls into view.

**Desktop timeline** (all times from the press):

| t (s) | What happens |
|---|---|
| 0 | Your line Flips from the field into the card's title position (420 ms). The dashed outline redraws as a solid pen line (DrawSVG, 500 ms). The paper fills with the rotation colour, spreading from the button as a BrushWash (460 ms). The byline reads 「你 · 剛剛」. |
| 0.6 | The thread across the gutter draws from your card to the story (700 ms). Caption 1. Actions in. |
| 0.8 | Note duet, 聆聆 → 牽牽, using the existing choreography: the hand-over (2.2 s); 牽牽 draws it to its chest, eyes shut and blushing, with the "moved" beat trimmed to 1.2 s for this scene. |
| 4.2 | 牽牽 walks the thread like a tightrope (about 1.6 s across 200 px), note held. The thread sags a few px under it. |
| 5.8 | It sits on the story card's top-left corner. Caption 2. |
| 6.2 | 聆聆 and 牽牽 greet from afar across the thread, with three pencil waves (the `resonate` bob). Caption 3. |

**820:** the same sequence, except the gutter is too short for a tightrope, so 牽牽 crosses it in one `hop`.

**390:** the note duet plays on your card's top edge, both puppets in view just above the field. The thread draws up the margin to the story. 牽牽 walks off left carrying the note. Caption 2 appears as it goes, and 聆聆 waves after it. If you scroll back up, 牽牽 is sitting on the story card.

**Touch:** puppets hold still while the keyboard is up (`visualViewport` height under 75%) and re-measure once it closes.

### 3.3 The clothesline: 「還有人在等一個回應」
**Purpose:** today's 3×2 grid, reframed so every story reads as *waiting for an answer*, and so the phone loses about 4,000 px of scroll.

**Copy:**
- Title: 「還有人在等一個回應」 / "Still waiting for an answer"
- Subtitle: 「真實的人、真實的經歷，每一張都可以回應」 / "Real people, real lives — every one can be answered"
- Under each card, a small tonal tag on its string: 「回應這個 ↑」. It sits outside the card's link, and it moves that story into the desk (scroll up, then a Flip swap).

**Layout:** the thread becomes a clothesline across the full width (a static SVG that doesn't scroll). The other five real `StoryCard`s hang from it, each by a short string and a brad, the puppets' own paper fastener. They tilt ±1.5° and sit in a horizontal `scroll-snap` row underneath the line, so their brads slide along it. The line ends in a blank gift tag that reads 「瀏覽所有故事 →」.
```
1440  還有人在等一個回應                                        ←  →
 ════●══════════●══════════●══════════●══════════●═══ 點點 hops here ═══╗
     │          │          │          │          │                   [瀏覽所有→]
  ┌──┴───┐  ┌───┴──┐   ┌───┴──┐   ┌───┴──┐   ┌───┴─        (3.5 visible, 340 px)
  │ card │  │ card │   │ card │   │ card │   │ ca…
  └──────┘  └──────┘   └──────┘   └──────┘   └─ ─
  回應這個↑  回應這個↑
820: 2.3 cards visible     390: one 300 px card plus 40 px of the next; native swipe
```
**Interaction and motion:**
- On touch, scrolling is native and there's no hijack.
- With a mouse you can drag to scroll (a tiny handler, no plugin), or use the ← → buttons.
- Cards sway with the row's scroll velocity (GSAP `quickTo`, at most 1.2°, settling in 600 ms).
- The clothesline draws itself as the section enters (CSS `animation-timeline: view()`).

**Puppet: 點點 Pip**, the hole-punch dot with only "ry" left of "story", looking for the rest. The clothesline is its line ledge. It hops along, stops above a card, looks down at it (`look`), and moves on. Tap it and it says 「這是我的故事嗎？」 (the `line` behaviour from the Paper Pals page).

**Server HTML:** a `<ul>` of the 5 cards plus the tag, the line, and scroll-snap, so it works with no JS at all. **Client:** drag, buttons, sway, and the stage.

### 3.4 Folded lines (CTA): 「每個人都有幾行，一直折著的字」
**Purpose:** close on the visitor's own story. If they answered in 3.2, the band remembers.

**Copy:**
- Title: 「每個人都有幾行，一直折著的字」 / "Everyone has a few lines folded away"
- Subtitle: 「準備好了再掀開——寫下來，也許正好回應了某個人」 / "Unfold them when you're ready — written down, they may answer someone"
- Buttons: 寫下你的故事 (ctaLight) · 先讀讀大家的故事 (ctaGhost). `StorytellerProof` 「成為一群最早說故事的人」 moves here.
- If the visitor answered above, the subtitle becomes 「你剛剛寫了『我也曾經……』——把它寫完」 and the first button becomes 寫完這張卡.

**Layout:** the terracotta band stays, but its top-right corner is a folded paper corner, a large `torso-alt`-style fold drawn with the band's pen. The title is left-aligned against it.
```
1440 ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ 摺摺 stands on the wave
     每個人都有幾行，                                    ◸ corner (lifts with scroll)
     一直折著的字                                          hidden pencil lines under it
     準備好了再掀開——寫下來，也許正好回應了某個人
     [寫下你的故事] [先讀讀大家的故事]   (念)(蕭)(方)(TE) 成為一群最早說故事的人
820: same, corner smaller   390: title 2 clauses, buttons full width stacked, corner 72 px
```
**Motion:** as the band crosses the middle of the view, the corner lifts about 30°, showing three pencil lines underneath (CSS scroll-driven, plus a static half-lift as fallback).

**Puppet: 摺摺 Tuck**, which has the same folded corner and the same hidden lines, and is shy and waves first. It walks onto the band's wave, waves, then does `reveal` (lifts its own corner) at the moment the band's corner lifts: the character and the layout make one gesture.

### 3.5 Night (footer)
**Purpose:** a calm ending that hands you one more story.

**Copy:**
- Tagline 用故事回應故事
- 「晚安，再讀一個就好 →」 (links to /home) / "Goodnight — just one more →"
- Badges and the trademark line, the links, ©. None of these lines end with a full stop.

**Layout:** the dark footer becomes the paper theatre's night sky, with pinprick stars as CSS dots. The page's thread comes down through the footer's wave and holds a cut-paper moon, drawn as SVG with the pen line, at the top right.
```
 ~~~~~~~~~~ 悄悄 naps on the wave ~~~~~~~~~~~~~~~~~~~~ │
   ·   ✦     ·        ✦      ·      ✦                  ☾  ← the thread's end
   ≋ Resonance   用故事回應故事      晚安，再讀一個就好 →
   [App Store] [Google Play]   Apple 與 App Store 是 Apple Inc. 的商標…
   關於我們 · 小紙團 · 聯絡我們 · 隱私政策 · 服務條款          © 2026 Resonance 版權所有
390: one column, centred, moon top-right 48 px
```
**Puppet: 悄悄 Hush**, quiet by day and awake at night. It naps (`nap`) on the wave and twinkles when you reach the end. Tap it and it says 「晚安……再說一個就好」.

**Pause control (WCAG 2.2.2):** a quiet button at the foot of the desk, 「讓小紙團休息」 / 「叫醒小紙團」 (`aria-pressed`, remembered in localStorage). It puts every stage to sleep and leaves the stills.

---

## 4. Signature moments

1. **"My line got carried."** You type one line while a paper index card nods along. You press 回應. It folds your words, a gift tag hugs them and tightropes across the pen thread to a stranger's real story, and your card stays linked to it. It takes about ten seconds and needs no account, and it *is* the product: answering, not liking. This is the thing people will retell.
2. **The underline was the thread.** The pen wave under 回應 in the headline is visibly the start of the thread you just finished. Once the visitor has answered, they read the h1 again and get it.

---

## 5. Tech

**What runs what:**
- **Existing puppet engine.** It drives all the puppets. A new directed scene, `lib/mascots/answer/scene.ts`, is modelled on `pals/titleScene.ts`: two stages, places read from the stills' DOM positions.
- **Engine additions:**
  - `walkLine(from, to)`: walk a line ledge starting from a spot, rather than entering from the edge of the view.
  - A held prop that survives a scene step: the duet's `Kept` note carried through the next walk.
  - A `listen` cue (a nod on demand).
  - An `onStep` position event so the page can sag the thread's SVG under the walker. This one is optional.
- **GSAP core + Flip + DrawSVGPlugin**, now all free, for the send timeline only. The timeline is the conductor: `tl.call()` cues the stage, and `addPause()` waits on stage events with a 1.5 s timeout, so the page never waits on a puppet. GSAP rather than Motion: timelines coordinate cleanly with an outside rAF engine, DrawSVG handles uneven wobbly paths, and Flip moves the line from the field into another DOM parent. That keeps the desk a server component with a tiny island; Motion's React layout animations would pull the whole desk client-side.
- **CSS scroll-driven animations** (`@supports (animation-timeline: view())`) for the thread stretches drawing as they enter, the CTA corner lift, and the clothesline drawing. There is no ScrollTrigger, no ScrollSmoother, and no pinning.

**Weight and load:**
- GSAP + Flip + DrawSVG is about 36 KB gzipped. It's dynamically imported on intent: the first focus or pointerdown in the answer card, or 2 s of idle after load, whichever comes first.
- The island is about 5 KB; the scene module is about 6 KB on top of the existing lazy engine chunk.
- Nothing extra loads before first paint, and the h1 is still server text and the LCP.

**How it degrades:**
- **JS off:** the whole page reads. The form opens the real story's page, the chips are hidden (`<noscript><style>`), the clothesline scrolls natively, and the stills stand.
- **Reduced motion:** stills only. Sending shows the finished card and the solid thread in a 150 ms fade, all three captions at once, and 牽牽's still moved to the story card. Scroll-driven draws are off, so threads are simply drawn.
- **Save-Data:** no GSAP and no stages. Only the desk's two stills stay; the other sections get none.
- **Slow phone:** if GSAP isn't loaded 300 ms after the press, the reduced path runs. The engine already stops itself when frames keep failing.

---

## 6. Risks, costs, cut order

**Estimate: about 15 engineering days.**

| Days | Work |
|---|---|
| 3 | Desk layout, the form/island, result card, thread, captions |
| 4–5 | Directed scene plus the engine additions, with tests like `titleScene.test.ts` |
| 2–3 | Clothesline, including 點點 on the line |
| 1.5 | CTA fold with 摺摺, footer night with 悄悄 |
| 1 | Writer hand-off (resonance plus seed) |
| 2–3 | i18n, dark mode, a11y, `npm run visual` slices (a new screen: `landing-answered`) |

**Risks:**
- **Honesty.** A visitor may think they published something. The honesty line sits *before* the button, and caption 2 is conditional (「真的寫的時候」).
- **The featured story.** A live card might be thin or raw. Mitigations: the listed filter, a minimum length, the gentle choreography only (no hop or five on the desk), and later an optional owner pin (`config/landing.featuredCardId`, server-only).
- **A directed scene breaks when layout drifts.** Extend `landing/marks.test.tsx` to cover the desk's places, and pin the timeline's cue order in a test.
- **The phone keyboard and iOS `visualViewport`.** Puppets freeze while typing, and the field is kept clear of torsos (`clear`).
- **Accessibility.**
  - A labelled form: 「換你說」, with chips as buttons named 「插入：我也曾經……」.
  - After sending, focus moves to the result card's title (`tabindex=-1`) and the captions are a polite live region.
  - Puppets are `aria-hidden`.
  - The clothesline is a list with ← → buttons; Tab scrolls each card into view.
- **i18n.** The en h1 breaks as "Answer stories / with stories" at 1440. A visitor's line is set by `storyType` of what they typed, whatever the page locale. CJK titles keep their clauses (`titleClauses`).
- **Performance.** At most two stages are live, and stages sleep out of view (existing behaviour). The sag is one path `d` update per step at 12 fps.

**Cut first, in order:**
1. The thread sagging under the tightrope walker
2. 點點 on the clothesline (keep the line and the hanging cards)
3. The full-page thread beyond the desk (each section keeps its own look)
4. The 「回應這個 ↑」 swap
5. The writer seed (just link to /write)
6. The typing nods

**Never cut:** answering, the linked card, the drawn thread, the note handed over, and the captions.

---

## 7. Prototype scope (one focused session)

**It must show:**
- The desk at **1440 and 390**, with the server's real featured card from the 6, the answer card with the composer capsule and chips, and the honesty line.
- Sending: your line Flips into a coloured card, the dashed outline redraws solid, the gutter thread draws (DrawSVG), the three captions appear, and the actions appear.
- 聆聆 and 牽牽 as **live stages using today's engine**:
  - 聆聆 `visit({ ledge: 'answer-top', slug: 'card', acts: ['write'] })`.
  - On send, `meet('note')` with 牽牽 as the guest. The giver is random, which is fine for a prototype.
  - 牽牽's tightrope is **faked**: hide the live 牽牽 and move a `PaperPalStill` along the thread path with GSAP MotionPath at 12 fps steps, with a 3 px bob.
- Below the desk, a static clothesline of the other five real cards. The CTA and footer can be today's, carrying the new copy.

**It may fake or skip:** 820, dark mode, 換一個故事, the writer seed, the scroll-driven draws, 點點, 摺摺's fold, the night sky.

**The owner judges three things:**
1. Does doing the verb once explain Resonance faster than the subtitle does?
2. Does the open spread read as "not a template" in the first second?
3. Do 聆聆 and 牽牽 now look as if the page was made for them?

---

## 8. References

- **Exchange diaries (交換日記), Postcrossing (send one, receive one), Hinge (reply to one specific prompt instead of a like):** the one-to-one answer as the core act.
- **Duolingo's web onboarding** (do a lesson before an account), **tldraw.com** (you draw on the homepage itself), **Typeform** (one question, one field): try first, sign in later.
- **gsap.com's own homepage** (demos you play rather than read), plus GSAP Flip "item lands in a card" and DrawSVG handwriting reveals; **motion.dev** layout-transition examples as the bar for smoothness.
- **scrolltide.co** and **godly.website**: scroll-driven reveals kept short and unpinned; clothesline and pinned-card galleries on **land-book** and **Readymag**; **cta.gallery**: a CTA that echoes the visitor's own input; **footer.design**: footers that end in a mood (night) rather than a link dump.
- **Monument Valley, Neko Atsume, Headspace:** characters who *live* in places and do one thing there, rather than wandering.
- **This repo's /paper-pals page:** bands built around each puppet, stills in the server HTML coming alive on idle. It's the proof that designing for the puppets works, and this direction takes that method to the landing page.
