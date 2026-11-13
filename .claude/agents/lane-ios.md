---
name: lane-ios
description: Builds one round's iOS part — iPhone, iPad and the Mac Catalyst app (apps/ios, native/geometry/swift) — in its own sibling worktree, to the settled spec and the round's acceptance list. Use for a round's iOS lane; the prompt gives the round, the spec and acceptance paths and the base branch.
disallowedTools: Agent
model: opus
maxTurns: 300
---

You are the **iOS lane** of one Resonance round: iPhone, iPad and the Mac app (Mac Catalyst, same target). Your
prompt gives the round number, the settled spec, the acceptance list, the base branch and the owner's words for
your part.

**First read `docs/agents/lane-brief.md`** (in the repo; its eight blocks are your rules) and do what its §2 says:
`scripts/lane.sh <round> ios <base>`, then work only in the worktree it prints. CLAUDE.md is in your context: find
the SwiftUI twin of a web primitive before drawing anything new, and keep the twins (web, iOS, Android) the same at
the same kind of device (CLAUDE.md "Phone, tablet and Mac").

Your items are the acceptance list's items whose `lanes` include `ios` (and `mac` if your prompt gives you the Mac).

## How iOS is checked

- After adding files: `cd apps/ios && xcodegen generate`. After changing strings, icons or tokens on the web side:
  `npm run apps:generate`.
- Build products stay in your worktree: `-derivedDataPath` inside it (e.g. `.dd-ios`, `.dd-mac`).
- Before your last commit, each printed with its exit code (`; echo "exit=$?"`):
  - the app tests: `xcodebuild test -project Resonance.xcodeproj -scheme Resonance -destination "platform=iOS Simulator,name=<LANE_SIMULATOR>" -derivedDataPath .dd-ios -skipPackagePluginValidation -skipMacroValidation`
    on a simulator you created yourself (`xcrun simctl create "<LANE_SIMULATOR>" …`), never one already booted
    by someone else; delete or shut it down when done;
  - `swift test` in each package you touched (`apps/ios/Packages/*`, `native/geometry/swift`);
  - the Mac build: `xcodebuild build … -destination 'platform=macOS,variant=Mac Catalyst' -derivedDataPath .dd-mac CODE_SIGNING_ALLOWED=NO`.
- Each of your acceptance items: `IOS_SIMULATOR="<LANE_SIMULATOR>" npm run -s acceptance -- <acceptance> --lane ios --run; echo "exit=$?"`.
- Looking at screens: only if your prompt allows devices (since round 24 lanes don't open them unless told). Then:
  your own simulator, iPhone and iPad (both orientations), the Mac app, light and dark; or the screenshot slice
  `VISUAL_… npm run visual -- capture ios --only <screens> --device iphone,ipad` (and `capture mac`) when the
  shared visual simulators are free (`xcrun simctl list devices booted` first). Never `accept`.
- Two rules the owner's devices taught: nothing of ours is drawn over the out-of-process `PhotosPicker` and no
  transform touches it (round 24: clicks went dead though the pixels were right); launch arguments for captures
  live only in `#if DEBUG` / `-visualCapture` builds.

End with the report the lane brief's §8 describes.
