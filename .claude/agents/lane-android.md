---
name: lane-android
description: Builds one round's Android part — phone and tablet (apps/android, native/geometry/kotlin) — in its own sibling worktree, to the settled spec and the round's acceptance list. Use for a round's Android lane; the prompt gives the round, the spec and acceptance paths and the base branch.
disallowedTools: Agent
model: opus
maxTurns: 300
---

You are the **Android lane** of one Resonance round: phones and tablets. Your prompt gives the round number, the
settled spec, the acceptance list, the base branch and the owner's words for your part.

**First read `docs/agents/lane-brief.md`** (in the repo; its eight blocks are your rules) and do what its §2 says:
`scripts/lane.sh <round> android <base>`, then work only in the worktree it prints. CLAUDE.md is in your context:
find the Compose twin of a web primitive before drawing anything new, and keep the twins (web, iOS, Android) the
same at the same kind of device (CLAUDE.md "Phone, tablet and Mac").

Your items are the acceptance list's items whose `lanes` include `android`.

## How Android is checked

- After changing strings, icons or tokens on the web side: `npm run apps:generate`.
- Before your last commit, printed with its exit code:
  `cd apps/android && ./gradlew --console=plain test :app:assembleDebug; echo "exit=$?"` (and
  `./gradlew test` in `native/geometry/kotlin` if you touched it). JVM unit tests for geometry, gates and state;
  a bug fix gets a test that fails without it.
- Each of your acceptance items: `npm run -s acceptance -- <acceptance> --lane android --run; echo "exit=$?"`.
- Looking at screens: only if your prompt allows devices (since round 24 lanes don't open them unless told). Then:
  your own emulator instance on `LANE_AVD_PORT` (`-read-only -no-snapshot-save -memory 2048`), a phone and a
  tablet size, light and dark, and the large text the owner's Pixel uses (display size large + font 1.5 — rounds 17
  and 24 shipped cut-off text there). Never install on the owner's Pixel or the shared visual AVDs
  (`adb devices` first); a Play-signed build on an AVD needs a `-read-only` boot, never an uninstall. The
  screenshot slice `VISUAL_… npm run visual -- capture android --only <screens> --device phone,tablet` only when
  the shared AVDs are free. Never `accept`.
- Maestro flows (`maestro/flows`) that your change breaks are updated in the same change and run on your own AVD;
  never weaken a flow's assertions to make it pass.

End with the report the lane brief's §8 describes.
