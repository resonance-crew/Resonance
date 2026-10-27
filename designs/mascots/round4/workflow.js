export const meta = {
  name: 'mascots-round4-landing',
  description: 'Round 4: give Hush pupils and quiet Pip\'s lines (one agent each), port the stage engine to TypeScript, build the cast assets, integrate the stage into the real landing page for desktop, tablet and phone, then review and fix',
  phases: [
    { title: 'Art and engine', detail: 'Hush eyes, Pip lines, engine port to TypeScript (parallel)' },
    { title: 'Cast', detail: 'cast build script, WebP parts, generated manifests' },
    { title: 'Landing', detail: 'DOM env, three layout presets, the landing component, live checks' },
    { title: 'Review', detail: 'code review and live critic (parallel)' },
    { title: 'Fix', detail: 'apply review findings and re-verify' },
  ],
}

const S = '/private/tmp/claude-501/-Users-ncchen-Documents-Resonance/3169a3a1-407a-43b9-a40d-6b2f52c2622f/scratchpad/mascots/r3'
const REPO = '/Users/ncchen/Documents/Resonance'
const DEV = 'http://localhost:3000'
const CHECKS = S + '/r4'

const HUSH_WORDS = '「啊，首先是这个巧巧 Hush，啊，很喜欢它的设计，但是呢，唯一的问题就是它的眼睛，啊。眼睛因为没有眼球的关系，其实它是有，但看不清楚，所以变成很像，啊、呃，就是眼神空洞，或者说幽灵，哦，这个是比较可惜的地方，不知道有没有办法可以保留它的这个特色在，同时又让它有眼球呢？」'
const PIP_WORDS = '「然后这个点点，啊，点点很可爱，但是我自己感觉它这个啊，笔记本上面的这条线和那个字有点太太抢太抢那个抢眼了，就是。会觉得好像怪怪的，因为那条线好明显，那个字也好明显。在想，如果啊，它、呃、的现在这个颜整支的颜色是很好的，但如果我们把这个纸，譬如说，我们去设想它如果纸是比较久的话，那自然这个颜色就会比较淡，可以维持现在压线的。粗细，或者是就把它改细，我觉得好像第一版的这个线和字也不错，哦，就是不要那么深，但是它的颜色，第二版的整个纸的颜色是好的，但我觉得你把那个把那个颜色改深也是呃有理由的，因为其他角色的这个纸其实是很看得出来它是一张纸嘛，它是什么纸？但如果这个点点就像第一版，它这个线又不明显的话，字也不明显，那它到底是什么纸，对不对？所以。感觉问题好像也不是把它改淡就可以解决的。在想，或许是因为它有点难让人一眼就看出来它是黄色的横线笔记本，或许是因为它只有出现一条线。我不知道这个线如果往上改一点点。然后下面再多一条会怎么样呢？不知道会是什么样的效果，会不会好一些呢？」'
const LANDING_WORDS = '「我觉得上线的时候五只都可以放，然后大小也没有问题。…第五题没问题，照现在的你做的动画就好。然后第六题，啊，我觉得可以，就把你做的动态放进首页，而且你已经做了很多个 preset，我觉得这些都可以使用。…不过也要想一下，在手机上界面不太一样的话，要怎么样子来呈现？所以可能电脑的动态要一版，平板要一版，然后手机要一版嘛，可能是这样子。」'

const SCOPE = (topic, words) => `SCOPE: this agent's task is one part of the owner's latest request in this session, about ${topic}. The owner's own words (dictated, simplified Chinese): ${words} If another, newer message from the owner reaches you, it is handled elsewhere and is NOT your task; do only the task below.

Background: Resonance (共振) is a storytelling site and apps (repo ${REPO}, Next.js 15 + React 19 + TS strict; CLAUDE.md is injected for you). Its brand mascots are a family of five hand-drawn paper puppets (round 3 of a design process, owner-approved): 摺摺 Tuck (slug tuck), 牽牽 Twine (tag), 聆聆 Nod (card), 點點 Pip (dot), 悄悄 Hush (night). Their series rules, rig contract and stage spec are in ${S}/kit/kit.md. Each character's working folder is ${S}/<slug>/ (gen/ generators, rig.svg, parts/ exported by ${S}/kit/export-parts.mjs, concept.svg/png, proposal.md, checks/, v1/ = the round-3 first pass). The landing-page stage prototype (engine + prototype over captures of the live landing page) is ${S}/stage/ (read its README.md). Headless Chrome helper: ${S}/kit/cdp.mjs (launch(), b.open(url,{width,height,dpr,mobile,dark}), p.eval(js), p.shot({full,clip})).

House rules for this run: the repo checkout is shared with other sessions — never git commit, push, stash, reset or checkout; never edit .claude/launch.json; stop only processes you started yourself, by PID (never pkill/killall by pattern); a Next dev server for the repo already runs at ${DEV} (do not start another on that port, do not stop it). Replies, labels in images and any Chinese text: Traditional Chinese. Form rules for the characters: no skin tones, no necks, no mammal ears, no stock face; arms stay short (the owner asked for that).`

const ART_SCHEMA = {
  type: 'object',
  properties: {
    slug: { type: 'string' },
    variants: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, description: { type: 'string' } }, required: ['name', 'description'] } },
    picked: { type: 'string' },
    why: { type: 'string' },
    changed: { type: 'array', items: { type: 'string' } },
    variants_png: { type: 'string' },
    before_after_png: { type: 'string' },
    concept_png: { type: 'string' },
    export_problems: { type: 'array', items: { type: 'string' } },
    recompose_diff_pct: { type: 'number' },
    copied_to_cast: { type: 'boolean' },
    concerns: { type: 'array', items: { type: 'string' } },
  },
  required: ['slug', 'variants', 'picked', 'why', 'changed', 'variants_png', 'before_after_png', 'concept_png', 'export_problems', 'recompose_diff_pct', 'copied_to_cast', 'concerns'],
}

const ART_COMMON = (slug) => `Workflow for this character (folder ${S}/${slug}):
1. Before changing anything, copy the current round-3 state into ${S}/${slug}/v3/ (rig.svg, concept.svg, concept.png, proposal.md, parts/rest.png, gen/ recursively) and never edit v3/ afterwards. v1/ is the round-3 first pass; leave it.
2. Explore the variants below in ${S}/${slug}/work/r4/ (your own scripts and renders), always judged at the sizes the character really has on the landing page: desktop (Tuck = 120 px), tablet (Tuck ≈ 100 px), phone (Tuck = 80 px), with series heights compressed as stage height = unit × (rig height / 420)^0.75, plus 48 px; on the day paper oklch(96.5% 0.015 75) and the night paper oklch(21% 0.012 60), and at 2× device pixels. Render from the exported parts the way the stage composes them where you can (parts/ + manifest), so what you judge is what ships.
3. Write a variants sheet ${S}/${slug}/checks/r4-variants.png: each variant at those sizes on both papers plus a large close-up, the round-3 current version beside them for comparison, labels in Traditional Chinese, and the pick marked (推薦).
4. Apply the pick in the generator (gen/), run node gen/build.mjs, re-export the parts with node ${S}/kit/export-parts.mjs rig.svg parts --scale 0.8 (must report problems [] and recomposeDiffPct < 1.5), re-render concept.png the way it was rendered before (see proposal.md / gen/ for the render command), and write ${S}/${slug}/checks/r4-before-after.png (v3 vs now, same scale, real stage sizes on both papers, labels in Traditional Chinese).
5. Add a section 「第四輪（業主回饋後）」 at the end of proposal.md: the owner's words quoted, each variant tried, the pick and why, exactly what changed (colours as oklch, sizes in rig units), and what you kept.
6. Copy the final rig.svg to ${REPO}/designs/mascots/cast/${slug}/rig.svg and the final parts to ${REPO}/designs/mascots/cast/${slug}/parts/ (manifest.json plus every part image the manifest names; NOT rest.png, recomposed.png, _raw/ or html files). The other three characters are already there (tuck, tag, card); do not touch them.
7. Do not touch any other character's folder, ${S}/stage, or anything in the repo except designs/mascots/cast/${slug}/.
Return the schema: the variants (name + one-line description), the pick and why, the list of changes, absolute paths of the variants sheet, the before/after and the concept png, the export problems and recompose diff, whether you copied to the cast folder, and any concerns (anything the owner should decide or the engine should know, e.g. a new or removed part name).`

const HUSH_PROMPT = SCOPE('悄悄 Hush\'s eyes', HUSH_WORDS) + `

Your task: 悄悄 Hush (slug night). Its eyes today are warm-white pencil ovals filled in, with no pupil (round 3 changed them from pale blue hollow ovals; both read as an empty, ghostly stare). The owner loves the character and wants to keep what makes it itself, but give it eyeballs (眼球) so the look is no longer hollow or ghostly.

Why the eyes are pale at all: Hush is the only dark paper in the family (a night-sky dome, pin-prick stars, a moon hair clip); the family face is small dark bean eyes (豆豆眼) with a catchlight, which would vanish on the dark paper. A pale eye with a dark pupil can keep both: the family's dark bean pupil, and a pale pencil eye that reads on the night paper. Explore at least three treatments, for example: (a) a warm-white pencil eye with the family's dark bean pupil (ink near the other characters' eye colour) and a small catchlight, pupil large enough to fill most of the eye so it never looks startled; (b) the same with the pupil sitting low and toward the centre for a sleepy, kind gaze; (c) a dark pupil with only a thin pale pencil rim around it (most like the family's bean eyes, the rim is what makes it read on dark paper); add your own if you see a better one. Avoid: big white eyes with tiny pupils (startled, mad, googly), anime sparkles, blank or hollow ovals, anything that reads blind or ghostly; keep the eye size roughly as now so the face keeps its proportions. Check every eye state the rig has: eye-l / eye-r (open), eye-*-sleepy (half-lidded: the pupil shows under the lid), eye-*-shut and eye-*-nap (closed arcs — keep them unless they need the new style), and the concept vignettes. On the stage, the night page dims the character layer (filter brightness(0.9) saturate(0.92)); judge night that way too.

` + ART_COMMON('night')

const PIP_PROMPT = SCOPE('點點 Pip\'s ruled line and writing', PIP_WORDS) + `

Your task: 點點 Pip (slug dot), the little disc punched out of a yellow ruled legal-pad page, with one ruled line and the tail of a word 「…ry」 (from "story") on it. Round 3 darkened its paper to oklch(84.5% 0.106 95) — the owner likes this paper colour, keep it — and also made the ruled line a printed blue line oklch(58% 0.06 235), 2.6 wide at opacity 0.8, and the 「…ry」 opacity 0.5. The owner finds the line and the writing too prominent now (太抢眼, 怪怪的); they liked the first version's lighter line and writing (see v1/), but notes that just making them faint again loses what the paper is (a yellow ruled notepad), because there is only one line. Their own idea: move the line up a little and add a second one below. They imagine the paper as old, so its ink has faded naturally; the line may keep its current weight or get thinner.

Explore at least four variants on the current paper, including the owner's idea, for example: (a) the round-1 strength of line and writing on the current paper; (b) the owner's: two ruled lines — the current one moved up a little, a second below at the pad's real spacing for the disc's size — in faded ink (aged paper), same or thinner weight, 「…ry」 faded to match and sitting on one of the lines; (c) like (b) plus a hint of the legal pad's red margin rule (a short faint red vertical line near the left edge — the mark that says "legal pad" at a glance); (d) three faint lines if they still read at the phone's size. Lines must never cross the eyes, mouth or blush, must sit naturally relative to the disc edge and the brads (the arms are tucked behind the disc), and must stay quieter than the face. Also check contrast on the phone hero, where Pip may stand over a pale peach blob (oklch about 90% 0.04 50). Pip is the smallest: desktop ≈ 77 px, tablet ≈ 64 px, phone ≈ 51 px tall on the page.

` + ART_COMMON('dot')

const ENGINE_SCHEMA = {
  type: 'object',
  properties: {
    files: { type: 'array', items: { type: 'string' } },
    api: { type: 'string' },
    tests: { type: 'object', properties: { passed: { type: 'number' }, failed: { type: 'number' } }, required: ['passed', 'failed'] },
    typecheck: { type: 'string' },
    lint: { type: 'string' },
    deviations: { type: 'array', items: { type: 'string' } },
    concerns: { type: 'array', items: { type: 'string' } },
  },
  required: ['files', 'api', 'tests', 'typecheck', 'lint', 'deviations', 'concerns'],
}

const ENGINE_PROMPT = SCOPE('putting the landing animation on the real landing page', LANDING_WORDS) + `

Your task (one part of that): port the reviewed stage engine to TypeScript inside the site. Another agent will later build the landing integration (DOM measurements, the three layouts, the React component) on top of what you write, and another the cast assets; do not do their parts.

Source: ${S}/stage/mascot-stage.js (≈1800 lines, ES module, no dependencies; its header documents the env interface; ${S}/stage/README.md explains every behaviour and the review fixes; ${S}/stage/verify/sim.mjs and ${S}/stage/check.mjs show how it is exercised; ${S}/stage/prototype.js is how the prototype drives it, incl. per-character TRAITS). It is the version the owner approved: keep its behaviour exactly (timings, scheduling, placement rules, acts, meetings and greetings, hover and poke, hides, reduced motion, pausing, 12-fps poses with 24-fps positions, the night dim, torso-only pointer shapes).

Write it under ${REPO}/src/lib/mascots/: strict TypeScript, no new dependencies, no \`any\` (use precise types or unknown + narrowing), in the repo's style (read a few files in src/lib/design and src/lib/chat for comment density and naming; comments say why, sparingly). Split into a few modules only where it helps reading (for example types.ts for the env / cast / ledge / options / stage-api types, engine.ts for createStage and the stage class, acts.ts for the activity generators, geometry helpers) — not one module per function. Type the env interface exactly as the header documents it (layer, ledges, viewport(), unitHeight, content, behind?, theme, reducedMotion, clock?, random?, document?), the ledge shapes the engine reads (every field the code reads from a ledge: kinds line/edge/peek/spot and their fields such as points, x, y, side, cover, clear, ceiling, partner, group, radius, ink, zone, weight, meetChance, avoid, first, acts, etc. — derive them from the code and ${S}/stage/ledges.json), the manifest shape (from the cast manifests in ${S}/stage/cast/*/manifest.json and what build.mjs adds: torso.hit, torso-alt.reveal.tip) and the cast entry ({ slug, base, manifest, traits? }). Drop what only the prototype needs: loadCast's fetch (the site will import manifests), the zh-TW ACT_LABELS narration (keep act ids; keep onEvent with structured events, no Chinese strings). Keep createStage's API (start, stop, pause, resume, next, meet, canMeet, visit, setOptions, setTheme, setReducedMotion, advance, refresh, visitors, stats, resetStats, destroy, time) so tests and the integration can drive it.

Tests (vitest, co-located, integration-style, see CLAUDE.md Testing): drive a real stage with a fake env — a jsdom layer, a fake clock and timers advanced by stage.advance(sec), a seeded random, synthetic ledges modelled on the prototype's desktop set (a wave line, a headline edge with a partner, spots with clear and ceiling, a card seat, a peek with a cover) and a cast built from two or three real manifests (you may read ${S}/stage/cast/<slug>/manifest.json in a test fixture you write under src/lib/mascots/ — copy the minimal data you need into a fixture file in the repo, never read the scratch path from a test). Assert what a visitor would notice: over 120 simulated seconds two characters never overlap outside a meeting; a meeting or greeting happens when two are on screen with partners; a back-view variant hides the face (hides); reduced motion shows one still character and schedules no frames; a hidden document pauses; visit({acts}) ignores unknown acts; only the torso shape takes the pointer. Each test must fail if its behaviour broke.

Must pass before you return: npx vitest run src/lib/mascots ; npm run typecheck ; npx eslint src/lib/mascots. Do not touch landing components, designs/, public/ or package.json.
Return: files written; an API summary the integration agent can build on (exported names and signatures, the env interface, the options with defaults, how a cast entry and its image URLs work); test counts; typecheck and lint results; any deviation from the JS behaviour and why; concerns.`

const CAST_SCHEMA = {
  type: 'object',
  properties: {
    files: { type: 'array', items: { type: 'string' } },
    sizes: { type: 'string' },
    how: { type: 'string' },
    tests: { type: 'string' },
    concerns: { type: 'array', items: { type: 'string' } },
  },
  required: ['files', 'sizes', 'how', 'tests', 'concerns'],
}

const CAST_PROMPT = (art, engine) => SCOPE('putting the landing animation on the real landing page', LANDING_WORDS) + `

Your task (one part of that): the cast assets the site serves. The approved cast's sources are ${REPO}/designs/mascots/cast/<slug>/ (rig.svg + parts/manifest.json + part PNGs) for tuck, tag, card, dot, night. dot and night were just revised by two art agents (their reports: ${JSON.stringify(art.map(a => a && { slug: a.slug, changed: a.changed, concerns: a.concerns }))}). The engine was just ported to TypeScript under ${REPO}/src/lib/mascots/ by another agent; its report: ${JSON.stringify(engine && { files: engine.files, api: engine.api, deviations: engine.deviations })}. Read its types (the manifest and cast-entry types) and produce data that satisfies them; if a type needs a field the cast must carry, coordinate by reading the code, and only touch the engine's type file if a field is genuinely missing (say so in your report).

Build:
1. ${REPO}/scripts/mascots/build-cast.ts (run with npx tsx; add "mascots:cast": "tsx scripts/mascots/build-cast.ts" to package.json scripts, nothing else in package.json): for each of the five, read the manifest and part PNGs, and write ${REPO}/public/mascots/<slug>/<part>.webp — alpha WebP through sharp (already a dependency). The parts are exported at manifest.scale (0.8) pixels per rig unit; on the desktop page Tuck (420 units) is 120 CSS px, i.e. ≈0.29 CSS px per unit, so 2× retina needs ≈0.57–0.6 px per unit: downscale accordingly (one factor for all), keep the manifest's geometry consistent with the new pixel size (check how x, y, w, h, pivot and scale are used by the engine before you change any of them), and choose WebP quality so edges and pencil texture stay clean at 2×. Budget: all five together about 700 KB or less; report the sizes.
2. Port ${S}/stage/outline.py (and what ${S}/stage/build.mjs does with it) to TypeScript inside the script: measure each torso's pointer polygon (torso.hit) and the reveal tip of torso-alt (torso-alt.reveal.tip) from the alpha channel with sharp, exactly as the Python did, and put them in the manifests.
3. Write ${REPO}/src/lib/mascots/cast.generated.ts (the script writes it; a header comment says so and how to regenerate): the five manifests (with hit and reveal), each character's traits (copy TRAITS for the five slugs from ${S}/stage/prototype.js), and each image base /mascots/<slug>/ with a content version (a short hash of that character's files, as a ?v= query or in the folder name) so a changed part never meets a stale cache. Export the cast in the engine's cast-entry shape.
4. A co-located test that fails when cast.generated.ts is stale against designs/mascots/cast (e.g. the generated file records a hash of each source manifest.json and part files; the test recomputes it), in the spirit of the OpenAPI staleness test (find it: grep for openapi in src for its pattern).
Run the script, the test, npm run typecheck and npx eslint on your files. Do not touch landing components or engine logic.
Return: files written, the sizes (per character and total), how to regenerate (one line), test result, concerns.`

const LANDING_SCHEMA = {
  type: 'object',
  properties: {
    files: { type: 'array', items: { type: 'string' } },
    presets: { type: 'string' },
    ledges: { type: 'string' },
    checks: { type: 'string' },
    screenshots: { type: 'array', items: { type: 'string' } },
    tests: { type: 'string' },
    typecheck: { type: 'string' },
    lint: { type: 'string' },
    known_issues: { type: 'array', items: { type: 'string' } },
  },
  required: ['files', 'presets', 'ledges', 'checks', 'screenshots', 'tests', 'typecheck', 'lint', 'known_issues'],
}

const LANDING_PROMPT = (engine, cast) => SCOPE('putting the landing animation on the real landing page', LANDING_WORDS) + `

Your task: put the approved landing stage on the real landing page (src/app/[locale]/page.tsx: SiteHeader (fixed) → HeroSection → CardFeedSection → CTASection → SiteFooter), with a desktop, a tablet and a phone version, as the owner asked. Everything the owner approved in the prototype should carry over (the presets: entrances, acts with page elements, meetings near and far, hover and poke, pacing, sizes, reduced motion), now measured from the real page instead of screenshots.

What exists now: the engine in TypeScript under ${REPO}/src/lib/mascots/ (report: ${JSON.stringify(engine && { files: engine.files, api: engine.api, deviations: engine.deviations, concerns: engine.concerns })}); the cast assets (report: ${JSON.stringify(cast && { files: cast.files, sizes: cast.sizes, how: cast.how, concerns: cast.concerns })}). The prototype's ledges, measured from captures of this very page at 1440 and 390 wide, are in ${S}/stage/ledges.json, built by ${S}/stage/measure-ledges.py from ${S}/landing/anchors.json; README.md explains every ledge kind and field (line / edge / peek / spot; cover, radius, clear, ceiling, partner, group, ink, zone, weight, meetChance, avoid, …), the sizes (unitHeight desktop 120, phone 80; heightCurve 0.75) and why each ledge exists. Those are your design reference: re-derive each ledge from the live DOM.

Build:
1. A DOM env (e.g. src/lib/mascots/dom.ts or a folder): the layer, viewport (the part of the page in view below the fixed header — no character may walk under the header), ledges and content rects measured from the real elements, theme from the site's appearance (<html data-scheme>, else prefers-color-scheme; follow changes live — see src/lib/design/appearance.ts), reduced motion from matchMedia (live), a clock on requestAnimationFrame/timers. Measure from the DOM: waves are the SectionEdge SVG paths (sample the path with getPointAtLength through getScreenCTM into page px); text edges from the text's line boxes (calibrate glyph tops against a screenshot: the prototype stood characters on the ink, not the line box); the QR card, badges, avatar row (StorytellerProof), cards (CardLinkGrid items), buttons and the footer from their rects. Re-measure on resize, on fonts.ready, and when the page's height changes (ResizeObserver on the page; card images load late) — never measure per frame. Mark the elements you need with data-mascot="…" attributes added to the existing components (HeroSection, GetTheApp, StorytellerProof, CardFeedSection, CardLinkGrid, CTASection, SiteFooter as needed) — attributes only, no visual change, nothing else in those components.
2. Three presets chosen by the page's width, matching the site's own breakpoints: phone < 640 (the card grid is one column), tablet 640–1023 (two columns), desktop ≥ 1024 (three columns). For each: unitHeight (desktop 120 and phone 80 are approved; choose tablet in between, about 100, and justify it on the page), which ledges exist and their weights, partners and groups, how many characters at once (the phone may want fewer at once on its first screen if two crowd it — judge on the page), meetChance and pacing as in the prototype. The tablet is new: design its ledges for its layout (centred hero, two-column cards). Switching width live (a rotated tablet, a resized window) re-measures and switches preset without errors.
3. The component: a client component (e.g. src/components/sections/LandingStage/) mounted only on the landing page, loaded lazily (next/dynamic with ssr:false, started when the browser is idle after the page has painted), so the landing page's first paint and its server HTML are unchanged and the engine and images load only after. The layer covers the page in page coordinates beneath the fixed header, clips at the page's sides (no horizontal scroll ever), takes no pointer events except the engine's torso shapes, is aria-hidden and out of the tab order. Respect navigator.connection.saveData (no stage). Clean up everything on unmount (observers, listeners, timers, the stage). No new user-visible strings (if you truly need one: both locales and the punctuation rule in CLAUDE.md).
4. Tests (vitest, jsdom, integration-style, CLAUDE.md Testing): the preset by width; ledges measured from a stubbed DOM (rects and an SVG path) give the expected ledges per preset; theme and reduced motion follow live changes; the component mounts nothing for saveData, cleans up on unmount, and the layer is aria-hidden. Each test must fail without the behaviour.
5. Live check against the running dev server (${DEV}/zh-TW and ${DEV}/en; it hot-reloads your edits; first compile can take a minute) with headless Chrome (${S}/kit/cdp.mjs): widths 1440×900, 1280×800, 1024×768, 834×1194, 768×1024, 390×844, 360×740; light and dark; reduced motion. Check: no console errors; document scrollWidth equals clientWidth; characters appear in the first screen within a few seconds, act on page elements, meet or greet; sizes per preset; never under the header; never covering a button's or link's click (elementFromPoint at each button/link centre sampled over time); dark page dims the characters; reduced motion shows one still character; switching width live works. Save screenshots to ${CHECKS}/landing/ and look at them yourself; fix what looks wrong (feet floating above or sunk into ledges, characters on top of text, peeks showing the hidden half, a character cut by the page edge in a way the prototype did not). Compare with the prototype (${S}/stage/index.html via file:// with cdp.mjs) for the same moments.
6. Add a short paragraph to CLAUDE.md (in Architecture, near the landing page / Design System) saying where the landing stage lives, how the cast is rebuilt (npm run mascots:cast from designs/mascots/cast), and the three presets — in the file's own terse style.
Must pass: npx vitest run src/lib/mascots src/components/sections ; npm run typecheck ; npm run lint. Do not change the landing layout or the engine's behaviour (if the engine needs a hook for the DOM env, keep it small and say so). Do not commit.
Return: files; the presets (numbers); the ledges per preset (ids, one line each); what the live checks showed (numbers); screenshot paths; test, typecheck and lint results; known issues.`

const REVIEW_SCHEMA = {
  type: 'object',
  properties: {
    findings: { type: 'array', items: { type: 'object', properties: {
      severity: { type: 'string', enum: ['must', 'should', 'nice'] },
      area: { type: 'string' },
      where: { type: 'string' },
      evidence: { type: 'string' },
      fix: { type: 'string' },
    }, required: ['severity', 'area', 'where', 'evidence', 'fix'] } },
    works: { type: 'array', items: { type: 'string' } },
    report_path: { type: 'string' },
  },
  required: ['findings', 'works', 'report_path'],
}

const CODE_REVIEW = (landing) => SCOPE('putting the landing animation on the real landing page', LANDING_WORDS) + `

Your task: review, read-only, the new landing stage code in ${REPO}: src/lib/mascots/**, the landing component (${JSON.stringify(landing && landing.files)}), scripts/mascots/build-cast.ts, public/mascots/**, the data-mascot attributes added to landing components, and the CLAUDE.md paragraph (git status and git diff show the changes; much is untracked). Do not edit anything.
Look for real defects, with evidence: correctness (state machines, timers and rAF after unmount, a stage left running, races between re-measure and the engine, errors swallowed or thrown in a frame), performance (layout reads per frame, forced reflow in loops, observers firing in loops, image decode on the main thread at a bad time, work while the tab is hidden or the stage idle, bundle weight added to the landing page's first load — confirm the engine is not in the initial chunk), SSR and hydration (no server HTML change, no window access at import), accessibility (aria-hidden, focus, pointer areas over text and buttons, reduced motion), security and the repo's rules (CSP: same-origin images only; no new dependency; TS strict without any; the punctuation and i18n rules if strings were added; tests that would fail without their behaviour; CLAUDE.md conventions), and leaks (listeners, observers, the layer). Run npx vitest run src/lib/mascots src/components/sections, npm run typecheck and npm run lint yourself and report failures.
Write your report to ${CHECKS}/review-code.md (Traditional Chinese or English), then return the findings (must = would ship a bug or break a rule; should = clear improvement; nice = optional), what works, and the report path.`

const LIVE_REVIEW = (landing, art) => SCOPE('putting the landing animation on the real landing page', LANDING_WORDS) + `

Your task: judge, read-only, the landing stage live on the real page and how it compares with the approved prototype. The dev server runs at ${DEV} (/zh-TW and /en). The prototype is ${S}/stage/index.html (open via file:// with ${S}/kit/cdp.mjs; it supports flags such as ?view=desktop|mobile&theme=light|dark&seed=N, see prototype.js). The integration agent's report: ${JSON.stringify(landing && { presets: landing.presets, ledges: landing.ledges, checks: landing.checks, known_issues: landing.known_issues })}. The art agents just revised 悄悄's eyes and 點點's lines: ${JSON.stringify(art.map(a => a && { slug: a.slug, picked: a.picked, why: a.why }))}.
With headless Chrome (${S}/kit/cdp.mjs), at 1440×900, 1024×768, 834×1194, 768×1024, 390×844 and 360×740, light and dark, zh-TW and en, and with reduced motion: watch for at least a few minutes of simulated or real time per layout (take frames every 0.5–1 s for stretches, scroll through the page). Judge as a visitor and as the owner who approved the prototype: do characters come in on the first screen soon enough and not too often, act with the page's elements (QR card, badges, avatars, cards, buttons, waves, footer), meet and greet, look the right size per layout (desktop Tuck 120 px, phone 80, tablet in between), stand on things (feet on the ink, not floating or sunk), peek correctly (the hidden half really hidden), never sit on text or buttons, never go under the fixed header, never make the page scroll sideways, never steal a click (elementFromPoint at each button/link centre over time), dim on the dark page, show one still character with reduced motion; and do 悄悄's new eyes and 點點's new lines read well at their real size? Note anything clearly worse than the prototype, and anything on the tablet or phone that crowds the screen.
Save frames to ${CHECKS}/live/ and write ${CHECKS}/review-live.md (Traditional Chinese), then return findings (must = the owner would see it as broken or wrong; should = clearly better; nice), what works, and the report path. Do not edit any code.`

const FIX_SCHEMA = {
  type: 'object',
  properties: {
    fixed: { type: 'array', items: { type: 'string' } },
    declined: { type: 'array', items: { type: 'object', properties: { item: { type: 'string' }, why: { type: 'string' } }, required: ['item', 'why'] } },
    checks: { type: 'string' },
    screenshots: { type: 'array', items: { type: 'string' } },
    known_issues: { type: 'array', items: { type: 'string' } },
  },
  required: ['fixed', 'declined', 'checks', 'screenshots', 'known_issues'],
}

const FIX_PROMPT = (landing, reviews) => SCOPE('putting the landing animation on the real landing page', LANDING_WORDS) + `

Your task: apply the two reviews of the new landing stage. You own the landing stage code now: src/lib/mascots/**, the landing component (${JSON.stringify(landing && landing.files)}), scripts/mascots/build-cast.ts and public/mascots/**, the data-mascot attributes, and the CLAUDE.md paragraph. The reviews: ${JSON.stringify(reviews)} (full reports in ${CHECKS}/review-code.md and ${CHECKS}/review-live.md).
Fix every "must" and the "should"s that are clearly right; decline with a reason what you judge wrong. Keep the engine's approved behaviour unless a finding shows it is broken on the real page. Then re-run: npx vitest run src/lib/mascots src/components/sections ; npm run typecheck ; npm run lint ; and the live check against ${DEV} with ${S}/kit/cdp.mjs at 1440×900, 834×1194 and 390×844 (light and dark; no console errors, no horizontal scroll, no stolen clicks, characters on the first screen). Save screenshots to ${CHECKS}/fixed/ and look at them. Do not commit.
Return what you fixed, what you declined and why, the check results, screenshot paths, and remaining known issues.`

phase('Art and engine')
const [hush, pip, engine] = await parallel([
  () => agent(HUSH_PROMPT, { label: 'art:hush-eyes', phase: 'Art and engine', schema: ART_SCHEMA }),
  () => agent(PIP_PROMPT, { label: 'art:pip-lines', phase: 'Art and engine', schema: ART_SCHEMA }),
  () => agent(ENGINE_PROMPT, { label: 'engine:port-ts', phase: 'Art and engine', schema: ENGINE_SCHEMA }),
])
const art = [hush, pip]
if (!hush || !pip) log('An art agent returned nothing; the cast step uses whatever is in designs/mascots/cast.')
if (!engine) log('The engine agent returned nothing; later steps read the repo as it is.')

phase('Cast')
const cast = await agent(CAST_PROMPT(art, engine), { label: 'cast:build', phase: 'Cast', schema: CAST_SCHEMA })

phase('Landing')
const landing = await agent(LANDING_PROMPT(engine, cast), { label: 'landing:integrate', phase: 'Landing', schema: LANDING_SCHEMA })

phase('Review')
const [codeReview, liveReview] = await parallel([
  () => agent(CODE_REVIEW(landing), { label: 'review:code', phase: 'Review', schema: REVIEW_SCHEMA }),
  () => agent(LIVE_REVIEW(landing, art), { label: 'review:live', phase: 'Review', schema: REVIEW_SCHEMA }),
])
const reviews = {
  code: codeReview && codeReview.findings,
  live: liveReview && liveReview.findings,
}

phase('Fix')
const fix = await agent(FIX_PROMPT(landing, reviews), { label: 'fix:landing', phase: 'Fix', schema: FIX_SCHEMA })

return { art, engine, cast, landing, reviews: { code: codeReview, live: liveReview }, fix }
