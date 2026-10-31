# Interaction flows (Maestro)

The release screenshots (`scripts/visual/`) open every screen by its address. These flows are the
layer above: a person's journey through the apps — taps, typing, sending — written as
[Maestro](https://docs.maestro.dev) YAML and run on the iOS simulator and the Android emulator
against the same private stack (Firebase emulators + `next dev`, seeded fresh before every flow).
Maestro doesn't drive macOS apps: the Mac app stays screenshots-only. The web's flows, when they
come, are Playwright's.

## The flows

| Flow | Account | What it proves |
| --- | --- | --- |
| `sign-in` | — → alice | A signed-out start, the emulator build's email form, alice's home feed (我也在雨裡走過 first) |
| `send-message` | alice | `/messages/bob`: types a message, 送出, the bubble is in the thread and nothing is left 傳送中⋯ |
| `leave-note` | alice | bob's card `rain-walk`: 寄小紙條, writes, 寄出, 紙條寄出了 |
| `publish-card` | alice | `/write`: title, Return, a line of story, ✓, 公開, 發布 → the card's page with its title, story and share |
| `trash-restore` | alice | her card `letter`: ⋯ → 刪除 → 這張卡片在垃圾桶裡 → 還原 → public again (its share back) |

Each one ends with a `takeScreenshot` of its end state (the trash flow also of the trashed page).

## Running them

```bash
npx tsx scripts/visual/flows.ts android                      # every flow on the visual-phone AVD
npx tsx scripts/visual/flows.ts ios --only sign-in,send-message   # some, on the Visual iPhone simulator
VISUAL_SKIP_BUILD=1 npx tsx scripts/visual/flows.ts ios      # the last build, installed again
```

The runner starts its own stack (ports `VISUAL_AUTH_PORT` / `VISUAL_FIRESTORE_PORT` /
`VISUAL_DEV_PORT`, default 9299 / 8280 / 3150), builds and installs the Debug app, brings up the
harness's own phone (booting it if needed, and shutting down only what it booted), reseeds before
each flow and runs `maestro test` on it. It prints `Flows <run> <platform>: N passed · M failed`
and exits non-zero on a failure. Everything lands in `visual/flows/<run>/<platform>/` (git-ignored):
`<flow>.xml` (JUnit), `<flow>/maestro.log`, and `<flow>/` with Maestro's commands, logs, the
flow's screenshots and, for a failure, the screen and hierarchy at the failing step
(`<flow>/debug/<flow>/screenshots/`). One platform at a time.

A release runs them inside the screenshot run: `npm run visual -- capture --flows --review` takes
every capture, then the flows on Android and then iOS on the same stack (reports in
`visual/runs/<id>/_flows/<platform>/`), then the review.

Maestro itself: `curl -fsSL "https://get.maestro.mobile.dev" | bash` (into `~/.maestro`; the runner
uses `~/.maestro/bin/maestro`, or `MAESTRO_BIN`). It needs Java 17+: the runner and the MCP use
`JAVA_HOME` when set, else Android Studio's own (`/Applications/Android Studio.app/Contents/jbr/Contents/Home`).

## Writing a new flow with an agent (Maestro's MCP)

`maestro mcp` gives an agent the phone: `list_devices`, `inspect_screen` (the screen's hierarchy as
JSON — the texts, labels and ids a selector can use), `take_screenshot`, `run` (inline YAML or
files, with `env`) and `cheat_sheet` (the command reference). It is registered for:

- **Claude Code**: `.mcp.json` at the repo root (project scope). `command` is
  `${HOME}/.maestro/bin/maestro` with `args: ["mcp"]`; `env` gives it `JAVA_HOME` (yours, else
  Android Studio's) and turns Maestro's analytics and its upsell notice off. Claude Code asks once
  to approve a project server: run `claude` here and accept `maestro`.
- **Antigravity (`agy`)**: `agy mcp add` has no project scope, so it is in your user config
  (`~/.gemini/config/mcp_config.json`), same command and environment:
  `agy mcp add --env "JAVA_HOME=/Applications/Android Studio.app/Contents/jbr/Contents/Home" --env MAESTRO_CLI_NO_ANALYTICS=1 maestro "$HOME/.maestro/bin/maestro" mcp`

First bring up a phone with the app and the stack, held until Ctrl-C:

```bash
npx tsx scripts/visual/flows.ts android --hold    # or ios; prints the device id and the -e values
```

Then, for `agy` (paste and fill in the journey):

```text
Use the maestro MCP server to write a Maestro flow for this journey in the Resonance app:
<journey, e.g. "alice opens bob's profile /u/bob and bookmarks his card 一場雨後的散步">.
The app (appId com.resonance.stories) is installed on device <device id> and the local stack is up.
1. Read maestro/README.md and two flows in maestro/flows/ (send-message.yaml, leave-note.yaml) and
   follow their conventions; call cheat_sheet once.
2. Start the flow with `runFlow: file: common/launch.yaml` and env ACCOUNT / ROUTE.
3. Walk the journey on the device with run (inline YAML, env AUTH_PORT=<…> FIRESTORE_PORT=<…>
   API_PORT=<…> PASSWORD=<…>) and inspect_screen after each step to find selectors: visible zh-TW
   text first, accessibility labels next, ids (`id:`) last.
4. Save it as maestro/flows/<kebab-name>.yaml with a comment saying what it proves, assertions
   (extendedWaitUntil) on what a person would see, and a takeScreenshot at the end.
5. Run the saved file with run until it passes twice in a row, then tell me the flow's name and
   anything in the app that had no selector.
Do not edit the app's code; do not change anything outside maestro/flows/.
```

From Claude Code the same prompt works as is (the tools show as `mcp__maestro__*`). The runner
reseeds between flows; while drafting, reseed by hand when a step changed the data:
`EMULATOR_AUTH_PORT=<auth> EMULATOR_FIRESTORE_PORT=<firestore> npx tsx scripts/seed-emulator.ts`.
A new top-level file in `maestro/flows/` is picked up by the runner (after the five above, by
name); add it to `ORDER` in `scripts/visual/flows.ts` to place it.

## Conventions

- **One file per journey**, at the top of `maestro/flows/`; shared steps in `maestro/flows/common/`
  (not run on their own). Each flow starts from nothing: `common/launch.yaml` clears the app and
  launches it signed in as `ACCOUNT` at `ROUTE`; the runner has reseeded the world.
- **The same YAML for both apps.** Where they differ, `runFlow` with `when: platform: iOS` /
  `Android` (the launch arguments, Return to put iOS's keyboard away, iOS's save-password sheet).
- **Selectors**: the words on screen, in zh-TW (a regex when the two apps word it differently:
  `與 bob 的對話|想說的話⋯`, `寄(一張)?小紙條(給作者)?`); a field whose hint is drawn rather than
  said gets an id — `accessibilityIdentifier` on iOS, `Modifier.flowTag("…")` on Android (a test tag
  shown as the resource id in debug builds, `apps/android/.../ui/FlowTag.kt`). Ids so far:
  `emulator-email`, `emulator-password`, `note-field`.
- **Typing**: Android flows type with no keyboard app (the runner turns them off and back on), so
  keys reach the field as they are; text with Chinese goes through Maestro's own input method on
  both platforms. Use zh-TW plus a little ASCII ("… Maestro") so a flow's own words are easy to find.
- **Waiting**: `extendedWaitUntil` on what the person would see, never a fixed sleep; wait for
  anything that moves the layout (the publish step's 正在讀你的故事⋯) before tapping under it. A
  toast may be gone before a check reads it — assert the page instead.
- **Environment** (`-e`, from the runner): `AUTH_PORT`, `FIRESTORE_PORT`, `API_PORT`, `PASSWORD`.
  `ACCOUNT` and `ROUTE` are the flow's own, given to `common/launch.yaml`.
- **Launch switches the flows rely on** (debug builds only): iOS `-visualCapture YES` (animations
  held still) and `-askForNotifications NO` (no system question after a first note or message —
  Maestro answers it only in English); Android takes its ports as string extras (Maestro's
  `launchApp` arguments read from env vars are strings), and is cleared and set to zh-TW by the
  runner rather than by `clearState` (which would drop the app's own language).
- **Screenshots**: `takeScreenshot: <flow>` at the end state; they are for a person (or a reviewing
  model) to look at, not compared with a baseline.
