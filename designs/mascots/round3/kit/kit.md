# Round 3 kit — the 摺摺 series and its stage

Round 3 starts from the owner's pick: direction C, 摺摺 Tuck (round 2, `designs/mascots/round2/c2`). The owner's
round-2 feedback, in their words, is in `designs/mascots/round2/feedback.md`; the full brief is
`designs/mascots/brief.md`, and the round-2 form rules (no skin tones, no necks, no mammal ears, no stock face, the
Stitch/Pikachu lesson) are in `designs/mascots/round2/brief.md`. Those rules still hold.

Scratch root: `/private/tmp/claude-501/-Users-ncchen-Documents-Resonance/3169a3a1-407a-43b9-a40d-6b2f52c2622f/scratchpad/mascots`
(below: `$M`). This kit is `$M/r3/kit`. Render a file to PNG with `$M/render.sh <in.svg|html> <out.png> [w] [h]`.

## The series: paper puppets from one craft table

Five characters, each torn or cut from a **different paper**, all held together the same way. That is the family:
every one of them is different, and they still recognise one another (「每個人都不一樣，但仍然能夠彼此理解與共鳴」).

What every member shares (the family grammar):

- **Paper made by the same filters.** Tuck's recipes (`ref/tuck-r2.mjs` `defs()`): torn or cut edge with the white
  fibre rim, the glue shadow falling down-right, mottle and specks; graphite pencil for faces and writing; crayon for
  blush; matte brass. Copy them under your own id prefix (never reuse `c2-` ids). A cleanly cut paper (card stock)
  keeps the rim and shadow, with a smaller displacement, so it reads cut, not torn.
- **Shoulders are brass brads, set inside the paper's edge** (never on the outline: the owner found a brad on the
  edge unreasonable). The brad sits on the body's face, about 1.5–2.5 brad radii in from the outline, with the arm
  strip tucked under the edge behind it.
- **Arms are paper strips ending in a round cream mitten with a small thumb**, torn from one cream paper
  (`oklch(93% 0.026 86)`), the family's shared glove. Arm length differs by character; none reaches below the hips
  at rest.
- **Shoulders sit low enough**: on Tuck the pivots were just under the eyes; the owner wants them lower. For every
  member, put the shoulder pivots clearly below the mouth line (around the body's middle or lower).
- **Faces drawn with one pen**: two small oval graphite eyes with one glint each, set wide; a small mouth line; a
  little terracotta crayon blush drawn as Tuck's three short slanted strokes (round 2's revision) — the
  same on everyone. No nose, beak, whiskers, fangs, eyelashes, tongues, big anime eyes. A dark paper may draw its face in
  white pencil — the same face in a light pen.
- **One head decoration each, from the craft table** (owner: 「頭髮、蝴蝶結、帽子…看他自己喜歡什麼樣的裝飾」).
  It must read at 48 px as hair or an accessory — never a single upright prong that could be an ear or a horn
  (Tuck's old torn tab read as 「像耳朵又不是耳朵」).
- **Feet**: small torn soles, a darker shade of the body's paper or of the legs.
- **Colour**: low saturation, OKLCH, each body its own hue. **No skin tones** for anything large (no peach, rose,
  tan, beige bodies or limbs: avoid hue 20–75 at lightness above 70% with chroma under 0.09). Terracotta
  (`oklch(62% 0.14 45)`) only as small accents. Each character works on the day paper `oklch(96.5% 0.015 75)` and the
  night paper `oklch(21% 0.012 60)`.
- **Originality**: none of them may recall Snipperclips (Snip/Clip), Tearaway (Iota/Atoi), Paper Mario,
  LittleBigPlanet's Sackboy, Kirby, LINE Friends (Brown, Cony, Sally…), Sumikko Gurashi, Mr. Men, Totoro's soot
  sprites; no mammal ears, no stock face, no plush kit.

### The cast (assignments; the drawer of each owns its details, name and personality)

| slug | prefix | paper and shape | size vs Tuck | limbs | head decoration | moves by |
|---|---|---|---|---|---|---|
| tuck | `tk-` | sage torn sheet with the dog-ear that hides a few lines of writing (round 2, revised) | 1.0 | accordion wheat legs, medium-short arms | replaces the torn tab: hair (a tuft of torn paper) or a clip — its choice | walk |
| tag | `tg-` | mist-blue (hue ≈ 215) die-cut card-stock gift tag, tall pentagon, eyelet ring near the top; a handwritten 「給：」 line on its back | ≈ 1.35 tall, slim | long legs, short arms | the tag's own string tied into a bow through the eyelet | walk (long strides) |
| card | `cd-` | lavender (hue ≈ 290) index card in landscape, rounded corners, one terracotta header rule, faint ruled lines, a few handwritten words | ≈ 0.8 tall, ≈ 1.4 wide | short stubby legs, longer arms (a hugger) | a hat — its choice (felt beret, folded paper hat…) | walk (shuffle) |
| dot | `dt-` | butter-yellow (hue ≈ 95, chroma 0.09–0.11) hole-punch dot: the circle punched out of someone's page, a fragment of a ruled line or two letters of handwriting across it | ≈ 0.55 | tiny folded-tab legs, tiny arms | hair: a quilled paper curl (a rolled strip), or its own idea | hop |
| night | `nt-` | midnight-blue paper (≈ oklch(40% 0.06 260)), a softly torn dome (flat bottom, round top), pin-pricked star holes | ≈ 0.95 | medium legs, medium arms | a clip: a small paper crescent or star | walk (slow) |

## Rig contract (what the stage engine reads)

Each character ships `rig.svg`: the character standing at rest, facing the viewer, arms relaxed down, drawn in
**shared series units** so heights compare across the cast.

- `viewBox="0 0 700 760"`. Ground line at **y = 700**, the character centred on **x = 350**. Tuck from ground to
  the top of its body (decoration excluded) is **≈ 420 units**; the others scale from that (table above). Nothing
  may touch the canvas edge.
- One root group `<g data-rig data-name="摺摺 Tuck" data-prefix="tk-" data-ground="350 700" data-face-center="x y"
  data-height="420" data-walk="walk|hop">` (`data-height`: ground to top of body, decoration excluded).
- Inside it, **flat sibling groups, one per part, in paint order (back to front)**, each with `data-part`,
  `data-parent` (`root`, `body` or `face`) and `data-pivot="x y"` in rig units. **No `data-part` inside another.**
  - required: `shadow` (root, pivot on the ground), `leg-l`, `leg-r` (root, pivot at the hip, each including its
    foot; add `data-len` = hip to sole), `torso` (body; pivot at the bottom centre where the body sits on the legs
    — the body's tilt and squash pivot), `deco` (body; pivot where it attaches), `arm-l`, `arm-r` (body; pivot =
    the brad's centre; each includes its mitten and its brad; `data-angle` = the angle it is drawn at, 0 = pointing
    right, 90 = straight down), `eye-l`, `eye-r` (face; pivot = eye centre), `eye-l-shut`, `eye-r-shut` (face;
    `data-variant-of="eye-l"` / `"eye-r"`: the closed, happy arc used for blinks and smiles), `mouth`, `mouth-o`
    (face; `data-variant-of="mouth"`).
  - optional: `cheeks` (face), `brows` (face), `deco-back` (body, painted behind the torso: a bow's tails, a hat's
    back), `torso-alt` (body, `data-variant-of="torso"`: the character's signature reveal — Tuck's dog-ear opened on
    its writing, the tag turned round to its 「給：」 back), `mouth-open` (face, a variant of `mouth`), `stars` (body),
    `stars-glow` (body, `data-only="dark"`, shown only on the night paper), anything else your character needs as a
    variant of an existing part.
  - Arms may sit in front of or behind the torso — paint order decides. Legs paint behind the body.
  - Do not bake a pose into the parts: the engine turns arms about the brads, swings legs about the hips, tilts and
    squashes the body about the torso pivot, slides the face group a few units toward where it looks, and swaps
    variants. Leave a few units of torso around the face so it can slide ±12 without leaving the paper.
- Export and check: `node $M/r3/kit/export-parts.mjs rig.svg parts --scale 0.8` must print `problems: []` and a
  `recomposeDiffPct` under 1.5. It writes one trimmed transparent PNG per part, `parts/manifest.json`,
  `parts/rest.png` and `parts/recomposed.png`.
- Expect the stage to show Tuck about **120 CSS px tall on desktop and 88 on a phone**, so check every part reads at
  that size: a brad of radius 8 units is 2.3 px there.

## Stage spec (the landing page prototype)

The owner, in their words: 「進到頁面的時候會 random 位置，然後會有可能一到兩隻的角色出現在畫面上，那他可能會進來動一動，
然後做點事情。…不確定要怎麼跟現在頁面上的元素來互動，然後結束之後，它可能會走出畫面，那可能會有新的角色走進來…
他們相遇的時候可以有一些互動…它的大小要小一點點。」 The round-2 landing mock showed Tuck about 200 px tall on a
1440 desktop; this round aims at about 120.

- The page is the live landing (captures and element rectangles in `$M/r3/landing/`: `desktop-light.png`,
  `desktop-dark.png` 1440 wide at 1×; `mobile-light.png`, `mobile-dark.png` 390 CSS px wide at 2×; `anchors.json`
  in CSS px, page coordinates).
- **Ledges** the characters use: the hero headline's top edge; the early-storytellers avatar row (stand at its end,
  as if one of them); the QR card and the store badges (peek from behind the QR card, point at it); the hand-drawn
  wave that ends the hero (walk along its crest); the feed title; the top edges of the story cards (sit on a card,
  legs over its front, reading its title); a card's side (peek from behind); the 「瀏覽所有故事」 button (lean on it);
  the terracotta CTA section's wavy top edge (walk along it); beside 「寫下你的故事」 (beckon, pretend to write); the
  footer logo (nap there — the night character).
- **Scheduler**: the first visitor arrives 1.2–2.5 s after load; one visit lasts 9–16 s; 3–7 s between visitors; at
  most two on screen; sometimes a second arrives while the first is there, and they meet. Never the same character
  twice in a row. Spots are chosen among ledges inside the current viewport, at random.
- **Entrances**: walk in from the nearer viewport edge along a ledge; rise from behind an element (the element
  hides the lower part); hop in (the dot). **Exits**: walk out the nearer edge, or sink back behind an element.
- **Activities** (a spot offers some): read (sit, look down, blink, turn the face), wave at the visitor, look around,
  sit and swing legs, stretch, beckon at the CTA, point at the QR code, nap (night), the signature reveal
  (`torso-alt`: Tuck lifts its corner, the tag turns round), tip the hat (card), hop on the spot (dot), stars
  twinkle (night).
- **Meeting** (two on screen): they notice each other (eyes and face slide toward the other), turn and walk until
  about one body-width apart, wave, then **resonate**: both bob in the same rhythm for two or three beats while three
  small wavy pencil lines (the logo's three waves) pulse between them, a little blush; then each goes its way, or
  they leave together. Variants: one hands the other a small folded note; a mitten high-five.
- **The visitor**: on hover the character looks at the pointer and gives a small wave; a click or tap makes it hop
  with happy (shut) eyes; a second click makes it shy (blush up, mittens over the face) and leave.
- **Motion style**: poses step at 12 frames a second ("on twos", like cut-paper stop motion) by default, with a
  switch to compare smooth motion. Walking: legs swing about the hips, the body bobs and tilts toward its travel,
  arms swing opposite; the face slides toward the direction of travel instead of mirroring the drawing (no
  horizontal flip, so the paper's shadow keeps falling down-right). Blinks every 2.5–6 s.
- **Scrolling**: characters live in page coordinates and scroll with the page; when their spot leaves the viewport
  they finish quickly and leave; new visitors pick spots in view.
- **Quiet by design**: decorative only (`aria-hidden`), pointer events on the characters alone, no layout shift,
  paused when the tab is hidden or the stage is off screen, never more than two characters. Reduced motion: one
  character standing still at a hero spot, no walking, no blinking.
- **Light and dark**: the same part images on both papers; `stars-glow` only on the dark one.

### Added after the first drawing pass

- `data-hides="face arm-l …"` on a variant part (usually `torso-alt`): while that variant shows, the engine hides the
  named parts, and the word `face` hides the whole face group. The tag turned round to its 「給：」 back says
  `data-hides="face"`; a back view may also hide `cheeks`. The exporter copies it to the manifest as `hides`.
