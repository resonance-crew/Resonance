# CLAUDE.md, split (2026-11-13)

Until 2026-11-13 the agents' guide was one file: `CLAUDE.md` at `343c6f21`, 294 lines, 160,978 bytes, 514
sentences — one line of it (the Design System) a single 16 KB paragraph. The official advice is under
200 lines per file, and long files are followed less reliably. It is now:

- **`CLAUDE.md`** — the commands, the architecture, a map of where each part's rules live, the
  zero-exception rules (零例外, each saying what enforces it), the preferences (偏好), the verification
  rules, testing in brief, deployment.
- **`.claude/rules/*.md`** — one file per part, each with `paths:` frontmatter so Claude Code loads it only
  when working on matching files. Other agents read them by hand (AGENTS.md says so).
- **`docs/rules/commands.md`** — the full command list with every flag (the root keeps the everyday ones).

## What changed besides the place

- **Nothing was reworded.** Every sentence is where the table below says, word for word. Long paragraphs
  are written one sentence per line (the same Markdown paragraph); a bullet's later sentences are indented
  under it. Headings moved a level where a file needed it.
- **The Design System paragraph (old line 210, 33 sentences)** is cut by subject: tokens, type, toast,
  fonts, one pen, blobs, banded lists, shapes, menus and dialogs stay in `design-system.md` under headings
  of their own; the thread's bubble, composer, held menu, reactions and the publish step's tags go to
  `messages-ui.md`; the writer and the workspace to `writer-ui.md`.
- **Written twice on purpose**: the no-bottom-sheet sentence (line 210, sentence 29) is in both
  `design-system.md` and `layout.md`, so it loads with any app UI file too; the testing summary (246) in the
  root and `testing.md`; the release line (291) in the root and `deploy.md`; the everyday commands in the
  root and `docs/rules/commands.md`.
- **New text** (no old sentence behind it): the root's layout note, rules map, zero-exception and preference
  lists; each rules file's one-line title and pointers.
- **Not done, deliberately**: the plan said to move history — the 39 "round N" back-references — to
  `docs/`. Those references sit inside rule sentences ("the owner, round 17: …") and name where a rule
  came from; cutting them out would reword some 40 sentences and make this proof impossible. Whole
  paragraphs that are only history were looked for and not found: "Landing stage", "Builds before letters"
  and the one-day "like" are still in force. So history stays inline, and the rules files are the place to
  trim it later, one reviewed change at a time.

## Proof

`scripts/ci/claudeMdCoverage.ts` splits the old file into sentences (a heading, a table row, a code line,
or a prose sentence) and looks for each one, word for word (Markdown's line marks and runs of spaces set
aside), in the new guide; one not found must be listed below under "Dropped on purpose" with why.
`src/lib/rules/claudeMd.test.ts` runs it whenever `343c6f21` is in the clone (it is skipped in CI's shallow
checkout), and also keeps every file under 200 lines, every `paths:` glob matching a file, every link alive.

```
npx tsx scripts/ci/claudeMdCoverage.ts        # old CLAUDE.md at 343c6f21 against the new guide
```

## Dropped on purpose

| Sentence | Why |
| --- | --- |

None.

## Where each old line went

Old line numbers are `git show 343c6f21:CLAUDE.md`'s. Blank lines and code fences are not listed.

| Old lines | Old section | New file | New heading |
| --- | --- | --- | --- |
| 1–3 | (top) | `CLAUDE.md` | CLAUDE.md |
| 5 | Commands | `CLAUDE.md` | Commands |
| 5–33 | Commands | `docs/rules/commands.md` | Commands |
| 8–17 | Commands | `CLAUDE.md` | Commands |
| 23–25 | Commands | `CLAUDE.md` | Commands |
| 29–30 | Commands | `CLAUDE.md` | Commands |
| 33 | Commands | `CLAUDE.md` | Commands |
| 35–39 | Architecture | `CLAUDE.md` | Architecture |
| 41–43 | Routing & i18n | `.claude/rules/web-app.md` | Routing & i18n |
| 45 | Routing & i18n | `.claude/rules/copy.md` | Copy |
| 47–53 | Routing & i18n | `.claude/rules/web-app.md` | Routing & i18n |
| 55–60 | Authentication | `.claude/rules/web-app.md` | Authentication |
| 62–74 | Data Layer (dual-track Firestore) | `.claude/rules/data-layer.md` | Data Layer (dual-track Firestore) |
| 76–118 | API Routes (`src/app/api/`) | `.claude/rules/api.md` | API Routes (`src/app/api/`) |
| 120–128 | API Routes (`src/app/api/`) | `.claude/rules/push.md` | Push |
| 130–134 | API Routes (`src/app/api/`) | `.claude/rules/links.md` | Link previews |
| 136–140 | API Routes (`src/app/api/`) | `.claude/rules/api.md` | Rate limits, auth, the contract |
| 142–154 | Safety (App Store 1.2 / 5.1.1(v)) | `.claude/rules/safety.md` | Safety (App Store 1.2 / 5.1.1(v)) |
| 156–158 | Story editor & its Markdown | `.claude/rules/editor.md` | Story editor & its Markdown |
| 160–162 | Sharing | `.claude/rules/sharing.md` | Sharing |
| 164–168 | Stickers and the composer (round 22) | `.claude/rules/messages-ui.md` | Stickers and the composer (round 22) |
| 170–172 | Security headers | `.claude/rules/security.md` | Security headers |
| 174–176 | App Check (watched, not enforced) | `.claude/rules/security.md` | App Check (watched, not enforced) |
| 178–182 | Native apps (`apps/`) | `.claude/rules/apps.md` | Native apps (`apps/`) |
| 184–186 | AI (`src/lib/ai/`) | `.claude/rules/ai.md` | AI (`src/lib/ai/`) |
| 188–196 | Storage & Image Pipeline | `.claude/rules/storage.md` | Storage & Image Pipeline |
| 198–206 | Component Hierarchy | `.claude/rules/design-system.md` | Component Hierarchy |
| 208 | Design System | `.claude/rules/design-system.md` | Design System |
| 210 | Design System | `.claude/rules/design-system.md` | Tokens, story type, the toast, fonts (sentences 1, 2, 3, 4) |
| 210 | Design System | `.claude/rules/design-system.md` | One pen (sentences 5) |
| 210 | Design System | `.claude/rules/design-system.md` | Tweaks, blobs (sentences 6, 7, 8) |
| 210 | Design System | `.claude/rules/design-system.md` | Banded lists, washes, shapes (sentences 9, 10, 11, 12, 13) |
| 210 | Design System | `.claude/rules/design-system.md` | Menus — one sheet, flat, no shadow anywhere (sentences 20, 21, 22, 23, 24, 27) |
| 210 | Design System | `.claude/rules/design-system.md` | Dialogs — never a bottom sheet (sentences 28, 29) |
| 210 | Design System | `.claude/rules/layout.md` | Never a bottom sheet (sentences 29) |
| 210 | Design System | `.claude/rules/messages-ui.md` | The thread, as drawn (from the design system) (sentences 14, 15) |
| 210 | Design System | `.claude/rules/messages-ui.md` | Holding a message, reactions (sentences 16, 17, 18, 19, 25) |
| 210 | Design System | `.claude/rules/messages-ui.md` | The publish step's tags (sentences 26) |
| 210 | Design System | `.claude/rules/writer-ui.md` | The writer and the workspace (from the design system) (sentences 30, 31) |
| 210 | Design System | `.claude/rules/writer-ui.md` | The workspace (≥ 1200) (sentences 32, 33) |
| 212–220 | Phone, tablet and Mac (the owner's layout rules) | `.claude/rules/layout.md` | Phone, tablet and Mac (the owner's layout rules) |
| 222–224 | Landing film | `.claude/rules/landing.md` | Landing film |
| 226–232 | Landing stage | `.claude/rules/landing.md` | Landing stage |
| 234–242 | Organic/Procedural SVG | `.claude/rules/design-system.md` | Organic/Procedural SVG |
| 244–246 | Testing | `.claude/rules/testing.md` | Testing |
| 246 | Testing | `CLAUDE.md` | Testing |
| 248–254 | Where tests live | `.claude/rules/testing.md` | Where tests live |
| 256–264 | Environment & the jsdom directive | `.claude/rules/testing.md` | Environment & the jsdom directive |
| 266–272 | Conventions | `.claude/rules/testing.md` | Conventions |
| 274–280 | Verification (hard rules) | `CLAUDE.md` | Verification (hard rules) |
| 282–291 | Deployment & CLI Tooling | `CLAUDE.md` | Deployment & CLI Tooling |
| 291–293 | Deployment & CLI Tooling | `.claude/rules/deploy.md` | Deployment |
