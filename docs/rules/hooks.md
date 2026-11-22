# The project's Claude Code hooks

`.claude/settings.json` wires three scripts in `.claude/hooks/` (all three are thin `sh` wrappers that
find `node` and call `hooks.mjs`). They load when a session **starts** in this repository (or one of its
worktrees); a session already running keeps the hooks it started with, and Claude Code asks to review
changed hooks in `/hooks`. Tested by `src/lib/rules/hooks.test.ts`, which spawns each script with a
sample hook input on stdin.

| Hook | Event | What it does | Cost |
|---|---|---|---|
| `ui-rules.sh` | PostToolUse, `Edit\|Write\|MultiEdit` | For a file a source-scan rule reads — web `src/**/*.{ts,tsx,css}`, `src/messages/*.json`, Swift under `apps/ios`, Kotlin under `apps/android`, the resonance-ui skill — runs that platform's rule tests (colour literals, no shadows, one pen, no flat borders, placeholders, wobble and inline-style ratchets, no bottom sheets, punctuation, the skill matching the code). A failure goes back to Claude on stderr with exit 2. Any other file: exits at once. | ~1 s |
| `gate.sh` | SessionStart, Stop | At SessionStart it records `HEAD` as the session's base (`<git dir>/claude-hooks/base-<session>`). At Stop: exits at once when `stop_hook_active` is true, nothing changed since the base, or nothing changed since its last pass (a fingerprint of the diff); otherwise ESLint on the changed JS/TS files, `tsc --noEmit` when a TS file changed, and `vitest related` for the changed sources plus the rule tests their paths call for — within `GATE_BUDGET_S` (420 s; the hook's timeout is 480). A failure blocks the stop once (exit 2, a summary on stderr); out of time, it lets the stop through and says so (`systemMessage`). | 0 s when nothing changed; ~10–60 s otherwise |
| `guard.sh` | PreToolUse, `Bash\|Edit\|Write\|MultiEdit\|NotebookEdit` | Answers `permissionDecision: "deny"` for what only the owner decides (below). | ~50 ms |

## What the guard refuses

- `pkill`, `killall` — they stop other sessions' simulators, dev servers and builds. Stop what you started by its PID.
- `git push` (any form: `git -C … push`, `git push origin main`) — a push to main deploys production.
- `git add -A`, `git add --all`, `git add .`, `git add :/`, `git add -u`, and `git commit -a` / `-am` — in a shared checkout they sweep in other sessions' changes. Stage by path.
- `npm run visual -- accept …` or `promote …` (or `tsx scripts/visual/run.ts accept|promote`), as the command's subcommand, without `--reason`, or with a `--reason` that is not the owner's words, verbatim, from one of their last five messages.
- Writing under `visual/baseline/` (main's) or `visual/baselines/` (each branch's, scripts/visual/baselines.ts): an Edit/Write there, or a shell command that names either and writes (`rm`, `mv`, `cp`, `rsync`, `tee`, `>`, `sed -i`, `find -delete`…). Reading (`ls`, `cat`, `find`) is fine.
- Editing a session transcript (`~/.claude/projects/**/*.jsonl`), which is what the guard reads the owner's words from.

Commit messages, heredocs and quoted strings are not read as commands (`git commit -m "never git push"` is
fine); `bash -c "…"` and `eval` are read whole.

## The way through, after the owner says yes

1. **The owner runs it.** Typing `! git push` in Claude Code's prompt runs the command as the owner's own shell
   command — no tool call, so no PreToolUse hook. This is the strongest way and the one to prefer for a push.
2. **The agent runs it with the owner's words.** Re-run the command prefixed with
   `OWNER_OK='<the owner's exact words>'`, e.g. `OWNER_OK='好，可以 push 到 main' git push origin main`.
   The guard reads the session's transcript (`transcript_path` in the hook input) and lets the command through
   only if those words — two characters at least, spacing aside — stand verbatim in one of the owner's last
   five messages. A message counts as the owner's only if Claude Code wrote it as typed by a person
   (`origin.kind: "human"`, not a tool result, a task notification, a compaction summary, a system reminder or
   an injected block). A subagent can never use it (its "user" is another agent). Each use is logged to
   `<git dir>/claude-hooks/guard.log`.
3. **`accept`** and **`promote`** need no OWNER_OK: its `--reason "<the owner's words>"` is checked the same way.

## How strong this is — honestly

- **Strong against accidents and habit**: the commands agents have actually run unasked (a push without the
  full suite, an `accept` nobody can trace, `pkill` of shared simulators, `git add -A` in the shared checkout)
  are stopped with a reason that says how to ask. The deny holds in every permission mode, per the
  documentation (to be confirmed live, below).
- **The owner's-words check is real but narrow**: an agent cannot write a message as the owner, so it cannot
  invent a yes; but a yes to one thing ("可以 push") can be reused for another push within the last five
  messages, and a common phrase the owner typed for another reason would also match. Ask for words that name
  the action.
- **Weak against an agent set on getting round it**: the guard reads command text. A script, `python -c`,
  an alias, `git -c alias.p=push p`, or `xargs` hides the command from it. It is a guardrail, not a sandbox —
  for that, permission rules (`permissions.deny`) and a separate OS user would be needed.
- **Fails partly closed**: without `node` the guard falls back to a cruder text match that denies the worst
  cases; the other two hooks do nothing without `node`.

## Still to try in a live session (cannot be tested here)

- Does the **Stop** hook fire under *Bypass permissions*? (The documentation does not say.) And in a
  `claude -p` run, a subagent's end (SubagentStop is not wired), and Desktop sessions?
- Does the **deny** hold under *Bypass permissions* and *auto* mode (the documentation says it does)? Is the
  `permissionDecisionReason` shown to Claude in full?
- Does `! git push` from the prompt really skip the PreToolUse hook?
- The `transcript_path` field and the `origin.kind: "human"` marker, on the Claude Code version in use, and
  the transcript being written before the PreToolUse hook reads it (the owner's last message must already be there).
- Timing on a real change: the gate's typecheck (~7 s here) and `vitest related` for a widely imported module
  (could be minutes — the budget then lets the stop through unverified).
- In the **shared main checkout** the gate sees every session's uncommitted changes as "changed since the
  base", so one session can be blocked by another's failing test. Worktrees avoid it.
- Two sessions at once: the gate's lint and typecheck compete for CPU with simulators and builds.
