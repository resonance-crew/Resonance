# Building a landing prototype — rules every builder follows

You build ONE prototype of a redesigned landing page for Resonance, to be judged by the owner beside two others.
Read first: /private/tmp/claude-501/-Users-ncchen--claude-spares-spare-pZgTcm/84b65950-01bf-4833-b134-c3a6994644eb/scratchpad/design/BRIEF.md (the owner's words, facts, hard constraints), /private/tmp/claude-501/-Users-ncchen--claude-spares-spare-pZgTcm/84b65950-01bf-4833-b134-c3a6994644eb/scratchpad/design/critique.md §7–§8
(cross-cutting rules), then your own spec /private/tmp/claude-501/-Users-ncchen--claude-spares-spare-pZgTcm/84b65950-01bf-4833-b134-c3a6994644eb/scratchpad/lab/SPEC-<id>.md and the proposal it builds on.

## Where you work

- The worktree **/Users/ncchen/Documents/Resonance-landing** (branch `landing-lab`). NEVER edit /Users/ncchen/Documents/Resonance (the main checkout) — other sessions work there.
- Your files go ONLY in `src/components/lab/landing/<id>/` (and static assets, if any, in `public/lab/<id>/`). Your entry is `src/components/lab/landing/<id>/Page.tsx`, whose default export is the whole page (header and footer included), taking `LabLandingProps` from `../types` (`{ cards, authors, locale }`: the same 6 latest public cards and bylines the real landing reads). It is already registered in `../registry.ts` — do not edit the registry, the route, or any shared file (atoms, molecules, sections, lib, styles, messages, tokens, package.json). Import and reuse shared code freely; if you need a variant of something shared, copy it into your folder and change the copy.
- Your page: http://localhost:3200/zh-TW/lab/landing/<id> (and /en/…). The lab dev server (port 3200) is already running and shared by three builders: never start, stop or restart a server, never `pkill`/`killall` anything; stop only processes you started, by PID.
- Deps available in the worktree: everything in package.json plus **gsap 3.15** (all plugins free: ScrollTrigger, Flip, DrawSVGPlugin, MotionPathPlugin, SplitText, Draggable, InertiaPlugin, CustomEase) and **motion 12** (`motion` vanilla `animate`/`inView`/`scroll`, `motion/react`). Do not install anything. Import animation libraries dynamically (on idle / on intent), never in the first paint's critical path.
- Do not commit. The lead commits.

## How it must behave (from the brief and the critique — non-negotiable)

- **Server HTML is the finished page.** Every word, card and badge is in the server render; puppets appear in the HTML as `PaperPalStill` stills where they belong and come alive after idle (pattern: `src/components/sections/PaperPalsPage/PalStrip.tsx`, `PalsTitleScene.tsx`, `src/lib/mascots/pals/stage.ts` `mountPalStrip`, `src/lib/mascots/pals/titleScene.ts`; `wantsStage`/`whenIdle` from `LandingStage`). Reduced motion → stills, no scroll effects; Save-Data → stills, no engine. JS off → complete page.
- **Do NOT mount the old `LandingStage`** (the random ledge-picker). Each section that has live puppets mounts its own small stage(s) from the section's own geometry (floors, cells, card tops you draw and therefore know), at most one or two sections live at a time (IntersectionObserver), paused off-screen.
- **Puppets get ground, never words**: nobody stands on the h1 or any line of text. **Scroll moves paper (lines, threads, waves, planes), never puppets**; puppet scenes are *cued* and play in their own time. **What the hand moves is smooth; what moves on its own is stop-motion** (the engine's 12 fps).
- Brand: hand-drawn pen lines (`HandDrawnBorder`/`wobRect`, `SectionEdge`, `wavyPath`), stroke widths only `INK` / `INK_LIGHT` / `INK_STRONG` (`src/lib/design/strokes.ts`), grain, OKLCH tokens only (no raw colours — use `var(--…)` from `src/styles/tokens.css`; dark mode must not break), **no shadows of any kind** (no box-shadow, no drop-shadow filter), buttons are fills (`OrganicButton` solid/tonal), outlines mark containers/inputs. Official store badges unmodified (`GetTheApp`).
- Copy: the h1 is 用故事回應故事 with 回應 accented (pen wave) / en "Answer stories with stories", "Answer" accented. No full stops in any subtitle or the footer. No ✦ pill eyebrow; no four-initials proof row (or only at the end beside the write CTA). Put your new copy in `<id>/copy.ts` as `{ 'zh-TW': {...}, en: {...} }` keyed by locale (zh-TW is judged; en must render sensibly, never blank). Reuse `useTranslations('footer')` etc. where today's strings fit.
- Real cards: `StoryCard`/`CardLinkGrid` or your own rendering of `cards`. **Never a grey placeholder cover** (a card without a cover is type only). Anonymous cards show 匿名 / 不署名 and never an author (`authors` already omits them). Quotes in the reading type (`storyType` from `src/lib/text/script.ts`; `.story-prose` / `.story-title` classes from `src/styles/story.css`). Plain-text excerpts: `src/lib/markdown/plainText` (or `card.excerpt` if present).
- Accessibility: one h1; puppets and decoration `aria-hidden`; keyboard reachable controls; a pause control 「讓小紙團休息 / 叫醒小紙團」 (`aria-pressed`, localStorage in try/catch) that stops every stage and looping motion.
- Phone 390 and desktop 1440 must be polished; tablet 820 and 320 must not break; en must not overflow.

## Verify as you go (you are not done until you have looked)

Capture with the lead's tool (Playwright Chromium; writes PNGs/MP4s):
  node /private/tmp/claude-501/-Users-ncchen--claude-spares-spare-pZgTcm/84b65950-01bf-4833-b134-c3a6994644eb/scratchpad/tools/shoot.mjs http://localhost:3200/zh-TW/lab/landing/<id> /private/tmp/claude-501/-Users-ncchen--claude-spares-spare-pZgTcm/84b65950-01bf-4833-b134-c3a6994644eb/scratchpad/lab/<id>/shots/v1 --sizes desktop,phone [--scheme dark] [--wait 8000]
  → <prefix>-desktop-fold.png, -desktop-full.png, -phone-fold.png, -phone-full.png. Read them (they are images) and fix what is off. Iterate. Also check /en and dark once, and 820 (`--sizes tablet`).
For your signature interaction, write /private/tmp/claude-501/-Users-ncchen--claude-spares-spare-pZgTcm/84b65950-01bf-4833-b134-c3a6994644eb/scratchpad/lab/<id>/demo.mjs — an ES module whose default export is `async (page, { size, vp }) => { … }` driving it with Playwright (scroll, tap, type…), and record it:
  node /private/tmp/claude-501/-Users-ncchen--claude-spares-spare-pZgTcm/84b65950-01bf-4833-b134-c3a6994644eb/scratchpad/tools/shoot.mjs <url> /private/tmp/claude-501/-Users-ncchen--claude-spares-spare-pZgTcm/84b65950-01bf-4833-b134-c3a6994644eb/scratchpad/lab/<id>/media/demo --video --demo /private/tmp/claude-501/-Users-ncchen--claude-spares-spare-pZgTcm/84b65950-01bf-4833-b134-c3a6994644eb/scratchpad/lab/<id>/demo.mjs --sizes desktop,phone
Check the browser console for errors (Playwright `page.on('console')` in a small script of your own in /private/tmp/claude-501/-Users-ncchen--claude-spares-spare-pZgTcm/84b65950-01bf-4833-b134-c3a6994644eb/scratchpad/lab/<id>/, or the built-in browser pane via ToolSearch `mcp__Claude_Browser__*` with its own tab — never the tabs named `seed` or `tab-1`).
Before you finish: `cd /Users/ncchen/Documents/Resonance-landing && npx tsc --noEmit -p . 2>&1 | grep "lab/landing/<id>"` must print nothing, and `npx eslint src/components/lab/landing/<id>` must be clean.

## What you return

A short report: what you built (section by section), what you faked or cut and why, known problems, and the paths of your final screenshots and demo video. Write the same into /private/tmp/claude-501/-Users-ncchen--claude-spares-spare-pZgTcm/84b65950-01bf-4833-b134-c3a6994644eb/scratchpad/lab/<id>/REPORT.md.
