# Release screenshots

Before a release, every screen in `screens.ts` is captured on every platform
and device, compared with this machine's baseline, and what changed goes to a
reviewing model. You look only at what it flags, then accept the new captures
as the next baseline.

```bash
npm run visual -- capture                    # web, ios, android, mac (each builds what it needs)
npm run visual -- capture web --only home,card --device phone   # a slice, while working on something
npm run visual -- review                     # writes the brief for a reviewing agent (Antigravity, Claude…)
npm run visual -- review --gemini            # or asks the Gemini API directly (GEMINI_API_KEY, GEMINI_MODEL)
npm run visual -- compare                    # redraws the report after a review wrote its verdicts
npm run visual -- accept                     # the latest run becomes the baseline
npm run visual -- accept --only card,web/phone/home@dark-zh-TW.png   # only these screens / captures
```

Everything lands in `visual/` (git-ignored): `visual/baseline/<platform>/<device>/<screen>@<theme>-<locale>.png`
and `visual/runs/<run>/` with the captures, `_diff/`, `results.json`, `index.html` (open it in a
browser) and `review/REVIEW.md` + `review/verdicts.json`.

## A release, step by step

1. `npm run visual -- capture` on the release commit. It starts its own emulators and dev server
   (ports 9299 / 8280 / 3150, override with `VISUAL_AUTH_PORT`, `VISUAL_FIRESTORE_PORT`,
   `VISUAL_DEV_PORT`), so it runs beside anything else on this machine.
2. Review: in Antigravity, ask its agent to *"follow visual/runs/<run>/review/REVIEW.md"*. It reads
   the images by path and writes `verdicts.json`. Or `npm run visual -- review --gemini`.
3. `npm run visual -- compare` and open the report. It lists broken first, then unsure, then
   changed, missing and new. Look at those; the unchanged ones are thumbnails at the bottom.
4. Fix what's broken and capture again (`--only` the screens involved), or `accept` what's right.

The first run on a machine has no baseline: every capture is "new" and the review judges each one
on its own. Accept that run once you've looked it over.

## What keeps a capture the same from run to run

- **Sizes**: each device has a fixed size and scale (web: `WEB_DEVICES` in `web.ts`; the apps: their
  own simulators/AVDs, Mac: a fixed window). Baselines belong to this machine: after updating
  macOS, Xcode or the Android system image, capture once and accept.
- **Data and time**: a fresh seed of `scripts/seed-emulator.ts` before every run, with its clock
  pinned (`SEED_NOW` in `stack.ts`), so no date on a screen moves.
- **Motion**: never captured mid-way. The web runs with reduced motion and CSS animations finished
  (Playwright's `animations: 'disabled'`), the apps with animations off. Every capture is taken
  again and again until two in a row match (`settle` in `util.ts`): a skeleton, a fade or a late
  font never makes it in. A screen that never settles is still taken, and the report says so.
- **Things that move by themselves**: the landing page's paper puppets are kept from loading;
  the reading puppets are off by default.
- **Small differences**: under 0.05 % of the pixels apart (after pixelmatch's antialiasing allowance)
  counts as unchanged (`DIFF_RATIO` in `compare.ts`).

What screenshots don't test: motion itself (timing, easing), and gestures. A state reached by a
gesture (a menu open, a pane dragged half-way) is set directly through a debug-only parameter and
captured as a screen, while the gesture's logic stays covered by unit tests.

## The platforms

| Platform | Devices | How a screen is opened | Notes |
| --- | --- | --- | --- |
| web (`web.ts`) | phone 390×844, tablet 820×1180, desktop 1440×900, all @2x | Playwright's pinned Chromium, `window.__emulatorSignIn`, the page's path | waits for requests to drain (bar the realtime channels) before checking stillness |
| ios (`ios.ts`) | `Visual iPhone` (17 Pro), `Visual iPad` (Air 11″), made on first use | a fresh launch with `-route`, `-email`/`-password` or `-signedOut YES`, `-visualCapture YES` | status bar 9:41; theme and language by launch arguments |
| mac (`mac.ts`) | the Debug Mac Catalyst app, `.macdev` bundle id, 1440×900 window | the same launch arguments, launched in the background | needs Screen Recording for the terminal that runs it |
| android (`android.ts`) | AVDs `visual-phone` (Pixel 9), `visual-tablet` (Pixel Tablet) on ports 5600/5602 | `am start -S` with `--es route`, the account, the stack's ports | animations off, demo-mode status bar; how to make the AVDs is at the top of the file |

Each app capture builds the Debug app first; `VISUAL_SKIP_BUILD=1` reuses the last build. The apps'
debug-only launch routes for the tabs and the writer (`/home`, `/messages`, `/me`, `/write`,
`/write/<id>`) live in `MainTabView.launchTab` (iOS) and `debugLaunchPlace` (Android).

Two captures can run at once on different ports (`VISUAL_*_PORT`); they share `visual/latest`, so
name the run (`--run <id>`, printed as `Run <id>: …`) when you accept or compare.

## Next: flows

Screens are opened directly by their address. Flows that need taps and typing (sign in, write and
publish a card, send a message) are the next layer: Maestro (YAML flows for the iOS simulator and
the Android emulator; its MCP server can draft them) for the apps, Playwright for the web.

## Adding a screen

Add it to `SCREENS` in `screens.ts`: a stable id, the site path, the account, and an `expect` line
saying what it should show (the review reads that line). Restrict it with `platforms` if an app has
no such place. The next run reports it as new; accept it once it looks right.
