# Actors for the landing film: feasibility report

Paths are relative to `/Users/ncchen/Documents/Resonance-landing` unless absolute. No newer owner message reached me. I wrote no code in the worktree. To get real numbers I built a throwaway benchmark in the scratchpad: 5 puppets and 11 kit props running live in a 3000 px world under a panning camera. It is in `/private/tmp/claude-501/-Users-ncchen--claude-spares-spare-pZgTcm/84b65950-01bf-4833-b134-c3a6994644eb/scratchpad/actors/` (`bench.ts`, `run.mjs`, `size.mjs`).

## 1. Can the kit run live? Yes, with a few small changes

**It already runs live.** `--serve` plays a sticker from a requestAnimationFrame clock by calling `renderAt(f/12)` (`scripts/stickers/render.ts:107-116`).

**Nothing depends on the 432 px canvas.** `SIZE` is only used by `iconSticker` and by the `#stage` CSS (`designs/stickers/kit/scene.ts:24,59,140-176`). Puppets are placed with `translate(x,y)` in the root's px (`kit/puppet.ts:308`) and sized as rig units × k (`layout()`, `kit/puppet.ts:185-207`), so any k from 0.15 to 0.6 works. `x`, `y` and `k` are public fields a frame can set (`kit/puppet.ts:82-84`). My benchmark drove all five puppets in a 3000×800 world with the camera as a translate on the parent, with no other change.

**What has to change:**

1. **CSS and filter defs, once per document.** Copy the `.sk-*` rules (`scene.ts:57-66`) without the `html/body/#stage` rules. Make each parallax plane `position:absolute; isolation:isolate`. Inject `paperFilters()` (`kit/paper.ts:189-258`) once, because its `sk-` ids are global.
2. **Which parts to load.** `Scene` binds the sticker manifests (`scene.ts:14-26`) and loads `${partsBase}${slug}/` (`scene.ts:76`). The options:
   - `designs/stickers/parts` is not served, and is 1.78 MB at 1.6 px per rig unit.
   - `public/mascots` is 0.66 px per unit (`scripts/mascots/build-cast.ts:26`). That is soft wherever k × DPR is above about 0.7. It also lacks 摺摺's `flap`/`flap-alt` and 悄悄's `star-glow-0…10`, which the lantern beat needs.
   - Boxes and pivots are in rig units, so a resampled copy works with the same manifest. I resampled and measured: **1.0 px/unit is 418 KB for all five** (tuck 105, tag 86, card 106, dot 35, night 86); 1.2 px/unit is 552 KB.
   - **Recommendation:** a film set at 1.0 px/unit, resampled from the sticker parts and served at `public/lab/film/parts/<slug>/`. It covers a phone (k ≈ 0.33 at DPR 3) and a desktop (k ≈ 0.5 at DPR 2). `MASCOT_CAST` manifests have the same shape, so `StickerPuppet` also accepts them for small background extras.
3. **Hidden is not free.** `Prop.hide()` uses `visibility:hidden` (`kit/props.ts:715-717`). Hidden props whose SVG filters are still in the DOM cost **10–13 ms of GPU per repaint; with `display:none` it drops to 0.55 ms**. Mount only the current shot's props and actors.
4. **Write only what changed.** `StickerPuppet.render` rewrites about 35 styles on every call (`kit/puppet.ts:296-393`). Port the engine's style cache (`set()`, `src/lib/mascots/puppet.ts:362-371`). Also port its split between placing (every frame) and posing (12 fps) (`render(full)`, `src/lib/mascots/puppet.ts:373-385`; `engine.ts:322,468`).
5. **Layers.** Put `will-change:transform` on every `.sk-char`, `.sk-prop` and parallax plane.
6. **Z ordering.** z is a `zIndex` inside one root (`kit/puppet.ts:309`, `kit/props.ts:704`). Each plane is its own stacking context, so z only interleaves within a plane. An actor that changes depth is moved to another plane at a shot boundary. Mounting a prop or puppet `inside` another (`scene.ts:79-99`) works as is.

**Smaller points:**
- The kit's `base()` sets `shadow: 0` (`kit/puppet.ts:219`); set it to 1 for actors standing on the ground.
- There is no stance blend in the kit (`kit/puppet.ts:210-222`). Port `sitU`/`floorU` from `changeStance` (`src/lib/mascots/motion.ts:208-220`) for sit → stand.
- Theme-only parts follow `pose.glow` (`kit/puppet.ts:359-367`). That is what we want: the night scene decides, not the page's theme.

**Bundling.** Next compiles TS outside `src`. The root `tsconfig.json` excludes `designs`, but imported files are still compiled and type-checked through the import graph. The kit reaches `src` by relative imports (`kit/timeline.ts:6`, `kit/puppet.ts:8-12`), which is fine. Add a barrel at `src/lib/paperkit/index.ts` that re-exports the kit plus `Scene` (`kit/index.ts:4` doesn't export it). The kit's constructors touch `document`, so it is client-only, loaded with a dynamic import on idle; the server HTML keeps the stills (`src/lib/mascots/pals/still.ts`).

**The smallest adapter:**
```ts
// a plane's actors: the kit's DOM, any k, place every frame, pose at 12 fps, write only what changed
class Plane {
  constructor(el: HTMLElement, base = '/lab/film/parts/') {}
  actor(id, { slug, k, stance, z }) { return new StickerPuppet(doc, el, { slug, x: 0, ground: 0, k, stance, z }, MANIFESTS[slug], `${base}${slug}/`); }
  prop(id, { kind, seed, z, inside }) { const p = new Prop(doc, kind, seed, z); initProp(p); el.append(p.el); return p; }
  show(ids: Set<string>) { /* display:none on everything else */ }
  render() { /* base → frame → diffed render; Prop.set skips identical state */ }
}
```

## 2. Cost per frame

Setup: Chrome on this Mac, DPR 2, main thread throttled 4×. 5 puppets at k 0.42 and 11 props (3 cards, heart, wave, lantern, scribble, note, sparkles, star, zz), every one of them moving and changing state, with the camera panning.

| mode | JS ms/frame | style ms | GPU ms/frame | frames > 20 ms |
|---|---|---|---|---|
| render every frame, no layers | 0.54 | 0.55 | 12.5 | 58 / 300 |
| poses at 12 fps, no layers | 0.13 | 0.20 | 11.8 | 38 |
| every frame, with layers | 0.52 | 0.51 | 7.8 | 0 |
| **12 fps poses, with layers** | **0.11** | **0.15** | **1.6** (pose frames 4–9) | 0 |
| same, props without filters | 0.09 | 0.17 | **0.2** (pose frames ≤ 1) | 0 |

**What this says:**
- The main thread is cheap even throttled 4× (about 0.6 ms in the worst case), so the DOM image transforms are fine.
- The cost is the props' SVG filters running on the GPU. The `paper` filter has four turbulences, and each filter region is a 1600×1600-unit `userSpaceOnUse` box (`kit/paper.ts:190`).
- An un-layered camera pan repaints everything, every frame.

**Which props re-filter on `set()`:**

| prop | what `set()` does (`kit/props.ts`) | re-filters |
|---|---|---|
| `heart` | scales its halos, draws rays (181-197) | all of them |
| `wave` | scales its 3 strips (427-443) | 3 paper paths |
| `lantern` | scales its halos (474-480) | 2 paper paths |
| `card`, `scribble`, `star`, `strokes`, `zz`, `underline`, `burst`, `sparkles` | stroke-dashoffset on graphite- or crayon-filtered groups | the filtered group |
| `confetti` | transforms on 28 groups (395-414) | 28 filtered groups |
| `pennant` | rebuilds `innerHTML` (325-334) | everything, every call |

Without a layer, any `at()` also re-filters, because the whole SVG repaints.

**60 fps on a mid phone.** A phone GPU is roughly 5–10× slower than this Mac, and WebKit runs SVG filters on the CPU.
- **Bake props to WebP** with the existing headless renderer, one image per state. Animate them only with transform and opacity, and reveal writing with `clip-path: inset()`.
- **Layers** on actors, props and planes.
- **Poses snapped to 12 fps; positions and camera every frame**, as the engine already does.
- **Diffed writes**, so state only changes on a step.
- **`display:none` for anything off-shot.**

Expect under 2 ms per frame of total work after that.

## 3. The moves the film needs

"Engine-clock" means the move exists as a `during(S, dur, (u, t) => …)` callback. Those callbacks are already pure in `(u, t)`; only `S.rand()` and the integrated walk aren't.

| move | status | source and how to write it |
|---|---|---|
| sit at a desk and write | engine-clock | `ACTS.write` (`acts.ts:365-419`); `writePose`, `writingAt`, `penLiftFor` are pure (`acts.ts:39-141`, memoize `writePose`). Kit has `card.lines` and `scribble` (`props.ts:357-379,592-603`) but **no pencil**: port the engine's (`src/lib/mascots/props.ts:36-37`). Sit with stance `sit` on a chair edge, with the desk prop at a higher z. |
| lift a finished card up | primitives exist | `aim` and `hold` (`kit/puppet.ts:280-285`, `poses.ts:122-127`), plus the stretch body (`acts.ts:170-184`). |
| let it go, it flies off | pattern exists | `tucked-away.ts:63-70` already flies a note purely in t (lerp, ease-out, decaying flutter rotation). Start the path at the mitten position at release time, taken from a ghost pose (§6). |
| walk | **missing as a pure function** | `walkPose` is pure given phase and amplitude (`motion.ts:40-53`); `walkTo` integrates velocity (`motion.ts:68-91`). Pure version: x(t) from eased keys, `phase = (x - x0) / stridePx × π` (the engine's own relation, `motion.ts:86`), amplitude from the distance travelled and left. Gait figures from `src/lib/mascots/puppet.ts:130-133`. 點點 hops (`"walk": "hop"`; `hopTo`, `motion.ts:96-134`). Feet stay planted on a reverse scrub. |
| catch a card from the air | missing, easy | The card path ends at a fixed catch mark. The arms `aim` at the card's position at the current t until the catch, then `hold`. Same pattern as tucked-away's "next note". |
| read a held card | engine-clock | `ACTS.read` (`acts.ts:420-446`; the face scans with `-6+12·((t·0.5)%1)`). For 聆聆, `turned`/`ink` (`nod/_local.ts`). |
| be moved | exists, pure | `moved()` (`poses.ts:110-116`) and the heart's glow/rim/ring (`props.ts:143-197`). References: `nod/so-moved.ts`, `tuck/warm-heart.ts`. |
| write an answer | engine-clock | as writing; `writePose` handles a card held in one mitten. |
| walk a bridge of waves, meet | walk + pure helpers | `y = pathY(bridge, x)` (`geometry.ts:21-35`). The duet's notice, close-in, wave and resonate (`scenes.ts:449-512`) are pure given fixed marks. Draw the bridge as baked world art from `ribbon`/`tear` (`paper.ts:65`, `props.ts:89`), not as a huge kit `wave` prop. |
| hand over a note | engine-clock | `duet`'s note variant (`scenes.ts:527-599`): hand-over 2.2 s, moved 2.0 s, bows 1.2 s. `chestLift` and `holdAt` are pure (`scenes.ts:339-354`). The script picks the giver instead of `S.rand`. |
| wave, bow | exist, pure | `wave`, `bow`, `bowStrokes` (`poses.ts:42-101`). |
| 悄悄 lights its lantern | **missing choreography** | Pieces: the `lantern` prop (`props.ts:465-480`), `pose.glow`, and the star-lighting order from `hush/lit-up.ts:18-40,60-66` (`extra['star-glow-n']`, film parts only). Arm aimed up, `hold(lantern)` by its grip, glow stepped on fours, stars lit in `LIGHT` order. The engine's `twinkle` uses `S.rand` (`acts.ts:289-302`); use a hash of the step instead. |
| 點點 peeks over a roof edge | exists in sticker form | `pip/hi.ts` (`pick` rise keys) plus `clipBelow` (`pip/_local.ts:168-171`). Engine `duck` (`acts.ts:480-518`). The roof is art in the same plane at a higher z. |
| nap | engine-clock | `ACTS.nap` (`acts.ts:459-479`); 悄悄's `sleepy`/`nap` eyes, the others fall back to shut. Kit `zz`; `hush/good-night.ts`. |

**How to write the missing ones in kit style.** Each is a function `(puppet, t, a, b, …)` that is 0 outside its span. It drives the body through `snap` or `step`, writes mittens and face every frame, uses no `S.rand` (use `hash(seed, k)`), and takes marks in world px.

## 4. Idle life on top of a scrubbed t

Render `frame(t)`, then apply an overlay that depends only on wall-clock `now`. Determinism holds because t alone fixes the choreography, `now` alone fixes the overlay, and tests pass a fixed `now`.
- **Breath:** `sy *= 1 + 0.012·sin(2.1·now + slot)` (the engine's, `src/lib/mascots/puppet.ts:340`). Better still, a CSS keyframe on a wrapper between root and body, which the compositor runs at zero JS cost (as `PaperPalStill.module.css:82,108` already does).
- **Blink:** only when the choreography left the eyes `open`. Blinks fall on a lattice: period P ≈ 4.2 s, jitter = `hash(seed, floor(now/P))`, shut for 0.13 s. A timer wakes exactly at blink edges, so there are 2 renders per blink.
- **Long rests:** the choreography sets `rest` (0–1) and the overlay adds `pause()`'s weight-shift and arm sway (`motion.ts:170-206`) with `now`.
- **Reduced motion:** no overlay at all.

## 5. API sketch

```ts
type PlaneId = 'sky'|'far'|'mid'|'near'|'action'|'front';
interface Layout { name: 'wide'|'tall'; scale: number /* px per world unit */; marks: Record<string, [number, number]> }
interface Shot<A extends string, P extends string> {
  id: string; span: [number, number];                    // film seconds
  cast: Partial<Record<A, { plane: PlaneId; z: number; stance?: Stance }>>;
  props: Partial<Record<P, { plane: PlaneId; z: number; inside?: { actor: A; above: string } }>>;
  camera(t: number, L: Layout): { x: number; y: number; lift: number };   // lift: the owner's slide-up transition
  frame(f: { t: number; tp: number /* t on twos */; L: Layout;
             a: Record<A, StickerPuppet>; p: Record<P, FilmProp>;
             ghost(actor: A, t: number): GhostPose;           // the pure pose at another time, no DOM
             card(slot: 'written'|'answer'): DomCardSlot }): void;  // place(rect, alpha) for the real StoryCard
}
class Film {
  constructor(root: HTMLElement, o: { planes: Record<PlaneId, { depth: number; liftSpeed: number }>;
    actors: Record<string, { slug: Slug; k: number }>; props: Record<string, { kind: string; seed?: number }>;
    shots: Shot<string, string>[]; layouts: Layout[] });
  ready(): Promise<void>;
  render(t: number, now?: number): void;                    // place every frame; pose when floor(t·12) changes
}
```

- **Planes:** each plane is translated by `−camera × depth`. During a transition, the outgoing planes rise by `lift × liftSpeed` and the incoming ones come up from below. All of it is pure in t.
- **Handing actors between shots:** each actor has lanes, `[{ from, to, shot }]`. A new lane starts from `ghost(actor, boundary)` evaluated on the previous shot, memoized, so continuity holds by construction. Plane changes happen at boundaries while the actor is off-camera or covered.
- **The real cards:** `FilmProp.screenRect()` computes the paper card's rectangle from its own transform math. The DOM card lives in a top layer and cross-fades in from that rectangle.

## 6. Risks, and the three hardest problems

**The three hardest:**
1. **Continuity across hand-offs in a pure timeline.** Release points, catch points, the note's path, and the paper card becoming the real card all depend on poses at other times. That needs a DOM-less ghost rig (`pagePoint`/`mitten` only use rig, pose, x, y and k: `kit/puppet.ts:237-289`) and a fixed evaluation order with no cycles: marks first, then the arms aim at the marks.
2. **iOS Safari performance.** WebKit runs SVG filters on the CPU, and filter cost dominates even on this Mac. Baked props, layers, 12 fps poses and `display:none` are all required. Layer memory also adds up (about 4 MB per puppet layer at DPR 3); budget it.
3. **Staging phone portrait and desktop.** The same ~70 s script needs two layouts of marks, not a scale. Authoring and tuning thousands of keys also needs tooling: a t scrubber with frame numbers, and per-shot contact sheets from the sticker renderer's `renderAt` (which can also make the picture-book stills for reduced motion and Save-Data).

**Also:**
- **Bytes and first paint:** the film parts (≈418 KB) plus baked props load after LCP, so the stills go first.
- **Leftover randomness:** the engine's `S.rand` calls must all become seeded hashes.
- **Walking with legs posed at 12 fps:** feet slide a little while scrubbing.