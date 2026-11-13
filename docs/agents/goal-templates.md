# `/goal` conditions for a lane

`/goal` checks its condition after every turn with a small model that **reads only the conversation**: it runs no
command, reads no file and sees no picture (`claude-code-mechanics.md` §2). So each condition below asks for things
the lane itself prints — a verdict line and an exit code — and names the turn limit as part of the condition (the
only cap `/goal` has; the workflows keep their own hard caps).

Fill in the braces and paste the block after `/goal ` in the lane's session (one paragraph, well under 4,000
characters). `{acc}` is the round's `acceptance.json`, `{signed}` the copy round-build kept at sign-off
(`acceptance.signed.json` beside it), `{base}` the lane's base branch (`LANE_BASE`), all from the lane's own
worktree. The acceptance command is `npm run -s acceptance -- …` (scripts/round/acceptance.ts).

## Web

```
the latest run in this conversation of `npm run -s acceptance -- {acc} --lane web --run --all-pass --against {signed}; echo "exit=$?"` printed a last line starting `Acceptance PASS r{round} web` followed by `exit=0`, and after the last code change `npm run lint; echo "exit=$?"`, `npm run typecheck; echo "exit=$?"` and `npm test; echo "exit=$?"` each printed exit=0, and `git diff --stat {base}..HEAD -- visual/baseline maestro/flows docs/visual-accept-log.md CLAUDE.md; echo "exit=$?"` printed nothing but exit=0; or 40 turns have passed — then stop and say which item or check is still failing and why
```

## iOS (iPhone, iPad, Mac Catalyst)

```
the latest run in this conversation of `npm run -s acceptance -- {acc} --lane ios --run --all-pass --against {signed}; echo "exit=$?"` printed a last line starting `Acceptance PASS r{round} ios` followed by `exit=0`, and after the last code change the app tests (`xcodebuild test … ; echo "exit=$?"` on the lane's own simulator), `swift test` for every package touched and the Mac Catalyst build (`xcodebuild build … -destination 'platform=macOS,variant=Mac Catalyst' … ; echo "exit=$?"`) each printed exit=0, and `git diff --stat {base}..HEAD -- visual/baseline maestro/flows docs/visual-accept-log.md CLAUDE.md; echo "exit=$?"` printed nothing but exit=0; or 40 turns have passed — then stop and say which item or check is still failing and why
```

## Android (phone and tablet)

```
the latest run in this conversation of `npm run -s acceptance -- {acc} --lane android --run --all-pass --against {signed}; echo "exit=$?"` printed a last line starting `Acceptance PASS r{round} android` followed by `exit=0`, and after the last code change `cd apps/android && ./gradlew --console=plain test :app:assembleDebug; echo "exit=$?"` printed exit=0, and `git diff --stat {base}..HEAD -- visual/baseline maestro/flows docs/visual-accept-log.md CLAUDE.md; echo "exit=$?"` printed nothing but exit=0; or 40 turns have passed — then stop and say which item or check is still failing and why
```

## Server (API, rules)

```
the latest run in this conversation of `npm run -s acceptance -- {acc} --lane server --run --all-pass --against {signed}; echo "exit=$?"` printed a last line starting `Acceptance PASS r{round} server` followed by `exit=0`, and after the last code change `npm run typecheck; echo "exit=$?"`, `npm test; echo "exit=$?"` and `npm run test:emulator; echo "exit=$?"` each printed exit=0, and `npm run -s api:openapi && git status --porcelain openapi; echo "exit=$?"` printed nothing but exit=0; or 40 turns have passed — then stop and say which item or check is still failing and why
```

## The merged base (the lead, after round-build)

```
the latest run in this conversation of `npm run -s acceptance -- {acc} --run --write --cwd . --against {signed}; echo "exit=$?"` in the base worktree printed a last line starting `Acceptance PASS r{round}:` followed by `exit=0`, and `npm run lint`, `npm run typecheck` and `npm test`, each followed by `echo "exit=$?"`, printed exit=0 after the last change; or 30 turns have passed — then stop and list the open items
```

## Why these shapes

- **A printed verdict, not a claim.** "All tests pass" in prose is what an early-victory agent writes; a last line
  the script prints and an `exit=` line the shell prints are what the evaluator can check.
- **`--against {signed}`.** Rewording an item, weakening its `verify` or dropping it makes the command fail
  ("changes beyond passes since sign-off"), so the cheap way to green is closed.
- **The diff check.** The failure everyone reports is the agent rewriting the check (baselines, flows, expected
  values) to make it pass; this makes that visible in the conversation.
- **Turns.** Matt Pocock's ranges (5–10 small, 30–50 large); 40 is a lane-sized round. Lower it for a fix-only lane.
