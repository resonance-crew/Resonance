# Running a round with agents

How a Resonance design/development round runs, now that its orchestration lives in the repo instead of being written
again each time (116 one-off workflow scripts, a lane brief in four forms, notes written days later from memory, the
spec in a session scratchpad under `/private/tmp`). Background and evidence:
`Resonance-notes/2026-11-13-loop/` (`notes.md` §3.2 and §3.5, `audit.md` §1 and §6).

## The shape of a round

```
owner's ask ─▶ lead's proposal ─▶ critic ─▶ settled spec + acceptance.json
                                                 │
                                    [gate 1: the owner's taste decisions and go — signedOff]
                                                 ▼
                                round-build: lanes ─▶ merge into rNN/base ─▶ post-merge review ─▶ fixes ─▶ record
                                                 ▼
                                round-verify: screenshot slices ─▶ review of changed captures ─▶ fixes ─▶ record
                                                 │
                                    [gate 2: the owner looks at the changed captures — accept --reason]
                                    [gate 3: the owner says push — main fast-forwarded, pushed = production]
                                                 ▼
                                release (the release skill, step 5)  [gate 4: store upload and submission]
```

A workflow can't take input while it runs, so every place a person must decide is a place where one workflow ends
and the next begins. Everything between two gates runs without anyone saying "go".

## The four human gates

| Gate | Where it sits | What holds it |
|---|---|---|
| 1. Spec taste decisions and the go-ahead | before round-build | `acceptance.json`'s `signedOff` quotes the owner's words; round-build's preflight refuses a list without it and keeps the signed copy; afterwards `acceptance --against` fails on any change but `passes` |
| 2. Accepting baselines | after round-verify | `npm run visual -- accept` needs `--reason "<the owner's words>"` and logs a row in `docs/visual-accept-log.md`; no workflow or agent here runs it (the lane brief forbids it; a guard hook is step 2's) |
| 3. Push to production | after gate 2 | a push to `main` deploys; nothing here pushes or touches `main` — the lead fast-forwards and pushes on the owner's word |
| 4. Store upload and submission | in the release | the release skill (step 5) is started by a person only (`disable-model-invocation: true`) and asks before each upload |

## What each file replaces

| File | Replaces |
|---|---|
| `docs/agents/lane-brief.md` | `lanes-common.md` of rounds 16, 17, 22 and the `head()` template in `r23-lanes` — the eight blocks every version repeated |
| `scripts/lane.sh <round> <lane> [base]` | worktree commands typed into each brief; ports picked by hand (`[9421, 8421, 3421]`, …) |
| `.claude/agents/lane-web.md`, `lane-ios.md`, `lane-android.md` | the per-lane prompt preambles in `r23-lanes` |
| `.claude/agents/critic.md` | the critic paragraph in each `rNN-research-and-critic` script and `design-debate.md` in memory |
| `.claude/agents/post-merge-reviewer.md` | the `SCOPE`/`WHERE`/`FINDINGS`/`LENSES` written into `r23-review` and the refute pass in `r23-fixes` |
| `.claude/agents/ui-reviewer.md` + `docs/agents/ui-review-examples.md` | the screenshot brief in `r23-visual-review`, with calibration it never had |
| `docs/agents/acceptance.schema.json`, `scripts/round/acceptance.ts` | the "SETTLED" section as the only statement of done; lanes' free-text "it works" |
| `docs/agents/goal-templates.md` | nothing: `/goal` was never used for a lane |
| `.claude/workflows/round-build.js` | `rNN-lanes` + `rNN-review` + `rNN-fixes` |
| `.claude/workflows/round-verify.js` | `rNN-visual-review` + `rNN-visual-fixes` |
| the workflows' Record step | `notes.md` written afterwards ("補記於 …" in 15 of 17 rounds), review findings kept only in workflow journals |

## Starting a round

1. **Notes folder first.** `Resonance-notes/<date>-round<NN>/`: the owner's words verbatim (`owner-ask.md` or quoted
   in the spec), the lead's proposal, and from here on the spec — never a `/private/tmp` scratchpad.
2. **Design debate** (a design round): start the `critic` agent (Agent tool, `subagent_type: "critic"`) with the
   owner's quoted words, the facts file and the proposal's path; it writes `critic-own.md`, then `critique.md`.
3. **Settle the spec** with the owner's answers, and write `acceptance.json` beside it (schema and example here):
   one item per ask, the owner's words, the lanes, a command per lane. `npm run -s acceptance -- <file>` must print
   `Acceptance PASS`.
4. **Gate 1.** When the owner says go, put their words in `signedOff` (`{ "by": "owner", "words": "…", "at": "…" }`).
5. **round-build.** Ask the lead session to run the saved workflow `round-build` with args, e.g.
   ```json
   { "round": 25, "date": "2026-11-14",
     "notes": "/Users/ncchen/Documents/Resonance-notes/2026-11-14-round25",
     "spec": "/Users/ncchen/Documents/Resonance-notes/2026-11-14-round25/spec.md",
     "acceptance": "/Users/ncchen/Documents/Resonance-notes/2026-11-14-round25/acceptance.json",
     "platforms": ["web", "ios", "android"],
     "ownerWords": "「…」" }
   ```
   The lead reads `open-items.md` when it ends. A lane run outside the workflow works too: `scripts/lane.sh`, then
   the lane agent, and the lane's `/goal` from `goal-templates.md`.
6. **round-verify** with the same paths plus `slices` (which screens per platform:
   `{ "web": { "only": "thread,messages", "device": "phone,desktop" }, "ios": { "only": "thread", "device": "iphone,ipad" } }`).
7. **Gates 2 and 3.** The lead shows the owner the changed captures `open-items.md` lists; on their OK runs the
   `accept --reason` commands written there, fast-forwards `main` to `rNN/base` and pushes on their word.

## Models

One table, `.claude/agents/models.json`; change it and run `npm run -s agents:models -- --write` (the test fails
while the agents' frontmatter and the table differ). The workflows' own mechanical steps take `args.models`.

| Role | Model | Why |
|---|---|---|
| lane-web / lane-ios / lane-android | opus | the implementation; quality here decides how many fix rounds follow |
| critic | opus | taste and judgment from the owner's words — the reason the role exists |
| post-merge-reviewer | opus | traced defects across three platforms; round 23's nine real findings came from this step |
| ui-reviewer | opus | reads pictures against a spec; the calibration examples assume a careful reader |
| workflow preflight, merge-settle, capture runner, record writer | sonnet (`args.models.mechanical`) | run commands, copy values, write down data they are handed — no judgment |
| the merge itself | inherits the session's | conflicts across three platforms are judgment |

Opus for every agent is the owner's word of 2026-11-13 (not the Fable tier). The memory files say why cost still
matters: all-Opus fan-outs used the plan's quota up on 2026-10-10 (`quota-light-rounds.md`), and eight concurrent
agents hit the session limit on 2026-09-30 (`subagent-model.md`). **Could safely go cheaper, in this order:** the
refute passes (`args.models.refute: "sonnet"` — refuting a written claim against the code is narrower than finding
it), the record writer and capture runner (already sonnet; haiku likely enough), and `ui-reviewer` once a few rounds
show its verdicts match the calibration cases. Keep the lanes and the critic on opus.

## Caps

| Cap | Value | Where |
|---|---|---|
| lanes per round | 4 | round-build `MAX_LANES` |
| retries per lane, fix rounds, fix-and-retake rounds | 2 | `MAX_RETRIES` (args can lower it, never raise it) |
| stop without progress | after 2 attempts in a row that pass no more items / leave no fewer findings | `PATIENCE` |
| review lenses | 5 (default: one per platform, plus parity) | `MAX_LENSES` |
| findings fixed per round | 20 | `MAX_FIXES` |
| captures per reviewer | 40, the rest listed in the record | round-verify `MAX_CAPTURES_PER_REVIEW` |
| nits | 3 per review | the reviewers' definitions and the workflows |
| turns | lanes 300, critic and post-merge reviewer 80, ui-reviewer 60 | each agent's `maxTurns` |
| captures | one platform at a time; round-verify stops if another run is going | round-verify |

Before trusting the defaults, look at `/usage` after the first round: how much went to reviewers versus lanes.

## Not tested yet

- **Neither workflow has run.** They parse (`node --check`) and walk their control flow against stub agents
  (`npm run test:loop`), nothing more. Try the first time on a small round with one platform (`"platforms": ["web"]`)
  and watch it.
- **`agentType` with the repo's agents** in a workflow is unconfirmed (notes §7). If a run says the type is unknown,
  pass `"useAgentTypes": false`: each agent is then told to read its `.claude/agents/<name>.md` and follow it (the
  frontmatter's model, tools and skills don't apply that way).
- Whether a subagent can read PNGs (the ui-reviewer's whole job) is unconfirmed too; the round-23 reviewers did, as
  workflow agents.
- The verify commands in `acceptance.example.json` name real tests of round 24 but were not run as a set.

## Files

- `lane-brief.md` — the lane rules; `goal-templates.md` — `/goal` per lane
- `acceptance.schema.json`, `acceptance.example.json` — the acceptance list; `scripts/round/acceptance.ts` checks and runs it
- `ui-review-examples.md` — calibration for UI review
- `backlog-proposal.md` — where open items should live (a proposal, nothing created)
- `../../.claude/agents/`, `../../.claude/workflows/`, `../../scripts/lane.sh`, `../../scripts/round/`
