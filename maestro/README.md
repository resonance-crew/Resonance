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
| `send-sticker` | alice | `/messages/bob`: ☺ (貼圖) opens the panel, one tap on 心暖暖 sends it (round 23): 貼圖：心暖暖 in the thread, and held at once its menu fills in with 回覆 and 收回, never 複製 |
| `react-reply` | alice | holds bob's note: the tray's 感動 (你回應了感動), then 回覆 and a reply that quotes the note |
| `unsend-message` | alice | sends a message, holds it, 收回 → the dialog's 收回: 你收回了一則訊息 |
| `chat-draft` | alice | types to bob and leaves unsent: the list shows the words after a pen, the thread keeps them |
| `composer-toggle` | alice | `/messages/bob`: the field, ☺ (貼圖) → the panel, ⌨ (鍵盤) → words typed land in the field (the focus came back), twice; bob's note stays above the capsule (escaped bugs #9, #11) |
| `sticker-replies` | alice | sends 心暖暖, answers bob's 謝謝 (the row names 貼圖：謝謝), then her own 心暖暖: the row now names it and no longer 謝謝 (#10) |
| `send-picture` | alice | `addMedia` puts `assets/paper.png` in the library; ＋ (附上圖片或卡片) → Android's 允許存取 and the system's question / iOS's inline picker → the picture rides (移除第 1 張圖片) → 送出 → 查看圖片 in the thread |
| `answer-letter` | alice | `/messages/carol`: carol's letter (her note quoting alice's card, 回覆後，你們就能開始聊天); alice's reply connects them, the hint goes |
| `leave-note` | alice | bob's card `rain-walk`: 寄小紙條, writes, 寄出, 紙條寄出了 |
| `resonate` | alice | carol's card `carol-note`: 共振 → the picker → 寫給十年前的自己 → 共振: 已共振, her card listed under carol's; 收藏 → 取消收藏 |
| `open-link` | alice | links into the app (#8): bob's card by its link; a crafted thread link (a note id with a `/`) opens the thread alone; a card key with a `/` names no page; the app still routes: bob's profile by its link. Android: `openLink` with `autoVerify`; iOS: a relaunch with `-openLink` (`common/open-link.yaml` says why) |
| `open-notification` | alice | the tab bar's 通知: carol's letter and bob's note unread with their words; carol's row opens their conversation (her note quoting alice's card, 回覆後，你們就能開始聊天) |
| `publish-card` | alice | `/write`: title, Return, a line of story, ✓, 公開, 發布 → the card's page with its title, story and share |
| `trash-restore` | alice | her card `letter`: ⋯ → 刪除 → 這張卡片在垃圾桶裡 → 還原 → public again (its share back) |
| `sticker-breath` | alice | `/messages/bob` with the system's animations on and battery saver on (the runner sets both for the `animations` tag and puts them back): ☺ opens the panel and, on Android, a cell is playing (`sticker-moving`, a debug build's name for it) — round 25 §D: the owner's phone in battery saver showed a picker that never moved. iOS has no such name yet, so there the flow only opens the panel |
| `translate-story` | alice | carol's English card `bridge-rain`: 翻譯成中文 under the byline → 舊橋上的雨 with 已由 AI 翻譯 · 顯示原文 (the seed's kept translation: the emulators ask no model), then 顯示原文 brings the English back with 顯示翻譯 (round 25 §F2) |

Each one ends with a `takeScreenshot` of its end state (the trash flow also of the trashed page).

## Running them

```bash
npx tsx scripts/visual/flows.ts android                      # every flow on the visual-phone AVD
npx tsx scripts/visual/flows.ts ios --only sign-in,send-message   # some, on the Visual iPhone simulator
npx tsx scripts/visual/flows.ts ios --tags composer          # the group a change touches (tags below)
npx tsx scripts/visual/flows.ts android --device tablet      # the flows tagged `tablet`, on the visual-tablet AVD
VISUAL_SKIP_BUILD=1 npx tsx scripts/visual/flows.ts ios      # the last build, installed again
```

**Tags** (each flow's `tags:`), so a round runs the group its change touches rather than all of them:

| Tag | Flows | Run it after a change to |
| --- | --- | --- |
| `smoke` | sign-in, send-message, open-notification, publish-card | anything, as a quick look |
| `composer` | send-message, send-sticker, react-reply, chat-draft, composer-toggle, sticker-replies, sticker-breath | the composer, its panels, its rows |
| `media` | send-picture | pictures, the attach panel, the gallery |
| `links` | open-link | Route, links, App Links / Universal Links |
| `animations` | sticker-breath | what moves by itself: before such a flow the runner turns the system's animations on (animator scale 1, which it otherwise holds at 0) and battery saver on, and puts both back after (`flowSettings` in `scripts/visual/flows.ts`, Android) |
| `translation` | translate-story | the translate line, the story translation's client, 自動翻譯 |
| `tablet` | sign-in, send-message, send-sticker, sticker-replies, open-notification | written to hold on two panes and popovers: `--device tablet` runs these alone |

plus the older ones by area (`chat`, `stickers`, `reactions`, `letters`, `card`, `notifications`,
`writer`, `trash`, `auth`). A tag no flow carries is refused, not run as nothing. `capture --flows
--tags composer` takes the same filter; `capture --flows --variants extended` also runs the `tablet` flows
on the iPad and the Android tablet (reports in `_flows/ios-tablet/`, `_flows/android-tablet/`).

The flows hold the same locks as a capture (scripts/visual/README.md, One run at a time): a second run
on the same devices refuses, or queues with `--wait`.

`maestro check-syntax <flow>` reads a flow without a device (an unknown command or property is an
error): every file here passes it.

The runner starts its own stack (ports `VISUAL_AUTH_PORT` / `VISUAL_FIRESTORE_PORT` /
`VISUAL_DEV_PORT`, default 9299 / 8280 / 3150), builds and installs the Debug app, brings up the
harness's own phone (booting it if needed, and shutting down only what it booted), reseeds before
each flow and runs `maestro test` on it. The reseed empties the stack's database first (`SEED_RESET=1`), so
nothing one flow wrote — a connection, a bookmark, a sent message — carries into the next. It prints `Flows <run> <platform>: N passed · M failed`
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
A new top-level file in `maestro/flows/` is picked up by the runner (after the ones above, by
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
  `emulator-email`, `emulator-password`, `note-field`. A selector's words are checked against
  `src/messages` and the seed by `scripts/visual/flows.test.ts`, so a renamed string fails in `npm test`.
- **Tags**: every flow has some; a new one joins a group above, and `tablet` only once it has passed on
  a tablet.
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
