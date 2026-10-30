# 小紙團 stickers

The chat's stickers (round 22): five packs, one per paper puppet, each puppet the protagonist of its own (it may share
a sticker with the others, but it leads — largest, in front or in the middle). No words on the stickers; nothing
cynical, angry or disdainful. The owner has the final say on the art. The packs and every sticker's names live in
`src/lib/stickers/catalog.ts` (ids are stored in messages for good: never rename one); the art lives here.

## What is where

| | |
| --- | --- |
| `kit/` | the sticker stage a choreography imports (`import { … } from '../kit'`): puppets, props, time, small moves |
| `parts/<slug>/` | the cast's parts at 2× (1.6 px per rig unit) and their manifest — `npm run stickers:parts` re-exports them from the live rigs (`designs/mascots/cast/<slug>/rig.svg`, what the generators in `designs/mascots/round3|4/<slug>/gen` write) |
| `<pack>/<id>.ts` | one choreography per sticker (`tuck/morning.ts` …); `<pack>/icon.ts` may draw the pack's tab icon (else the hero's head) |
| `review/index.html` | every sticker playing at 128 and 144 px on the day and the night paper, its key frame, size, length, and a mock thread (open from disk) |
| `review/contact-<pack>.webp` | contact sheets: every frame of every drawn sticker of a pack; the first cell of each, framed in terracotta on the night paper, is its hero frame (its thumb) |
| `review/props.ts` | every prop on one canvas, at rest and in its state (a review aid, rendered with `--out`) |

Generated (committed): `public/stickers/<pack>/<id>.webp`, `<id>.thumb.webp`, `icon.webp`,
`src/lib/stickers/catalog.generated.ts`, `public/stickers/catalog.json`, `review/data.js`, `review/heroes.json` (each
sticker's hero time), `review/contact-*.webp`.

## The pipeline

```bash
npm run stickers                       # every pack: each sticker with a choreography, and each pack's icon
npm run stickers -- tuck               # one pack (its stickers and its icon)
npm run stickers -- tuck/morning       # one sticker
npm run stickers -- tuck/icon          # one icon
npm run stickers -- tuck/morning --serve 3221                   # play it live in a browser (day / night), writes nothing
npm run stickers -- designs/stickers/tuck/morning.ts --out /tmp/try --fast --frames /tmp/try/frames
                                       # a draft: files to /tmp/try, one quick encode, every frame as a PNG
npm run stickers:parts [-- slug]       # re-export the parts (only after a rig changes)
```

`scripts/stickers/render.ts` bundles the choreography with the kit (esbuild), opens it in headless Chrome over the
DevTools protocol (`CHROME_PATH`; no browser library) at 432 × 432 and 2×, and asks the page for each frame: the page is
a pure function of t, so the clock is the renderer's. Each frame is scaled to 432 px, given its die-cut margin (a 2.5 px
cream outline round everything solid, the torn paper's own rim colour — not a shadow: it is what lets 悄悄's navy read on
the night paper; anything faint beyond it, a glue shadow's tail, is cut away), and checked: nothing may come within
6 px of the canvas edge (the margin included — the render fails), and t = duration must be the key pose again (t = 0),
so the loop closes. The file then plays that loop **from its hero**: frame i is the choreography at (hero + i/12) mod
duration, and the hero frame is repeated as the last — so a sticker starts and ends on the moment that means something,
the same picture as its thumb, and nothing jumps when a client swaps the played animation for the thumb. `img2webp`
(libwebp) encodes the frames: lossy, quality 80 (stepping down to 74 and 68 to stay near 120 KB), method 6, loop count 2,
each frame 83 or 84 ms (12 fps without drift). Past 200 KB the sticker fails. The hero frame becomes the 256 px thumb;
the pack icon is drawn at 96 px. Then `catalog.ts` reads every file back into `catalog.generated.ts`
(frames as stored — img2webp merges a held frame into the one before, so a sticker of 31 frames may store 16 —, one
play's length, bytes, and a content version `v` of the animation and its thumb for the immutable URLs; a placeholder
still is 1 frame, 0 ms), writes `catalog.json` and the
review list, and `contact.ts` the contact sheets. `img2webp` has no alpha-quality flag: alpha is kept lossless
(a die-cut silhouette's alpha costs little).

Rendering a sticker takes about half a minute (most of it the method-6 encode; `--fast` is a second or two).

## Writing a sticker

```ts
import { blink, defineSticker, fr, keys, snap } from '../kit';

export default defineSticker({
  duration: 2,                                            // one play, 1.5–2.5 s (the file plays it twice)
  hero: fr(12),                                           // required: the frame that says what it means (the thumb)
  cast: { tuck: { slug: 'tuck', x: 214, ground: 414, k: 0.66 } },   // px on the 432 canvas; k = px per rig unit
  props: { sun: { kind: 'sun', seed: 4, z: 0 } },         // z: paint order (puppets 10, 20, …; props 100 unless told)
  frame(t, { tuck }, { sun }) {                           // every frame, each pose reset to its stance first
    const tb = snap(t, [0, fr(5), fr(6), fr(7)]);         // the body moves only on these frames (see Budget)
    tuck.pose.sy *= 1 + 0.1 * keys(tb, [[0, 0], [fr(7), 1]]);
    blink(tuck, t, fr(20));
    sun.at(320, 120, { k: tuck.k }).set({ rays: 1 });     // a prop not placed in a frame is hidden in it
  },
});
```

- **Time**: t in seconds; `fr(n)` is frame n's time (12 a second). t = 0 and t = duration must give the same picture —
  the key pose, so the loop closes without a seam. Build every curve so it starts and ends at its rest: `keys`, `env`,
  `bell`, `cycles`, `taps` (`kit/timeline.ts`) all do. The file is one frame longer than `duration` (its first frame
  again at the end) and plays the loop from the hero (below), so the key pose is where the loop closes, mid-file.
- **Hero** (required — a definition without it doesn't type-check): the moment, in seconds within 0–duration, that
  reads best at 128 pt as the sticker's meaning — mid-bow with the blush spread, arms up in the stretch with the sun up,
  the heart at its fullest glow, a pat landing, the lean with its sparkles, the note going in under the dog-ear. Its
  frame is rendered as `<id>.thumb.webp`, which is what the picker shows and what every client rests on once the
  animation has played twice — so a resting sticker still says what it says. Never the plain key pose: in a picker of
  standing puppets nobody can tell the stickers apart. Pick it from the contact sheet (frame n is `fr(n)`), then check
  the sheet's first cell. 摺摺's six: morning `fr(12)`, deep-thanks `fr(17)`, tucked-away `fr(10)`, warm-heart `fr(12)`,
  take-your-time `fr(13)`, glad-youre-here `fr(22)` (see each file for the current one). The hero is snapped to the
  nearest frame; the file starts on it, so the first frame a client paints is that picture too.
- **Puppets** (`kit/puppet.ts`) are the landing page's puppets without their stage: the same rig, DOM, pose fields and
  transforms (`src/lib/mascots/puppet.ts`), so they move as on the site. The pose: `rise`, `bodyUp`, `tilt`, `sx`/`sy`,
  `legL`/`legR`/`legS`, `liftL`/`liftR` (0 hangs straight down, 90 sideways, 180 straight up; `rest(side)` is as drawn),
  `faceX`/`faceY` (the face slides on the paper toward where it looks, ±14 / −10…12 rig units — the puppets never flip),
  `eyes` (`'open' | 'shut'` or any eye variant the rig has: 悄悄 has `sleepy` and `nap`), `mouth` (`mouth`, `mouth-o`,
  `mouth-open` where the rig has it), `alt` (its torso-alt: 摺摺's dog-ear lifted, 牽牽 turned to its 「給：」 back —
  which hides its face, arms and bow — 聆聆's card's other side), `decoR`/`decoY`, `blush` (0–1 as the engine; a sticker
  may go to 2, the flush spreading wider), `stars` (悄悄's opacity), `front` (arms drawn behind the torso come in front
  once turned away from rest — set it whenever a mitten crosses the body), `popX`/`popY`, `alpha`. Stickers add `decoX`,
  `decoS` (move and scale the deco freely: a beret doffed, a bow's loops perking up), `lean` (the paper tips toward the
  viewer about its foot, in perspective: a bow), `glow` (悄悄's `stars-glow`, on any paper), and `extra` (extra parts,
  opacity 0–1: 摺摺's `flap` / `flap-alt`, 悄悄's `star-glow-0`…`10`).
  Stances: `stand`, `sit` (on an edge, legs over its front), `floor` (sitting on the floor, legs out — rest the arms
  in the lap or close beside: a sitting arm hanging straight down goes through the floor).
- **Where things are**: `pagePoint(ux, uy)` (a rig point → canvas px through this frame's pose), `mitten(side, at)`
  (a mitten's px and the arm's angle; `MITTEN_MIDDLE` is where it holds things), `aim(side, x, y)` (the lift that points
  an arm at a point), `headPoint()`, `facePoint()`, `reach(side)`. Set lifts before reading a mitten.
- **Moves** (`kit/poses.ts`, each 0 outside its span so they add up): `breathe`, `blink`, `lookAt`, `nod`, `bow`,
  `bowStrokes`, `hop`, `wave`, `reachTo`, `moved` (eyes shut, a fuller blush, a squeeze), `hold(prop, puppet, side)`
  (a prop in a mitten, by its `grip` anchor), `polar`.
- **A bow** that reads at 72 px from the front (the review's recipe): `bow()` tips the paper toward us by about half a
  full tip (lean 31° — more only squashes the sheet into a lump), drops the face toward the foot (faceY +9), swings the
  deco forward over the brow, gives at the knees, shuts the eyes and keeps the **closed smile** — never `mouth-o` in a
  thank-you (with shut eyes it reads as a sigh). On its bottom frames add `bowStrokes(puppet, left, right, e)` (two
  `strokes` props: short pencil motion lines at the shoulders). Hold the bottom; bring the mittens in front (palms
  together, a note held out) so a bow is never armless.
- **Props** (`kit/props.ts`, drawn by seeded generator code in the series' paper: torn or cut paper with its fibre rim
  and glue shadow, graphite, crayon) are placed in canvas px at their puppet's k so their grain matches: `heart` (`glow`,
  `warm`, `heart: 0` for the glow alone), `note`, `cup` (`steam`, `phase`), `flower`, `slip` (`seal`: the red ○), `stamp`,
  `pennant` (`wave`), `star` (`shine`), `card` (`lines`, `underline`), `confetti` (`t`), `wave` (the brand's ≋: `show`,
  `pulse`), `tear` (`glint`), `lantern` (悄悄's star held up: `glow`), `sun` (`rays`), `burst` (joy strokes: `draw`),
  `sparkle` (`show`), `sparkles` (a cluster of three, the big one 1.6× a sparkle: `show`), `strokes` (motion lines:
  `draw`), `zz` (`draw`), `scribble` (handwriting lines: `lines`), `underline` (`draw`), and two to hide
  behind: `panel` (a page standing on its edge — peek out from behind it; the sticker's own edge can't be peeked from,
  the die-cut needs room all round) and `ground` (a torn strip along the foot — pop up from behind it). Each has a
  `center` anchor and most a `grip`. `review/props.ts` shows them all. A prop can live **inside** a puppet, just above one of its parts
  (`inside: { puppet: 'tuck', above: 'torso-alt' }`): it is then under the parts after that one — the face, the deco, an
  arm brought to the front — as a note slipped under 摺摺's dog-ear lies under its `flap` (see `tuck/tucked-away.ts`, and
  `tuck/warm-heart.ts` for a glow behind the face with its heart in front).
  A **puppet** can be held inside another the same way (`inside: { puppet: 'nod', above: 'torso' }` in its cast entry:
  聆聆 scooping 點點 into a hug — in front of 聆聆's card, behind its arms brought to the front). It moves with the other's
  body; keep it below the other's face, which is drawn over it.
  **Sparkles that carry the meaning** (so-moved, a hug, glad-youre-here) must be big: one `sparkle` is about 10 px at
  128 pt and gone at 72 — draw it at `scale: SPARKLE_BIG` (1.65), or use `sparkles`.
  Grow and shrink anything that sticks out past the puppets by scale, not opacity: the die-cut follows what is solid,
  so a half-faded prop loses its outline (opacity is fine for anything over a puppet or another prop).
- **Fit**: keep everything 6 px inside the canvas in every frame, the die-cut margin included — the render fails
  otherwise (arms swinging out, a hop's top, a prop flying in: grow it in from nothing rather than slide it in from the
  edge). Fill the canvas: a solo puppet's thumb should fill 0.4 or more of it (raise k as far as the arms allow). 摺摺 alone is about k 0.66–0.72 (an arm swung out
  sideways reaches 300 rig units from its middle); two puppets share one k (the rigs are in series units, so 點點 is
  small beside 摺摺 by itself); one further back may be a little smaller and higher.

## Budget: what a frame costs

WebP animation has no motion vectors: each frame stores one rectangle, everything that changed since the frame before,
as a picture. So:

- The first frame is a whole picture: about 10–15 KB (more puppets, more bytes).
- **A frame in which a puppet's body moves** (squash, tilt, rise, lean, a hop) **costs about as much again: 8–12 KB.**
  Twelve of them and the sticker is over its 120 KB.
- A frame in which only small things change — a mitten, the eyes or mouth, the blush, the deco, a small prop — costs a
  tenth of that, *if those changes sit together*: two mittens moving at once on either side of the body store the
  whole width between them (≈ 5 KB).
- A frame identical to the one before is free (held poses cost nothing).

So, as cut-paper stop motion does: **hold the body and move the small things on every frame; move the body on a few
frames (`snap(t, [...])` for exact poses, `step(t, 1/6)` for on-fours) and put every big change — body, a prop
travelling, a second puppet — on those same frames.** Look at the frame sizes: `node -e` over the ANMF chunks, or
just render with `--fast` and read the size; the six of 摺摺's pack are 57–109 KB.

## Review

`review/index.html` (from disk) and the contact sheets. Read the sheets at full size: each sticker must read at 128 pt
(the thread) — the silhouette, the prop, the expression — on both papers. A reviewer (the owner asked for one, not
many) looks at the screenshots before the art is called done.

## A new sticker, a new pack

- **A sticker in an existing pack**: add it to `src/lib/stickers/catalog.ts` (id, both names, its place in the pack —
  bump `STICKER_CATALOG_VERSION`), write `designs/stickers/<pack>/<id>.ts` (with its `hero`), run
  `npm run stickers -- <pack>/<id>`, look at the contact sheet (its hero cell too) and the review page, commit the
  choreography and everything it generated.
- **A new pack** (a new character): its rig first (`designs/mascots`, the kit's rig contract), then add it to
  `scripts/stickers/export-parts.ts` and `kit/scene.ts` (`MANIFESTS`), `npm run stickers:parts -- <slug>`, the pack in
  `catalog.ts`, its stickers here, `npm run stickers -- <pack>`.
