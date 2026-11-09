# 書桌 · The Desk

**Pitch:** the landing page is the animator's table the 小紙團 are shot on — real stories lie on it as paper you can pick up, pull apart and turn over, and each puppet has a job there: the page explains Resonance with objects, not sections.

Why a *table* fits this brand exactly: cut-out animation is filmed from above, on a lit table. On that table gravity is "down the screen" by convention, which is why a puppet can sit on a card's top edge. The light is even, so nothing casts a shadow (the owner's no-shadow rule, now with a reason). And things move frame by frame, which is the 12 fps the puppets already use. One rule follows for every motion on the page: **what your hand moves is smooth; what moves on its own moves in stop-motion, at 12 fps.**

## 2. Diagnosis

- **A stock hero.** At 1440 the fold is one centred column about 520 px wide: pill, then H1, then subtitle, then store buttons, then a "join the early ones" avatar row, with a blob in two corners. About 60 % of the screen is empty cream. That is the shape of every SaaS hero on supahero.io. Only the Ming typeface is ours.
- **The product shows up late.** The first story starts about 1,000 px down on desktop and about two screens down on a phone. The phone fold has a blob, two puppets, the headline, the badges, the avatars and about 300 px of blank cream. Nothing shows what 回應 means, though the headline is now that very word.
- **The page hides what makes Resonance different.** The cards sit in a uniform 3×2 grid under a centred tag, title and subtitle, like a blog index. In the screenshot 3 of 6 cards have no cover and show a grey placeholder, so the grid looks half-loaded. No card is shown answering another card, even though `referenceCardId` is already in the data `latestForLanding` reads.
- **The end is a template too.** A terracotta conversion band with generic copy (「讓世界聽見你的聲音」), then a dark footer. The wavy edges are used as dividers between full-width bands, so the brand's elements decorate a standard stack instead of being things on the page.
- **The puppets look bolted on** because they stand on leftover ledges measured from type:
  - 點點 floats above the H1's 「讓」 and 悄悄 stands on its right end. At 120 px they are taller than the 84 px headline, so they compete with the LCP.
  - On the phone, 摺摺 and 牽牽 crowd the pill inside a blob.
  - No surface is drawn under their feet.
  - Visits are random, and their best acts (read, write, hand a note, resonate) are never tied to anything on the page.
  - /paper-pals shows the opposite: built around them, they read on a card's top, nap at its end and peek past its side.

## 3. The page, top to bottom

One continuous desk surface (`--color-cream-dark` + `ShapeGrain`), with no bands and no section edges until the very end. An option to A/B in the prototype: a faint hand-drawn cutting-mat grid (`wavyPath` lines at 4 % ink, faded away under the text column). The cards, the note and the blank card are **objects**: `--color-card-bg` inside one pen line (`HandDrawnBorder`, INK), turned ±1–4°, overlapping only at corners and never over text.

Each puppet has a **home**: an object designed for it, drawn as its `PaperPalStill` in the server HTML, which comes alive on idle. Five homes, five verbs: Tuck **reads**, Nod **answers**, Pip **discovers**, Twine **reaches you**, Hush **sends you off for tonight**. At most two puppets are live in any viewport, which is the engine's own limit.

### 3.1 The desk at a glance (hero): "a story, and the story that answered it"

**Purpose:** in 5 seconds, show that here a card answers a card. No heart, no like button.

**Content**
- The headline is written straight on the desk. It is not on a sheet, and no puppet ever stands on it: 「✦ 真實的人生故事」 then **用故事 / 回應 / 故事**. 回應 is the accent word with the pen-wave underline. On desktop it stacks on three lines at 96 px, which reads as story → answer → story. In en: "**Answer** stories / with stories".
- Subtitle (no full stop): 「一個讓世界各地的人生故事相互連結的空間——在這裡閱讀、分享，與塑造我們的經歷產生共鳴」, then the badges (+ QR on hover/fine-pointer devices).
- **The resonance pair:** the newest public, listed card that answers another public, listed card (card **B**), beside the card it answered (**A**). Between them are the engine's own three pencil waves.
- An annotation under the waves: 「這張卡片，回應了那個故事」 / "This card answered that story", with a small hand-drawn arrow.
- The avatar row moves to the end.

**Layout**
```
1440 ┌───────────────────────────────────────────────────────────────────────┐
     │ ≋ Resonance                                            繁體中文  [登入] │
     │ ✦ 真實的人生故事               Tuck (sits, reads)                        │
     │                               ╭─┴──────────╮                            │
     │ 用故事                         │ A  cover   │         ╭────────────╮     │
     │ 回應  ← accent + pen wave       │    title   │  ≈≈≈≈   │ B  cover   │     │
     │ 故事                           │    excerpt │  ≈≈≈≈   │    title   │     │
     │ subtitle ≤ 26em                │    byline ◸│  ≈≈≈≈   │    excerpt │     │
     │ [App Store] [Google Play] [QR] ╰────────────╯         │    byline ◸│     │
     │                             這張卡片，回應了那個故事 ↗   ╰────────────╯     │
     │                                                     Nod ✎ (on the desk) │
     │ ── the next cards' tops peek in at the fold ──                          │
     └───────────────────────────────────────────────────────────────────────┘
820  ✦ tag / 用故事回應故事 (64 px, one line) / subtitle / [badges]
     then A and B side by side (330 each, waves in an 80 px gap), Tuck on A, Nod at B's foot
390  ┌──────────────────────────┐
     │ ≋ Resonance        ◍  ☰  │
     │ ✦ 真實的人生故事           │
     │ 用故事回應故事 (44 px)      │   one line: 7 × 44 = 308 px
     │ subtitle, 3 lines         │
     │ [App Store][Google Play]  │
     │        Tuck               │   ← Tuck and A's top edge are on the fold
     │ ╭──┴────────╮             │
     │ │ A (280,-2°)│ ≈           │
     │ ╰───────────╯  ≈ (diag.)  │
     │ Nod   ╭───────────╮       │
     │       │ B (280,+2°)│       │
     └──────────────────────────┘
```

**Interaction and motion**
- **Pull the stories apart.** You can drag B: free on a fine pointer, along x on touch (`touch-action: pan-y`, so a vertical swipe still scrolls).
  - The three waves stay pinned to both cards' facing edges. As the gap grows they stretch: their amplitude falls to 25 % and their pen thins from INK to INK_LIGHT.
  - Past two card-widths the drag meets rubber-band resistance.
  - When you let go, B goes back to its slot by itself, in stop-motion (6 frames, 0.5 s).
  - This makes the link between two stories something you can feel.
- **On idle after load:** the waves draw in (DrawSVG, 3 × 0.6 s, staggered 0.15 s, at 12 fps).
- **Every 15–25 s while in view:** Tuck and Nod **resonate across the gap**: the duet's bob, eyes shut and blush, 2–3 beats × 0.7 s, with the page's waves pulsing in time. This is the duet without the walking.
- **Dog-ear (◸):** every card has a folded bottom-right corner, Tuck's own motif. On hover it lifts 6°. Tapping it **turns the card over** (rotateY, 8 frames / 0.66 s, no shadow, the pen line kept). The back:
  - 「這個故事收到 {n} 個共振」 (`resonanceCount`), or 「還沒有人回應它」 when there are none;
  - two fill buttons, 讀完它 (tonal) and 用你的故事回應 (solid), both to the card page, where 共振 lives (sign-in asked there).
- Tapping the card face opens the card. It is still an `<a>`.

**Puppets**
- **摺摺 Tuck** sits on A's top, reading the card under it. Its line when tapped: 「一起看嗎？」.
- **聆聆 Nod** stands on the desk at B's foot with its pencil, `write` act. Nod "writes down what it hears": it is the one who answered A.
- While you drag B, Nod looks after it; when B comes home, the two resonate.
- If you drag **A**, Tuck rides along: its stage is a child of A, so it inherits A's transform. It plays a new `ride` act (mittens up, mouth-o, legs swinging with velocity), then a blush and a look when A stops.

**Server vs client**
- Server: headline, badges, both cards (StoryCard on fixed-height "desk" faces), the static waves SVG, the annotation, the Tuck and Nod stills, slot positions as CSS transforms. This is final, with no CLS.
- Client: drag, stretch, flip, resonance, live puppets.

**Data**
- Read the newest ~30 public cards (`LISTING_FIELDS`). Take the first that has a `referenceCardId` and isn't `unlistedCard`. `get` its original under `LANDING_CARD_FIELDS` and check it is public, published, not trashed and not unlisted.
- An anonymous card shows 匿名 with no author, as today.
- Fallback when no pair is found: A is the newest card, and B is an empty dashed card reading 「等一個故事來回應它」.
- An optional owner pin (`config/landing.pair`, server-only) can override the pick.
- Cost: one extra query and one get per ISR hour.

### 3.2 剛放上桌的故事: the rest of the desk (Pip's home)

**Purpose:** reading-first browsing of the other 4 latest cards. It is a composed scatter, not a grid.

**Content:**
- h2 「剛放上桌的故事」 / "Fresh on the desk", the line 「真實的人、真實的經歷——每個聲音都承載著一個世界」 and 4 cards.
- **The pile:** 3 stacked cards; the top one lies face down with 「瀏覽所有故事 →」 written on its back and links to /home.

**Layout**
```
1440   剛放上桌的故事                                       ╭─────╮╮╮
       ╭─────╮       ╭─────╮                 ╭─────╮     │更多  │││  Pip on the pile
       │  C  │╭─────╮│  E  │   (open desk:   │  F  │     │故事 →│││  「這是我的故事嗎？」
       │ -2° ││  D  ││ -1° │    the throw    │+2.5°│     ╰─────╯╯╯
       ╰─────╯│+1.5°│╰─────╯    room)        ╰─────╯
              ╰─────╯           slots: x/y/rot fixed per breakpoint, seeded by card id
820    2 rows × 2 cards, staggered 40 px, pile under the second row's right card
390    native horizontal scroll-snap strip: cards 280 wide, 12 px overlap; the pile is the last stop
       ← [C][D][E][F][pile] →   each card turns to 0° as it reaches the centre
```

**Interaction:**
- Desktop (fine pointer): any card can be picked up and thrown (Draggable + Inertia, bounded to the desk, `edgeResistance` 0.85).
  - While it moves, its turn follows horizontal velocity (±6°, `quickTo` 0.25 s).
  - A grabbed card comes to the top of the pile and stays there, as real paper would.
  - The headline column is a no-drop zone: a card let go over the words slides off them (Inertia `snap` to the nearest free spot).
- Once anything has moved, 「整理桌面」 (tonal) fades in at the desk's corner. Flip returns every card to its slot in stop-motion (0.5 s, 12 fps, staggered 0.05 s).
- First time in view, each card *is placed* on the desk: from +3° and 1.03 to its slot, in 5 frames (0.42 s), staggered 0.12 s. This is transform only, so the layout is unchanged.
- Phone: the strip straightens with CSS `animation-timeline: view(inline)`, with no JS. Cards are not draggable on touch; a tap opens the card and the dog-ear flips it.

**Puppet: 點點 Pip.** Pip has lost the rest of its "story", so it hops from card to card (`pop` entrances on card tops) asking 「這是我的故事嗎？」, and goes home to sit on the pile.
- On the phone, Pip sits on the centred card in the strip and hops to the next one when the snap changes. Swiping the strip is how you meet Pip.
- Throwing a card at Pip makes it `duck`.

**Server vs client:** everything is drawn in the HTML in DOM reading order, with the slots as CSS. The client adds drag, tidy, settle-in and Pip live.

### 3.3 小紙條: the note Twine brings you (the "how it works")

**Purpose:** explain resonance in four lines, as a note that is *for you*.

**Content:**
- Outside of the folded note: **「給：第一次來的你」** / "To: you, new here". 牽牽 is a gift tag whose 「給：」 has always been blank. Here it has found its someone: the visitor.
- Inside title: 「回應一個故事的，是另一個故事」 (`about.how.title`).
- Four panels from `about.how`, existing strings with no full stops: 寫下一段人生 · 讀到觸動你的故事 · 寫一張卡片共振它 · 讓對方知道是你. Each has its title, one line and a small `Icon` glyph.

**Layout**
```
1440  folded: one 240 × 300 note, turned -3°, 「給：第一次來的你」, Twine beside it
      open:   ┌──────┬──────┬──────┬──────┐   accordion folded in four: 4 × 240 panels,
              │寫下   │讀到   │寫一張 │讓對方 │   the creases are the dividers (pen lines,
              │一段人生│觸動你的│卡片  │知道  │   INK_LIGHT, slightly bowed)
              └──────┴──────┴──────┴──────┘
820   map fold: in half, then in half again, opening into 2 × 2 panels
390   vertical accordion: 4 strips of 358 × ~140, horizontal creases
```

**Interaction:**
- The note is a button (`aria-expanded`, 「打開小紙條」). Tapping it or pressing Enter unfolds it crease by crease: 4 × 0.33 s at 12 fps. Each panel's words are in the DOM throughout, folded with 3D transforms, never `display:none`.
- When the note is first fully in view, **Twine walks in carrying it** (the engine's carried-note pose), turns to face you and holds it out. This is a new `offer` act: an arm forward, a slow sway and a blush, with 「這個……可以給你嗎？」 shown where it covers nothing (`placeSaid`).
- Tapping the note or Twine: the note jumps from its mitten to the desk (5 frames) and unfolds. Twine bows (the duet's bow), blushes, and sits on the note's top edge.
- If you are not interested, it stays folded with its 「打開」 label, and Twine beckons once more after 6 s. There is no nagging past that.

**Server vs client:** server HTML has the note **unfolded and flat** and Twine's still beside it. The client folds the note only when JS is on, motion is allowed and the section is not yet in view.

### 3.4 輪到你了: the desk at night (Hush's home, CTA + footer as one)

**Purpose:** the last object on the desk is *your* blank card, under the lamp-off night sky.

**Content:**
- h2 「輪到你了」 / "Your turn", and the line 「每一個故事都有意義——你的故事，也許正是改變某個人那天的那個故事」.
- **A blank card**: dashed pen line (`HandDrawnDashedBorder`, a slot waiting), reading 「你的故事，會是下一張」, with a pencil lying across it.
- Fills: **寫下你的故事** (solid) → /write, and 先讀讀大家的故事 (tonal) → /home.
- The avatars + 「成為一群最早說故事的人」.
- 「睡前，在 App 裡再讀一個」 + badges + QR.
- Then the footer links, the trademark line and © under one pen line.
- The tagline 用故事回應故事, no full stop anywhere.

**Layout**
```
1440  ～～～ wavy top edge (the lamp's light ends) → night palette, `data-night` as on /paper-pals
      輪到你了                       ╭ ─ ─ ─ ─ ─ ─ ─ ╮  Hush sits on its top, asleep
      line                          ┆ 你的故事，      ┆
      [寫下你的故事] [先讀讀大家的故事] ┆ 會是下一張  ✏︎  ┆
      ◯◯◯◯ 成為一群最早說故事的人      ╰ ─ ─ ─ ─ ─ ─ ─ ╯
      睡前，在 App 裡再讀一個  [App Store] [Google Play] [QR]
      ─────────────────────────────────────────────────────────
      ≋ Resonance · 用故事回應故事    關於我們 小紙團 聯絡我們 隱私政策 服務條款   ©
820   words above the card, buttons below the card, footer in two rows
390   h2 / line / blank card (full width) / buttons stacked / badges / footer
```

**Interaction:**
- The whole blank card is the write link. On hover or focus the pencil rolls ±8° (3 frames) and writes one wavy line across the card (DrawSVG, 6 frames), so the card isn't blank any more.
- The wavy top edge draws in when it enters view.

**Puppet: 悄悄 Hush**, awake at night and 「晚安……再說一個就好」, which is the app's bedtime reading.
- It naps on the blank card's top (z's) and wakes as you arrive (`twinkle`).
- It points at the pencil (`point`, its target set to the pencil).
- When tapped, it says its line.
- In dark mode the whole desk is night, so Hush is the most active puppet (`Traits.zones` already weights it).

**Server vs client:** everything is in the HTML. The client adds the pencil's line and Hush live.

### Throughout

- **Header** as today, as part of the desk with no bar.
- **「讓小紙團睡一下」 / "Let the Paper Pals nap"**: a small moon `BareIconButton` at the desk's corner, which is the WCAG 2.2.2 pause control. When pressed:
  - every live puppet naps in place (z's) and the stages stop after 2 s;
  - the waves stop pulsing;
  - it becomes 「叫醒小紙團」;
  - the choice is remembered in `localStorage`, wrapped in try/catch.
- **What you can and can't move.** You move paper and never the pals: puppets are tappable (hop, then their line, then shy after four pokes, as today), not draggable. They are characters, not objects.

## 4. Signature moments

1. **Pulling two stories apart and feeling them hold.** The first screen shows a real story and the real story that answered it, joined by three pencil waves. You drag one away and the waves stretch. You let go and it hops back, and the two puppets resonate. People will describe it as "on their site the answer is literally tied to the story". That *is* 用故事回應故事, understood without reading a line.
2. **A puppet hands you a note addressed to you.** 牽牽, whose tag has always said 「給：」 with no name, walks up holding a note marked 「給：第一次來的你」. It blushes and offers it. You tap, and the note unfolds into how Resonance works. It is the only "how it works" section people will open on purpose.

## 5. Tech

| Need | Choice | Why |
|---|---|---|
| Drag, throw, bounds, click vs drag | **GSAP Draggable + InertiaPlugin** | The best physical throw on the web: `allowNativeTouchScrolling` with `type:'x'` on touch, `minimumMovement` keeps taps as link clicks, `snap` for the no-drop zone. It is framework-agnostic, so it sits beside the vanilla engine. Free since 3.13. |
| Tidy, settle-in | **GSAP Flip** + core tweens with `ease: steps(n)` | Flip animates from any messed-up state back to the CSS slots. `steps()` gives the stop-motion register. |
| Waves draw-in, pencil line | **DrawSVGPlugin** | Tiny, and handles hand-drawn paths of uneven length. |
| Phone strip straightening, wave edge | **CSS scroll-driven animations** (`view()`) | No JS, so a browser without them simply shows a straight strip. |
| Puppets | **The existing engine** (`createStage`, stills, `placeSaid`) | Three additions: **per-object stages** (a stage whose `layer` lives inside a moving card, with `viewport()` mapped through the card's inverse transform, so riders inherit drag and rotation), acts **`offer`** and **`ride`**, and **resonate-at-a-distance** (the duet's beat without the walk, firing an event the page uses to pulse its waves). |
| Not used | Motion, ScrollTrigger, ScrollSmoother | Motion would be a second animation library for no gain. ScrollTrigger isn't needed: no pins, and `IntersectionObserver` triggers the sections. No smooth-scroll and no wheel hijack, ever. |

**Weight:** GSAP core + Draggable + Inertia + Flip + DrawSVG ≈ **48 KB gz**; desk code ≈ 8 KB; the existing stage chunk is unchanged, with the engine additions ≈ +5 KB.

**Loading:** HTML + CSS are the finished page.
- After `load`, on `requestIdleCallback`: the stage chunk (as today) and the desk chunk (`next/dynamic`, no SSR). The desk chunk also loads on the first `pointerdown` on a card, if that comes first; that tap still works as a link.
- Each section's stage mounts when it is within 200 px of the view and stops when it is far away.
- An error boundary renders nothing if a chunk fails (as `LandingStage` does).

**How it degrades:**

| Condition | What the visitor gets |
|---|---|
| **JS off** | The composed desk exactly as designed: headline, badges, the pair with static waves, the scatter, the note **open and flat**, the blank card and buttons, the night footer, and every puppet as a still. Every link works. There is no drag, flip or folding. |
| **Reduced motion** | Stills only, no settle-in. Drag still follows the hand (it is the visitor's own motion), but with no inertia, no stretch return and no stepped tweens. Flip becomes a 150 ms crossfade. The note is open from the start. The waves are static. |
| **Save-Data** | No stage and no desk chunk. Stills load lazily (only Tuck and Nod are above the fold); the ISR HTML can't vary by Save-Data, so they stay. |
| **Slow phone** (`hardwareConcurrency ≤ 4` or `deviceMemory ≤ 2`) | No settle-in. The desk chunk loads on first touch only. The engine already steps at 12 fps on timers. |

## 6. Risks, costs, what to cut

**Engineering estimate:**
- Desk layout and slots at 3 breakpoints, plus fixed-height desk card faces (no grey placeholder: a card without a cover shows its title larger): 3 d
- Pair read + fallback + tests: 1.5 d
- Waves link (static + stretch): 1.5 d
- Drag/throw/no-drop/tidy: 2.5 d
- Dog-ear flip + back: 1.5 d
- Note in three fold layouts: 2.5 d
- Engine additions (per-object stages, `ride`, `offer`, resonate-at-a-distance, Twine's carried entrance) and the homes: 5 d
- Night end + Hush: 1 d
- a11y, pause control, degradation paths, `npm run visual` slices, en copy: 2.5 d
- **≈ 21 days.**

**Risks:**
- **A11y.** Every object stays a real link or button, in DOM reading order, whatever its transform. Moving is never required, and 「整理桌面」 always resets the desk. Puppets are `aria-hidden`; the flip's back is `inert` until it is shown; focus rings are INK_STRONG accent pen lines. Risk: a keyboard user can't "play". Accepted, since playing is an extra.
- **Content.** Scatter slots meet real content of any length, so the desk card face is fixed height with clamped lines. The newest resonance pair may be weak or a test card: `unlistedCard` already filters thin and placeholder cards, and the owner pin covers the rest.
- **Touch.** Drag conflicts with scrolling, which is why touch gets x-only drag on the pair and a native strip in the scatter. Test on a real iPhone, Android and iPad.
- **Perf.** Two animation systems run at once (the engine's rAF/timers and GSAP's ticker). Both idle when nothing moves. The puppet's PNG parts are already budgeted on /paper-pals.
- **i18n.** The en headline breaks differently, so the stacking is set per locale. Note panels must fit the en body lines: 240 px panels need en at 15 px, tested at 320 wide.
- **Maintenance.** Slots are hand-placed per breakpoint. Keep them in one `deskSlots.ts` so a new card count or size is one edit, and give the scatter a test so a slot never covers text.

**Cut first, in this order:**
1. The pencil's written line.
2. Free throwing in the scatter (keep the pair's stretch only).
3. The map fold at 820 (use the vertical accordion).
4. The dog-ear flip.
5. `ride` (Tuck hops off instead).
6. Twine's `offer` (the note sits folded with its label, and Twine's still waves).

**Never cut:** the pair with its waves, and the five homes.

## 7. Prototype scope (one session)

A throwaway route (`/zh-TW/desk-proto`, not linked anywhere) built with the 6 cards from `stageFixture`, or a JSON copy of real latest cards, at **1440 and 390**. It must show:
1. **The first screen** at both widths: stacked or one-line headline, badges, the A/B pair with the waves, and stills of Tuck on A and Nod at B. This is enough to judge whether the fold stops looking like SaaS.
2. **The stretch:** drag B, the waves stretch, B hops back in stop-motion. GSAP is real here.
3. **Tuck riding A:** the still is placed inside A's element, so it moves and turns with it. The engine is faked with the still and a CSS-stepped wobble.
4. **One dog-ear flip** with a real back.
5. **The note:** folded with 「給：第一次來的你」 and unfolding on tap (horizontal at 1440, vertical at 390), with Twine's still beside it doing its `data-hello` wave.
6. **The scatter at 1440** with throw + 「整理桌面」, and the phone strip straightening with CSS.
7. **The night end:** blank card, buttons, Hush's still. It can be static.

May be faked: the pair read (hard-code two fixture cards and a link), live puppets and all new acts (stills plus stepped CSS keyframes), the footer links, en copy, dark mode. A toggle in the corner switches stop-motion vs smooth for automatic motions, so the owner can judge the 12 fps rule.

## 8. References

- **Cut-out animation tables:** Lotte Reiniger's trick table, the construction-paper South Park pilots, Terry Gilliam's Python cut-outs, all shot top-down under even light. This is where the gravity, the no-shadow rule and the 12 fps come from.
- **Pages as a surface of objects:** Figma Config and Vercel Ship event sites (draggable stickers on the page), cosmos.so and Are.na boards, tldraw and Apple Freeform (objects *are* the page), Stripe Press (books as objects you turn).
- **Playful personal sites where the layout is a toy:** Lynn Fisher's yearly lynnandtonic.com redesigns, Josh Comeau's tactile details, Panic's Playdate site.
- **GSAP:** Draggable + InertiaPlugin throw-with-bounds demos, Flip "return to layout", DrawSVG hand-drawn reveals. Motion's drag/`dragElastic` was considered for the stretch and not chosen (one library).
- **Paper folding UI:** accordion and map-fold 3D-transform demos (the OriDomi lineage).
- From the owner's galleries: godly.website and land-book "desk/workspace" heroes with scattered polaroids and notes, and supahero.io as the catalogue of what the current hero looks like, i.e. what to leave.
- In-house: /paper-pals's title scene (stills where the server drew them, one stage per character, cut along a card's drawn line), which is the proof that designing *for* the puppets works.
