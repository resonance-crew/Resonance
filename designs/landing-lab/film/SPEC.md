No newer owner message reached me. This spec settles the debate from the brief, LEAD.md, the three proposals, the critique and the four research reports. Before writing it I checked the kit, the engine, the earlier prototypes, the art mock and the critic's frames.

# SPEC D · 一張卡片，一整天 · One Card, One Day (id: `film`)

## 0. What is settled, and where this departs from the critic

The critic's recommendation is the spine of this spec:
- **Four scenes, about 45 s of film.** The page scrolls about 6.2 screens.
- **Outdoors at the blue hour.** No attic.
- **Two clocks.** The scroll drives the scenery; the acting is triggered and plays at film speed. The page moves by itself only for ▶, a scene's tick or ←/→, and 重看一次 (round 3: ⏮ ⏭ 略過 gone; the progress line is dragged by the visitor).
- **The paper turns over edge-on.** That is how the drawn slip becomes the real card.
- **≋ ripples, never a heart.**
- **A CSS-sticky stage, our own clock, no GSAP.**
- **The data rule:** anonymous cards are linked by id, no `readCount`, no stories in the HTML.
- **For a day's work:** scenes 1 and 2 are fully built, scenes 3 and 4 rough. The acting puppets are 摺摺, 聆聆 and 點點; 牽牽 and 悄悄 do little.

Where this spec departs from the critic, and why:

1. **Answer card B is 聆聆's own drawn card** unless a real public, named resonance exists. The kin card is never shown as an answer, and it gets **no ≋** anywhere, because ≋ means "answered". It comes second in the stories list. `?b=kin` previews the other choice for the owner, under a banner.
2. **Every scene change is the same full fly-and-rise.** The critic had change 2 fly only the back flats. One transition is enough for a day, and the pair of cards holds on screen anyway.
3. **Card A keeps one horizontal chip layout throughout.** It never grows into the full card. It stays legible at every step, and the full card appears in the stories list.
4. **No baked finish plates.** The layers are flat inline SVG with torn edges, a rim stroke, a contact sliver, origami facets and one grain overlay. Baked plates are later work.
5. **Puppet parts come from `public/mascots/*`** (0.66 px per rig unit), not a 1.0 px/unit resample. At this film's sizes (摺摺 at most 140 px, k at most 0.33, DPR at most 3), 0.66 is enough. That means no new assets and no build step.
6. **The WCAG pause is the site's own 「讓小紙團休息」 toggle,** separate from ▶. ▶ and ❚❚ start and stop the play-through, which is a scroll; the rest toggle stops every automatic motion.
7. **Phone night scene: no story chips on the stage.** There the night stage holds the call to action and the five puppets; the stories follow straight after the release. Desktop gets 4 sky chips.
8. **牽牽 does not tie the two cards in scene 3** (cut). 牽牽 appears only at night, holding out the blank card.
9. **Landscape phones (max-height 500 px) always get the picture book.**

## 0b. The lead's amendments (these override anything below)

1. **Card A pops out as the platform's card, then folds into a chip.** The owner's words:
   「他這卡片樣式就會是我們的這個平台的這個卡片的樣式，會跳出來這樣子」 and 「他寫完的卡片可以浮出來讓大家看。那如果使用者點擊，或許就可以直接跳到那張卡片」.
   - **The reveal.** The `write` turnover lands on `FilmStoryCard`, a copy of the feed's `molecules/StoryCard` look: framed (`wobRect`, the card family's paper and pen, INK, radius 16), the cover on top (16:9, or no cover band at all, never grey), title, a two-line excerpt in the reading type, and the byline (avatar · pen name · N 分鐘). It is a `Link` to its card page and readable.
     - **Wide:** 320 wide, placed in the sky right of the hero. Its left edge is at least 24 px past the hero block, its bottom above the puppets' heads; scale it down (never below 0.8) if it doesn't fit.
     - **Tall:** centred, `min(300px, 100vw − 48px)` wide, top = hero bottom + 16. Its bottom stays above 摺摺's head; scale it down to fit, never below 0.7.
   - **It holds there,** readable and tappable, until the visitor scrolls.
   - **The fold.** In `wind`, v 0.05–0.35, it turns over a second time (the same edge-on turnover, scrubbed by the scroll) into the horizontal chip `FilmCard` (§5.5, the story-card family's smallest member, as `molecules/EmbedStoryCard` draws it). The chip then flies to the carrier spot: the card folding up for its journey. Scrolling back unfolds it.
   - **From then on** §5's chip rules hold: travel, catch, the pair, the bridge.
   - **The book's plate 1** shows the full card, not the chip. The full card is in the server HTML, hidden in film mode until it is revealed.
2. **The art bar.** `designs/landing-lab/film/mocks/palettes.html` and its renders are the minimum, not the target:
   - `…/scratchpad/film/mock-dusk.png` and `mock-palettes.png`: atmospheric depth by colour, the town's lit windows, the sun's tissue halo, the clouds, the grass fringe, the torn rims.
   - The first screen at 390 and 1440 must look at least that rich, with the cream h1 on a darker blue-hour sky. Judge every frame against the owner's words: 「非常精美」「沉浸式」「奇幻色彩」, understood 「甚至不用閱讀文字」.
3. **The dev server is already running** at http://localhost:3200, started by the lead. Never start, stop or restart it. If it stops answering, say so in your report rather than starting another.
4. **Reports are returned, not written.** Return your report as your final text. You may also save it under the scratchpad's `film/build/` folder; a refused write is not a failure.

## 1. Where, and the rules

- **Worktree:** `/Users/ncchen/Documents/Resonance-landing`, branch `landing-lab`. Never touch `/Users/ncchen/Documents/Resonance`. Do not commit or push.
- **Production Firestore:** reads only (the lab route already reads it). Never write.
- **Shared rules:** follow `designs/landing-lab/prototypes/BUILD.md` everywhere this spec does not override it.
- **Dev server:** if `http://localhost:3200` answers, use it and never restart it. Otherwise start `npx next dev --port 3200` in the worktree, in the background, note its PID, and stop only that PID at the end. Never `pkill`/`killall`.
- **Files you may create or edit:**
  - `src/app/[locale]/lab/landing/film/page.tsx` (new)
  - one new entry in `src/components/lab/landing/registry.ts`: `{ id: 'film', name: 'D · 一張卡片，一整天 One Card, One Day', pitch: '小紙團演一整天：寫下一張卡片、被讀到、被回應、兩個人相遇，最後換你寫' }`
  - everything under `src/components/lab/landing/film/`
  - `designs/landing-lab/film/tools/`
- **Do NOT edit:** atoms, molecules, sections, `src/lib/**`, `src/styles/**`, messages, tokens, `package.json`, `designs/stickers/**`, `public/mascots/**`, `labRoute.tsx`, `types.ts`, the other prototypes.
- **Copying:** to vary something shared, copy it into `film/` and change the copy.
- **Libraries:** no GSAP, no Motion, nothing installed. ScrollTrigger would cost 45 KB gzip to read one number, its pin jitters on iOS where `sticky` doesn't, and its snapping fights our clock.

## 2. Data (`film/data.ts`, server only; `film/model.ts`, the types)

1. **Port `.lab-tmp/filmCards.ts` into `film/data.ts`** as `filmCards(db, { storageBases: publicBases(), now })`. Keep its rule, constants and comments exactly:
   - lead eligibility;
   - tier 0: the pin `config/landingFilm`;
   - tier 1: a real resonance;
   - tier 2: kin (insight distance ≤ 0.40, situation distance ≤ 0.70, one per author, daily rotation among the top 3 at Taipei midnight);
   - tier 3: alone;
   - the sky from `latestForLanding(db, 14)` minus the leads, at most 12.
   - Do not import from `.lab-tmp`.
2. **`loadFilm(locale)`:**
   - Memoize the result in `globalThis.__filmMemo` for 10 minutes, keyed by the Taipei day. In dev, every reload re-renders, and one run takes 1–2 s and about 130 reads.
   - On a throw or `null`, log `[film] picks failed` and fall back to `latestForLanding(db, 13)`: A = the first named card with a cover, relation `alone`, and the rest as the sky.
   - With no cards at all, A is also drawn: the slip turns over into a `DrawnCard`.
3. **`toModel()` builds the only thing the client sees** (never pass a `Card` to a client component):

   ```ts
   interface FilmTile { id: string; href: string; title: string; excerpt: string; cover?: string;
     author?: { name: string; initials: string; avatar?: string }; minutes: number; family: number;
     script: 'cjk' | 'latin'; lang?: string }
   interface FilmModel { a: FilmTile | null; b: FilmTile | null /* only when relation === 'resonance' */;
     kin: FilmTile | null; relation: 'resonance' | 'kin' | 'alone'; sky: FilmTile[] /* ≤12, kin first */ }
   ```

   - **`href`:** `/card/${slug ?? id}`, but always `/card/${id}` for an anonymous card. Never keep a slug field.
   - **Other fields:** port `tilesOf` from `oneday/tiles.ts`, with `family` from `cardPalettes` over `[a, b, ...sky]`.
4. **Today's data** (from the data research): A is 〈Let's Enjoy Me Time! 🌿〉 by Winnie. The relation is `kin` with 〈不要只有在狀態好的時候才喜歡自己〉 by Starry, so B is drawn and Starry's card comes first in the sky.
5. **`?b=kin` (lab preview only):**
   - the kin tile takes B's place;
   - a fixed banner reads 「預覽：把相近的故事當成回應——它們並沒有真的回應彼此」 / "Preview: a nearby story shown as the answer — it did not really answer this one".
6. **The lab note**, above the footer, muted at 13 px: 「實驗原型：卡片是今天平台上真實公開的故事；聆聆的回應卡是畫的」 / "Lab prototype: the cards are real public stories from today; Nod's answer card is a drawing".

## 3. The world

### 3.1 Coordinates and layouts

**World units.** Each place is a world 2000 units wide and 1000 tall: the mock's 1600 composition shifted +200, with its margins extended. The journey is wider (§3.2).
- Puppets stand at ground y ≈ 885 (the ground-edge spline).
- World y 370 is the top of the far range; the horizon is 614.

**One CSS length per world unit,** `--u`, computed in CSS so the server's frame 0 and the runtime agree. The runtime reads it as `planeEl.getBoundingClientRect().width / 2000`.

```css
.stage { --lip:56px; --pad:24px; --hero-bottom:340px; --pal:88px; /* phone, tall */
  --u: max(calc(100vw / 1900), calc((100svh - var(--lip) - var(--pad) - var(--hero-bottom) - 16px) / 515));
  --ground-y: calc(100svh - var(--lip) - var(--pad));            /* world y 885 lands here */
  --hz: calc(var(--ground-y) - 271 * var(--u)); }                /* the horizon, world 614 */
@media (min-width: 640px) and (max-aspect-ratio: 11/10) { .stage { --lip:64px; --hero-bottom:430px; --pal:112px } }
@media (min-aspect-ratio: 11/10) { .stage { --lip:64px; --pad:32px; --hero-bottom:42svh; --pal:clamp(112px, 14.7svh, 140px) } }
@media (max-height: 500px) { /* book, always */ }
```

- **The layout name:** `wide` when the aspect is at least 1.1, otherwise `tall`.
- **Planes:** each is `width: calc(W * var(--u))`, positioned with `top: calc(var(--ground-y) - 885 * var(--u))`.
- **Horizontal placement:** `left: calc(50% + (0 - var(--cam)) * var(--u))`. `--cam` is the camera's world x for the scene and layout.
- **Puppets:** sized by `--pal`, 摺摺's height in px. The live `k = pal / 420`, the same for all five.
- **Check sizes:** phone 390×844 gives u ≈ 0.79 (view ≈ 494 units). Tablet portrait 820×1180 gives u ≈ 1.27, 1440×900 ≈ 0.88, 1366×768 ≈ 0.72, 1180×820 ≈ 0.73.

### 3.2 Places (`film/script/world.ts`)

Port the mock's geometry from `designs/landing-lab/film/mocks/palettes.html` into pure TypeScript: `rng`, `spline`, `poly`, `tear`, `smoothPath`, `pencil`, `peaks`, `place`, `yAt`. Parameterize it by `W` and `variant`. The seeds stay the mock's.

| place | used by | what it is |
|---|---|---|
| `home` | scenes 1 and 4 | the mock's place: far range, near peaks, sea, far shore and headland with lighthouse, the town on its hill, tree hills, the near hill with the lone tree, the ground with grass tufts, front fringe |
| `journey` | scene 2 | `home` mirrored in x. Planes with depth ≥ 0.34 are tiled twice, with a period of 2000. The far planes are generated 2600 wide. |
| `valley` | scene 3 | `home`'s far layers, sea and town. The near hill and ground are replaced by a left bank (x −80…540) and a right bank (1060…2080), both with their ground at y 885. The valley floor at y 980 is in `--film-c-shade`. |

**The bridge** (valley only) is its own plane at depth 0.9. It is three pale paper ribbons in the logo's ≋ shape, fill `oklch(90% 0.03 85)` with a rim stroke, spanning x 600→1400. The top ribbon is the walkway: (600, 880) → apex (1000, 790) → (1400, 880).

**Server rendering.** `World.tsx` renders each plane of each place as an SVG `<symbol id="film-{place}-{plane}">`, all inside one hidden `<svg>` in the server HTML. Paths fill with `var(--film-c-{plane})`.

**The paper finish, with no SVG filters anywhere on the stage:**
- **(a) Torn edges:** from `tear()`.
- **(b) The rim:** the top edge stroked in `var(--film-c-rim)`, 1.2 px, `vector-effect: non-scaling-stroke`, on every plane with depth ≥ 0.34.
- **(c) Contact sliver:** on planes with depth ≥ 0.5, the edge path offset −4 units, filled `--film-c-shade` at 0.12 opacity (0.2 at night), drawn before the fill.
- **(d) Origami facets on the peaks:** the sun-side face takes a cream overlay at 10 % alpha, the shade side the ink at 10 %.
- **(e) Lit windows:** grouped into five buckets by their `on` value. Each bucket's opacity is `--film-win-0…4`.
- **(f) Grain:** one `GrainOverlay` (opacity 0.07) over the whole stage, in its own layer (`will-change: transform`). Grain is never baked in.

### 3.3 Planes, far to near

| plane | depth | | plane | depth |
|---|---|---|---|---|
| range | 0.08 | | hills | 0.66 |
| peaks | 0.20 | | near | 0.82 |
| sea (a flat band, horizon to 760, with sun-strip reflections) | 0.27 | | bridge (valley only) | 0.90 |
| headland and shore | 0.34 | | ground | 1.0 |
| town | 0.50 | | fringe (dark grass at the bottom corners) | 1.3 |

**Behind the planes, in the sky layer** (all transform and opacity only):
- the sky: one div with a linear gradient through `--film-sky-0…3`, stops at 0, `0.55·hz`, `0.80·hz` and `hz`;
- stars: one SVG of 150 pinpricks, opacity `--film-stars`, six of them twinkling by CSS;
- the disc: a radial-gradient div plus two tissue halo circles (sun), or a cut-paper crescent path (moon);
- clouds: tissue strips at depth 0.02.

**In front of the planes,** a screen-space particle layer:
- wind ribbons ≋: three tapered cream ribbons whose dash offset streams with s, alpha 0.42 → 0.85;
- birds: five chevrons;
- lanterns: a paper lantern plus a radial glow disc, no filter;
- fireflies: 12 warm 3 px dots on CSS drift.

### 3.4 Light: hours and palettes (`film/script/palette.ts`)

Port `TIMES`, `LAYERS`, `layerColour`, `paletteOf`, `mixLch` and `mixLab` from the mock. Add two keyframes that keep the cream hero text above 4.5:1:

- **blueHour:** sky `[[0,.36,.065,272],[.55,.47,.085,300],[.80,.64,.095,338],[1,.80,.075,40]]`, haze `[.66,.06,318]`, ink `[.26,.05,285]`, γ .9, κ .6, rim `[.80,.03,300]`, sea `[.66,.06,320]`, windows .25, stars 12, sun below the range (glow only).
- **sunrise:** sky `[[0,.42,.07,278],[.55,.52,.09,312],[.80,.74,.09,20],[1,.90,.07,66]]`. Everything else is the mock's `dawn`.

**Hours along the film.** `hourAt(s)` is piecewise linear through these (s, hour) pairs:

(0, 5.33) (9, 6.17) (11, 8.0) (15, 11.0) (21, 14.5) (26.5, 16.5) (28.5, 17.5) (37, 19.5) (39.5, 21) (45, 22.5) — round 3: the same hours at the same segment starts of the slower film (c1 12.4, journey 15.6, catch 20.4, reply 29.5, c2 39.1, bridge 42.3, c3 54.7, yours 58.1, end 67.3)

**Palette keyframes by hour:** 5.33 blueHour, 6.17 sunrise, 8.0 day, 14.0 day, 16.5 golden, 17.5 dusk, 19.5 evening, 21.0 night. `paletteAt(h, {dim})` interpolates neighbouring keyframes with `mixLch` (the short way round the hue) and returns the CSS variables:
- `--film-sky-0…3`
- `--film-c-{range,peaks,sea,headland,town,hills,near,bridge,ground,shade,rim,window,accent}`
- `--film-win-0…4`, `--film-stars`
- `--film-chrome-ink` and `--film-chrome-ink-soft`

**Softer than the mock (round 3).** The owner: the scenery behind the puppets and the cards a little paler and greyer, so it doesn't catch the eye. Each time carries `soft: [k, lift]` and `softened(T)` paints from it: every colour keeps k of its chroma (warm lights — the lanterns' glow, the lit windows — 1 − 0.6·(1 − k)), the ink moves `lift` of the way to the haze (so every layer between is pulled that much toward the far air and the depth order holds), the sky's low stop and the disc's halo half that toward the horizon's glow; the sky's upper stops keep their lightness (the chrome's ink, the cream hero) and the sea keeps its (the darkest band under the sky that c2 keeps). blueHour [.78, .07], sunrise [.72, .12], day and golden [.68, .15], sunset [.68, .13], dusk [.7, .11], evening [.8, .05], night [.88, 0]. The puppets' and the cards' colours never change.

**`?depth=blur` (lab flag, round 3):** the owner's comparison, the farther the blurrier — a static CSS blur per far plane by its depth (`(0.74 − d) × 4.5 px`: the range ~3 px … the hills a hair; the near flats, the bridge and the ground none), the disc 1.2 px and the clouds 1.6 px; the stars never (they twinkle, a repaint every frame: blurred, WebKit fell from 59 to ~40 fps). Measured on ▶ through c1 (s 7 → 14, an M5 Mac): Chromium 60 fps with and without; WebKit 59–60 desktop and 58–59 phone-sized, with and without.

**Chrome ink.** The header, the pen ≋ and the ripples use whichever of cream `oklch(97% .015 85)` and graphite `oklch(25% .03 280)` contrasts more with `--film-sky-0`.

**Updates.** The director recomputes the variables only when `floor(hour × 12)` changes. The server writes the variables for s = 0 into a `<style>` block, and again for each plate's hour.

**Contrast rules** (§12 checks them):
- the four pale puppets stand only on the ground or the near hill;
- 悄悄 appears only from dusk, self-lit (its paper ×1.25, plus `pose.glow`);
- 點點 riding the chip gets a 1 px graphite contour (four `drop-shadow(±1px 0 0 graphite)` on its root, only while it is off the ground).

### 3.5 The dark scheme

The film keeps its own hours. Under the site's dark scheme (`prefers-color-scheme: dark` without `[data-scheme=light]`, or `[data-scheme=dark]`), `paletteAt(…, {dim:true})`:
- multiplies the sky and every layer's L by 0.92, and the sky's C by 0.9;
- sets the night sky top to L 0.145.

Puppets, windows, stars, lanterns and chips stay as they are. The lip, the call-to-action panel, the end section's text and the footer follow the site's tokens.

## 4. Scene changes (`film/script/parallax.ts`; the tech research's math, verbatim)

The change position `p` runs 0 → 1 across a change segment. Old and new planes are both mounted only during a change.

```ts
const sCut = 0.35, m = 0.06;
const win = (d: number) => 0.35 + 0.35 * (1 - d) / (1 - sCut);
const outFlat = (d: number, p: number) => -(1 + m) * eIn(c(p / win(d)));                       // ×stageH
const inFlat  = (d: number, p: number) =>  (1 + m) * (1 - eOut(c((p - 1 + win(d)) / win(d))));
// seam lock: the new back flat never shows sky under the old ground
const inBack  = (p: number) => Math.min(inFlat(dBack, p), oldBackBottom + outFlat(dBackOld, p) - newBackTop);
// planes with depth < 0.35 are backdrop: outY -0.5·d·smooth(p), inY 0.5·d·(1-smooth(p)), inAlpha smooth((p-.25)/.5)
```

- **Paint order:** new flats are always painted in front of old ones.
- **The sky** does not fly. It is recoloured by `hourAt(s)`, so there is never grey mud between keyframes.
- **The disc** follows its own arc (§5.4).
- **Held elements** (card A with 點點; the pair; the lanterns) keep their screen place and lift by `0.06 × stageH × bell(p)`.
- **Puppets ride their planes,** because they are children of the plane element.
- **The hero block flies like a plane of depth 0.6.**
- **`?fly=1` (lab flag):** two graphite threads go up from each moving flat to the stage top, opacity proportional to |dy/dt|. These are the theatre's fly lines, for owner decision 5.

## 5. The script

### 5.1 Segments (`film/script/timeline.ts`)

Lengths are in svh. "Y start" is where the segment starts on the track.

| # | id | kind | film s | svh | y start | scene |
|---|---|---|---|---|---|---|
| 1 | `write` | act | 0.0–6.5 | 25 | 0 | 1 寫下 `#write` |
| 2 | `wind` | travel | 6.5–9.0 | 40 | 25 | |
| 3 | `c1` | change | 9.0–11.0 | 70 | 65 | |
| 4 | `journey` | travel | 11.0–15.0 | 70 | 135 | 2 回應 `#answer` |
| 5 | `catch` | act | 15.0–17.5 | 30 | 205 | |
| 6 | `read` | act | 17.5–21.0 | 35 | 235 | |
| 7 | `reply` | act | 21.0–26.5 | 40 | 270 | |
| 8 | `c2` | change | 26.5–28.5 | 70 | 310 | |
| 9 | `bridge` | travel | 28.5–30.5 | 35 | 380 | 3 相遇 `#meet` |
| 10 | `meet` | act | 30.5–37.0 | 45 | 415 | |
| 11 | `c3` | change | 37.0–39.5 | 70 | 460 | |
| 12 | `yours` | act | 39.5–45.0 | 45 | 530 | 4 換你 `#yours` |
| 13 | `rest` | hold | 45.0 | 40 | 575 | end 615 |

**Round 3 (the owner: 「現在的動畫普遍都有一個太快的問題…全部都慢一點…也包括這個轉場動畫…卡片在移動什麼那種，那種不要變慢好了…這影片可能還是要有一點點留白」).** The film is 67.3 s along 805 svh: the acting about 1.4× slower, each act ending in a quiet moment of idle life, the changes 3.2–3.4 s over 100 svh each, the travels a little slower; the cards' own flights (the wind, the catch, the rise to the pair, the night's sky cards) keep their pace. ▶ also holds 1.5 s at the end of `meet` (`drive.ts` `HOLDS`). The hours keep their places in their scenes (`palette.ts` `HOURS` is tied to the segments), and so do the disc's dusk and the picture book's plates.

| # | id | kind | film s | svh | y start | scene |
|---|---|---|---|---|---|---|
| 1 | `write` | act | 0.0–9.4 | 35 | 0 | 1 寫下 `#write` |
| 2 | `wind` | travel | 9.4–12.4 | 45 | 35 | |
| 3 | `c1` | change | 12.4–15.6 | 100 | 80 | |
| 4 | `journey` | travel | 15.6–20.4 | 80 | 180 | 2 回應 `#answer` |
| 5 | `catch` | act | 20.4–24.2 | 40 | 260 | |
| 6 | `read` | act | 24.2–29.5 | 45 | 300 | |
| 7 | `reply` | act | 29.5–39.1 | 55 | 345 | |
| 8 | `c2` | change | 39.1–42.3 | 100 | 400 | |
| 9 | `bridge` | travel | 42.3–44.9 | 45 | 500 | 3 相遇 `#meet` |
| 10 | `meet` | act | 44.9–54.7 | 60 | 545 | |
| 11 | `c3` | change | 54.7–58.1 | 100 | 605 | |
| 12 | `yours` | act | 58.1–67.3 | 60 | 705 | 4 換你 `#yours` |
| 13 | `rest` | hold | 67.3 | 40 | 765 | end 805 |

### 5.2 Actors and props

**Actors.** Each actor is a `StickerPuppet` from `film/kit/puppet.ts`, which is a copy of `designs/stickers/kit/puppet.ts` with its imports changed to `@/lib/mascots/*`. It is built from the `MASCOT_CAST` entry's `manifest` and `base` (`/mascots/<slug>/`).

**Write helpers** (`film/kit/write.ts`): port `writePose`, `writingAt`, `penLiftFor`, `gripFor` and `mittenAt` from `src/lib/mascots/acts.ts`, with `ch.arm(side)` → `ch.rig.arms[side]`. Import `PAPER_LINES`, `PENCIL_TIP` and `PENCIL_LEN` from `@/lib/mascots/props`.

**Walking** (`film/kit/walk.ts`, new):
- `walkAt(p, t, keys)`: x from eased keys; `phase = (x − x0) / stride × π`; the body of `walkPose` copied from `motion.ts`, with gait swing 24, arm 10, stride `max(44, legLen·1.05)`, and amplitude from the distance travelled and left.
- On the bridge, `y = pathY(walkway, x)`.

**Props** (`film/kit/props.ts`, new, inline SVG, no filters):

| prop | what it is |
|---|---|
| `slip` | the engine's `paper` drawing, fill its owner's paper (摺摺 `oklch(80% .045 140)`, 聆聆 `oklch(84% .045 290)`), graphite lines revealed by dash offset through `write(u)` |
| `pencil` | the engine's drawing |
| `ripple` | one wavy arc, stroke `--film-chrome-ink` at INK_STRONG |
| `blank` | a cream card, 40×28 units, with a dashed graphite outline |
| `lantern` | as in §3.3 |

Every prop has `at(x, y, {k, rot, anchor, alpha, sx})`.

**Turnover** (`film/script/turnover.ts`). For u in 0…1:
- the slip's rectangle lerps from the mitten's rectangle to the target DOM rectangle along a quadratic Bézier whose control point sits 120 px above the midpoint;
- the slip's `scaleX = cos(π·u)` until u = 0.5, where it is edge-on and the DOM element replaces it;
- the DOM element's `scaleX = −cos(π·u)` after that.

The slip's aspect morphs to the target's while it is edge-on.

**Round 3: the writing and the toss** (the owner: 「那張卡片和現在角色的這個設計就不搭…他的筆首先沒有接在手上，然後他的這個相對的位置也不太對」, 「或許有點像它拋向空中，然後卡片慢慢的那一張慢慢的變大」). The turnover is gone (`turnover.ts` deleted).
- **The slip** (`kit/props.ts`) is a tiny portrait card (30 × 44 units, the story card's shape) of the paper it will become: its slot's card family (`CardSlot.family`, read from the StoryCard's `--card-interior`) — the interior inside a wobbly outline at INK_LIGHT in the family's pen, a striped cover block, a title line (INK, the family's deep ink) and two story lines (INK_LIGHT, its pen), written in by dash offset; never black. 牽牽's `blank` is the same card in the call to action's family, its lines pencilled guides. The flecks are gone.
- **Held** (`kit/write.ts`): the slip by its edge in one mitten, in front of the body below the face (eyes and mouth wholly clear), at the chest, a little to the holding side; the pencil in the other mitten, closed over it a third of the way from its cap (sliding a little if it must), its point on the line being written — a paper arm has no elbow, so along a line the pencil's slant swings as a wrist would. `writePose` finds the hold once per character by search. Both are drawn inside the live puppet's body (`StickerPuppet.handLayer()`: over the torso and face, under the arms), so the mittens close over them and they move and breathe with the body; a ghost puts them on the stage.
- **聆聆's answer:** its paper arms are too short for its wide body (their mittens never meet in front of it), so 點點 holds the slip up beside it with its left mitten (`Holder`), and 聆聆 writes with its right; 點點 tosses it.
- **The toss** (`beats.ts` `Toss`): lifted with a little crouch, let go as the arm swings up, the paper rises in a soft arc over the head toward the card's place, slowing to the top (growing ×1.7 on the way), hangs a moment drifting; then the card appears at the paper's size and place, the two crossfading (0.4 s), and slowly grows into its spot (1.4–1.6 s, from rest into a long settle, drifting a little), a tissue halo blooming behind it. Every eye follows the paper and the card. No turn, no squash: the director's turn (`ry`, `TURN_PERSPECTIVE`, the `--ink` fade) is gone too. The growing card moves across a little ahead of up (on a landscape tablet it rises beside the hero's words, not through them).

### 5.3 Beats

A is act time (seconds from the act's start); v is the travel progress `span(s, t0, t1)`. Marks are world x on the ground plane unless noted. The wide and tall values are given as `wide / tall`.

**1 `write`** (blue hour). Cameras: wide 1000 / tall 700. 摺摺 at 630, 點點 at 760.
- 摺摺:
  - A 0.3–0.5: the slip fades in, in its right mitten (`writePose(hold 'R', pen 'L')`).
  - A 0.5–3.9: writes (`ink = span(A, .5, 3.9)`, face down and toward the slip, the pencil following `writingAt`).
  - A 3.9–4.3: the pencil fades and 摺摺 smiles (`mouth-open`, blush .5).
  - A 4.3–4.9: raises the slip toward the chip spot (`aim` plus `reachTo`) and `lookAt`s it.
  - A 4.9–5.7: the slip flies; turnover `u = span(A, 5.1, 5.7)`, edge-on at 5.4, **real chip A** face-on.
  - A 5.7–6.5: `wave('L', A, 5.7, 6.5, 2)`.
- 點點:
  - A 0–4.3: `lookAt` 摺摺's slip, one `nod` (A 2.0–2.6).
  - A 4.9–5.7: `lookAt` the flight.
  - A 5.8–6.4: `hop` (height 24), eyes shut at 6.0–6.2.
- The chip spot is `(0.62w, 0.26svh)` / `(centre, worldTop + 0.12·(groundY − worldTop))`, where worldTop = the hero bottom + 16 px.

**2 `wind`.**
- The wind ribbons enter from the left from v 0, reaching the chip by v 0.4.
- The chip flutters: rotation `4·sin(3π·v)·(1 − v)` degrees, and it lifts 12 px.
- 點點 hops onto the chip (v 0.35–0.65). At the apex (v 0.5) it moves to the carrier layer and lands sitting (stance `sit`) on the chip's top edge, at its right third, contour on.
- 摺摺 `lookAt`s the chip.
- The sun reaches `0.84·hz` by v 1.

**3 `c1`.**
- The `home` planes fly up; the `journey` planes rise.
- The hero block flies as a plane of depth 0.6. At p = 1 it gets `data-gone`: the h1 and subtitle become visually hidden (they stay in the accessibility tree), and the badges become `inert`.
- Chip A and 點點 hold their place on screen.

**4 `journey`.**
- The camera runs from 1000 to `3370 − 0.12·view`, with `smooth(v)`. A plane's dx is `−(cam − cam0)·d·u`.
- The carrier spot is `(0.56w, 0.24svh)` / `(centre, 0.24svh)`. It bobs `8·sin(2π·s/1.6)` px and tilts `3·sin(2π·s/2.2)` degrees.
- 點點 throws its arms up (lifts 150 × `bell(v, .2, .5)`).
- Birds cross from right to left, v 0.2–0.8.
- 聆聆 stands at 3370 (tile 2), with the lone tree at 3600.

**5 `catch`.**
- A 0–1.6: chip A arcs from the carrier to the point between 聆聆's mittens (both arms `aim` at it from A 1.0); its scale goes 1 → 0.62.
- A 0.9–1.5: 點點 hops off, to 聆聆 + 110.
- A 1.6: the catch: `sy × 0.96` for 0.15 s.
- A 1.6–2.5: the chip is held at the chest, front facing us.

**6 `read`.**
- 聆聆: `faceY +6`, `faceX = −6 + 12·((A·0.5) % 1)`; `nod` at A 1.0–1.6 and 1.8–2.4; then `moved(bell(A, 2.4, 3.5))`.
- Three `ripple`s rise from `headPoint()` at A 1.2, 1.8 and 2.4. Each rises 40 px and fades over 1.2 s, about 0.9 × the torso's width.
- 點點 `lookAt`s 聆聆, then hops (A 3.0–3.5).
- **Never a heart.**

**7 `reply`.**
- A 0–0.8: 聆聆 raises chip A, which flies to **pair spot A** (scale 0.62 → 1).
  - Wide: A at `(0.5w − 336, 0.14svh)`, B at `(0.5w + 36, 0.14svh)`.
  - Tall: A at `((w − 288)/2, 104)`, B at `((w − 288)/2, 248)` on a phone. On a tablet the y values are 112 and 264.
- A 0.9–1.2: the lavender slip appears.
- A 1.2–3.8: 聆聆 writes.
- A 3.8–4.3: lifts the slip toward B.
- A 4.3–5.0: flight; turnover `span(A, 4.4, 5.0)` → **B**: the `DrawnCard`, or the real chip when the relation is `resonance` (or with `?b=kin`).
- A 5.0–5.5: the pen ≋ draws between A and B (`PairWave`: three `wavyLine`s 64 px long, 8 px apart, INK_STRONG, `pathLength=1`, dash offset 1 → 0). It is horizontal on wide layouts and turned 90° on tall. 點點 hops.

**8 `c2`.** The `journey` planes fly; `valley` rises. The pair and the ≋ hold. 聆聆 and 點點 leave with their ground.

**9 `bridge`.**
- The bridge plane rises: `y = (1 − smooth(v))·0.7·stageH`.
- The pen ≋ glides toward the screen point of the apex while scaling ×3, with opacity `1 − smooth((v − .3)/.5)`.
- The chips go to the top:
  - wide: scale 0.8, A at `(0.5w − 312, 96)`, B at `(0.5w + 12, 96)`;
  - tall: scale 0.62, A at `(12, 96)`, B at `(w − 12 − 179, 96)`.
- Valley cameras: 1000 / 1000.

**10 `meet`.**
- 摺摺 walks from 520 to 960 (A 0.2–3.2); 聆聆 from 1480 to 1040 (A 0.5–3.5).
- 點點 hops twice behind 聆聆 to 1440 (A 0.6–2.2).
- A 3.5–4.0: they `lookAt` each other.
- Both `bow(4.0, 4.5, 5.0, 5.5)`.
- They wave at us: 摺摺 with its L arm at A 5.6–6.5, 聆聆 with its R arm at A 5.7–6.5.
- 悄悄, at 1600 on the right bank: eyes `sleepy` until A 4.6, then open, with `glow` going 0 → 1 over A 4.6–5.6. On a phone 悄悄 is out of view; leave it so.
- Fireflies come in from 19:00.

**11 `c3`.**
- Nine lanterns rise from the town line (staggered over p 0–0.6) to their sky slots by p = 1. On tall layouts the slots are in the upper 30 % and avoid the panel.
- The pair fades out over p 0.2–0.6.
- The `home` planes rise in the night palette, with all five already standing on the ground plane:
  - wide: 牽牽 760, 摺摺 880, 點點 1000, 聆聆 1120, 悄悄 1250;
  - tall: 850, 925, 1000, 1075, 1150.
  - Night cameras: 1000 / 1000.

**12 `yours`.**
- A 0–1.5: the lanterns sway.
  - Wide only: four lanterns turn into **sky chips** at A 0.5–1.5 (the lantern's glow 1 → 0, the chip's scale 0.3 → 1).
  - Slots, as fractions of the stage: (0.05, 0.18), (0.12, 0.44), (0.76, 0.34), (0.80, 0.58). The moon is at (0.86w, 0.14svh).
- A 1.5–3.0: 牽牽 walks 30 units in; a `blank` appears in its mitten; from A 2.4 it aims toward the panel.
- A 3.1–4.0: turnover into the **call-to-action panel**:
  - wide: centred at `(0.5w, 0.36svh)`, 460 wide;
  - tall: centred, top `0.14svh`, `min(340px, 100vw − 32px)` wide;
  - the moon on tall layouts is at `(0.80w, 0.86·hz)`.
- A 4.0–5.5: the five wave in turn, starting at A 4.0 and 0.25 s apart: 點點 hops instead, 悄悄 pulses its `glow`.

**13 `rest`.** Idle life only. The stage then releases (§8).

**Round 3 beats (act seconds; `W1`, `CATCH`, `READ_SLOW`, `R1`, `MEET_SLOW`, `Y1` in `beats.ts`).**
- `write` (9.4): the slip comes up 0.15–0.5; the pencil 0.45–0.8; writing 0.75–3.6 (a nod per line); pencil away 3.6–3.95, a glad look at it; the toss: lift 4.3, release 4.85, top 5.85, the card from 6.15, grown 7.75; 摺摺 waves 7.2–8.15, 點點 hops 7.55–8.15; idle to 9.4 (and ▶'s 1.5 s).
- `catch` (3.8): the card's flight 0–1.6 as before; what follows acted 1.4× slower; idle from about 2.9.
- `read` (5.3): round 2's reading acted 1.35× slower (to 4.7), then idle.
- `reply` (9.6): A up 0–0.9; 點點 lifts the slip 0.95–1.35; 聆聆's pencil 1.3–1.7, writing 1.7–4.6, away 4.6–4.95; 點點's toss: lift 5.3, release 5.85, top 6.8, B from 7.1, grown 8.6; the ≋ 8.45–9.05 (點點 hops); idle to 9.6.
- `meet` (9.8): round 2's meeting (6.5 s) acted 1.4× slower (to 9.1), then idle.
- `yours` (9.2): lanterns up and everyone looks up 0–0.85 (wide: the sky cards at 0.5 + 0.12·i over 1 s each, as before); a quiet moment; 牽牽 walks in 3.0–5.0, the blank at its side from 4.55; the toss: lift 5.75, release 6.3, top 7.25, the call to action from 7.5, grown 8.9; the five wave in turn from 7.6, 0.25 apart.

### 5.4 The disc

Positions are fractions of the stage width, and of `hz` for height; radius is in world units × u.

| scene | disc |
|---|---|
| 1 | sun, x 0.74 / 0.78, from 1.03·hz down to 0.84·hz, r 86 |
| 2 | sun from (0.80, 0.30·hz) to (0.22, 0.80·hz), y minus `0.25·hz·sin(π·v)`, r 60 → 104 |
| 3 | sun at x 0.30, setting from 0.86·hz to 1.06·hz (s 28.5–32); moon rising from (0.82, 1.0·hz) to (0.82, 0.45·hz) over s 32–37 |
| 4 | crescent: wide (0.86w, 0.14svh), tall (0.80w, 0.86·hz) |

### 5.5 The DOM overlays (`.ui` layer, screen px)

**Round 3 (the owner): every card is the landing page's own** — 「現在的這些卡片都不是我們原本首頁的卡片的設計…改的和原本首頁的設計是一樣的」. What follows in this section (the chip, the drawn chip, the sky chips, the cream panel) is round 2's and is replaced by:
- **The cards are `molecules/StoryCard`** (FilmCard.tsx `FilmStoryCard`), `framed` (the hand-drawn card at every width: no phone band over the stage) and with a `stillGrain` (the stage's bitmap grain tile, cut to the outline: no feTurbulence on a card that moves every frame), each in the family the film's list gave it (`palette`), tags (≤ 3 over the stage), the title and the excerpt clamped to two lines over the stage (one for the sky's), the byline in the film's words (「5 分鐘」).
- **story and a are the same card** at the same width (320 wide; tall min(300, 100 % − 48); an upright tablet 340), so the hand-over is unseen: the wind no longer folds it — it eases from where it popped to where 點點 can sit on its top edge (`boardSpot`), flutters, and rides the journey at about 0.3 of the screen's height (`carrierSpot`).
- **B is the nearest real card** (relation `kin`, data.ts) unless a real resonance exists; `?b=drawn` shows 聆聆's drawing (DrawnCard, now in the story card's shape). Its cover is fetched a scene ahead (`data-covers` on its slot; FilmStoryCard waits for it).
- **The pair** (reply, c2) and **the pair up top** (bridge, meet, c3) are side by side at every width, the ≋ between them, under the header: `pairSpots` / `topSpots` (wide 0.8 / 0.52, a phone ≤ 0.62, an upright tablet ≤ 0.85).
- **The night:** three small sky cards (wide only, `SKY_CARDS`): two staggered left of the call to action, one right of it under the moon; the call to action is **CtaCard** — a StoryCard (preview) of the story not written yet: the striped cover with a pen, 「下一個故事，由你來寫」, one line 「把你的一段人生，寫成一張卡片」 and, in place of a byline (StoryCard `foot`), its one action 寫下你的故事. No badges in it.
- On a short tall screen (< 700 px) the written card and its answer show no cover over the stage.

**`FilmCard`, the real chip** (a `Link` to `href`):
- 300 wide on wide layouts, 288 on tall; about 96 tall.
- Its paper is the copied `Paper` (`cardVar('interior', family)`, pen `cardVar('border', family)`, INK, radius 16).
- Cover 72×72 at radius 12, or none (never a grey box).
- Title at 16/1.3, weight 600, two lines, in its `lang`.
- Byline: avatar 18, then pen name · 「N 分鐘」 / "N min".
- It is laid out at full size and only ever scaled down. `will-change: transform`.
- It is `inert` and `visibility: hidden` outside its live range; both switch only when the range edge is crossed.

**`DrawnCard`:**
- the same box in 聆聆's lavender `oklch(90% .035 290)`, pen `oklch(40% .03 290)`;
- the cover area holds three graphite scribble lines, the title area two `wavyLine`s (70 % and 45 %), the byline a dot and one short line;
- `aria-hidden`, never focusable.

**Sky mini chips** (wide only): 220×56 links, cover 40, the title on one line.

**`CtaPanel`:**
- a `Paper` in `var(--color-cream)`, pen `var(--color-text)`;
- the line 「下一個故事，由你來寫」 / "The next story is yours to write" as a styled `<p>`, not a heading (§9);
- `OrganicButton` (primary) 寫下你的故事 inside `<Link href="/write">`;
- `GetTheApp size="sm" qr={false}`;
- a quiet 重看一次 ↺ / "Watch again ↺" button.

## 6. The first screen (server HTML, before any JavaScript)

**Everywhere:**
- the stage at s = 0: the blue-hour sky, the `home` planes from the inline symbols, the sun's glow below the range, the grain;
- `PaperPalStill` for 摺摺 and 點點 at their marks, sized by `--unit: var(--pal)`;
- the hero block;
- the lip in its intro state;
- chip A is in the HTML but hidden.

**The header** is `FilmHeader`, a copy of `SiteHeader`:
- over the stage it is transparent (no band, no wave), with its ink set to `var(--film-chrome-ink)`;
- once the stage has released it shows a night band in `--film-night-ground` with a cream wave at INK_LIGHT;
- in book mode it is `position: absolute` and scrolls away.

**The hero:**
- the h1 in cream: zh 「用故事」 then 「回應故事」, with 回應 in `Emphasis` (colour `oklch(84% .10 62)`, `strokeWidth={INK_STRONG}`); en "Answer stories with stories", with "Answer" accented;
- the one supporting line, cream at 92 %: 「讀到觸動你的故事，不必按讚——寫一張自己的卡片回應它」 / "When a story moves you, skip the like — answer it with a card of your own";
- no store badges (round 3, the owner: the first screen is crowded enough — they wait at the page's end, `#download`). On a phone the block's top is 108 and on an upright tablet 144 (the words a little lower without the badges); a wide screen keeps its place.

| size | hero block | world, puppets | chip spot (born at 5.4 s) |
|---|---|---|---|
| 390×844 | left 20, top 96. h1 44/1.12 on two lines (en 38). Sub 16/1.55, max 340 px (en 15/1.5). Badges 40. Bottom ≤ 324. | ground y 764, 摺摺 88 px | x centred, y ≈ 405 |
| 820×1180 | left 40, top 120. h1 72 on one line (en may take two lines at 60). Sub 18, max 560. Badges 44. Bottom ≤ 414. | ground y 1092, 摺摺 112 | centred, about 0.12 into the world band |
| 1180×820 | left max(40px, 7.8vw), top clamp(104px, 16svh, 156px). h1 clamp(56px, 8.4svh, 80px) on one line. Sub 19, max 540. Badges 44. Bottom ≤ 42svh − 16. | 摺摺 120 | (0.62w, 0.26svh) |
| 1440×900 | the same rules. h1 76. | 摺摺 132 | x 893…1193, y 234 |
| 1366×768 | the same rules. h1 64. | 摺摺 113 | x 847…1147 |

**The lip in its intro state** (until the first scroll, or until ▶): ▶ 「看小紙團演一遍」 / "Watch the film", then the progress line (round 3: no 「直接看故事 ↓」, no ☾).

The largest contentful paint (LCP) is the h1.

## 7. Control (`film/runtime/clock.ts`, `drive.ts`, `film/Player.tsx`)

### 7.1 The scenery clock

- **y** is the scroll offset inside `.film`.
- **sTarget** comes from y through the segment table. The svh unit is measured from a `100svh` probe at mount and on resize.
- **s** follows sTarget with a time constant of 50 ms; while ▶ is driving, s equals sTarget.
- **Driven by s:** planes, camera, sky, disc, particles, travel actors and held elements, at the display's frame rate.

### 7.2 The act clocks

Each act a keeps its own act time A:

```ts
const floor = span(s, a.t0, a.t1) * a.dur;
if (resting) A = floor;                                   // pure scrub: no automatic motion
else if (s >= a.t0) A = Math.min(a.dur, Math.max(A + dt, floor)); // plays at 1×, never behind the scroll
else A = Math.max(0, A - 3 * dt);                         // scrolled back above it: rewinds at 3×
```

- **Owner rule.** An actor is posed by the latest segment k such that either k is travel, change or hold with s ≥ k.t0, or k is an act with s ≥ k.t0 or A_k > 0. A rewinding act therefore keeps its actors until A reaches 0.
- **Continuity by construction.** Each travel segment's pose at its start equals the previous act's pose at A = dur, read as a ghost evaluation of that act's frame.
- **Act 1 needs no special case:** it plays on load because s = 0 ≥ t0.
- **Jumps** (the hash, back navigation, `?t=`) set every A_k to its floor at the target position. (The progress line's press and drag is a scroll of the visitor's own, not a jump.)
- **A hidden tab** freezes dt.

### 7.3 Stop motion

- Puppets are posed on twos: they render only when `floor(A·12)` (or `floor(s·12)` for travel) changes, or when the idle layer steps at 12 fps.
- Walk positions are on twos too.
- Planes and held DOM are smooth: what the hand moves is smooth, what moves on its own is stop motion.
- **Idle layer** (wall clock, off while resting or under reduced motion):
  - breath: `sy *= 1 + 0.012·sin(2.1·now + slot)`;
  - blinks on a lattice: period 4.2 s, jitter `hash(slot, floor(now/4.2))`, eyes shut for 0.13 s, and only when the frame left the eyes `open`.

### 7.4 The lip

- **Placement:** fixed at the bottom while the stage is pinned; height `var(--lip) + env(safe-area-inset-bottom)`.
- **Look:** background `var(--film-c-ground)`, with a `wavyLine` top edge in the same colour; cream ink; every target at least 44 px. It slides away when the stage releases.

**Round 3 (the owner):** only ▶ stays — 「只要留播放就好了…使用者一直往下滑，或是滾動，或是拖曳那個播放進度條，它就可以做到同樣的操作」 — and ☾ goes (resting made no difference while the film plays).

**Phone strip:** [▶/❚❚] [progress].

**Wide and tablet strip:** [▶/❚❚] [progress, with the scene's name at 12 px after it].

**Glyphs** are local to `film/glyphs.tsx`: absolute paths, viewBox 24, INK_STRONG. Play is a filled hand-drawn triangle, pause two rounded bars, replay an open circle with an arrow (▶ once the film is over).

| control | zh-TW | en | behaviour |
|---|---|---|---|
| ▶ / ❚❚ | 播放 / 暫停播放 (intro label 看小紙團演一遍; once the film is over ↺ 重看一次, from the start) — ❚❚ also while an act plays on its own (WCAG 2.2.2, the review after round 3): it holds every act and the puppets' idle life still (`FilmClock.hold`) until ▶, or until a scroll reaches another act | Play / Pause (intro: Watch the film; over: Watch again ↺) | Play-through: writes `scrollTo({top, behavior:'instant'})` (instant matters, because `globals.css` sets smooth scrolling) at `L_px/(t1−t0)` per segment, holding 1.5 s at the end of `write`, of `reply` and of `yours`, and stopping at the stage's end. A wheel, touchstart, scroll key, scrollbar mousedown, or the position drifting more than 3 px from our last write hands control back (browse mode). |
| progress | slider: 「第 {n} 幕，共 4 幕：{寫下 / 回應 / 相遇 / 換你}」 | "Scene {n} of 4: {Write / Answer / Meet / Your turn}" | A pen line with four ticks at the scene starts and a dot in chip A's colour, 44 px tall to the finger. A mouse's press seeks there and its drag scrubs; a finger is a native slider's — a sideways drag (past 8 px, more sideways than up or down) scrubs, a tap seeks where it lifts, and a swipe up or down scrolls the page (`touch-action: pan-y`). Each lands as a jump does — the page at that place on the track (its x fraction × the track, short of the stage letting go), every act at its floor there, playing on once the pointer lifts — and stops ▶. A tap on a tick glides to that scene (a finger's tick is its mark ±8 px); ←/→/Home/End while focused. |
| 重看一次 ↺ | 重看一次 | Watch again | A glide back to 0 in at most 2 s (A follows its floor), then ▶. |
| skip link | 略過動畫，直接看故事 (first in the film's tab order, visible on focus) | Skip the film and go to the stories | Jumps to `#stories`. |

### 7.5 Keys, the URL, and returning

- **Keys:** ←/→ move to the previous or next scene and K toggles ▶, whenever the film is in view and focus is not in a form field. Space, ↓, PageDown and Home keep their native meaning.
- **The hash:** `history.replaceState` writes `#write`, `#answer`, `#meet` or `#yours` when the scene changes. The anchors are the narration items, placed at their scenes' y.
- **Going back:** clicking a chip saves `{y, at}` in sessionStorage `resonance:film-y`. On mount after back/forward navigation, a scroll at 0 with a saved y younger than 30 minutes jumps there.
- **`?rest=1` (lab flag, round 3):** the film rests — every act a pure scrub, no idle life — for exact stills (`tools/shots.mjs --rest`, `tools/changes.mjs`). Nothing a visitor does makes it rest any more, and nothing is stored.
- **`?settle=1` (lab flag, owner decision 3):** after 160 ms of quiet with no finger down, a position inside a change glides to that change's end in the last direction moved (back to its start if the visitor moved less than 24 px).
- **Nothing else** ever moves the page.

## 8. The end state and the rest of the page

**Round 3 (the owner): after the film the page is the site's own** — 「希望它可以保留這個原本的這個配色…使用者怎麼設定就怎麼顯示那個顏色…動畫播完之後向下滾，這邊做一個漸層，就銜接到原本的這個主題色的顏色」. Replacing what follows: the stage's foot (the night's ground, `--film-end-ground` from the night's palette) fades into the theme's paper (`--color-cream-dark`, light or dark as the visitor's scheme says) over about a screen (`.endFade`: through OKLCH in light — a faint dawn violet, then rose — straight through OKLab in dark); then 「今晚的故事」 with CardFeedSection's heading (its pill, title, subtitle) and CardLinkGrid's layout and CSS (`TonightGrid`: StoryCards, bands on a phone, the masonry wider): A ≋ B on a row of their own (a group named 「一個故事，和最接近它的故事」 for the nearest story, 「…回應它的故事」 for a real one), then four more of tonight's stories (six in all, as the landing page lists), 瀏覽所有故事 and the lab's note (`end.labNote(relation)`); `#download` is the landing page's closing band (CTASection's CSS: 換你寫下一個故事, 寫下你的故事 · 重看一次, the QR and the stores); then SiteFooter with its default edge. The header, bare over the stage, is the site header once the stage lets go (its cream band, its soft pen's wave, the text's ink).

The stage releases after `rest`; its last frame is the night with the call-to-action panel. The section `#stories` follows, on `--film-night-ground: oklch(14% .035 266)`, fixed in both schemes, with cream text:

1. **The stories.**
   - h2 「今晚的故事」 / "Tonight's stories".
   - A `<ul>` of the copied oneday `StoryTile` (cover, title, excerpt, byline): A first. When the relation is `resonance`, A and B form a `role="group"` named 「一個故事，和回應它的故事」, with a ≋ between them. Then the sky list, kin first.
   - One column on a phone, two on a tablet, three on desktop (max 1120), tilted ±1° alternately on desktop only.
   - Then 「瀏覽所有故事 →」, linking to `/home`.
2. **The call to action** (`id="download"`):
   - h2 「換你寫下一個故事」 / "Your turn to write one";
   - `OrganicButton` 寫下你的故事 to `/write`;
   - 重看一次 ↺;
   - `GetTheApp qr tone="ink"`.
3. The lab note (§2.6), then `SiteFooter edgeColor="var(--film-night-ground)"`.

(Round 3: no 「直接看故事 ↓」 on the lip, so nothing remembers a seen film.)

## 9. Picture book, reduced motion, Save-Data, no JavaScript, accessibility

**When `.film[data-film]` is the book:**
- in CSS, under `@media (scripting: none)`, `(prefers-reduced-motion: reduce)` (unless `[data-film=film]`) or `(max-height: 500px)`;
- set by JavaScript when Save-Data is on, `deviceMemory < 2`, or the runtime has not reached `ready` within 8 s of hydration.

**In the book:**
- the stage is static, at 100svh, not sticky, with chip A shown at its spot;
- the lip becomes an in-flow row: 「播放動畫」 / "Play the film" (under Save-Data: 「播放動畫（約 0.8 MB）」 / "Play the film (about 0.8 MB)"; hidden when scripting is off) and 「直接看故事 ↓」;
- the narration list becomes the plates.

**The narration** is `<ol class="beats">`, one `<li id>` per scene, each with an h2 and one sentence:
1. 寫下 · 「有人把自己的一段人生，寫成了一張卡片」 / Write · "Someone writes a piece of their life on a card"
2. 回應 · 「讀到它的人，不按讚，寫一張自己的卡片回應」 / Answer · "Whoever it moves skips the like and answers with a card of their own"
3. 相遇 · 「兩張卡片連在一起，兩個人就能開始聊聊」 / Meet · "Two cards linked, and two people can start to talk"
4. 換你 · 「下一個故事，由你來寫」 / Your turn · "The next story is yours to write"

**In film mode** the items are visually hidden (not `display: none`) and positioned at `top: calc(var(--y)·1svh − 100lvh)`.

**In book mode,** items 2–4 each carry a `<figure>`:
- an art box (16:10 on wide, 4:5 on tall) holding one `<svg viewBox>` that `<use>`s that place's symbols, with the plate's hour variables in a scoped `<style>` (light and dim);
- lazy stills (`film/Still.tsx`, a copy of `PaperPalStill` with `loading="lazy"` if the original isn't lazy);
- the chips beside the art: plate 2 has A plus B and the ≋; plate 3 the bridge with 摺摺 and 聆聆 at the apex; plate 4 all five and `CtaPanel`.

The plates' art is `display: none` in film mode.

**Reduced motion with the opt-in** (localStorage `resonance:film-optin`) plays the **calm film**: changes become an opacity crossfade, with no y offsets, no journey pan and no idle layer. This is last in the cut order: if it is cut, the opt-in plays the normal film.

**Accessibility:**
- **One h1.** The h2s are the narration, plus the end section's two.
- **Art:** stage art, stills, `DrawnCard`, particles and the planes are `aria-hidden`.
- **Chips:** only live chips are focusable. If the scroll moves a focused chip out of its range, focus moves to ▶ first.
- **Announcements:** a polite live region announces the scene's name only when ▶, a tick or ←/→ changed it.
- **Hover and focus during play:** hovering or focusing a chip during ▶ returns to browse mode.
- **WCAG 2.2.2:** the end state's motion stops within 5 s, leaving breath and blinks only. (Round 3 removed ☾, which stopped every automatic motion from the first frame; an act still plays on its own for up to 9.8 s once reached (round 3 slowed the acting), so ❚❚ shows whenever one does and holds it — and the puppets' breath and blinks — still. Still open: the intro's first act, while the lip shows 看小紙團演一遍 rather than ❚❚ (K pauses it). A reduced-motion reader gets the picture book.)

## 10. Performance and loading

**What the server HTML holds** (≤ 100 KB gzip in all):
- the hero, the frame-0 stage and every place's symbols (≤ 18 KB gzip);
- the plates, the end section and the footer;
- the s = 0 variables.

**Loading order:**
1. The film runtime (`film/runtime/index.ts`, ≤ 30 KB gzip of our own code, kit copy included), through `import()` in a `useEffect` right after hydration, not on idle.
2. 摺摺's and 點點's parts (already cached from the stills). Then `ready`, the stills hidden and the live puppets shown.
3. 聆聆 on idle, or by s > 4.
4. 牽牽 and 悄悄 by s > 20, or on idle 3 s after `ready`.
5. Covers last: A's with `fetchPriority="low"`, the rest lazy.

**Budgets:**
- the first screen's images ≤ 250 KB;
- the whole film on a phone ≤ 1 MB, covers excluded.

**Per frame:**
- director JavaScript ≤ 4 ms at the 95th percentile on a 390×844 phone with the CPU throttled 4×;
- transform and opacity only, no layout reads inside the loop;
- `contain: strict; overflow: clip` on the stage; `overflow-anchor: none; touch-action: pan-y` on `.film`;
- only the current scene's planes are mounted (and the incoming ones during a change), others `display: none`;
- `will-change` only on mounted planes, live puppets and live overlays;
- no SVG filters, blend modes or shadows on the stage, except the 1 px contour on 點點 while it rides;
- if frames exceed 24 ms for 2 s, drop the particles, then the cloud drift.

## 11. Files

```
src/app/[locale]/lab/landing/film/page.tsx   revalidate 300, robots noindex; setRequestLocale; loadFilm(); <Page model locale>
src/components/lab/landing/film/
  Page.tsx (server) · data.ts · model.ts · tiles.ts · copy.ts (zh-TW/en, no full stops on one-sentence strings) · film.module.css
  FilmHeader.tsx + FilmHeader.module.css (copy of SiteHeader) · Hero.tsx · World.tsx · Film.tsx ('use client': mode, mounts runtime,
  window.__film) · FilmCard.tsx (FilmCard, DrawnCard, SkyChip) · PairWave.tsx · CtaPanel.tsx · Player.tsx · glyphs.tsx · Book.tsx
  End.tsx · StoryTile.tsx · Paper.tsx (copy of oneday's) · Still.tsx (if needed)
  script/ timeline.ts palette.ts world.ts parallax.ts layout.ts marks.ts beats.ts (turnover.ts: gone in round 3)
  kit/ puppet.ts poses.ts timeline.ts (copies of designs/stickers/kit/*, imports rewritten; poses.ts's hold/bowStrokes take
       a {at()} interface) write.ts walk.ts props.ts
  runtime/ index.ts clock.ts drive.ts director.ts actors.ts particles.ts
  *.test.ts (§12)
designs/landing-lab/film/tools/ shots.mjs video.mjs
```

**Reused as they are:**
- `MASCOT_CAST`, `stillOf`, `PaperPalStill`;
- `GetTheApp`, `SiteFooter`, `GrainOverlay`, `Emphasis`, `OrganicButton`;
- `Link` (`@/i18n/navigation`); `wavyLine`, `wobRect`, `INK*`;
- `cardVar`, `cardPalettes`; `storyType`, `plainText`/`excerpt`, `readMinutes`;
- `latestForLanding`, `LANDING_CARD_FIELDS`, `publicBases`, `getAdminDb`;
- `@/lib/mascots/{geometry,motion,rig,props}` (exported items only);
- `wantsStage`/`whenIdle` from `LandingStage`.

**The development handle, `window.__film`** (the lab only): `ready`, `segments()`, `seek(t)`, `play()`, `state()` → `{s, scene, acting, mode, resting}`, and `stats()` → `{frames, p50, p95, long}`.

**Query flags:**
- `?t=` seeks;
- `?film=book|film` forces a mode;
- `?b=kin`, `?settle=1`, `?fly=1` as above.

## 12. Tests and acceptance

**Vitest** (`npx vitest run src/components/lab/landing/film`):
- **timeline:** y ↔ s round trip, contiguous segments, 805 svh in all (round 3; the CSS track the same), each change 100 svh and 3–3.5 s, the scene marks;
- **clock:** the act rules (plays 1×, never behind the floor, rewinds 3×, pure scrub while resting, jumps set the floor) and the owner rule;
- **parallax:** everything at rest at p = 0 and p = 1, the old flats off stage at p = 1, no sky under the ground for any sampled p;
- **palette:** for every layout, at every s while the hero is visible (0–11), cream against the sky colour at the subtitle's bottom fraction is at least 4.5:1, and the h1 at least 3:1. The chrome ink is at least 4.5:1 against `--film-sky-0` at every hour, in light and dim;
- **data:** `JSON.stringify(model)` contains none of `readCount`, `insightScore`, `coreInsight`, `signature`, `story` or `slug`; an anonymous tile's href is `/card/{id}`; `b` is null unless the relation is `resonance`;
- **rendering** (jsdom, `renderWithIntl`): one h1, four narration h2s, chips are links with the right hrefs and are `inert` when hidden, the lip keeps ▶ and the progress line only.

**Static checks:**
- `npx tsc --noEmit -p . 2>&1 | grep -E "lab/landing/film|stickers/kit"` prints nothing;
- `npx eslint src/components/lab/landing/film` is clean.

**Screens** (`tools/shots.mjs`, Playwright from `/Users/ncchen/Documents/Resonance-landing/node_modules/playwright/index.mjs`):
- **Sizes:** 390×844 (DPR 3, mobile), 820×1180, 1180×820, 1440×900, 1366×768.
- **Times:** t = 0 (after `ready`), 3, 7, 13, 19, 26.5, 34, 45, then the end section and the footer.
- **Both locales** at every size.
- **Dark** at 390 and 1440 for t = 0, 19 and 45.
- **Reduced motion** (`reducedMotion: 'reduce'`) at 390 and 1440.
- **JavaScript off** at 390.
- **Save-Data** through an init script that defines `navigator.connection = {saveData: true}`.
- **844×390** (must be the book).
- **WebKit:** if Playwright's WebKit is installed, one 390 shot at t = 0 and one mid-`c1`; otherwise note that WebKit is untested.

**Look at every shot.** On the first screen, at all five sizes and in both locales:
- the h1, the subtitle and both badges sit fully above the lip and above the world's top;
- 摺摺 (and 點點) stand whole on the ground;
- no text lies over the planes;
- chips, the panel, the moon and sky chips never overlap;
- there is no horizontal scroll at 320 or 390.

**Behaviour:**
- 0 console errors;
- ▶ hands back control on a wheel and on a touch;
- the progress line's press and drag (mouse and touch) and 重看一次 work; ←/→ and K work; Space pages;
- the tab order starts with the skip link, and focus never lands on a hidden chip;
- back from chip A's card page lands in the same scene;
- `?b=kin` shows the banner.

**Performance:** at 390×844 with 4× CPU throttling (CDP `Emulation.setCPUThrottlingRate`), a scripted scroll of the whole film gives `stats().p95` ≤ 4 ms and no long task over 50 ms after `ready`.

**Privacy:** the page HTML (`curl`) contains none of the §12 data strings.

**Demo videos** (`tools/video.mjs <url> <outDir> --sizes desktop,phone --mode scroll|play`):
- **Contexts:** desktop 1440×900 at DPR 1; phone 390×844 at DPR 2 with `isMobile` and `hasTouch`; `recordVideo` at the viewport size. Wait for `__film.ready`.
- **`scroll` mode:**
  - let the prologue play (7 s);
  - then, segment by segment from `__film.segments()`, scroll its length at a pace that makes travel and change segments last about 1.1× their film time;
    - desktop: `page.mouse.wheel` steps of 40–90 px every 16–24 ms (seeded random);
    - phone: CDP `Input.synthesizeScrollGesture` (`gestureSourceType: 'touch'`, speed 900) in flicks of 300–400 px, waiting for 120 ms of quiet;
  - at each act, wait until `state().acting === false`, plus 0.8 s;
  - then scroll the end section at 600 px/s to the footer and hold 2 s.
- **`play` mode:** click ▶ and wait until the mode is `browse` at the end (at most 70 s), plus 2 s.
- **Encoding:** `ffmpeg -c:v libx264 -pix_fmt yuv420p -crf 23 -preset medium -movflags +faststart -an`.
- **Output:** `film-{desktop,phone}-{scroll,play}.mp4` in `/private/tmp/claude-501/-Users-ncchen--claude-spares-spare-pZgTcm/84b65950-01bf-4833-b134-c3a6994644eb/scratchpad/film/build/media/`.
- **Stills** go to `…/scratchpad/film/build/shots/`.

## 13. Cut order and the owner's open decisions

**Cut from the top when time runs short:**
1. the calm film for reduced motion
2. fireflies and birds
3. dragging the progress line
4. the `?settle` and `?fly` flags
5. the sky chips on wide layouts
6. 悄悄 waking (a still instead)
7. the ≋ morphing into the bridge (it just fades)
8. tablet tuning
9. the `meet` walk (they start at the apex and bow)

**Never cut:**
- write → turnover → the real chip A;
- the journey with 點點 riding;
- catch, read and reply with the ripples;
- the parallax of `c1` and `c2`;
- ▶ and the progress line;
- the book mode;
- the end section and footer;
- the data rule;
- phone and desktop.

**Defaults built, for the owner to change** (only 1, 3 and 5 have a preview flag):
1. The kin card as 聆聆's answer: default drawn, preview with `?b=kin`. A third way is for the owner to write one real resonance, which the tier-1 path then shows.
2. Length: four scenes, about 45 s.
3. Does the page ever move by itself: default no; try `?settle=1` on a phone.
4. Opening: outdoors at the blue hour (no attic built).
5. Fly lines: default seamless; `?fly=1` shows them.
6. /en shows the zh-TW cards unchanged, marked with `lang`.

## 14. After round 3's review (the fix lane)

- **The release, one decision.** `runtime/index.ts` decides `released` (y ≥ TRACK_SVH − 0.5) once and hands it to the director, so the header never keeps the night's inline ink over the site's band; ▶'s last write rounds up onto the track's end. The header becomes the site's band only once the end's fade has turned to paper under its foot (`data-paper`: half-way down `.endFade`), never while the night still fills the screen.
- **The end.** `.endFade` passes through a dawn (violet, then a warm rose, the last steps mixed toward the theme's paper) and its top wears the stage's grain, fading out, so the stage's foot and the fade are one paper (the dark scheme's cream specks had lifted the stage's foot above the fade's first colour). The stories after A ≋ B fill whole rows: three on three columns, four on two or one (TonightGrid `moreFor`); the excerpts are the landing page's (96 characters); the model carries at most five sky stories.
- **The picture book** stands on the theme's paper: the stage (its first plate) keeps its hour and its ground fades into the paper under the 播放動畫 row; each plate keeps its own hour inside its frame; the ≋ between a plate's cards is the accent.
- **Cards over the stage** sit above the stage's grain (`.ui` z 11, the carrier z 12); StoryCard's still grain is ShapeGrain's grey (oklch 80 %), so a stage card's paper measures as the feed card's.
- **The toss.** The card is held exactly on the paper (centre, width, turn) while the two crossfade (`FADE` 0.3 s), and grows only after. The night's bloom is gone by the act's end.
- **The writing.** A writing arm is kept in front of its body (`StickerPose.keepL/keepR`, set by `writeArms`): near its rest it had slipped behind the body, under the slip, leaving the pencil in no hand. The pencil comes into the mitten as the arm starts up (0.15 s) and goes over 0.3 s as the writing ends, while the mitten is still up (the arm comes down 0.15 s later).
- **The ≋ becomes the bridge** (`BRIDGE_IN`): it glides to where the apex comes to rest (scale ≤ 1.4, its pen kept at the pair's weight through `--pen`), lands as the bridge starts to fade up under it (rising its last 0.07 lvh), and stretches out along the ribbons as it goes. The read's and the meet's ripples are the same ≋ glyph, drawn in, rising and fading.
- **Pace.** The card's ease down in the wind keeps round 2's 0.75 s (v 0.05–0.30). On a tall screen the night's wait has a small beat: the four turn to a neighbour and back while the lanterns rise (`Y1.glance`).
- **Performance.** The writers' poses (kit/write.ts `writePose`: its search, made twice as fast with the same results, still about 0.2 s in WebKit for the reply's) are made ahead of their acts at a still moment once the opening has played — nothing acting, the scenery at rest or ▶ holding its breath (`Director.warmPoses`). Through a scene change the planes' paper steps four times an hour instead of twelve (the hour runs fastest there and the planes fly; at rest a quarter's step would show). The depth blur drops itself on a device the safety net finds slow (`data-lowfx`). The night's call to action's button wears no live grain filter.
- **The lab.** The depth-blur comparison is listed in the lab's index (`D′ · 遠景模糊對照`, `?depth=blur`).

