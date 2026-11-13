# Backlog: GitHub issues with labels, or a tracked file?

A proposal; nothing has been created. Today no tracker is in use (`gh issue list --state all` and
`gh pr list --state all` are both empty; `docs/TODO.md` was last touched 2026-07-18). Open items live at the end of
each round's notes (「留給擁有者看的」, 「發現但沒修的」), in memory files, and in the security audit's
`NEEDS-VALIDATION.md` (14 open leads) — `audit.md` §5 and §6. Nothing reads them again unless someone remembers.

What the backlog has to do:

1. Hold the open items a round leaves (round-build and round-verify write `open-items.md`; something must collect them).
2. Say which stage each item is in, so a loop can pick the next one without the owner saying "go".
3. Be readable by an agent in one step, and writable only in ways that can be checked.
4. Cost little to keep, for one person.

## Option A — GitHub issues, labels as the stage machine

Labels such as `needs-spec` → `ready-to-build` → `needs-verify` → `needs-owner` → `done`, plus `platform:web|ios|android`
and `kind:bug|ask|debt`. Claude Code's cloud routines can trigger on a label being added, `/goal` can run "until no
issue carries `ready-to-build`", and `gh issue list --label … --json` gives an agent the queue.

- **For:** a real UI on the phone (the owner can triage from anywhere); history, comments, links to commits for free;
  triggers exist; the established pattern (`claude-code-loops.md` §E).
- **Against:** the repo is public — the backlog would be too (security leads cannot go there; device and store
  details often shouldn't). The cloud routines that react to labels run in a fresh clone and reach no simulator,
  emulator or the owner's Mac, which is where Resonance's verify stage happens. Labels are free text: nothing stops a
  wrong transition, and a bot reacting to its own label change is a known loop. It moves state off the machine where
  the rounds run. It is one more place to keep in step with the notes.

## Option B — a tracked file, `docs/backlog.json`

One JSON list in the repo, the same shape as an acceptance item plus a stage: `{ id, ask (the owner's words or the
finding), source (notes path, commit, finding), lanes, stage: "open" | "spec" | "build" | "verify" | "owner" |
"done", verify? }`. Round-build's Record step appends its open items; a round's spec takes items out by id; a
validator like `acceptance.ts` (with a test) checks the shape and refuses a stage skipping forward without its
evidence (no `done` without a `verify` that printed exit 0, or the owner's words).

- **For:** private items can stay out of it (keep the file to product work; security leads stay in Resonance-notes);
  it lives with the code, so a commit can close an item and the diff shows it; deterministic checks, the same tool as
  the acceptance list; one agent read; nothing to trigger by accident; works offline and on the machine that has the
  devices.
- **Against:** no phone UI (the owner reads it through a session, or a generated page); merges between parallel
  sessions can conflict on one file (small: append-mostly, one item per line keeps conflicts rare); no triggers —
  a loop has to be started.

## Recommendation

**Option B now, Option A only for what is public anyway.** The verify stage runs on this Mac and the stage changes
should be checked by a script, both of which favour a tracked file; a public tracker also fits badly with security
and store details. Concretely:

1. `docs/backlog.json` + `scripts/round/backlog.ts` (validator and `--stage` / `--next` queries, with a test), seeded
   by hand from the open items in rounds 21–24's notes and `NEEDS-VALIDATION.md`'s titles (not their details).
2. round-build's Record step appends to it (after a review of the step's output, not blindly).
3. Later, if the owner wants to triage from the phone: a GitHub issue per **user-reported** bug only (tester
   feedback, store reviews), labelled, whose number the backlog item cites — never the other way round.

Decision for the owner: B as above, A instead, or neither yet (keep `open-items.md` per round and let the lead read
the last three).
