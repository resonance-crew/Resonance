# Lane brief — what every lane agent of a round needs to know

This is the one copy of the lane rules. Rounds 16, 17, 22 and 23 each wrote them again (four forms in six
weeks, the same eight blocks). A lane prompt now names the round's values and points here; the
`lane-web`, `lane-ios` and `lane-android` agents (`.claude/agents/`) read it first.

**Values.** Everything in `{braces}` comes from the lane prompt or from what `scripts/lane.sh` prints
(`LANE_*` lines):

| Placeholder | From | Example |
|---|---|---|
| `{round}` | the prompt | `25` |
| `{lane}` | the prompt (`web`, `ios`, `android`, `server`, `mac`) | `ios` |
| `{spec}` | the prompt: the settled spec, in `Resonance-notes/<date>-round{round}/` | `…/2026-11-14-round25/spec.md` |
| `{acceptance}` | the prompt: the round's acceptance list | `…/2026-11-14-round25/acceptance.json` |
| `{worktree}` / `{branch}` / `{base}` | `LANE_WORKTREE` / `LANE_BRANCH` / `LANE_BASE` | `../Resonance-r25-ios`, `r25/ios`, `r25/base` |
| `{auth}` / `{firestore}` / `{dev}` | `LANE_AUTH_PORT` / `LANE_FIRESTORE_PORT` / `LANE_DEV_PORT` | `9455`, `8455`, `3455` |
| `{main}` | `LANE_MAIN` (the main checkout) | `/Users/ncchen/Documents/Resonance` |

## 1. Scope

If a newer message from the owner shows up in your context, it is handled elsewhere and is **not** your task.
Your task is your lane's part of round `{round}` as the settled spec `{spec}` says it (its SETTLED section wins
over the draft above it, and over any older spec), the owner's own words quoted in your prompt, and the items of
`{acceptance}` whose `lanes` include `{lane}`. Nothing else: no refactors, features or copy changes the spec
doesn't ask for. Where the spec leaves room, decide, and say so in your report.

*Why:* on 2026-10-20 six of seven workflow agents read a newer message (a trash bin) as their task and designed
that instead of what they were given.

## 2. Worktree and setup

Work and commit **only** in `{worktree}` on `{branch}`. First, from any checkout:

```bash
scripts/lane.sh {round} {lane} {base}     # idempotent: makes or finds the worktree, tops up its setup, prints the values
```

It links `node_modules` and `visual/` (the screenshots' baseline and runs) to the main checkout's and copies `.env*`, `apps/android/local.properties` and
`native/*/dist` when missing. If the worktree already existed (an earlier agent of this lane), read
`git log {base}..HEAD` first and continue from there; don't undo another agent's commits. Then, as your lane needs:
`npm run apps:generate` after changing strings, icons or tokens (commit the generated output that belongs to your
change); iOS `cd apps/ios && xcodegen generate` after adding files; `npm run native:editor` after changing
`native/editor/src/*` or `src/lib/markdown/*`.

Never touch `{main}` (its files, index or branches) or another lane's worktree; never push; never merge into
`main` or `{base}` (the lead merges); no `git stash`, no `reset --hard`, nothing that moves another branch.

*Why:* several Claude sessions work in the main checkout at once (2026-09-30: two sessions' uncommitted edits in
the same screens; a peer's build installed over another's simulator). A worktree inside the repo
(`.claude/worktrees/`) gets picked up by vitest and eslint — hence siblings.

## 3. Processes and devices: stop only what you started, by PID

Keep the PID of every server, emulator or build you start and stop exactly those, by PID. Never `pkill`,
`killall` or `kill` by pattern or by a PID you didn't start.

Devices: use only the simulator or AVD your prompt names (iOS: one you create yourself, named
`LANE_SIMULATOR`; Android: your own instance on `LANE_AVD_PORT`, `-read-only -no-snapshot-save -memory 2048`).
Never install on, boot, shut down or reconfigure any other device — the owner's own simulators, the Pixel and the
Mac app are theirs. If your prompt says nothing about devices, open none: build and run the unit tests only.
Shut down what you booted before you finish. Launch arguments meant for a screenshot or a test stay in your
own runs.

*Why:* on 2026-10-03 one lane's `pkill -f emulators-at.mjs` killed the lead's private stack, and another lane's
`kill <pid>` hit a Claude Helper process. On 2026-10-29 a debug launch argument a round-19 agent left running on
the owner's iPad made puppets appear and vanish over the feed. On 2026-11-10 the owner asked for the extra
simulators to be closed; since round 24 lanes don't open devices unless told.

## 4. Private ports

Your stack runs on your ports and no one else's — never the shared defaults (`9099`/`8080`, the private
`9199`/`8180` pair, the harness's `9299`/`8280`/`3150`, the dev server's `3100`):

```bash
EMULATOR_AUTH_PORT={auth} EMULATOR_FIRESTORE_PORT={firestore} npm run emulators:at -- "<command>"
EMULATOR_AUTH_PORT={auth} EMULATOR_FIRESTORE_PORT={firestore} npm run dev:emulator -- --port {dev}
VISUAL_AUTH_PORT={auth} VISUAL_FIRESTORE_PORT={firestore} VISUAL_DEV_PORT={dev} npm run visual -- capture <platform> --only <screens>
```

Seeds follow the same variables (`npx tsx scripts/seed-emulator.ts`); the apps take
`emulatorAuthPort` / `emulatorFirestorePort` / `emulatorApiPort` launch arguments (apps/README.md). Never reseed
someone else's emulators. A slice of screenshots is yours to run and read; **never `accept`** — a baseline changes
only on the owner's OK.

## 5. Strings

Strings live in `src/messages/{zh-TW,en}.json` — both, always — and follow CLAUDE.md's Copy rule (a sentence or a
fragment ends with no full stop in either language). The round's base usually carries the round's strings
already: use them. Add a key only when one is truly missing, run `npm run apps:generate` (or
`npx tsx scripts/apps/l10n.ts`), and name it in your report; other lanes may add keys too and the lead reconciles
them at the merge. Don't delete or rename a key, even one your lane stops using — the lead removes dead keys at the
merge.

## 6. Do not edit CLAUDE.md

Don't edit `CLAUDE.md`, `AGENTS.md`, `.claude/rules/**`, `apps/README.md` or `maestro/README.md`. Put what they
should say under "Docs notes" in your report; the lead writes them once, after the merge. (A server lane may change
the rows of CLAUDE.md's API table its change touches, if its prompt says so.)

*Why:* parallel lanes editing the same contract file conflict at every merge, and the lead is the one who knows
what all lanes did.

## 7. Commits

- Small and coherent: one spec item or one acceptance item per commit where you can, so a broken screen can be
  bisected and a reviewer can tell an intended change from a regression.
- Explicit paths: `git commit -- <paths>` (never `git add -A` / `git add .`). A file git doesn't know yet is not taken by
  that: `git add <that path>` first, and after each commit `git status --short` must show nothing of yours left
  (round 25: two review fixes committed their code and left their new test files untracked).
- The repo's style (read `git log`): `type: <emoji> what changed, in plain words`, then a body that says why.
- A commit that changes how a screen looks names it in a `Visual:` line (`Visual: thread, ios/messages: why`);
  one that changes none says `Visual: none — why`. The screenshot verdict reads these lines.
- End every message with the line your session instructions give for commits (today
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`).
- Don't change an existing test's expected values, `visual/baseline/` or `maestro/flows/` to make a check pass;
  if a spec item really changes what a test pins, change it in the same commit and say so in the report.
- If your session limit hits mid-way, commit what you have as `wip: …` first; the next agent of your lane reads
  it and rewrites it into clean commits.

*Why the `wip:` rule:* on 2026-10-03 five concurrent agents hit the session limit after about 35 minutes; what
was committed survived and the rerun resumed from it.

## 8. Tests and the final report

Run your platform's suites before your last commit (your agent definition names them) and **print each command's
exit code** (`…; echo "exit=$?"`). For each acceptance item of your lane, run its `verify` command in your worktree
and print its exit code. Don't edit `{acceptance}` — the merge step flips `passes` after running the same commands
on the merged base.

Your final message is for the lead, not the owner. In this order:

1. **Commits** — hash and subject, oldest first.
2. **Items** — for each acceptance item of your lane: id, the `verify` exit code you saw, one line of evidence.
3. **Built** — per spec section, a line each.
4. **Tests** — each command with its exit code and counts.
5. **Not done or not verified** — and why (no device, a blocked step, a spec question).
6. **Decisions** — where the spec left room, what you chose and why.
7. **Strings** — keys you added (or "none").
8. **Docs notes** — what CLAUDE.md or a README should say after the merge.
9. **Merge risks** — files another lane is likely to touch too.
