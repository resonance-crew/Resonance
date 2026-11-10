The mock is done: six times of day in a 3×2 grid and one large dusk frame, all in paper. No newer owner message reached me, so this follows the brief as written.

- **Grid (1600 px):** /private/tmp/claude-501/-Users-ncchen--claude-spares-spare-pZgTcm/84b65950-01bf-4833-b134-c3a6994644eb/scratchpad/film/mock-palettes.png
- **Dusk (1440×900):** /private/tmp/claude-501/-Users-ncchen--claude-spares-spare-pZgTcm/84b65950-01bf-4833-b134-c3a6994644eb/scratchpad/film/mock-dusk.png
- **Mock source:** /Users/ncchen/Documents/Resonance-landing/designs/landing-lab/film/mocks/palettes.html (open with `?view=dusk` for the big frame)
- **Puppet data it loads:** /Users/ncchen/Documents/Resonance-landing/designs/landing-lab/film/mocks/puppets.js (the five rigs at rest, read from `designs/stickers/parts/*/manifest.json`)

The mock is seeded, so the same seed always draws the same paper. It ports the geometry from `kit/paper.ts` and uses that kit's filter recipes, rescaled for a landscape. The puppets are drawn from their real part images. All six frames show the same place, so only the light and colour change between them. The render scripts are in the scratchpad `film/` folder: `render.mjs` for the grid and dusk PNGs, `render2x.mjs`, `sizes.mjs` and `svgsize.mjs` for the size measurements, `crop.mjs` for zoomed checks.

## 1. Art direction: a world made of paper

**We take from the reference picture:** a big simple sky wash, one big low sun or moon, flat layers that fade toward the sky colour with distance, the darkest layer in front, and small drifting particles. **We do not take:** balloons, palms, domes, arches, ruins, snow slopes or its silhouettes.

**Layers per scene:** seven paper layers plus the sky, the sun or moon, and two particle layers. From far to near:

| Layer | Depth d | Parallax |
|---|---|---|
| Far range | 0.08 | 0.04 |
| Near peaks | 0.20 | 0.10 |
| Sea (a flat plane, not a ridge) | — | — |
| Headland and far shore | 0.34 | 0.18 |
| Town | 0.50 | 0.30 |
| Tree hills | 0.66 | 0.45 |
| Near hill | 0.82 | 0.65 |
| Ground (the puppets' band) | 1.0 | 1.0 |

A front fringe of dark grass leaves (parallax 1.3) frames the bottom corners. On phones the three far layers merge into one, leaving five planes.

**Colour formula.** Each time of day picks four things: a haze H (the air at the horizon), an ink K (the darkest near paper), a γ and a κ. Each layer has a depth d and its own paper from the brand's six families: town terracotta 48°, hills sage 140°, near 150°, peaks 270–285°.

- t = d^γ, with γ between 0.8 and 1.05.
- L = L_H + (L_K − L_H)·t.
- C and hue go linearly from H to K at t, the hue the short way round. Interpolating in OKLCH rather than OKLab avoids grey, muddy middle layers.
- The layer's own paper is then added as a vector: (a, b) += κ·sin(πd)·C_own·(cos h_own, sin h_own). Lightness is left alone. κ runs from 1.0 by day to 0.3 at night.
- The sea is the time's sea tint mixed 20% toward the near peaks.

So the middle layers carry their own colour, the far ones fade into the air, and the near ones go into shadow.

Two rules hold in every palette: the near hill is at most L 0.45 and the ground at most L 0.38.

**Paper treatment by depth:**
- **Far (d < 0.35):** flat colour, edges displaced about 1.6 px, faint large mottle (≤ 7%). No rim, no shadow. Mountains get origami folds: the sun side is 20% toward the light, the shade side 12% toward the ink.
- **Middle:** cut paper with a 0.8 px pale cut edge, mottle about 9%, and a soft contact shadow cast on the layer behind (blur 7; strength 13% by day, 21% at night).
- **Near:** torn paper with the kit's frayed fibre rim (about 1.5 px), mottle, specks and a stronger contact shadow. The ground also gets a graphite pencil line just under its edge. The fringe is darkest, has no rim, and is blurred 1.4 px like a shallow depth of field.
- **The rim's colour follows the light** — cream by day, gold at golden hour, 56% moonlit grey at night — so night edges never glow like neon.
- These shadows belong to the paper art, not the UI, so the no-shadow rule for UI still holds.

**Light:**
- A four-stop sky wash plus a soft glow around the disc (5.5× its radius).
- One to three torn tissue-paper halo rings around the sun or moon, its reflection cut into strips on the sea, and a crescent moon cut out of paper.
- At low sun (dawn, golden, dusk) the puppets get a 7 px warm rim on the sun side.
- Lit windows: 35% at dusk, 80% in the evening, 32% at night. A lighthouse beam in the evening and at night.
- Stars are pinpricks of light through dark paper (5 at dusk, 28 in the evening, 150 at night); the largest get a four-point twinkle.
- At night the pale puppets are dimmed (×0.76–0.86). 悄悄 instead carries its own light: its paper ×1.25 and a ring of glow that is clear at the centre.

**Particles:** paper-bird chevrons in V flocks, the ≋ as three tapered ribbons of wind (42% alpha when idle, 85% when carrying a card), rising paper lanterns, tiny fibre curls, and the front fringe.

## 2. Six palettes (OKLCH: L%, C, h)

| | Dawn | Day | Golden | Dusk | Evening | Night |
|---|---|---|---|---|---|---|
| Sky top | 60 .075 280 | 63 .120 248 | 72 .065 234 | 45 .100 296 | 33 .080 268 | 19 .045 266 |
| Sky 0.4 | 74 .075 322 | 75 .095 238 | 87 .035 96 | 61 .130 338 | 46 .090 282 | 24 .055 264 |
| Sky 0.75 | 86 .070 30 | 86 .060 225 | 90 .090 88 | 76 .130 28 | 60 .085 312 | 30 .060 268 |
| Horizon | 93 .060 72 | 91 .040 208 | 91 .120 80 | 87 .100 66 | 72 .090 42 | 35 .060 272 |
| Disc | 96 .070 84 | 99 .040 98 | 96 .110 92 | 94 .085 84 | moon 94 .040 92 | crescent 92 .070 92 |
| 1 Far range | 81 .046 17 | 81 .047 216 | 80 .082 89 | 69 .105 12 | 53 .070 294 | 29 .059 268 |
| 2 Near peaks | 73 .048 354 | 73 .055 222 | 73 .068 101 | 63 .100 359 | 48 .072 290 | 27 .059 268 |
| Sea | 80 .050 343 | 74 .079 228 | 80 .094 86 | 69 .116 14 | 50 .074 288 | 27 .052 265 |
| 3 Headland | 65 .049 330 | 66 .068 221 | 65 .058 123 | 56 .092 344 | 43 .072 283 | 25 .059 265 |
| 4 Town (roofs +terracotta) | 57 .070 4 | 59 .022 120 | 57 .091 93 | 48 .102 356 | 38 .051 307 | 22 .037 282 |
| 5 Tree hills | 49 .024 321 | 52 .077 173 | 49 .095 133 | 41 .061 335 | 32 .044 268 | 19 .038 252 |
| 6 Near hill | 41 .042 298 | 45 .064 183 | 42 .072 142 | 34 .066 320 | 27 .049 272 | 17 .037 259 |
| 7 **Ground band** | 33 .055 290 | 38 .050 192 | 34 .050 150 | 27 .070 310 | 21 .050 276 | 14 .035 266 |
| Fibre rim | 94 .035 40 | 98 .012 85 | 95 .070 86 | 88 .075 48 | 70 .040 288 | 56 .035 258 |
| Accent / lights | 84 .100 62 | 62 .140 45 | 80 .140 72 | 82 .130 60 | 84 .130 78 | 86 .120 85 |
| Haze → ink, γ, κ | 87 .045 32 → 33 .055 290; .85; .7 | 87 .045 215 → 38 .05 192; .8; 1 | 86 .09 82 → 34 .05 150; .85; .85 | 75 .11 22 → 27 .07 310; .85; .55 | 56 .07 296 → 21 .05 276; .95; .45 | 30 .06 268 → 14 .035 266; 1; .3 |

**Puppet papers,** measured from their `torso.webp` files:

| Puppet | Main paper |
|---|---|
| 摺摺 Tuck | 80 .045 140 |
| 牽牽 Twine | 82 .04 220 |
| 聆聆 Nod | 84 .045 290 |
| 點點 Pip | 86 .10 95 |
| 悄悄 Hush | 44 .06 260 |

All five have a cream fibre rim (97.5 .012 85) and graphite faces.

**Contrast** (luminance ratio after each time's light; target 3:1 for graphics). Cells read tree hills / near hill / ground, then the sea:

| | Dawn | Day | Golden | Dusk | Evening | Night |
|---|---|---|---|---|---|---|
| Tuck (the lowest of the pale four) | 3.2 / 4.5 / 6.3 · sea 1.0 | 2.9 / 3.9 / 5.3 · 1.2 | 3.1 / 4.3 / 6.1 · 1.0 | 4.2 / 5.5 / 7.2 · 1.4 | 5.2 / 6.3 / 7.4 · 2.6 | 6.4 / 6.7 / 7.0 · 5.3 |
| Pip (the highest) | 3.9 / 5.4 / 7.6 · 1.2 | 3.5 / 4.7 / 6.4 · 1.5 | 3.8 / 5.3 / 7.4 · 1.2 | 5.1 / 6.7 / 8.7 · 1.7 | 6.2 / 7.5 / 8.8 · 3.1 | 7.5 / 7.9 / 8.2 · 6.2 |
| 悄悄 | 1.3 / 1.1 / 1.5 · 4.3 | 1.5 / 1.1 / 1.3 · 3.4 | 1.4 / 1.0 / 1.4 · 4.3 | 1.0 / 1.4 / 1.8 · 2.9 | 2.2 / 2.7 / 3.1 · 1.1 | 3.2 / 3.4 / 3.5 · 2.7 |

Twine and Nod sit between Tuck and Pip in every cell. The cream rim against the near hill is 6.6–19:1 everywhere.

**Where it fails, and the fixes:**
1. **Pale puppets in front of the sea, sky or far layers fail (1.0–1.5).** The staging rule: the four pale puppets stand in front of the near hill or ground (≥ 3.9:1, feet ≥ 5.3:1). When they must cross something light (riding the wind, the sky), a 1.5 px graphite contour switches on (graphite L 0.35 against the day sky is 7.5:1).
2. **悄悄 by day fails (about 1.1).** It is the night's character and should appear from evening. If it has to appear by day, stand it against the sea or sky (2.9–4.3) or on a pale paper strip — the bridge of waves at L 0.9 gives 5.8:1.
3. **A soft glow behind 悄悄 makes it worse.** Measured: the night ratio drops from 2.5 to 1.3, because the glow lifts the background toward its own lightness. So 悄悄 is lit itself (×1.25 → 3.4 / 3.5 at night, 2.7 / 3.1 in the evening) and the glow is a ring that leaves the centre dark. This is what the evening and night frames show.

## 3. Dark colour scheme

The film keeps its own time of day. Its colours are fixed, as the night bands on /paper-pals and in prototype C already are, and dark mode never moves the clock.

Dark mode changes three things:
- **The page around and after the film** (the end section and footer) follows the site's tokens.
- **The player controls** wear the night face (pill `oklch(36% .05 262)`, ink `oklch(94% .02 85)`). In light mode they wear the toast's face (InkPill).
- **Exposure:** the sky and layers get L × 0.92 and the sky's chroma × 0.9, a dimmer day for a dark room. The night sky floor drops from 19% to 14.5%, matching the site's dark night papers. Puppets, windows, stars, lanterns and the cards keep full brightness, so every contrast above only goes up.

## 4. Original scene elements, cut as paper

- **The attic writing room:** a round window framing the layered world, slanted kraft-paper beams, desk, inkwell, paper stack, a corkboard of tiny cards. The desk lamp is dawn's warm light.
- Mountains with origami folds that catch the light.
- Rolling sage hills of lollipop and cypress trees.
- **A paper town:** gabled houses, a clock tower and a little post office (cards are letters), with lit windows by evening.
- **A river of layered paper strips**, with a stepping-stone bridge and a paper boat carrying a card.
- **The lone tree by the sea** on a headland: 聆聆's reading place.
- **A lighthouse** whose beam is light through a slit in the paper.
- **A bridge made of the three ≋ waves** arching over the valley, where the two puppets meet.
- **牽牽's string** (紅線) tying two cards together: connection.
- Sky lanterns rising from the town that become the night's stars of stories.
- A cut-paper moon, and the 悄悄-shaped hole in the sky (from prototype C).
- Tissue-paper clouds by day, torn streak clouds at low sun.
- Paper birds led by one origami crane.
- Paper fireflies in the evening, drifting fibres and dandelion seeds.
- Pinhole stars through night paper.
- The front fringe of grass and seed heads.

## 5. How to build the layers

**Recommendation: pre-render at build time, keep the colour live.** A build script (`npm run film:paper`, in the manner of `mascots:cast`) turns the seeded scene definitions — sharing `kit/paper.ts`'s random, spline and tear functions and its filter recipes — into two things per layer:
- **(a) The shape:** simplified path data in a generated TS module.
- **(b) A colour-neutral finish plate:** a transparent WebP holding only the rim, mottle, specks and contact shadow, rendered in headless Chrome at 2400 px wide for desktop and 1200 px for phones. A test fails while either is stale.

At runtime each layer is an `<svg>` with `<path fill="var(--film-layer-n)">` plus the plate as an `<image>` in the same viewBox, so they always line up. The colours come from the formula above, as one TS function shared by the server and the client. They are registered `@property <color>` variables, so a time-of-day change tweens smoothly and the day can pass over the same paper. Parallax is plain transforms. If repainting proves costly on phones, the same data can be drawn into one `<canvas>` instead.

**Measured sizes** (the dusk frame, WebP quality 80):

| What | Size |
|---|---|
| Whole frame at 2880×1800 | 125 KB |
| Whole frame at 1440 | 46 KB |
| Whole frame for a phone (1170 wide) | 34 KB |
| Ground band crop | 29 KB |
| Near-hill crop | 23 KB |
| Inline SVG of the full frame | 112 KB raw / 38 KB gzipped |

The page grain disappears in WebP compression (the file is the same size with or without it), so grain must stay a runtime overlay — the site's GrainOverlay or a CSS tile — and never be baked into the plates.

**Expected budget** (estimated from the crops above): plates of about 8–25 KB each, so about 90–160 KB per scene set at 2× and about half that on phones. About 0.4–0.7 MB for the whole film, loaded scene by scene. The six palettes cost no extra bytes. Decode only the current and next scene, and cap the pixel ratio at 2, since one 2880×600 layer is about 7 MB in memory.

**Why not the alternatives:**
- **Live SVG filters:** every non-composited change re-runs the noise and displacement filters over full-width layers — roughly 20–100 ms per layer on a phone, and Safari draws them differently.
- **Rasterising in the browser at load:** no bytes, but roughly 0.3–1 s of CPU per scene on a mid phone, about 50 MB of memory per scene, and the look would differ between Safari and Chrome.
- **WebP with the colours baked in:** 3–4× the bytes, no continuous dusk-to-night change, and the dark scheme would double it again.

**First paint:** the server HTML carries the first scene as flat inline SVG — sky wash, disc and the seven layers in the dawn palette, no filters, estimated at 10–15 KB gzipped — plus the puppets' still images, the h1, the cards and the controls. The LCP is the h1 text. The finish plates fade in once decoded, and the stage comes alive when the browser is idle. Without JavaScript, or under reduced motion or Save-Data, visitors get the same flat-plus-plates picture book.

**Phones:** each scene is composed at 16:10 with a phone-safe middle column for the puppets and the disc. Phone portrait reuses the same plates with per-layer vertical offsets, giving a taller sky.

**Suggested mapping to the lead's script:** dawn for the writing room, day for the journey, golden for the arrival, dusk for the answer, evening for the meeting, night for the sky of stories.

Nothing was committed, and I touched nothing outside the worktree and the scratchpad.