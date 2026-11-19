# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**How this guide is laid out** (since 2026-11-13 — the single 159 KB file it replaced is mapped, paragraph by paragraph, in [docs/claude-md-migration.md](docs/claude-md-migration.md)):

- **This file**: the commands, the architecture map, and the rules with no exceptions (零例外).
- **`.claude/rules/*.md`**: each part's rules — how it is built and what it must keep. Claude Code loads a file when you work on a path its `paths:` names. **Any other agent, or a session about to change a part it hasn't read: read the matching file first** — the map below says which.
- **`docs/rules/`**: the full command list, the project's hooks. The UI component contract is the `resonance-ui` skill; the design's territory is `designs/DESIGN.md`.

**Rounds run with agents** — `docs/agents/README.md`: the four human gates, `round-build` / `round-verify` (`.claude/workflows`), the lane brief, the acceptance list, the agents in `.claude/agents`. A lane follows `docs/agents/lane-brief.md`, never a brief written again.

## Commands

```bash
npm run dev        # Start Next.js dev server
npm run build      # Production build
npm run lint       # ESLint (flat config, plain `eslint .`)
npm run typecheck  # tsc --noEmit
npm test           # Vitest, single run (CI mode)
npm run test:watch # Vitest in watch mode
npm run test:ui    # Vitest browser UI
npm run emulators       # Firebase Auth + Firestore emulators (needs Java; project demo-resonance)
npm run dev:emulator    # Next dev server wired to the emulators (no real Firebase/R2 is touched)
npm run test:emulator   # Rules + Admin SDK suites in test/emulator (starts/stops the emulators itself)
npm run api:openapi     # regenerate openapi/v1/openapi.json from the Zod contract (a test fails when stale)
npm run native:editor   # typecheck + build the native apps' editor island (native/editor/dist/editor.html)
npm run apps:generate   # regenerate what the native apps take from the web (tokens, strings, OpenAPI, editor)
npm run visual -- capture [web android ios mac] [--only <screen ids>] [--device <id>] [--flows] [--review]   # release screenshots: every screen of scripts/visual/screens.ts on web (phone/tablet/desktop), iPhone, iPad, the Mac app and Android phone/tablet, against a private seeded stack, two at a time (web + Mac, the AVDs, the simulators), diffed with this machine's baseline (areas moved more than 2 px, `scripts/visual/diff.ts`) (visual/, git-ignored); `--review` hands what changed to Antigravity's CLI (`agy`); `review --run <id> --agy`, `accept --run <id> [--only …] --reason "<the owner's words>"` (refused without one; logged in docs/visual-accept-log.md) — scripts/visual/README.md says which devices, sizes and settings, and why
npx tsx scripts/visual/flows.ts <android|ios> [--only <flow>]   # Maestro interaction flows (maestro/flows) on the harness's own phone simulator/AVD — maestro/README.md
npm run visual -- capture … [--variants release|extended] [--flows [--tags <tags>]] [--wait]   # --variants extended adds large text on the Android phone, the tablets turned and in the dark, a narrow Mac window and the composer's extra states (scripts/visual/variants.ts); one run at a time per device and port (lock.ts: refused, or --wait to queue); never shuts down a device it didn't boot
npm run visual -- plan   # how many captures each variant set takes, and about how long
npx tsx scripts/visual/flows.ts <android|ios> … [--tags smoke|composer|media|links|…] [--device phone|tablet] [--wait]   # a tagged group of flows, or the tablets — maestro/README.md
```

The whole list — backfills, the integrity check, the share image, stickers, the promo film — with every flag: [docs/rules/commands.md](docs/rules/commands.md).

Seed the emulators with known test accounts: `npx tsx scripts/seed-emulator.ts`. In a `dev:emulator` browser, sign in from devtools with `await window.__emulatorSignIn(email, password)` (values in the seed script) — that helper exists only in emulator builds.

## Architecture

**Resonance**（共振）is a multilingual social storytelling platform built around "story cards" — users write cards and answer others' in three ways (round 26): **共振**, the tap (a quiet signal to the author, kept on the server, never a public number: `resonanceTaps`, `PUT /api/v1/cards/{id}/tap`), a **note** to the author (小紙條, written in place under the story, never in a dialog), or **用卡片回應** — a reply card with a `referenceCardId`, which the code still calls a *resonance* (`resonate.ts`, `/resonances`). They form one-to-one connections by replying with a public, named card, or when a card's author replies to a note (older invites can still be answered, none are sent); a tap connects no one.
Built with Next.js 15 (App Router) + React 19 + TypeScript 5.7 (strict).
No Tailwind — all styling uses CSS Modules + CSS custom properties defined in `src/styles/tokens.css`.
`README.md` is the project's landing page (what, why, download, getting started; `README.zh-TW.md` in Chinese) and `CONTRIBUTING.md` / `SECURITY.md` say how to help and how to report a vulnerability; the older architecture write-up in Chinese is `docs/ARCHITECTURE.zh-TW.md` (this file is the current one).

Stack: Firebase Auth + session cookies, Cloud Firestore, Cloudflare R2 (object storage), OpenAI (slugs/tags/illustrations), Tiptap 3 editor + react-markdown reader, SWR for client data fetching.
Deployed on Vercel at https://resonance.channel (www redirects to it): functions in `hkg1` (nearest Firestore's asia-east1), except the routes that call OpenAI — which refuses requests from Hong Kong — pinned to `hnd1` in vercel.json `functions` (see AI).
The old address, resonance-world.vercel.app, serves the same deployment; vercel.json `redirects` sends its pages (path and query) to resonance.channel with a 308, but not `/api/*`, `/_next/*` or `/.well-known/*`, which keep answering there for app builds already installed and Android's App Links — `src/lib/site.test.ts` pins that, so don't widen it.

### Where each part's rules live

| Part (the old CLAUDE.md sections) | Rules | Loads for |
| --- | --- | --- |
| Routing & i18n, app routes, Authentication | [.claude/rules/web-app.md](.claude/rules/web-app.md) | `src/app`, `src/middleware.ts`, `src/lib/auth`, `public` |
| Copy | [.claude/rules/copy.md](.claude/rules/copy.md) | `src/messages`, components, pages, pushes |
| Data Layer | [.claude/rules/data-layer.md](.claude/rules/data-layer.md) | `src/lib/{db,data,adapters,chat,cards}`, `firebase`, `test/emulator` |
| API Routes, Rate limits, the `/api/v1` contract | [.claude/rules/api.md](.claude/rules/api.md) | `src/app/api`, `src/lib/api`, `openapi` |
| Push, opt-in pushes, chat push | [.claude/rules/push.md](.claude/rules/push.md) | `src/lib/push`, crons, messages, notes, notifications |
| Link previews, link-preview image, story link previews | [.claude/rules/links.md](.claude/rules/links.md) | `src/lib/{links,linkImage,markdown}`, og routes |
| Safety | [.claude/rules/safety.md](.claude/rules/safety.md) | the server, the rules, the emulator suites, the account purge |
| Story editor & its Markdown | [.claude/rules/editor.md](.claude/rules/editor.md) | `src/lib/markdown`, the editors, `native/editor` |
| Sharing | [.claude/rules/sharing.md](.claude/rules/sharing.md) | `src/lib/share`, `ShareMenu`, `BrandMark`, the apps' share |
| Stickers and the composer; the thread's bubble, held menu, reactions | [.claude/rules/messages-ui.md](.claude/rules/messages-ui.md) | `MessagesPage`, `src/lib/{chat,stickers}`, the apps' threads |
| Security headers, App Check | [.claude/rules/security.md](.claude/rules/security.md) | `next.config.ts`, `src/lib/appCheck`, headers |
| Native apps | [.claude/rules/apps.md](.claude/rules/apps.md) | `apps`, `native`, `scripts/{apps,native}` |
| AI | [.claude/rules/ai.md](.claude/rules/ai.md) | `src/lib/{ai,recommend}`, `vercel.json` |
| Storage & Image Pipeline | [.claude/rules/storage.md](.claude/rules/storage.md) | `src/lib/{storage,images}`, upload, `infra` |
| Component Hierarchy, Design System, Organic/Procedural SVG | [.claude/rules/design-system.md](.claude/rules/design-system.md) | web UI, the apps' design systems, the skill |
| The writer and the workspace (from Design System) | [.claude/rules/writer-ui.md](.claude/rules/writer-ui.md) | the writer, the thought map, `HeaderBar` |
| Phone, tablet and Mac | [.claude/rules/layout.md](.claude/rules/layout.md) | every UI file, web and apps |
| Landing film, Landing stage, Reading stage, Paper Pals | [.claude/rules/landing.md](.claude/rules/landing.md) | the landing page, the stages, `src/lib/mascots`, the lab |
| Testing | below, and [.claude/rules/testing.md](.claude/rules/testing.md) | test files, `test/` |
| Verification (hard rules) | below | — |
| Deployment & CLI Tooling | below, and [.claude/rules/deploy.md](.claude/rules/deploy.md) | `vercel.json`, `scripts/vercel`, `next.config.ts` |

## Zero-exception rules (零例外)

None of these is a preference: each has been broken and cost a regression, a rejection or the owner's time. Where a test, CI or a hook enforces one it says so (the hooks: `.claude/settings.json`, [docs/rules/hooks.md](docs/rules/hooks.md)); the exception lists in those tests only ever shrink. A rule that keeps being broken becomes a test or a hook, not more prose here.

1. **Verification** — the three hard rules below: both widths for UI; a slice of the release screenshots for a screen, with a `Visual:` line on every commit touching UI (CI `commits` job); a data-layer change ships with a test that fails without it (CI `commits` job).
2. **Never push unasked.** A push to `main` deploys production; releasing follows [docs/release-checklist.md](docs/release-checklist.md). *Guard hook.*
3. **Never accept a baseline unasked**: only `npm run visual -- accept … --reason "<the owner's words>"`, never a write under `visual/baseline/`. *`accept` refuses without a reason; the guard hook checks the words are the owner's.*
4. **Stop only what you started, by its PID** — never `pkill` / `killall` (other sessions' simulators, servers and builds). *Guard hook.*
5. **Commit by explicit paths** — never `git add -A` / `git add .` / `git commit -a`: other sessions share checkouts. *Guard hook.*
6. **Safety** ([.claude/rules/safety.md](.claude/rules/safety.md)): no answer anywhere tells who wrote an anonymous card; a block hides people and their named cards, never an anonymous card; every guarantee the rules give the client is re-checked on the server (Admin SDK) and covered by an emulator test.
7. **A client write's only guard is its Firestore rule**: field-level checks and a `test/emulator/rules.emulator.test.ts` case for every new one ([.claude/rules/data-layer.md](.claude/rules/data-layer.md)).
8. **`/api/v1` changes additively only**, and the two additive-looking changes that break the apps' build touch the apps in the same change ([.claude/rules/api.md](.claude/rules/api.md)). *`contract.test.ts`.*
9. **OpenAI only from server routes, every call with a timeout, its route pinned to `hnd1`** ([.claude/rules/ai.md](.claude/rules/ai.md)). *`regions.test.ts`, `tasks.test.ts`.*
10. **A new collection that stores a uid joins `collectAccountData()`** (`src/lib/account/deletion.ts`; [.claude/rules/safety.md](.claude/rules/safety.md), Account deletion).
11. **What the apps take from the web stays generated**: `npm run apps:generate` after changing tokens, strings, icons, reactions, stickers or the v1 schemas. *CI regenerates and fails on a diff.*
12. **Copy**: a string of one sentence or a fragment ends without a full stop, in both languages ([.claude/rules/copy.md](.claude/rules/copy.md)). *`punctuation.test.ts`.*
13. **The design, on every platform**: no colour written outside the palette (*`colourLiterals.{web,ios,android}.test.ts`*); **no shadows anywhere** (*`noShadows.test.ts`*); **one pen** — `INK` / `INK_LIGHT` / `INK_STRONG`, never a number (*`onePen.test.ts`*); **no bottom sheets** (*`noBottomSheets.test.ts`*); a phone is bands, a tablet cards in wider margins, the Mac's sidebar a band, and lines meet, fills fill ([.claude/rules/layout.md](.claude/rules/layout.md)). *The `ui-rules` hook runs these tests after every UI edit.*

### Verification (hard rules)

These are non-negotiable — both rules exist because their violation has already shipped regressions:

- **UI changes**: before calling the work done, verify in the browser preview at **both desktop and mobile** widths (`preview_resize`). Mobile-only fixes have silently broken the desktop layout before (and vice versa), and a fix to one organic component must be checked against its siblings (buttons, inputs, selects, toggles share the same border language).
- **Screens**: a change that alters how a screen looks (web or apps) runs a slice of the release screenshots for the screens it touches, on the platform it touches — `npm run visual -- capture <platform> --only <screen ids> [--device phone,desktop]` — and shows the owner the report's changed captures; the new pictures become the baseline only on the owner's OK (`npm run visual -- accept --run <id> --only … --reason "<the owner's words>"`), never unasked — `accept` refuses to run without `--reason` and adds a row to `docs/visual-accept-log.md` (when, run, commit, platforms, `--only`, reason), committed with it.
  Its commit names those screens in a `Visual:` trailer (`Visual: card, ios/thread: why`), which the release review reads to tell an intended change from a regression.
  A run ends with its verdict — the last line `Visual PASS|FAIL <id>: …`, `summary.json` beside the report, exit code 1 on a FAIL: a capture the review calls broken, one that never held still after a second look, a change no trailer names, a failed flow (scripts/visual/README.md, What fails a run) — so a slice or a release run is done only on a PASS.
  A new screen joins `SCREENS` in `scripts/visual/screens.ts`.
  Before a release (a store build, or a push that ships the web) the whole run goes through: `npm run visual -- capture --flows --review` (screens, then the Maestro flows, then the review), and the owner looks at what it flagged.
- **Data-layer changes** (repositories, `client/*` read-write modules, adapters, page data fetching): ship with an integration-style test that fails without the change. A Server-Render→Firestore migration once broke the home feed and card pages while the whole suite stayed green.
- **A bug found on a device** gets, besides its unit test, a Maestro flow (the tap the flows never made) or a capture variant (the state the screenshots never have — `scripts/visual/variants.ts`) in the same change; its commit says which, or why neither can hold it.
- **Releases**: a store release is started only by the owner, with `/release` (`.claude/skills/release/SKILL.md`, `disable-model-invocation`); it runs `npm run release:preflight` before and after the release run, and asks for an explicit yes before any upload or submission. Something a release depends on that a push doesn't do (a rules deploy, a backfill) goes into `docs/release/owed.md` as an open item.

## Preferences (偏好)

Everything else in `.claude/rules/` describes how the product is built today: follow it, and when a change departs from it, say so in the commit. Four habits are held by count ratchets rather than refused — design values in inline styles, literal wobble props, per-component `::placeholder`, flat 1px borders (`src/lib/design/*.test.ts`): today's number may fall, never rise. The taste behind them — how organic, how much air, which pen colour means what — is judged against the `resonance-ui` skill and `designs/DESIGN.md`, by the owner.

## Testing

Tests run on **Vitest** + **@testing-library/react** + **jsdom**.
Config is `vitest.config.ts`; shared setup is in `test/`.
We write **integration-style unit tests** — exercise a whole feature (an adapter's rules, a hook's composition, a component's interaction), not single trivial functions.
What the screens look like on each platform is the release screenshots' job (`npm run visual`, scripts/visual/README.md), and taps through the apps Maestro's (maestro/README.md).

Where tests live, the jsdom directive and the house conventions: [.claude/rules/testing.md](.claude/rules/testing.md).

## Deployment & CLI Tooling

The local environment has the following CLIs installed and authenticated:
1. **Firebase CLI** (`firebase`)
2. **Cloudflare CLI** (`wrangler`)
3. **Vercel CLI** (`vercel`)

For any deployment or configuration update needs, use these CLIs directly. Login is already complete. If you are logged out or experience authentication failures, notify the user so they can re-authenticate.

Releasing — a store build, or a push that ships the web — follows [docs/release-checklist.md](docs/release-checklist.md): first the commit's CI is green (`gh run list --commit <sha> --workflow CI`), then the order of what goes live (rules before the web that needs them, the web before an iOS / Mac build with associated domains), the release run, the builds, and the owner's yes before any upload.

What Vercel builds and what each deployment keeps: [.claude/rules/deploy.md](.claude/rules/deploy.md).
