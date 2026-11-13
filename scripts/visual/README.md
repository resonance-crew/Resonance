# Release screenshots

Every screen in `screens.ts` is captured on every platform and device, compared pixel by pixel
with the accepted baseline, and whatever changed goes to a reviewing model (Antigravity's CLI by
default) that knows what each screen should show and what the release meant to change. A person
looks only at what it flags, then accepts the new captures as the next baseline.

Interaction flows (sign in, send a message, leave a note, publish, trash and restore) are a separate
layer on the iOS simulator and the Android emulator — Maestro, [maestro/README.md](../../maestro/README.md)
— which the release run takes too (`--flows`), after every capture, on the same stack.

```bash
npm run visual -- capture --flows --review   # the release run: web + mac, android phone + tablet, iphone + ipad, the flows, then the agy review
npm run visual -- capture web --only home,card --device phone   # a slice, while working on something
npm run visual -- review --run <id> --agy    # review a run with Antigravity (only what changed or is new)
npm run visual -- review --run <id> --agy --all   # every capture: a first look over a new baseline
npm run visual -- review --run <id>          # just write review/REVIEW.md, a brief any agent can follow by hand
npm run visual -- review --run <id> --gemini # the Gemini API instead (GEMINI_API_KEY, GEMINI_MODEL)
npm run visual -- compare --run <id>         # redraw the report (after verdicts came in another way)
npm run visual -- accept --run <id> --reason "<the owner's words>"   # the run becomes the baseline
npm run visual -- accept --run <id> --only card,web/phone/home@dark-zh-TW.png --reason "…"   # only these screens / captures
```

Every command prints `Run <id>: …`; pass that id with `--run` (the default, `visual/latest`, is
whichever run started last on this machine, which can be someone else's).

Everything lands in `visual/` (git-ignored):

```
visual/baseline/<platform>/<device>/<screen>@<theme>-<locale>.png   the accepted pictures
visual/baseline/<platform>/meta.json                                the commit, run and reason of the latest accept
visual/runs/<id>/<platform>/<device>/…png                           a run's captures
visual/runs/<id>/_diff/…png                                         changed pixels in red
visual/runs/<id>/results.json   index.html                          the comparison and its report (open in a browser)
visual/runs/<id>/review/REVIEW.md   verdicts.json                   the review brief and the model's verdicts
visual/runs/<id>/_logs/                                             emulators, dev server, app builds
```

## When to run what

| When | What | Time | Who accepts |
| --- | --- | --- | --- |
| A change that alters what a screen looks like | a slice: the screens it touches, on the platform it touches (`--only`, `--device`), compared with the baseline | 1–3 min web, + a build for an app | the owner, after seeing the report; then `accept --only` those captures |
| Before a release (store build, or a push that ships the web) | `capture --flows --review`: everything, the Maestro flows, then the agy review | ~25 min of captures (builds included, beside them) + ~11 min of flows + ~1 min of comparison, + ~40 s per changed capture for the review | the owner, after looking at what the review flagged |
| After updating macOS, Xcode, an Android system image or Playwright | a full capture with no code change; accept it once it looks right | ~25 min | the owner |

The slice keeps the baseline current as the work goes, so the release run mostly shows what nobody
meant to change. When a slice was skipped, the release run still knows what was meant: write it in
the commit.

### Telling the reviewer what changed on purpose: `Visual:` trailers

A commit that changes how a screen looks says so in a trailer (screen ids from `screens.ts`;
optionally `<platform>/<screen>` or `<platform>/<device>/<screen>`; `*` for every screen):

```
feat: 💌 the note button reads 小紙條

Visual: card-other, card-anonymous: the response bar's note button is shorter (小紙條)
Visual: android/thread: the composer's ＋ sits inside the capsule
```

The lines are read from the whole message, so a paragraph of their own above `Co-Authored-By` is
fine (git's own trailer parsing reads only the last paragraph, and so missed most of them). A line
names the screens before its colon; written loosely (`landing (desktop web): why`, `landing (web) —
why`) it names the screen ids among its first words. A commit that changes no screen says
`Visual: none — why`, and a line naming no screen the harness knows names none: every screen is `*`,
written out, never a line read as one.

The review lists, for every changed capture, the trailers that name it ("Intended change: …"), and
a change no trailer names is judged `unsure` at best, so the report surfaces it. The report shows
the same lines beside each capture. A change no trailer names also **fails the run** (see What
fails a run): name it in the commit, or, when the commit is already made, in a commit of its own
(`git commit --allow-empty -m "docs: 📸 …" -m "Visual: card: why"`), then `compare --run <id>` again.

## A release, step by step

1. On the release commit, with nothing else heavy running: `npm run visual -- capture --flows --review`.
   It starts its own emulators and dev server (ports 9299 / 8280 / 3150; `VISUAL_AUTH_PORT`,
   `VISUAL_FIRESTORE_PORT`, `VISUAL_DEV_PORT` move them), captures in three phases of two at a time —
   the web beside the Mac app, the two AVDs together, the two simulators together — each phase
   freeing its devices before the next, then runs the Maestro flows on the Android phone and the iPhone
   (reports in `visual/runs/<id>/_flows/`), then hands what changed to `agy`. Its last line is the
   run's verdict, `Visual PASS …` or `Visual FAIL …`, and its exit code says the same (see What fails
   a run).
2. Open `visual/runs/<id>/index.html`. It opens on the verdict and its problems, then lists broken
   first, then unsure, changed, missing and new, each with baseline · now · diff, the verdict and the
   intended change. Unchanged captures are thumbnails at the bottom.
3. Fix what's broken and capture again (`--only` the screens involved), or, once the owner says so,
   accept what's right (see Accepting).

The first run on a machine has no baseline: every capture is new. Review it with `--all`, look the
report over, and accept it.

## What fails a run

`capture`, `compare` and `review` end with the run's verdict (`gate.ts`): one line per problem, then
one line that is always last —

```
Visual FAIL 20261113-020000: 1 unexplained, 1 unsettled · 3 changed, 0 new, 0 missing, 278 unchanged · 2 warnings → visual/runs/20261113-020000/summary.json
```

— `visual/runs/<id>/summary.json` with every problem and warning by capture, the same at the top of
the report, and exit code 1 on a FAIL. So an agent can stop on it: the run passes or it doesn't.

| Fails the run | When |
| --- | --- |
| `broken` | the review judged a capture broken (only when a review ran) |
| `unsettled` | a capture never held still, even after a second look (below) |
| `unexplained` | a capture changed and no `Visual:` trailer since the baseline names its screen |
| `flow` | a Maestro flow failed (`--flows`) |
| `check` | a web check at `fail` found something (below: `blank`, `overflow`, `wrapped-label`) |

Warnings are said and never fail: a capture *taken again* because its first look was early, a
baseline capture the run didn't take (*missing*), a web check still at `warn`. A changed capture a
trailer names is neither: it waits for the owner's look and `accept --reason`. `compare --run <id>`
judges again after a trailer is added or verdicts come in another way.

**The second look** (`secondLook.ts`). Two frames alike only say a page holds still, and a page
still waiting holds still too: the 2.5.0 release run kept three Android cards taken before they
loaded, and `settle` had flagged nothing in 55 runs. So a capture that differs from its baseline —
or a new screen on a platform with a baseline — is taken again after a few seconds (web 2, the apps
5). The same picture again: the change is real and stays. Another one: the first look was early,
the later one is kept, and it is looked at once more, three looks in all; still moving then, it is
`unsettled`. A machine's first run has nothing to go by and takes no second look. It costs a few
seconds per changed capture, nothing for an unchanged one.

**The web's checks** (`webChecks.ts`). The web's pass measures each page it captures and writes
what it finds beside the capture (`<capture>.checks.json`; the log line names the checks):

| Check | What it finds | Level |
| --- | --- | --- |
| `blank` | the page shows no words and no picture (taken again twice first) | fail |
| `overflow` | the page is wider than the window, and what sticks out | fail |
| `wrapped-label` | a button of ≤ 40 characters whose words break onto a second line | fail |
| `console` | a console error or an uncaught exception while the page loaded (the aborted puppet requests left out; a failed resource names its address) | warn |
| `touch-target` | on the phone and tablet, a control under 44 × 44 (a link inside running text aside) | warn |
| `contrast` | words under WCAG AA, from `window.__contrastAudit()` (dev and emulator builds have it) | warn |

A check fails runs only once it has been seen clean — one that fails every run only teaches everyone
to ignore the verdict. The first full web run (2026-11-13, 110 captures) found no overflow and no
wrapped label, so those two fail, with `blank`, which is never right. It warned of the rest: 82
touch targets (the phone and tablet header's icons are 34 × 34), 19 words under contrast (the
landing film's skip link, a thread's quoted words at 3.95:1, 刪除帳號 at 4.18:1, …) and 10 console
errors, all meant (the 404 page's own 404, and the Firestore emulator's permission-denied as an
anonymous card's page reads it through the rules before asking the server). When what a check
shows is fixed, or accepted as it is, raise it to `fail` in `WEB_CHECKS`.

## The landing film

The landing page is a film the scroll plays (`src/components/sections/LandingFilm`): a stage held at
the top of the window over a track about eight windows long, the acts drawn by where the scroll is.
A whole-page capture took its first frame and then a screenful of empty track for every few seconds
of it — a change to the film hardly showed, and one that only changed its pace (a longer track) moved
the whole capture. So the film is taken three ways:

- **Compared, as any screen**: `landing` (its first frame, the window a visitor meets), and its end —
  `landing-stories` (tonight's stories, `#stories` at the window's top) and `landing-footer` (the
  closing band and the footer). These are the site's own pages and change rarely.
- **Looked at, never compared**: one still of each scene — `film-write` (11.5 s), `film-answer` (27 s),
  `film-meet` (50 s), `film-yours` (63 s) — on every web device in light zh-TW, in the run's `_glance/`
  (out of the comparison and of `accept`), shown in the report under "Looked at, not compared" and
  handed to the review to judge on their own. The film's art is still being drawn: a baseline of it
  would change with every brush stroke, on every device, and each change would wait for the owner's
  OK. When a round is about the film, the lab's own tools compare its frames side by side
  (`designs/landing-lab/film/tools/shots.mjs`, `changes.mjs`).
- **Checked, every run**: the `film` check fails a film page whose runtime never says it is ready,
  whose puppets don't all come on stage, or a still standing in another scene than its screen names
  (`screens.test.ts` also checks each still's second against the film's timeline, so a scene that
  moves fails there first); `film-frames` warns when the film, scrolled through from its top on the
  `landing` screen, draws slowly (`__film.stats()`, a dev build's numbers: a change, not a budget).

A still is the film's lab frame: `?rest=1` holds every act at the floor of its moment and `?t=` puts
the scroll there (runtime/index.ts). Two fresh loads of the same moment came out pixel for pixel the
same on a phone and a desktop, puppets included (2026-11-13).

## Accepting

A capture becomes the baseline only on the owner's OK, never unasked, and `accept` holds to it:

```bash
npm run visual -- accept --run <id> --only card,home --reason "owner, in chat: the new card and home look right, make them the baseline"
```

- Without `--reason` — or with a blank one, or with another flag where its words should be — it
  refuses, says why and accepts nothing (exit code 1). The reason is the owner's words, quoted, or
  what the accept rests on when it isn't a new look (`after updating Xcode 27.3: the same screens
  re-rendered, owner's OK in chat`).
- An `--only` that matches no capture of the run accepts nothing either (exit code 1), rather than
  quietly doing nothing.
- Each accept appends one row to [docs/visual-accept-log.md](../../docs/visual-accept-log.md), which
  is in git (`visual/` isn't): the time (UTC), the run and the commit it captured (`(dirty)` when the
  tree had changes), the platforms, what `--only` named (*all* for the whole run), how many captures
  and the reason. Commit that row with the work it accepts: `git commit -- docs/visual-accept-log.md`.
  The platform's `meta.json` keeps the reason of its latest accept too.
- The report's per-capture command (`index.html`) carries a `--reason "<the owner's words>"` to fill in.

## The review with Antigravity (`--agy`)

`agy -p` runs headless from the repository (its workspace, so it may open the images there), in
batches of `VISUAL_AGY_BATCH` (10) captures, with the model `VISUAL_AGY_MODEL`
(`gemini-3.8-flash-medium`; `agy models` lists others). Each batch gets the rubric (what counts as
broken in this hand-drawn UI), the commits since the baseline, and per capture: what it should show
(`expect` in `screens.ts`), its intended changes, and the paths of the baseline, the capture and the
diff. It answers a JSON schema (`review/verdict.schema.json`): `ok`, `intended`, `broken` or
`unsure`, with a note. A capture a batch left out, or a batch that failed, comes back `unsure` with
the reason. Needs `agy` installed and logged in (`agy --version`; headless runs use the cached
login and stop with "authentication required" otherwise).

Checked on 2026-10-31: five captures, one of them a blank messages page left by a capture taken too
early; the blank one came back `broken` ("the conversation item with bob is missing entirely… the
screen body blank"), the other four `ok`, in 3 min 15 s.

## The capture, exactly

Baselines belong to the machine that made them: fonts are the site's own (self-hosted), but
antialiasing differs between macOS versions, GPUs and simulator runtimes. On another machine, set
up the same devices below, capture once and accept: never compare against a baseline from another
machine.

The reference machine (2026-10-31): MacBook (Apple silicon, arm64, 24 GB), macOS 27.2, Xcode 27.2
(27B52), iOS simulator runtime 26.5 (23F77), Android system image android-36 Google Play arm64
(rev 7), Playwright 1.64.1 with its Chromium 156.0.8078.4 (revision 1248), Maestro 2.12.0.

### Devices and sizes

| Platform | Device id | Device | Logical size | Scale | Capture (px) | Variants |
| --- | --- | --- | --- | --- | --- | --- |
| web | `phone` | Playwright Chromium, touch, mobile | 390 × 844 | 2 | 780 × 1688 | light zh-TW, dark zh-TW, light en |
| web | `tablet` | Playwright Chromium, touch, mobile | 820 × 1180 | 2 | 1640 × 2360 | light zh-TW |
| web | `desktop` | Playwright Chromium, mouse | 1440 × 900 | 2 | 2880 × 1800 | light zh-TW |
| ios | `iphone` | simulator `Visual iPhone`: iPhone 17 Pro | 402 × 874 | 3 | 1206 × 2622 | light zh-TW, dark zh-TW, light en |
| ios | `ipad` | simulator `Visual iPad`: iPad Air 11-inch (M4), portrait | 820 × 1180 | 2 | 1640 × 2360 | light zh-TW |
| mac | `mac` | the Debug Mac Catalyst app, window `-macWindowSize 1440x900` | 1440 × 900 | 2 | 2880 × 1800 (cropped to it) | light zh-TW |
| android | `phone` | AVD `visual-phone`: Pixel 9, 420 dpi, emulator-5600 | 411 × 923 dp | 2.625 | 1080 × 2424 | light zh-TW, dark zh-TW, light en |
| android | `tablet` | AVD `visual-tablet`: Pixel Tablet, 320 dpi, landscape, emulator-5602 | 1280 × 800 dp | 2 | 2560 × 1600 | light zh-TW |

Phones take three variants because dark mode and English break the same way at every width and the
phone is where text is tightest; every other device takes light zh-TW (`PHONE_VARIANTS` in
`screens.ts`). 24 web screens and 19 app screens give 120 + 76 + 19 + 76 = 291 captures compared
with the baseline, and the landing film's 4 stills × 3 web devices = 12 more only looked at (The
landing film, below).

### Setting the devices up on another machine

- **Web**: `npm ci`, then `npx playwright install chromium` (the browser pinned by the playwright
  version in package.json; never the system Chrome, which updates itself).
- **iOS**: Xcode with the iOS 26.5 simulator runtime (`xcodebuild -downloadPlatform iOS` or Xcode ›
  Settings › Components). The simulators are made on first use (`RUNTIME` and `IOS_DEVICES` in
  `ios.ts`); a newer runtime means changing `RUNTIME`, capturing and accepting again.
- **Mac**: the same Xcode; the Debug app is built with the `.macdev` bundle id and
  `mac-dev.entitlements` (a development profile is enough). The terminal that runs the capture needs
  Screen Recording (System Settings › Privacy & Security), or every capture is the desktop behind
  the window.
- **Android**: Android Studio's SDK with `system-images;android-36;google_apis_playstore;arm64-v8a`
  (x86_64 on an Intel machine), then make the two AVDs as the top of `android.ts` says
  (`avdmanager create avd …`, then in each `config.ini`: `hw.keyboard=yes`, `hw.gpu.enabled=yes`,
  `hw.gpu.mode=host`, `hw.ramSize=3G`). A hardware keyboard keeps the soft one from opening in the
  writer.
- **The stack**: Java for the Firebase emulators (`npm run emulators` must work), and
  `native/editor/dist/editor.html` for the app builds (`npm run native:editor`).

### What keeps a capture the same from run to run

- **Sizes** are fixed per device (above), and so are the system settings that change pixels: the
  iOS status bar is overridden to 9:41 with full bars on 2026-09-01 (`simctl status_bar`), Android's
  is in demo mode at 09:41 with no notification icons (said again before each capture).
- **Data and time**: `scripts/seed-emulator.ts` seeds a fresh world before every run with its clock
  pinned (`SEED_NOW`, 2026-09-01 12:00 Taipei, in `stack.ts`), so every date on a screen is the same.
- **Motion is never captured mid-way.** Web: `reducedMotion: 'reduce'`, CSS animations finished and
  the caret hidden by Playwright. iOS and Mac: the debug-only `-visualCapture YES` turns UIKit and
  SwiftUI animations off and hides scroll indicators (Mac also `-AppleShowScrollBars WhenScrolling`).
  Android: the three system animation scales at 0.
- **Waiting for the real page**: a capture is taken again and again until two in a row match
  (`settle` in `util.ts`). A page waiting for a compile or a read holds still too, so the web first
  waits for its requests to drain (bar the realtime channels), and Android checks a settled frame
  is still the same 3.5 s later after warming the API routes. The web asks for every page once
  before it captures any (`next dev` compiles a route on its first request and then reloads every
  open page in full), and takes a page again when it reloaded itself during the capture or came up
  with no words and no picture (the dev server's 404 page navigates to itself once more after
  loading, and now and then stays empty). Then a capture that differs from the baseline gets a
  second look (What fails a run). A capture that never settles is taken anyway,
  listed at the top of the report, and fails the run.
- **Accounts**: each account signs in fresh (web: a new browser context; iOS: a launch of its own,
  `-signedOut YES` for the signed-out start; Android: `pm clear`), so nothing carries over.
- **Things that move by themselves**: the landing film is held still (`?rest=1`: every act stands at
  its moment, no idle life) with its cast on stage — the paper puppets load (`/mascots/`) and a capture
  waits until every one is live; the reading puppets are off by default.
- **The comparison** (`diff.ts`): not a share of the page's pixels, which a window drawn a pixel
  lower fills with red edges while a heading moved across the page hardly registers. A pixel
  differs past pixelmatch's threshold (YIQ 0.1). The page is cut into 16 px cells; a cell with
  pixels apart is only *moved*, and forgiven, when one shift of at most 2 px lines the whole cell up
  with the other picture — one shift per cell, never per pixel, so a badge's "2" turned "3" (every
  stroke with ink beside it) still counts. The search runs on both pictures blurred 3 × 3, so a thin
  pen line moved by part of a pixel (the Mac app's 77 % scale after a one-pixel shift) lines up
  too. A cell not forgiven with 6 pixels apart is changed; touching changed cells make an area, and
  any area — one cell is enough, the size of a badge's digit — makes the capture changed, however
  small beside the page. A capture can name regions to skip (`<capture>.ignore.json`, kept with it
  on `accept`): the web names the cards' cover titles (SVG text scaled to the cover, whose glyphs
  come out spaced a pixel or more differently each run); they stay in the picture for a person to
  see. The report and the review name each area, and the diff image draws the baseline faded,
  forgiven pixels pale yellow, the rest red, and a box round each area. A screen's own `maxDiff`
  (the writer beside the thought map: 1 %, its camera lands a fraction of a pixel differently each
  run) still forgives what is left under that share. A different size always counts as changed.
- **The status bars**: Android's demo mode is said again before every capture (SystemUI drops the
  demo clock now and then, and the real time shows); the Mac window's close / minimise / zoom
  buttons are painted over with the bar's paper (a background launch still comes up active now and
  then, and they are the system's).

### Gestures and states

Screenshots never perform a gesture: a drag or a long press depends on timing and lands a little
differently each run. A state reached by one (a menu open, a pane dragged half-way, a message held)
is opened directly through a debug-only parameter and captured as its own screen; the gesture's
logic (where a release settles, how fast is a throw) stays covered by unit tests, and the gesture
itself by Maestro flows that check the outcome, not the in-between.

## The platforms in the code

| Platform | File | How a screen is opened |
| --- | --- | --- |
| web | `web.ts` | `window.__emulatorSignIn`, then the page's path under `/<locale>` |
| ios | `ios.ts` | a fresh launch: `-emulator YES` + the stack's ports, `-email`/`-password` or `-signedOut YES`, `-route <path>`, `-appLanguage`, `-appearance.scheme`, `-visualCapture YES` |
| mac | `mac.ts` (+ `macWindows.swift`) | the iOS arguments + `-macWindowSize 1440x900`, launched in the background (`open -n -g`), the window found and captured with `screencapture -l` |
| android | `android.ts` | `am start -S` with `--ez emulator true`, the ports, `--es email/password`, `--es route <path>`, the app locale from `cmd locale set-app-locales`, night mode from `cmd uimode night` |

The apps' debug-only launch routes for the tabs and the writer (`/home`, `/messages`, `/notifications`, `/me`,
`/write`, `/write/<id>`) are `MainTabView.launchTab` (iOS) and `debugLaunchPlace` (Android); pushes
and links route as before.

Each app capture builds its Debug app first (`apps/ios/build/visual-sim`, `visual-mac`,
`./gradlew :app:assembleDebug`); `VISUAL_SKIP_BUILD=1` reuses the last build. The builds run beside
the captures, never blocking them: the APK and the simulator app start building as the run starts,
while the web and the Mac app are captured, and the two Xcode builds (Mac, simulator) take turns, as
they share the project and Swift's package caches. Phases (`PHASES` in `run.ts`): web + Mac, then
Android's phone and tablet together, then the iPhone and iPad together (`VISUAL_PARALLEL=0` runs a
platform's devices one at a time, for a machine short of memory); an AVD or simulator this run
booted is shut down when its screens are done (`VISUAL_KEEP_DEVICES=1` keeps the simulators up).
The flows still run one platform at a time after the captures: each reseeds (and so empties) the
stack's database, which would pull the data from under the other platform's flow. The stack's `next dev` builds into `.next-visual/<port>` with its own
tsconfig, so it never meets another dev server's `.next` and never rewrites `tsconfig.json`.

## Adding a screen

Add it to `SCREENS` in `screens.ts`: a stable id (renaming one orphans its baseline), the site path,
the account, an `expect` line saying what it should show (the reviewer reads it), and `platforms`
if an app has no such place. An app screen needs its path to open by launch route (see above).
Where the web has no page for it, `web: { route, click }` opens another path and clicks a selector
once it is ready (the notifications: the bell's panel over the feed); a click, unlike a drag or a
long press, lands the same every run. `web.storage` is what the browser keeps for the screen (a
conversation's draft, so the composer opens with a reply and a card riding: `thread-reply`), written
to the site's localStorage before its page opens and taken away before the next screen. A state the
apps reach by a gesture or a tap is opened by their own debug launch arguments, `app: { ios, android
}` (`-threadPanel stickers` / `--es threadPanel stickers` for `thread-stickers`, `-visualRide
replyCard` / `--es visualRide replyCard` for `thread-reply`), added after the account and the route;
the Mac takes `app.mac`, else iOS's. The
next run reports it as new; accept it once it looks right.
