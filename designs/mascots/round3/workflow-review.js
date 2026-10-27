export const meta = {
  name: 'mascot-round3-review',
  description: 'Round 3 review: three critics (series form, landing stage, blind first impression), then one reviser per character and one stage fixer',
  phases: [
    { title: 'Review', detail: 'series-form critic, stage critic, blind first-impression reader' },
    { title: 'Revise', detail: 'one reviser per character + one stage fixer' },
  ],
}

const M = '/private/tmp/claude-501/-Users-ncchen-Documents-Resonance/3169a3a1-407a-43b9-a40d-6b2f52c2622f/scratchpad/mascots'
const R = `${M}/r3`

const SCOPE = `SCOPE: The owner (業主) may send new chat messages while you work; the lead agent handles those — they are not your task. Your task is the one below, from the owner's request of 2026-10-27 (dictated, simplified Chinese), quoted where it matters. Never edit anything in the Resonance repo (/Users/ncchen/Documents/Resonance) or in rounds 1–2 (${M}/r1, ${M}/r2).`

const OWNER = `The owner picked direction C, 摺摺 Tuck, and asked: fix Tuck — 「肩膀的关节…几乎是在眼睛的下面一点的位置…再往下放一点点」, 「这个图钉…向内移一点点，因为现在有点像是定在边缘」, 「手…短一点点…会比较可爱」, and the thing on its head 「看不出来它是什么东西。有点像耳朵，又不是耳朵」 → hair or a decoration (「蝴蝶结，或是戴个帽子…看他自己喜欢什么样的装饰」); then 「制作一个系列的这种方向 C 的这个角色…五只」 where 「不同角色他可能身体的形状和手手脚长短可以不太一样」; and the landing page: 「进到页面的时候会 random 位置，然后会有可能一到两只的角色出现在画面上，那他可能会进来动一动，然后做点事情…跟现在页面上的元素来互动，然后结束之后，它可能会走出画面，那可能会有新的角色走进来…他们相遇的时候可以有一些互动…它的大小要小一点点」 (round 2's landing mock had Tuck ≈ 200 px tall; this round shows it at 120 px on desktop, 88 on a phone).`

const STATE = `State of round 3: five characters drawn, one subagent each, in ${R}/<slug>/ (tuck 摺摺 Tuck, tag 牽牽 Twine, card 聆聆 Nod, dot 點點 Pip, night 悄悄 Hush): gen/ (Node generator: \`node gen/build.mjs\` from that folder writes rig.svg + concept.svg), rig.svg, parts/ (exported by ${R}/kit/export-parts.mjs: one PNG per part + manifest.json + rest.png), concept.svg/png (1600×1000 sheet), proposal.md (zh-TW), checks/. The binding kit (series grammar, rig contract, stage spec) is ${R}/kit/kit.md. Lineups at shared scale: ${R}/review/lineup-full.png (rest pose, day and night) and ${R}/review/lineup-stage.png (at stage size 120 px for Tuck, and at 48 px). The landing stage prototype is ${R}/stage/ (README.md explains files, URL flags and the engine API; index.html opens over file://; check.mjs is the headless check; checks/ has its screenshots). Headless Chrome helper: ${R}/kit/cdp.mjs (launch() → open(url,{width,height,dpr,mobile,dark,transparent,wait}) → {eval, send, shot}); render an SVG/HTML to PNG with ${M}/render.sh <in> <out.png> [w] [h]. The owner's form rules from round 2 still hold: no skin tones, no necks, no mammal ears, no stock face, no plush kit, nothing that recalls an existing character (/Users/ncchen/Documents/Resonance/designs/mascots/round2/brief.md).`

const SERIES_CRITIC = `${SCOPE}

${OWNER}

${STATE}

You are the series-form critic for round 3. You write; you never edit the characters or the stage.

Step 1 — your own first read, before reading any notes: look at ${R}/review/lineup-full.png, ${R}/review/lineup-stage.png, each ${R}/<slug>/concept.png and parts/rest.png. Make your own check renders where useful (e.g. a silhouette lineup, greyscale, the five at 120 px and 48 px on the day paper oklch(96.5% 0.015 75) and the night paper oklch(21% 0.012 60), each beside the landing capture ${R}/landing/desktop-light.png) into ${R}/review/checks/series-*.png. Write down your first read in ${R}/review/critic-series.md under 「第一印象」 before reading anything else.

Step 2 — then read kit.md, the five proposal.md files, the owner's feedback (/Users/ncchen/Documents/Resonance/designs/mascots/round2/feedback.md) and finally the lead's notes ${R}/review/lead-notes.md, and write the critique in the same file (Traditional Chinese, plain and concrete):
- Does Tuck now do exactly what the owner asked (shoulders clearly lower, brads inside the edge, arms shorter, a head piece that reads as hair or an accessory, not an ear)? Compare with ${R}/tuck/checks/before-after.png and ${M}/r2/c2/character.png.
- Does the five read as one family and still as five different people? Distinct silhouettes at 48 px? Colour harmony on both papers? Relative sizes on the page (is the tallest too big for 「小一點點」)?
- Each head decoration: does it read at 48 px as hair or an accessory, never an ear/horn/antenna?
- Cuteness and appeal: which ones the owner will love, which feel weaker and why.
- Originality: any member that recalls an existing character, brand, emoji or app icon.
- Faults in the drawing itself: anything detached, misaligned, muddy, unreadable at stage size, a brad on an edge, an arm reaching below the hips, skin-tone areas.
Then, for each character, a verdict (keep / revise) with must-fix and should-fix items written as instructions a reviser can apply (which part, what change, in rig units or by proportion), and what must be kept. Be honest: if one is already good, say keep and give at most small should-fix items. Don't ask for longer arms (the owner asked for shorter ones), and don't redesign a character from scratch unless it fails badly.`

const STAGE_CRITIC = `${SCOPE}

${OWNER}

${STATE}

You are the landing-stage critic for round 3. You test and write; you never edit the stage or the characters.

Run the prototype ${R}/stage/index.html in headless Chrome through ${R}/kit/cdp.mjs (read ${R}/stage/README.md for the URL flags: view, theme, fps, size, reduced, ledges, scroll, meet, at/who/do, seed; and ${R}/stage/check.mjs for how the existing check drives it). Watch it the way a visitor would:
- Frame sequences: at desktop (1440 wide window, the prototype's frame) and phone, light and dark, 12 fps and smooth: capture a frame every 200–250 ms for 20–30 s from load with a few different seeds, and save contact sheets to ${R}/review/checks/stage-*.png. Also scroll the page to the feed, the CTA and the footer and watch there.
- Force each character through its activities and spots (at/who/do), each meeting variant (meet=1 with each variant), hover and click (CDP Input.dispatchMouseEvent) and reduced motion.
Look for: parts coming apart or misaligned when they rotate (arms off their brads, mittens floating, legs off hips, faces sliding off the paper, a variant showing with the wrong part), z-order mistakes, feet not on the ledge, occluder seams, a back view still showing the face, characters covering text or controls they shouldn't, two characters overlapping, jitter, anything that looks broken at 120/88 px; then the quality of the behaviour: does it feel alive and charming, is it too busy or too sparse, are the interactions with page elements legible at that size, do entrances/exits and meetings read, is the timing right, is the size 「小一點點」 enough on desktop and on a phone. Also read ${R}/review/lead-notes.md AFTER forming your own view (one note mentions a faded 點點 at the mobile headline in ${R}/stage/checks/mobile-light-7s.png — find out what it is).

Write ${R}/review/critic-stage.md (Traditional Chinese): what works, then findings ranked must / should / nice, each with evidence (which capture), the cause in the code where you can find it (file:line in mascot-stage.js / prototype.js / ledges.json / measure-ledges.py), and a concrete fix. Also findings that belong to a character's rig (e.g. a pivot in the wrong place, a part too big) — name the character.`

const BLIND = `${SCOPE}

You are a first-time viewer. Open ONLY these images and nothing else (no .md, .svg, .mjs, .json, no folder listings beyond this one): ${R}/review/blind/lineup-day.png, ${R}/review/blind/lineup-night.png, ${R}/review/blind/silhouettes-96.png, ${R}/review/blind/silhouettes-48.png, and ${R}/review/blind/1.png … 5.png. They show five small paper-craft characters, numbered 1–5 left to right, meant to wander on the landing page of a storytelling app (Resonance 共振: people write true life stories and respond to each other's). At their real size they are about 50–160 px tall.

Answer honestly and specifically, in Traditional Chinese: for each number — what it is (what object or creature you think it is made from), what it reminds you of (any existing character, mascot, brand, emoji, app icon, toy — name it even if the resemblance is slight), what its head piece reads as, how clear it is at the small sizes (1–5) and how appealing (1–5), and anything that looks off or broken. Then: which one doesn't seem to belong to the family, which is your favourite and why, and your overall impression of the five together. Write the same into ${R}/review/blind.md.`

const CHAR_LIST = [
  { slug: 'tag', n: 1, name: '牽牽 Twine' },
  { slug: 'tuck', n: 2, name: '摺摺 Tuck' },
  { slug: 'night', n: 3, name: '悄悄 Hush' },
  { slug: 'card', n: 4, name: '聆聆 Nod' },
  { slug: 'dot', n: 5, name: '點點 Pip' },
]

const CRITIC_SCHEMA = {
  type: 'object',
  properties: {
    report_md: { type: 'string' },
    first_read: { type: 'string' },
    per_character: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          slug: { type: 'string', enum: ['tuck', 'tag', 'card', 'dot', 'night'] },
          verdict: { type: 'string', enum: ['keep', 'revise'] },
          must_fix: { type: 'array', items: { type: 'string' } },
          should_fix: { type: 'array', items: { type: 'string' } },
          keep: { type: 'array', items: { type: 'string' } },
        },
        required: ['slug', 'verdict', 'must_fix', 'should_fix', 'keep'],
      },
    },
    series: { type: 'array', items: { type: 'string' } },
  },
  required: ['report_md', 'first_read', 'per_character', 'series'],
}

const STAGE_SCHEMA = {
  type: 'object',
  properties: {
    report_md: { type: 'string' },
    works: { type: 'array', items: { type: 'string' } },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          severity: { type: 'string', enum: ['must', 'should', 'nice'] },
          area: { type: 'string', description: 'engine | prototype | ledges | rig:<slug> | size | behaviour' },
          evidence: { type: 'string' },
          cause: { type: 'string' },
          fix: { type: 'string' },
        },
        required: ['severity', 'area', 'evidence', 'fix'],
      },
    },
    size_view: { type: 'string' },
  },
  required: ['report_md', 'works', 'findings', 'size_view'],
}

const BLIND_SCHEMA = {
  type: 'object',
  properties: {
    per_character: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          n: { type: 'integer', minimum: 1, maximum: 5 },
          reads_as: { type: 'string' }, reminds_of: { type: 'array', items: { type: 'string' } },
          head_piece: { type: 'string' }, clarity: { type: 'integer', minimum: 1, maximum: 5 },
          appeal: { type: 'integer', minimum: 1, maximum: 5 }, off: { type: 'string' },
        },
        required: ['n', 'reads_as', 'reminds_of', 'head_piece', 'clarity', 'appeal', 'off'],
      },
    },
    off_family: { type: 'string' }, favourite: { type: 'string' }, overall: { type: 'string' },
  },
  required: ['per_character', 'off_family', 'favourite', 'overall'],
}

phase('Review')
const [series, stageCritic, blind] = await parallel([
  () => agent(SERIES_CRITIC, { label: 'critic:series', phase: 'Review', schema: CRITIC_SCHEMA }),
  () => agent(STAGE_CRITIC, { label: 'critic:stage', phase: 'Review', schema: STAGE_SCHEMA }),
  () => agent(BLIND, { label: 'blind-read', phase: 'Review', schema: BLIND_SCHEMA }),
])
log(`critics back: series ${!!series}, stage ${!!stageCritic}, blind ${!!blind}`)

const REVISE_SCHEMA = {
  type: 'object',
  properties: {
    slug: { type: 'string' },
    changed: { type: 'array', items: { type: 'string' } },
    declined: { type: 'array', items: { type: 'object', properties: { item: { type: 'string' }, why: { type: 'string' } }, required: ['item', 'why'] } },
    concept_png: { type: 'string' }, before_after_png: { type: 'string' },
    height: { type: 'number' }, export_problems: { type: 'array', items: { type: 'string' } }, recompose_diff_pct: { type: 'number' },
    concerns: { type: 'array', items: { type: 'string' } },
  },
  required: ['slug', 'changed', 'declined', 'concept_png', 'before_after_png', 'export_problems', 'recompose_diff_pct', 'concerns'],
}

const FIX_SCHEMA = {
  type: 'object',
  properties: {
    fixed: { type: 'array', items: { type: 'string' } },
    declined: { type: 'array', items: { type: 'object', properties: { item: { type: 'string' }, why: { type: 'string' } }, required: ['item', 'why'] } },
    default_size: { type: 'string' },
    checks: { type: 'array', items: { type: 'string' } },
    known_issues: { type: 'array', items: { type: 'string' } },
  },
  required: ['fixed', 'declined', 'default_size', 'checks', 'known_issues'],
}

const seriesLines = series ? series.series : []
const stageFindings = stageCritic ? stageCritic.findings : []

function reviserPrompt(c) {
  const mine = series ? series.per_character.find(p => p.slug === c.slug) : null
  const blindMine = blind ? blind.per_character.find(p => p.n === c.n) : null
  const stageMine = stageFindings.filter(f => (f.area || '').includes(c.slug) || (f.evidence + ' ' + (f.fix || '')).includes(c.name.split(' ')[0]) || (f.evidence + ' ' + (f.fix || '')).includes(c.name.split(' ')[1]))
  return `${SCOPE} Work only in ${R}/${c.slug}/ (your character's folder); never touch another character's folder, ${R}/kit or ${R}/stage.

${OWNER}

${STATE}

You revise ${c.name} (${R}/${c.slug}/) after review. First keep the first pass for the record: if ${R}/${c.slug}/v1/ doesn't exist, copy rig.svg, concept.svg, concept.png, proposal.md, parts/rest.png and gen/ into it (never edit v1/ afterwards).

Read the series critic's report ${R}/review/critic-series.md, the stage critic's ${R}/review/critic-stage.md and the blind reader's ${R}/review/blind.md (your character is number ${c.n} there). Then your folder's proposal.md and gen/.

Series critic on you: ${JSON.stringify(mine)}
Series-level points: ${JSON.stringify(seriesLines)}
Blind reader on number ${c.n}: ${JSON.stringify(blindMine)}
Stage findings that may touch your rig: ${JSON.stringify(stageMine)}

Apply every must-fix unless it contradicts the owner's words or the kit (then decline it and say why); weigh the should-fix items and the blind reader's impressions with your own eye — take what makes the character better, decline the rest with a reason. Don't lengthen arms (the owner asked for shorter ones), keep shoulders below the mouth and brads inside the edge, keep what the critics say to keep. If a back or reveal view (torso-alt) should not show the face, add data-hides="face" (and any other part names, space-separated) to that variant's group — the exporter now passes it to the manifest as hides (kit.md, "Added after the first drawing pass").

If the verdict is keep and nothing is worth changing, change nothing and say so (still return the fields: before_after_png can then be the current concept.png).

After changes: \`node gen/build.mjs\`, re-export (\`node ${R}/kit/export-parts.mjs rig.svg parts --scale 0.8\` → problems [], recomposeDiffPct < 1.5), re-render concept.png (\`${M}/render.sh concept.svg concept.png 1600 1000\`), update proposal.md where it changed (add a short 「第三輪評審後修改」 section at the end listing what changed and why, in Traditional Chinese), and save checks/review-before-after.png (v1 rest beside the revision, same scale, short Chinese labels). Look at the result yourself at 120 px and 48 px on both papers before returning.`
}

const FIXER = `${SCOPE} Work only in ${R}/stage/ (you may read everything else); never edit a character's folder or ${R}/kit.

${OWNER}

${STATE}

You fix the landing stage after review. Read ${R}/stage/README.md, the stage critic's report ${R}/review/critic-stage.md and its findings below, the series critic's ${R}/review/critic-series.md (for size and anything about how characters should behave), and kit.md's stage spec and its addendum.

Stage findings: ${JSON.stringify(stageFindings)}
Stage critic's view on size: ${JSON.stringify(stageCritic ? stageCritic.size_view : null)}
Series-level points: ${JSON.stringify(seriesLines)}

Do:
1. Fix every must finding and the should findings you agree with (decline the rest with a reason). Findings marked rig:<slug> belong to the character revisers working in parallel — don't work around a rig problem in the engine unless the engine is really at fault; note them in known_issues.
2. Support the manifest's new \`hides\` field: while a variant part with hides shows, hide the parts it names, and the word face hides the whole face group (e.g. the tag's back). Keep everything working when hides is absent (older manifests).
3. Default size: decide with the two critics' views — the owner wants the characters 「小一點點」 than round 2's ~200 px; it is 120/88 now. Keep the 大小 slider. Say what you chose and why.
4. Keep the stage's guarantees (aria-hidden, pointer events on the characters only, no layout shift, paused when hidden/off screen, reduced motion = one still character, ≤ 2 characters, 12 fps stepped default).
5. The character revisers are re-exporting parts at the same time. Don't copy their parts until you are done with the engine; at the very end run \`bash ${R}/stage/sync-cast.sh\` once (it copies whatever is exported and rebuilds cast.js and stage.bundle.js), then \`node ${R}/stage/check.mjs\` and look at the new screenshots in ${R}/stage/checks/. Update README.md (what changed) and return.`

phase('Revise')
const results = await parallel([
  ...CHAR_LIST.map(c => () => agent(reviserPrompt(c), { label: `revise:${c.slug}`, phase: 'Revise', schema: REVISE_SCHEMA })),
  () => agent(FIXER, { label: 'stage:fix', phase: 'Revise', schema: FIX_SCHEMA }),
])

return {
  critics: { series, stage: stageCritic, blind },
  revised: results.slice(0, CHAR_LIST.length),
  stage: results[CHAR_LIST.length],
}
