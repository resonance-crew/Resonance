export const meta = {
  name: 'mascot-round3-series',
  description: 'Round 3: five subagents each draw one member of the 摺摺 series as a rig + concept sheet; one builds the landing stage engine',
  phases: [
    { title: 'Draw', detail: 'one agent per character: rig.svg, exported parts, concept sheet, proposal' },
    { title: 'Stage', detail: 'landing animation engine + prototype on the landing captures' },
  ],
}

const M = '/private/tmp/claude-501/-Users-ncchen-Documents-Resonance/3169a3a1-407a-43b9-a40d-6b2f52c2622f/scratchpad/mascots'

const SCOPE = `SCOPE: The owner (業主) may send new chat messages while you work; the lead agent handles those — they are not your task. Your task is the one below, from the owner's request of 2026-10-27, quoted here in their own (dictated, simplified-Chinese) words where it matters. Work only in your own folder; never edit files of another character, of round 1 or 2, or anything in the Resonance repo.`

const OWNER = `The owner picked direction C, 摺摺 Tuck, and asked (their words): 「我也很同意方案 C 的这个泽泽的设计」（泽泽 = 摺摺）. 「他的这个手的位置…肩膀的关节…几乎是在眼睛的下面一点的位置，是不是可以把他手的位置再往下放一点点」; 「这个图钉…把它向内移一点点，因为现在有点像是定在边缘。好像有点不是那么的合理的感觉」; 「他的手是不是可以短一点点…会比较感觉比较可爱一点」; 「不同角色他可能身体的形状和手手脚长短可以不太一样，所以选定这个之后，想请你帮我制作一个系列的这种方向 C 的这个角色…五只」; 「他的头上有一根这个…看不出来它是什么东西。有点像耳朵，又不是耳朵的东西…设计其他角色的时候…改成…像是头发…还是他头上的装饰？他可能可以弄个蝴蝶结，或是戴个帽子…看他自己喜欢什么样的装饰」.`

const COMMON = `Read first, in this order: ${M}/r3/kit/kit.md (the series grammar, your cast row, the rig contract, the stage spec — binding), /Users/ncchen/Documents/Resonance/designs/mascots/round2/feedback.md, /Users/ncchen/Documents/Resonance/designs/mascots/round2/brief.md (form rules: still binding), ${M}/r2/c2/proposal.md, and look at ${M}/r3/kit/ref/tuck-r2-concept.png and tuck-r2-character.png. Tuck's round-2 generator is ${M}/r3/kit/ref/tuck-r2.mjs with its helpers ${M}/r3/kit/ref/lib.mjs (rng, spline, tear, path, smoothPath, pencil, ellipse…): reuse its filter recipes (copied under your own id prefix) and helpers so the series is one family; your shapes, proportions and decoration are your own.

Hand-authored layered SVG, written by a small Node generator (.mjs) like round 2's — no AI image tools, no bitmaps traced from elsewhere. Same paper language as Tuck: torn/cut edge with the white fibre rim, glue shadow down-right, mottle, specks; graphite face; crayon blush; matte brass brads.

Deliver in your folder (create it):
1. gen/*.mjs — one command (\`node gen/build.mjs\`, run from your folder) writes rig.svg and concept.svg from shared parameters, so the rig and the sheet are the same character.
2. rig.svg — exactly per kit.md "Rig contract" (viewBox 0 0 700 760, ground y=700, x=350, series units, flat data-part groups, required parts, pivots, variants). Then run \`node ${M}/r3/kit/export-parts.mjs rig.svg parts --scale 0.8\` and fix things until it prints problems: [] and recomposeDiffPct under 1.5. Look at parts/rest.png yourself.
3. concept.svg + concept.png (render with \`${M}/render.sh concept.svg concept.png 1600 1000\`), laid out like round 2's sheet (${M}/r3/kit/ref/tuck-r2-concept.png): the character large on the left in its main pose with its name (Chinese + English) and a one-line description; on the right a) scale tests at 96, 48 and 32 px plus black silhouettes at 96 and 48, b) the night paper oklch(21% 0.012 60), c) two small vignettes — one thing it does on the landing page, one emotion. Text in Traditional Chinese.
4. proposal.md in Traditional Chinese (plain, concrete): 角色概念 / 紙材與外型（比例、手腳長短）/ 頭飾（是什麼、為什麼適合它、48px 讀成什麼）/ 個性與情感 / 在首頁上會做的事（出場、兩三個活動、離場、遇到另一隻時怎麼打招呼）/ 仿作檢查（像不像哪個既有角色，怎麼避開）/ 給動畫的備註（哪些部件、哪些變體、注意事項）。
5. Check your own work by looking at renders: the concept at full size and shrunk to 120 px and 48 px tall (save checks/ PNGs); the silhouette for unwanted readings (organs, skin, ears, horns, an animal, an existing character); that the decoration reads as hair or an accessory at 48 px; that the shoulders sit clearly below the mouth line and the brads sit inside the paper edge; that arms at rest end above the hips. Fix what you find, then return.

Keep the effort proportionate: one character, one sheet, one rig — no extra variants, no animation, no turnaround.`

const CAST = [
  { slug: 'tuck', label: 'tuck', brief: `Your character: 摺摺 Tuck itself, revised (prefix tk-). It is the owner's chosen design, so change only what the owner asked, and keep everything else they liked: the sage torn sheet, the dog-ear corner folded over a few lines of hidden pencil writing, the face (eyes, glints, mouth, three-stroke terracotta blush), the wheat accordion legs, sage feet, cream thumbed mittens, brass brads, the white fibre rim and glue shadow. Start by copying ${M}/r2/c2/gen/* into your folder's gen/ (never edit the round-2 files) and work from there.
Changes, all four from the owner's words above:
- Shoulders lower: the brad pivots go clearly below the mouth line, around the middle of the sheet (round 2 had them at eye-to-blush height, ~y420 in Tuck's own coordinates, with the mouth at ~y445).
- Brads inward: on the sheet's face, about 1.5–2.5 brad radii in from the torn outline, the arm strip tucked under the edge behind the brad (round 2 pinned them on the outline itself).
- Arms shorter, for cuteness: at rest the mitten centre sits around the hip line, never by the knees; raised in the "hi" pose the mitten must still clearly read as a raised hand at 96 and 48 px (beside or just above the top of the head — test the silhouette; if shorter arms can't get the mitten that high, angle the strip or lift the shoulder within the rule, and say what you chose).
- The torn tab on the head goes: replace it with a head decoration that reads at 48 px as hair or an accessory — your choice between a small tuft of torn paper hair and a clip (e.g. a brass paper clip, matching the brads), or a better idea in the same spirit; it becomes the rig's deco part. Never a single upright prong.
Also fix what round 2's verification found: no pose may put the two mittens together at the lower belly centre; make the thumb readable at 200 px; the main pose stays "hi" (one mitten raised).
Extra deliverable: checks/before-after.png — round 2 (${M}/r2/c2/character.png) beside the revision at the same scale, with short Chinese labels for the four changes.
Its torso-alt variant: the dog-ear lifted open on its writing.`},
  { slug: 'tag', label: 'tag', brief: `Your character (prefix tg-): the mist-blue die-cut card-stock gift tag from kit.md's cast table — tall pentagon, about 1.35× Tuck's height, slim; cleanly cut edges (a little hand-cut wobble, smaller displacement than Tuck's tear, same rim and shadow so it is unmistakably paper); a reinforced eyelet ring near the top with the tag's own string through it, tied into a bow — that bow is its head decoration (deco; tails can be deco-back). Long legs (paper strips, accordion, or strips with a small brad at the knee — your call, keep them paper), short arms ending in the family's cream mittens on brass brads set inside the edge, shoulders below the mouth line. Its back carries a handwritten 「給：」 line (torso-alt = the tag seen turned round). Personality to start from: gentle, a little formal, a messenger who always means to give something to someone — make it your own. Name: a reduplicated two-character Chinese name like 摺摺, plus a short English name. Watch that the pentagon top plus a bow doesn't read as a house, a bell, a gift box or an existing character, and that a tall slim body on long legs doesn't read as a person in a costume.` },
  { slug: 'card', label: 'card', brief: `Your character (prefix cd-): the lavender index card in landscape from kit.md's cast table — about 0.8× Tuck's height and 1.4× its width, rounded corners, one terracotta header rule, faint ruled lines, a few words of handwriting (torso-alt: your choice of a small reveal, e.g. the card flipped to a fuller page of writing, or skip it). Short stubby legs, longer arms (it hugs) ending in the family's cream mittens on brass brads set inside the edge, shoulders below the mouth line. Head decoration: a hat that suits it (a felt beret, a folded paper hat, a small knitted cap — your call; a hat-tip is one of its gestures, so let the deco pivot at the brim). Personality to start from: warm, steady, a big-hearted listener — make it your own. Name: a reduplicated two-character Chinese name like 摺摺, plus a short English name. Watch that a wide rectangle with a face doesn't read as a TV, a box, a sponge, a bus or an existing character (SpongeBob especially), and that a lined card doesn't become a literal UI icon.` },
  { slug: 'dot', label: 'dot', brief: `Your character (prefix dt-): the butter-yellow hole-punch dot from kit.md's cast table — the circle punched out of someone's page, a fragment of a ruled line or a couple of letters of someone's handwriting running across it (a piece of another's story), about 0.55× Tuck's height: the little one. A clean punched edge that is still paper (a slight bur, the rim, the shadow). Tiny folded-tab legs (data-walk="hop": it hops rather than walks), tiny arms ending in tiny cream mittens on small brads set inside the edge, shoulders below the mouth line. Head decoration: hair — a quilled paper curl (a strip of paper rolled into a curl), or your own better idea in the same spirit. Personality to start from: energetic, curious, quick to hop over to anyone — make it your own. Name: a reduplicated two-character Chinese name like 摺摺, plus a short English name. Watch that it never reads as a chick (LINE's Sally), Kirby, a smiley emoji, a coin, a sun, an egg yolk or a pom-pom creature; keep its chroma high enough that it is butter yellow, not beige or skin.` },
  { slug: 'night', label: 'night', brief: `Your character (prefix nt-): the midnight-blue paper from kit.md's cast table — a softly torn dome (flat bottom, round top), about 0.95× Tuck's height, with a few pin-pricked star holes (stars part: tiny holes showing a light dot in day; stars-glow, data-only="dark", a soft glow through them on the night paper). Its face in white or pale pencil — the family's face in a light pen (its eye and mouth parts still follow the contract). Medium legs, medium arms ending in the family's cream mittens on brass brads set inside the edge, shoulders below the mouth line. Head decoration: a clip — a small paper crescent or a star — or your own better idea in the same spirit. Personality to start from: quiet, a little sleepy, the one who reads stories under starlight; it naps on the footer at night — make it your own (consider an extra variant of the eyes for sleepy). Name: a reduplicated two-character Chinese name like 摺摺, plus a short English name. Watch that the dome never reads as a ghost, an onigiri, a soot sprite, a tombstone or a blob; make sure it stays readable on the day paper and on the night paper (its white fibre rim and the stars help).` },
]

const DRAW_SCHEMA = {
  type: 'object',
  properties: {
    slug: { type: 'string' }, name_zh: { type: 'string' }, name_en: { type: 'string' }, one_liner: { type: 'string' },
    paper: { type: 'string' }, deco: { type: 'string' }, proportions: { type: 'string' },
    landing: { type: 'array', items: { type: 'string' } }, greeting: { type: 'string' },
    concept_png: { type: 'string' }, rig_svg: { type: 'string' }, manifest: { type: 'string' }, proposal_md: { type: 'string' },
    variants: { type: 'array', items: { type: 'string' } },
    export_problems: { type: 'array', items: { type: 'string' } }, recompose_diff_pct: { type: 'number' },
    concerns: { type: 'array', items: { type: 'string' } },
  },
  required: ['slug', 'name_zh', 'name_en', 'one_liner', 'deco', 'concept_png', 'rig_svg', 'manifest', 'proposal_md', 'export_problems', 'concerns'],
}

const STAGE = `${SCOPE}

${OWNER}

The landing part of their request: 「完成之后，帮我在 landing 这边…进到页面的时候会 random 位置，然后会有可能一到两只的角色出现在画面上，那他可能会进来动一动，然后做点事情。啊，不确定要怎么跟现在页面上的元素来互动，然后结束之后，它可能会走出画面，那可能会有新的角色走进来…然后他们相遇的时候可以有一些互动…然后可能它的大小要小一点点嘛。」

Your task: build the landing-page stage — the animation engine and a working prototype of it on the live landing page's captures. Five other agents are drawing the five characters right now; you work from the rig contract and placeholders, so the real cast drops in later without code changes.

Read ${M}/r3/kit/kit.md first (the rig contract and the stage spec are binding; the stage spec is the lead's design — implement it, and say where you would change it). Look at ${M}/r3/landing/ (desktop-light.png / desktop-dark.png: 1440 CSS px wide at 1×; mobile-light.png / mobile-dark.png: 390 CSS px wide at 2×; anchors.json: element rectangles in CSS px, page coordinates). The exporter ${M}/r3/kit/export-parts.mjs and its output format (${M}/r3/kit/test/out/manifest.json from ${M}/r3/kit/test/rig.svg) define what a character is at runtime. ${M}/r3/kit/cdp.mjs drives headless Chrome (open, eval, screenshots) for your own testing.

Build in ${M}/r3/stage/:
1. mascot-stage.js — the engine, a framework-free ES module with no dependencies, written so it can later be wrapped by a React component on the real site. It knows nothing about screenshots: it gets an environment adapter (ledges in page coordinates, the viewport, a way to put a character behind an element, the theme, reduced motion, a clock) and a cast (manifests + image base URLs). Characters are DOM: nested containers root → body → face with one <img> per part, CSS transforms about the pivots, variants swapped by visibility; GPU-friendly (transforms and opacity only), no SVG filters at runtime.
   - Implement the stage spec: scheduler (first visitor after 1.2–2.5 s, visits 9–16 s, gaps 3–7 s, ≤ 2 on screen, no repeat), spots chosen at random among ledges in view, entrances (walk in from the nearer edge, rise from behind an element, hop in for data-walk="hop"), activities (read/sit with legs over the front, wave, look around, swing legs, stretch, beckon, point, nap, the torso-alt reveal when a character has one, deco wiggle/tip, hop, stars twinkle when present), exits, the meeting (notice → approach → wave → resonate: synced bobbing with three small wavy pencil lines pulsing between them, blush; variants: hand over a folded note, mitten high-five), hover (look at the pointer, small wave), click/tap (hop with shut eyes; a second click: shy, leave), blinks, walking (legs swing about hips, body bobs and tilts toward travel, arms swing opposite, the face slides toward the travel direction — never a horizontal flip).
   - Poses step at 12 fps by default (cut-paper stop motion), switchable to smooth. Pause when the document is hidden or the stage is off screen. Reduced motion: one character standing still at a hero spot, nothing moving. aria-hidden; pointer events only on characters.
   - Size: Tuck (data-height 420) is 120 CSS px tall on desktop, 88 on a phone; every character scales by its data-height relative to 420; a size multiplier is an option.
2. Ledges for the prototype, from anchors.json plus what you measure from the captures: the two hand-drawn waves (the hero's bottom edge, the terracotta CTA section's top edge) as polylines y(x) — scan the light captures column by column for the colour change — for desktop and mobile; the card tops; the headline top; the avatar row's end; the QR card; the badges; the feed title; the 瀏覽所有故事 and 寫下你的故事 buttons; the footer logo. Store them as data (ledges.json) with kinds the engine understands (walk-along line, sit edge, peek-behind rect, stand spot).
3. prototype.js + index.html — a standalone page that shows the landing capture in a scrollable browser-window frame (desktop: the 1440-wide page scaled to fit the column, the window 900 page-px tall; mobile: a 390 × 844 phone frame) with the stage living on it, and controls labelled in Traditional Chinese: 桌機 / 手機, 淺色 / 深色 (swap captures; stars-glow on dark), 下一位, 讓兩隻相遇, 大小 (60–160 %), 動畫：每秒 12 格（紙偶感）/ 流暢, 減少動態, 顯示落腳點 (draw the ledges). "Behind an element" in the prototype = a crop of the capture over the character, clipped to that element's rectangle. Export \`mountPrototype(container, { cast, base })\` so the lead can drop the same prototype into the proposal page. Convert the captures you use to WebP (cwebp is installed) to keep the page light; every path relative (it will be published as a claude.ai artifact: no external scripts or fonts other than Google Fonts, no fetch to other origins, try/catch around any storage, page works at 390 px wide without horizontal scroll, :root colour tokens with a prefers-color-scheme dark block guarded by :root:not([data-theme="light"]) and a :root[data-theme="dark"] block, explicit body background).
4. Placeholders until the cast arrives: make two or three placeholder rigs per the contract in stage/placeholders/<name>/rig.svg (simple paper-ish shapes in different proportions — one tall, one small with data-walk="hop", one Tuck-sized — with the required parts and a deco), export each with the kit exporter into stage/placeholders/<name>/parts. The cast list is configuration (an array of { slug, base } pointing at parts folders), so later the lead can point it at ${M}/r3/{tuck,tag,card,dot,night}/parts by copying them into stage/cast/<slug>/ — write a tiny script stage/sync-cast.sh that does that copy and regenerates the cast list from whatever folders exist.
5. README.md (short, Traditional Chinese is fine): the engine's API, the behaviours and how they are chosen, how a real site would supply ledges (e.g. data-mascot-ledge attributes on elements, the waves from their own path data), and how to port it into the Next.js landing page later (do NOT touch the Resonance repo now).

Test it yourself with headless Chrome through ${M}/r3/kit/cdp.mjs: load index.html (file://) on desktop and on mobile, both themes; check the console is clean; screenshot at several moments (e.g. 3 s, 7 s, 12 s, and during a forced meeting via the button or a URL flag) into stage/checks/; measure frame time with a rAF loop; fix what looks wrong (feet floating off a ledge, characters clipped wrongly, z-order, jitter). Keep the code readable and the file count small. Return what you built and what is left.`

const STAGE_SCHEMA = {
  type: 'object',
  properties: {
    index_html: { type: 'string' }, engine_js: { type: 'string' }, prototype_js: { type: 'string' }, readme: { type: 'string' },
    ledges_json: { type: 'string' }, sync_script: { type: 'string' },
    checks: { type: 'array', items: { type: 'string' } },
    behaviours: { type: 'array', items: { type: 'string' } },
    frame_ms: { type: 'string' },
    spec_changes: { type: 'array', items: { type: 'string' } },
    known_issues: { type: 'array', items: { type: 'string' } },
  },
  required: ['index_html', 'engine_js', 'prototype_js', 'readme', 'checks', 'behaviours', 'known_issues'],
}

phase('Draw')
const drawn = CAST.map(c => agent(`${SCOPE}

${OWNER}

You draw exactly one character of the series — the brief says one subagent per character concept (「若使用 Subagent，每個 Subagent 僅負責一個角色概念」). Your folder: ${M}/r3/${c.slug}/.

${c.brief}

${COMMON}`, { label: `draw:${c.label}`, phase: 'Draw', schema: DRAW_SCHEMA }))

const stage = agent(STAGE, { label: 'stage', phase: 'Stage', schema: STAGE_SCHEMA })

const results = await Promise.all([...drawn, stage])
return { drawn: results.slice(0, 5), stage: results[5] }
