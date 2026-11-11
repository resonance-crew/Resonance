No newer owner message reached me during this task, so this covers only the brief, LEAD.md, the two earlier prototypes (`answer`, `oneday`), their reviews and the installed packages. I measured GSAP 3.15.1 and our own modules by bundling them with esbuild (`--minify`, ESM) and gzipping them (`gzip -9`).

# Landing film: how it is controlled, and how it is built

## 0. The recommendation in brief

1. **Control: the lead's hybrid (c), with four changes.**
   - When the page loads it never scrolls itself.
   - A scene change always finishes in the direction the visitor last moved.
   - Acting plays itself only when the visitor was moving forward.
   - Space keeps its normal page-down meaning.
2. **The stage is pinned with CSS `position: sticky`, not with ScrollTrigger's pin.** Everything on the stage is drawn by one pure function, `filmFrame(t)`, in the same style as the sticker kit. A small clock of our own (about 3 KB) turns the scroll position into t.
3. **No GSAP on the critical path.** GSAP core plus ScrollTrigger is 45 KB gzipped. We would use it to read one number, and its pin and snap features don't match the behaviour we want.
4. **The HTML is the picture book.** The server HTML is the picture-book version of the film. When JavaScript runs, the same frames become the invisible scroll track under the stage. Reduced motion, Save-Data and no-JS visitors keep the book. The first screen looks the same in both modes.

## 1. The control model

| | (a) Scrolling scrubs the whole film | (b) A full-screen player; the page doesn't scroll | (c) Hybrid (recommended) |
|---|---|---|---|
| Trackpad | Very good: precise, and the parallax follows the fingers | Feels broken: the gesture does nothing, or one flick with inertia jumps 2–3 scenes | Very good |
| Mouse wheel | Choppy (each notch jumps 100 px) unless smoothed | The same problem as the trackpad | One notch moves to the next scene; spinning the wheel scrubs |
| Phone swipe | A fling blurs through 3–4 scenes; the acting looks fast-forwarded | Swipes have to be captured, and the page feels frozen | A nudge plays the next scene; a fling goes as far as it goes, then settles |
| Pace of the acting | Whatever speed the visitor scrolls | As designed | As designed |
| Accessibility | Native | Poor: you can't scroll past it | Native |

(b) gets the pacing right but takes away the page. (a) is honest but tells the story badly when scrolled fast. (c) keeps native scrolling and adds two kinds of segment:

- **change**: the parallax scene changes. Scroll scrubs them, and they never come to rest halfway.
- **act**: writing, reading, answering, and the journey across the world. Scroll scrubs them too, like flipping a flipbook. If the visitor stops while moving forward, the act finishes by itself at film speed.

Some act ends are marked as **pages**: places where the film waits for the visitor.

The result:

- A visitor who nudges gets one scene per nudge, played at its own speed.
- A visitor who scrolls continuously gets a scrubbed film.
- **▶** removes the waits at the pages.

**What happens when the visitor stops scrolling** ("settle"). It runs after 160 ms with no scroll or wheel events, no finger down, and any momentum finished. Nothing is ever scrolled while a finger is down or momentum is running: on iOS a programmatic scroll during momentum stops it with a jolt. `scrollend` is used where the browser has it, but the quiet timer is the rule everywhere.

- **Inside a change:** glide to the end of the change in the direction of the last movement. A movement under 24 px counts as accidental and goes back. The glide runs at about 2.5× film speed, between 0.25 s and 0.9 s, easing out.
- **Inside an act:**
  - If the last movement was forward and the film isn't paused, play to the next page at 1× film speed.
  - If the last movement was backward, hold where it is. The puppets keep breathing on wall-clock time, so the frame never looks frozen.
- **The prologue** (the title page: 摺摺 writes, the card pops out) plays on wall-clock time at y = 0 (the top of the page), once, on load. It takes about 5 s. If the visitor scrolls before it ends, it fast-forwards to its end within 0.4 s. Coming back up to it shows its finished state. This is the one exception that keeps the page from scrolling on load.

**What ▶ does.** Play scrolls the page by itself at film speed, through every segment, to the end. If the visitor does anything during play, the film drops back to browsing (▶ shows "play" again) and their scroll takes over. "Anything" means wheel, touchstart, a scroll key, a mousedown on the scrollbar, or the scroll position drifting more than 3 px from the last position we wrote. Play does not resume by itself afterwards.

**The player**, which appears once the prologue is over:

- ⏮: back to the start of the current scene, or to the previous scene if we are within 1 s of the start.
- ▶/❚❚: play and pause.
- ⏭: the next scene.
- A pen-line progress bar with six ticks, built as a `role="slider"` with `aria-valuetext` such as 「第 3 幕，共 6 幕：抵達」. It can be dragged to scrub.
- 略過: an instant jump to the end, with a 250 ms veil. Scrubbing through 60 s of film would only be a blur.

**Pause** stops everything automatic: playing acts forward, idle breathing, particles. The visitor's own scrolling still scrubs, and a scene change still settles, because that is part of the gesture.

**Keyboard.**

- ← and →: previous and next scene. They work anywhere on the page unless focus is in a form field.
- K: play and pause.
- Home: rewind to the start.
- Space, ↓ and PageDown keep their native meaning. They scrub, then settle.
- The lead's Space-for-play is dropped: taking over Space globally breaks keyboard paging.

**The URL.**

- When a scene is reached, `history.replaceState` writes `#dawn`, `#journey`, … and so on. It never uses pushState, so the browser's Back button leaves the page instead of walking through scenes.
- Those ids sit on the track frames, so following a hash is the browser's own anchor scroll. It works without JS, in the picture book too.
- Arriving with a hash counts as moving forward, so that scene plays.

**Coming back to the page.**

- **Back from a card page:** the visitor lands exactly where they were.
  - The browser's own scroll restoration gives back the scroll position, and t follows from it.
  - As a fallback, t is saved in `sessionStorage` on pagehide or on a click on a card, and restored if it is younger than 30 minutes and the navigation was back/forward.
- **A new visit:** always starts at the title page. If an earlier visit reached the end (`localStorage resonance:film-seen`), the title's second action becomes 「直接看故事 ↓」.
- Resuming mid-film on a new visit would be disorienting, so it is not offered.

```ts
// runtime/clock.ts — t follows the scroll; the clock only ever writes scroll positions
type Seg = { id: string; kind: 'act' | 'change'; t0: number; t1: number; y0: number; y1: number; page?: boolean };
type Mode = 'browse' | 'play' | 'pause';
const tOf = (y: number) => { const s = segAtY(y); return lerp(s.t0, s.t1, (y - s.y0) / (s.y1 - s.y0)); };
function onQuiet() {
  if (mode === 'play' || holding()) return;                 // a focused or hovered card, the slider being dragged, a hidden tab
  const s = segAt(target);
  if (s.kind === 'change') glideTo(dir > 0 && gesture > 24 ? s.t1 : s.t0);
  else if (dir > 0 && mode === 'browse') driveTo(nextPage(target), 1);   // film speed
}
const write = (y: number) => { lastY = Math.round(y); window.scrollTo({ top: lastY, behavior: 'instant' }); };
// 'instant' matters: globals.css sets html { scroll-behavior: smooth }, which would turn every per-frame write into a smooth scroll
```

The track's lengths are in `svh` units:

- changes: 110 svh each
- acts: 12 svh per film-second
- the journey: 25 svh per film-second
- the night hold: 50 svh

That comes to about 14 screens. Most visitors won't scroll all of it: the glides and ▶ move them along.

## 2. The parallax scene change, as math

Positions are in stage heights (positive is down), and p runs from 0 to 1 across a change. Each layer has a depth factor s:

- s = 1: the foreground flat.
- s < 0.35: the **backdrop**, meaning the sky and the far ranges.

A flat's paper continues below its drawn edge as an **apron** of solid colour (a plain div, no bitmap), about 0.6 stage heights deep.

```ts
const sCut = 0.35, m = 0.06;                                   // m: room for the torn edges
const win = (s: number) => 0.35 + 0.35 * (1 - s) / (1 - sCut); // the near flat takes 0.35 of p, the back flat 0.70
const eIn = (u: number) => u ** 3, eOut = (u: number) => 1 - (1 - u) ** 3, c = clamp01;
const outFlat = (s: number, p: number) => -(1 + m) * eIn(c(p / win(s)));                         // lifts off, near flats first and fastest
const inFlat  = (s: number, p: number) => (1 + m) * (1 - eOut(c((p - 1 + win(s)) / win(s))));   // rises; the back flat leads, the near one lands last
// The seam lock: the new back flat may never show sky beneath the old ground
const inBack = (p: number) => Math.min(inFlat(sBack, p), oldBackBottom + outFlat(sBackOld, p) - newBackTop);
const backdrop = (s: number, p: number) => ({ outY: -0.5 * s * smooth(p), inY: 0.5 * s * (1 - smooth(p)), inAlpha: smooth(c((p - 0.25) / 0.5)) });
const sky = (p: number) => ({ mid: smooth(c((p - 0.1) / 0.35)), next: smooth(c((p - 0.5) / 0.35)) });
```

- **Speeds:** the near flats move about twice as fast as the back flat.
- **Overlap:** the old flats are gone by p = 0.70, and the new ones rise from p = 0.30. The new flats are always painted in front of the old ones.
- **Stacking order**, back to front: the old sky, the "mid" sky, the new sky, the old backdrop, the new backdrop, the old flats, the new flats, the carrier, the DOM overlays.
- **Easing:** both ends start and stop at zero velocity. Scrubbing then feels like paper with some weight, and nothing jumps at p = 0 or p = 1.
- **Why the seam lock:** seen whole, it reads as one tall hanging scroll being rolled upward, each flat at its own speed.

**The sky** is three stacked gradient divs, crossfaded with opacity only (no gradient is repainted). The "mid" sky is computed once per change in OKLCH, so dusk going to night doesn't pass through grey mud:
- lightness: the average of the two skies'
- chroma: 0.9 × the larger of the two
- hue: interpolated the short way round

**The sun and moon** follow one arc over the whole film, `θ(t_global)`, at infinite depth. The sky changes colour under a light that keeps moving.

**Actors.**

- A puppet is a child of the flat it stands on, so it leaves and arrives with its ground.
- The **carrier** (the card riding the wind ≋) stays fixed on screen through a change and lifts by 0.08 stage heights at mid-change. The world changes around it, like a match cut.
- Characters who arrive in the next scene are already standing on their rising flat. Their acting starts when their act starts.

**Sideways travel** happens only in the journey act. It reads as riding along without the visitor ever scrolling sideways.

- Each layer moves `x = −s · v · (t − t0)`, with v about 0.35 screen widths per second.
- The near flats are tiled: two copies, positioned modulo the tile width.
- The backdrop is simply wide enough: screen width + s · v · duration.

## 3. iOS Safari and Android Chrome

- **The stage:** `position: sticky; top: 0; height: 100lvh; margin-bottom: -100lvh`.
  - The browser's compositor keeps it pinned, so it doesn't jitter during momentum the way a JS or fixed pin can.
  - Our layers move *inside* the stage, so drawing them one frame after the scroll is invisible. This is the main reason a JS clock is enough.
  - Composition stays inside the top `100svh` (the screen with Safari's bars showing). The ground bleeds down to `lvh` (the screen with the bars hidden).
  - The player is `position: fixed` at the bottom while the film is in view, at `bottom: env(safe-area-inset-bottom)`.
- **Track lengths are in svh.** The toolbar showing or hiding never changes them, so no remeasure is needed. This is what ScrollTrigger's `ignoreMobileResize` does; it is already on by default on touch devices (ScrollTrigger.js, line 2047).
- **Width changes and rotation:** keep t the same, remeasure, and jump instantly to the same t. Otherwise a rotation lands on a different moment.
- **`normalizeScroll`: no.**
  - It stops the iPhone toolbar from collapsing, so the visitor never gets the full screen.
  - It takes over touch scrolling for the whole page, the end state and footer included.
  - It would fight our own scroll writes.
  - The jitter it exists to fix does not happen with a sticky stage.
- **Snapping:** done by the settle glide described in section 1, never CSS `scroll-snap`.
  - `mandatory` snapping re-snaps the browser after our programmatic scrolls.
  - The film's long free segments can't be expressed as snap areas.
- **60 fps budget:** under 4 ms of our JS per frame.
  - Only transforms and opacity, written into the DOM, with nothing read back from the layout inside the loop.
  - `contain: strict` on the stage.
  - At most about 16 layers promoted to the GPU at once (`will-change` only on live ones).
  - The puppets are posed "on twos": film time snapped to 12 fps, `floor(t·12)/12`. That is the brand's stop-motion look, and it cuts their DOM writes by 5×. The flats move at the display's full frame rate.
  - Particles (stars, birds, ≋ trails) are one `<canvas>` at most 2× pixel density, drawing pre-made sprites.
  - The sticker kit's props use SVG `filter`s (`kit/paper.ts`). They are pre-rendered to bitmaps. There are no animated SVG filters and no blend modes; the grain is baked into each layer's WebP.
  - If frames stay above 24 ms for 2 s, the film drops detail: fewer particles, then backdrop drift off.
- **Memory:** the ~40 layers are never all decoded at once.
  - Only the current scene and the one changing in are mounted, plus the next one decoded on idle if `deviceMemory ≥ 4`.
  - Phone, pixel density capped at 2: a typical flat is about 3 MB decoded, so 14 live is about 45 MB.
  - Desktop 1440×900 at 2×: a typical flat is about 12 MB. Backdrop layers are drawn at 1× and flats moving at the same speed are merged, for under 100 MB in all.
  - Layers are WebP, not AVIF, because WebP decodes faster at scene-change time.

## 4. The cards over the stage, and accessibility

- **The card that pops out.**
  - It is a real `<a>`: a compact StoryCard to the card's page.
  - It sits in a `.ui` layer inside the sticky stage, after the art.
  - Outside its t-range it carries `inert` and `visibility: hidden`, so it is focusable only while shown. Both are switched when t crosses the range's edges, not on every frame.
  - Focus or hover on the card holds the film.
  - If the visitor's scroll moves t out of the card's range while it has focus, focus moves to ▶ first.
- **How it grows from 摺摺's paper prop:** a FLIP-style transform driven by t.

```ts
const u = smooth(c((t - t0) / (t1 - t0)));
const r = lerpRect(prop.rect(t), final, u);   // the prop's rectangle comes from the kit's pose at t; final is measured once per resize
el.style.transform = `translate3d(${r.x - final.x}px,${r.y - final.y}px,0) rotate(${lerp(prop.rot, 0, u)}deg) scale(${r.w / final.w})`;
el.style.setProperty('--words', String(c((u - 0.45) / 0.35)));   // the words come up once the card is large enough to read
```

  - The card is laid out at full size and only ever scaled *down*. Its raster is then sharp at the end of the growth, never a blurry enlargement.
  - The prop is drawn at the card's proportions, in the card's paper colour, so the switch from prop to card at u ≈ 0.15 is not seen.
- **The two cards joined by ≋.**
  - Desktop and tablet: side by side.
  - Phone: stacked, with the ≋ turned vertical.
  - The ≋ is an inline SVG path with `pathLength="1"`, its dash offset driven by t, and its stroke width taken from INK. DrawSVG isn't needed.
  - The pair is a `role="group"`, named 「一個故事，和回應它的故事」.
- **Screen readers.**
  - The art is `aria-hidden`.
  - The track frames hold a short narration of each scene in visually hidden text (an `h2` and one sentence each), with no links, so a sighted keyboard user never tabs onto something invisible.
  - The two cards appear again first in the end state's list of stories. That list is the complete version of the film's content.
  - A polite live region announces the scene, but only when the player caused the change, not while scrolling.
  - 「略過動畫」 is the film's first item in the tab order.
- **WCAG 2.2.2:** ❚❚ stops all automatic motion. The end state's motion stops by itself within 5 s.
- **Reduced motion** (parallax is a well-known trigger for motion sickness) and **Save-Data:** the picture book.
  - The film is offered on request: 「播放動畫」, or 「播放動畫（約 1.5 MB）」 under Save-Data.
  - Under reduced motion it plays with crossfades, no parallax and no sideways travel. The choice is remembered.
- **No JS:** the picture book. CSS picks it with `@media (scripting: none)` and needs no inline script. JS turns to the book (`html[data-film="book"]`) when:
  - Save-Data is on;
  - `deviceMemory < 2`;
  - the runtime chunk fails or hasn't started within 8 s.

  These changes all fall below the fold, because frame 0 is identical in both modes.

## 5. The end of the film and the rest of the page

- **The release.** The last act (night, the five on the hill) ends in a 50 svh hold, so the smoothed t can catch up.
  - The sticky stage then lets go and scrolls up as one piece, its near flats pushed a little faster.
  - The end section rises from below, the way the next scene would. It starts with the same night colour and continues the same stars.
- **The end section is normal flowing content:**
  - the sky of stories, as a real `<ul>` of links with lazy covers;
  - 「下一個故事，由你來寫」 with 寫下你的故事 and the store badges;
  - 重看一次, which rewinds at speed: the whole film scrubs backward like a tape, capped at 2 s (instant under reduced motion), then plays;
  - the footer, on the night ground.
- **The site header:** shown on the title page and in the end state, sliding away (driven by t) during the film. This needs a header variant for the lab only.

## 6. First paint and the size budget

**The server HTML holds:**

- **Frame 0** as a single pre-rendered WebP, `fetchpriority="high"`: about 60 KB on a phone, 120 KB on desktop. The picture book's first frame is the same image.
- The h1, the subtitle, ▶ 看看小紙團的故事 and the badges.
- The narration.
- The two cards' markup, once in the overlay and once in the book. The copy that isn't used is `display: none`.
- The end state and the footer.

The h1 or frame 0 is the LCP. The live layers replace frame 0 pixel for pixel once they are decoded.

**Loading order after that:**

1. The film runtime, right after hydration (not waiting for idle, because visitors scroll early).
2. 摺摺's parts and scene 0's layers.
3. On idle, scenes 1–2, then two scenes ahead of wherever t is.
4. The covers of card 1 and card 2.

If a change is reached before its incoming flats are ready, it plays with the sky alone and the flats fade in when they arrive. Scrolling is never blocked.

| Size, gzip -9 (esbuild-minified ESM) | KB |
|---|---|
| GSAP core | 27.8 |
| core + ScrollTrigger (Observer included) | 45.3 |
| + ScrollToPlugin + Observer | 46.7 |
| + MotionPathPlugin | 55.6 |
| Separately (dist): ScrollTrigger · Observer · ScrollTo · MotionPath · DrawSVG | 18.0 · 4.3 · 2.0 · 9.7 · 2.2 |
| The kit's puppet + poses + timeline | 5.9 |
| Cast manifests (`cast.generated`) | 4.0 |
| The ambient mascot engine (not needed) | 28.4 |

**Budget:**

- Film JS: 25 KB or less (clock, director, scenes, player, kit puppets).
- Images: 150 KB or less for the first screen; 900 KB or less for the whole film on a phone, 1.6 MB on desktop.
- If the owner wants GSAP anyway, ScrollTrigger can feed the clock's progress (`onUpdate: s => clock.setScroll(s.scroll())`) with no pin and no snap. That adds 45 KB and gains nothing.

## 7. File plan (worktree `landing-lab`)

```
src/app/[locale]/lab/landing/film/page.tsx      revalidate 300, robots noindex, renderLab(Page, params)
src/components/lab/landing/registry.ts          + { id: 'film', name: 'D · 一張卡片的旅程 The Journey', pitch }
src/components/lab/landing/film/
  Page.tsx          server: awaits filmPicks() (server-only; insightScore never serialized), renders Title, Stage shell, Book/Track, End
  film.module.css   sticky/lvh/svh; book mode via @media (scripting: none), (prefers-reduced-motion: reduce) and [data-film=book]
  Film.tsx          'use client': chooses the mode, mounts the runtime, a fallback timer to the book; dev: window.__film { seek, play, state }
  Book.tsx · End.tsx · Player.tsx · OverlayCard.tsx · Waves.tsx
  script/           pure, no DOM: timeline.ts (segments, pages, y↔t), parallax.ts, sky.ts (OKLCH stops, sun arc), scenes/*.ts (layers, depth, actors, beats as frame(t))
  runtime/          clock.ts (modes, quiet, settle, drive, cancel on intent), director.ts (filmFrame → DOM writes, which scenes are mounted, decode()),
                    puppets.ts (kit StickerPuppet over the /mascots parts, posed on twos), particles.ts, memory.ts
  *.test.ts         y↔t round trip; settle decision table; parallax invariants (everything at rest at p=0 and p=1; the old flats off stage at p=1;
                    no sky under the ground for any sampled p); clock with fake timers and a fake window; Book/End/inert rendering (jsdom)
public/lab/film/<scene>/<layer>-<w>.webp + manifest.json   produced from designs/landing-lab/film/art by the art pipeline
```

`labRoute.tsx` stays as it is. The film's Page fetches its own picks on the server, alongside `LabLandingProps`. Nothing outside the lab folder changes, except a header variant for the lab only if the sliding header goes ahead.