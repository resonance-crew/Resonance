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
npm run visual -- capture --flows --review --variants extended   # the release run plus the extended set (large text, turned and dark tablets, a narrow Mac window)
npm run visual -- plan                       # how many captures each set takes, and about how long
npm run visual -- review --run <id> --agy    # review a run with Antigravity (only what changed or is new)
npm run visual -- review --run <id> --agy --all   # every capture: a first look over a new baseline
npm run visual -- review --run <id>          # just write review/REVIEW.md, a brief any agent can follow by hand
npm run visual -- review --run <id> --gemini # the Gemini API instead (GEMINI_API_KEY, GEMINI_MODEL)
npm run visual -- compare --run <id>         # redraw the report (after verdicts came in another way)
npm run visual -- accept --run <id> --reason "<the owner's words>"   # the run becomes the baseline
npm run visual -- accept --run <id> --only card,web/phone/home@dark-zh-TW.png --reason "…"   # only these screens / captures
npm run visual -- accept --runs <id>,<id> --only card --reason "…"   # several runs at once (a retake named after the run it retakes)
npm run visual -- promote --from r30/base --reason "<the owner's words>"   # a merged round's accepted pictures into main's baseline
npm run visual -- baselines                  # main's and every branch's baseline, and which one this checkout uses
npm run visual -- prune --dry-run            # which old runs `prune` would remove (and the GB): never the newest 20 (--keep N), one a baseline or an accept log names, visual/latest, or one maybe running (prune.ts)
npm run visual -- capture web ios android --web-only card --web-device phone --ios-only card,thread --android-device phone   # one run, each platform its own slice
```

Every command prints `Run <id>: …`; pass that id with `--run` (the default, `visual/latest`, is
whichever run started last on this machine, which can be someone else's).

Everything lands in `visual/` (git-ignored):

```
visual/baseline/<platform>/<device>/<screen>@<theme>-<locale>.png   main's accepted pictures
visual/baseline/<platform>/meta.json                                the latest accept, and each picture's commit
visual/baselines/<branch, encoded>/…                                a round's or a branch's own (Baselines, below)
visual/runs/<id>/<platform>/<device>/…png                           a run's captures
visual/runs/<id>/_diff/…png                                         changed pixels in red
visual/runs/<id>/results.json   index.html                          the comparison and its report (open in a browser)
visual/runs/<id>/review/REVIEW.md   verdicts.json                   the review brief and the model's verdicts
visual/runs/<id>/_logs/                                             emulators, dev server, app builds
visual/runs/<id>/_resources.jsonl   _resources.json                 what the run cost the machine, every 5 s, by phase
visual/runs/<id>/_timings.jsonl   _timings.json                     each capture's steps, each sign-in and build, by device
```

**What a run costs** (`resources.ts`, `timings.ts`). Every few seconds (`VISUAL_SAMPLE_S`, default 5; `0` turns it
off) the run notes each of its parts' resident memory and CPU — `next`, `firestore-emulator`, `firebase-cli`,
`chromium`, `android-emulator`, `sim:Visual iPhone`, `mac-app`, `xcodebuild`, `gradle`, `maestro`, `agy`, the
`harness` itself — with the machine's swap, compressed memory and free share, by the phase it is in (`stack`,
`web+mac`, `android`, `ios`, `flows`, `compare`, `review`); the machine's build daemons are said apart
(`machine:gradle-daemons`, `machine:xcode-build-service`: anyone's, never the run's). Each phase's peaks are said as
it ends (`Resources (android, 412 s): the run's peak 9.8 GB (android-emulator 7.1 GB, next 1.9 GB, …) · swap …`) and
kept in `_resources.json`. Each capture writes its steps (`hints`, `launch`, `ready`, `demo-bar`, `settle`,
`second-look`, `checks`, `write`, `quit`), each sign-in launch and build its own line, and the run ends with each
device's medians (`Timings android/phone: 6 captures, median 7.9 s (launch 1.4 s · ready 2.1 s · …)`). Nothing is
asked but `ps`, `sysctl` and `vm_stat`.

## Baselines: main's, a round's, a branch's

Each line of work compares with, and accepts into, a baseline of its own (`baselines.ts`); a round's accept no
longer becomes every other branch's baseline (on 2026-11-22 the one baseline was r29/r30's look, and main's and
the other rounds' captures all came out changed and unexplained). Which one a checkout uses:

| Checkout on | Baseline | Folder |
| --- | --- | --- |
| `main` (or `master`) | main's | `visual/baseline/` — the old single baseline, where it always was |
| a round's branch: `r30/base`, `r30/web`, `r30/ios`, … | the round's, shared by its lanes and round-verify | `visual/baselines/r30%2Fbase/` |
| any other branch | its own | `visual/baselines/<its name, encoded>/` |
| a detached checkout | its commit's | `visual/baselines/detached-<sha8>/` |
| `VISUAL_BASELINE=<name>` set | that one (`main` for main's) | as above |

A branch's baseline is made the first time it is used, cloned from main's (`cp -c`: APFS clones, no bytes
copied), with `branch.json` saying when; a name becomes a folder with every byte but letters, digits, `-` and
`_` as `%XX`, so no branch name makes a path (`..` → `%2E%2E`). Each run records its baseline (`run.json`
`baseline`), and `compare`, `review` and `accept` of a run use that one, from whichever checkout; runs from
before had main's. Only main itself (or `VISUAL_BASELINE=main`) accepts into main's — a branch's pictures reach
it by `promote` (below). Each baseline's `meta.json` starts its trailer range at its own accepts.

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
| `aborted` | the run was ended before its end: nothing moved for `VISUAL_STALL_MIN` (30), it passed `VISUAL_RUN_TIMEOUT_MIN` (300), or another run took over its lock (One run at a time, below) |

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
`unsettled`. On the apps every capture without a baseline gets the second look too — a machine's
first run, a new screen, the extended set's first run — or a skeleton taken there would be the
baseline the next run trusts (the web's pass has its own guards: requests drained, a blank page
retaken). It costs a few seconds per changed or new capture, nothing for an unchanged one. On the apps a
capture with no baseline has had a settled first look already (Android: held 3.5 s with no skeleton named; iOS and
the Mac: 4 s after the launch), so its second look, after the same wait, is one plain frame (a screencap, a simctl
screenshot): the same page again and the first look is kept; another page, and the whole looks go on as above
(about 7 s less per new Android capture, 1–2 s on iOS and the Mac; a changed capture's looks are as they were).

**Android's skeletons** are told by name, not by pixels: the app names each skeleton for TalkBack
(`L10n.Home.moreLoading`, 載入中… / Loading… — the card page's story, the conversations, the bell, a
thread, settings' lists), and a settled frame counts only once `uiautomator dump` shows no node so
named (`stillLoading` in android.ts); still there after 90 s, the capture is `unsettled`.

What can still pass, precisely: on **iOS and the Mac** nothing reads the screen's hierarchy (simctl and
screencapture give pixels only), so a page still loading after the 4 s wait, the settle and both looks
(about 15 s in all) is kept as it is — a change from the baseline, which fails the run as
`unexplained` unless a `Visual:` trailer names that screen, and then waits for the owner's look like any
named change. On **Android** the home feed's, a profile's and the card box's skeletons carry no name yet
(the same `semantics { contentDescription = L10n.Home.moreLoading }` would make them count), so those
screens rely on the looks alone, as iOS does.

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
| `phone-bands` | on the phone, a list's card (an `article` beside another, a card grid's item; a `data-framed` one aside) or a band (`[data-band]`) that stops short of the window's edges — a phone's lists are bands, not cards; not inside a dialog, a menu or the landing film | warn |

A check fails runs only once it has been seen clean — one that fails every run only teaches everyone
to ignore the verdict. The first full web run (2026-11-13, 110 captures) found no overflow and no
wrapped label, so those two fail, with `blank`, which is never right. It warned of the rest: 82
touch targets (the phone and tablet header's icons are 34 × 34), 19 words under contrast (the
landing film's skip link, a thread's quoted words at 3.95:1, 刪除帳號 at 4.18:1, …) and 10 console
errors, all meant (the 404 page's own 404, and the Firestore emulator's permission-denied as an
anonymous card's page reads it through the rules before asking the server). When what a check
shows is fixed, or accepted as it is, raise it to `fail` in `WEB_CHECKS`. `phone-bands` came later
(2026-11-13): a phone slice of home, card, profile, me, messages, notifications and settings in all three
variants found nothing, so it can go to `fail` once a full web run agrees.

## The web's interaction flows

The Maestro flows (maestro/README.md) walk the apps; the web's twin is `scripts/visual/webFlows.ts` — Playwright
journeys in Chromium against the same private stack, each at a desktop and a phone width: a message and a bell row
arriving while the page only watches (`signals/{uid}` → a pull over `/api/v1`), a block and its undoing, a draft
through the outbox (a reload, an offline stretch, publishing), a published card's pending edit, the thought map's
batched ops, a bookmark. Every flow also fails on a Firestore write from the page, a listener on anything but
`signals/{uid}`, a 5xx or an uncaught page error. `scripts/visual/webflows/README.md` says what each proves and how
to add one.

```bash
npx tsx scripts/visual/webFlows.ts                       # every flow, both widths
npx tsx scripts/visual/webFlows.ts --only write-draft --width phone
```

It holds the same port locks as a capture (below) and reports to `visual/webflows/<run>/` (git-ignored); its last
line is `Web flows <run>: N passed · M failed` and its exit code says the same. A release's `capture --flows` does
not run it yet: run it beside the release run when a change touches the web's data paths.

## One run at a time, and the owner's devices

Two runs on the same devices hurt each other: the second finds the first one's simulators up and
leaves them running, the first shuts them down under it, and each reseeds (empties) the other's
database. So a run holds a lock on what it uses (`lock.ts`) — `android`, `ios`, `mac` for the devices
it captures, `port-<n>` for each of its stack's three ports — in one folder for the whole machine
(`VISUAL_LOCK_DIR`, else the temp dir: every worktree's run sees every other's). One that finds a
lock held does not start:

```
Visual: the ios devices in use by another run — pid 4242, `visual capture ios` in /Users/…/Resonance-loop-step2, since 2026-11-13T03:46:00.000Z (14 min).
Two runs on the same devices shut down each other's simulators and reseed each other's stack, so this one does not start.
Wait for it and run again, or add --wait to queue behind it; a web-only slice can move its stack instead (VISUAL_AUTH_PORT, VISUAL_FIRESTORE_PORT, VISUAL_DEV_PORT).
```

(exit code 1); with `--wait` it says once what it waits for and starts when the other run is done.
A web slice on its own ports takes only those ports, so two of them run side by side. A lock whose
run was killed outright is taken over (its pid is gone). `scripts/visual/flows.ts` takes the same
locks.

A run never holds them for ever (2026-11-22: one sat 2 h 16 min on `simctl bootstatus`, a second
queued behind it the whole time):

- **Every device command has a time.** `simctl bootstatus` 5 min (`VISUAL_BOOT_TIMEOUT_S`), then the
  harness's own simulator is shut down and booted once more; an AVD that doesn't boot in that time is
  stopped and started once more; an adb call 2 min (`VISUAL_ADB_TIMEOUT_S`; an install 5), then
  `adb reconnect` and once more; any other blocking command 10 min (`VISUAL_CMD_TIMEOUT_S`). A second
  timeout fails the run (`retry.ts`).
- **The lock beats.** Its holder writes the time into its lock files every 30 s; a holder still alive
  whose beat is older than 10 min (`VISUAL_LOCK_STALE_MIN`) is stuck, and its locks are taken over —
  said, never killed. A lock from an older harness, without a beat, is judged by its pid alone (`lock.ts`).
- **The watchdog.** A capture with nothing said for 30 min (`VISUAL_STALL_MIN`; a cold Mac build, the
  longest quiet step, takes 17) or running past 300 min (`VISUAL_RUN_TIMEOUT_MIN`) ends: its stack
  stops, its locks go free, and its last line is `Visual FAIL <id>: aborted — why` (exit 1; `watchdog.ts`).
  So does one that finds its lock taken over.

The harness shuts down only what it booted, and only its own (`devices.ts`: `Visual iPhone`,
`Visual iPad`, `emulator-5600`, `emulator-5602`); every shutdown goes through that check, and anything
else is left running and said. A run with an app in it lists everyone else's simulators and
emulators as it starts ("Left alone while this runs: …") and again as it ends: one that went down
meanwhile — the 2026-11-10 release run saw the owner's go, which nothing in the harness names: a Mac
short of memory, or CoreSimulator restarting, takes devices down by itself — is a `device` warning,
printed above the verdict line and kept in `run.json` (`devicesLost`), so the owner hears it from the
run.

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
- `--runs a,b,c` accepts several runs as one (accept.ts): all are checked first — each exists and gives
  at least one capture — or nothing is accepted. A capture two of them took comes from the one named
  last (a retake after the run it retakes), and the other is said. Each run gets its own log row and
  each capture its own run's commit in `meta.json`. `--run <id>` (or none: the latest) works as before.
- Each accept appends one row to [docs/visual-accept-log.md](../../docs/visual-accept-log.md), which
  is in git (`visual/` isn't): the time (UTC), the run and the commit it captured (`(dirty)` when the
  tree had changes), the platforms, what `--only` named (*all* for the whole run), how many captures
  and the reason. Commit that row with the work it accepts: `git commit -- docs/visual-accept-log.md`.
- The platform's `meta.json` keeps the run, time and reason of its latest accept, the commit each
  capture was accepted at (`captures`), and as `commit` the oldest of those: where the review starts
  reading `Visual:` trailers, so an `--only` accept never hides the trailers of the platform's other,
  older pictures (`baselineMeta.ts`).
- An accept compares the run again only where it copied: every other capture's result is reused
  (the comparison keeps each result with what it was judged from, `_compare.json`).
- The report's per-capture command (`index.html`) carries a `--reason "<the owner's words>"` to fill in.

### Promoting a round's pictures into main's

A round accepts into its own baseline; once its work is on main, its look becomes main's with `promote`, held as
an accept into main's (`promote.ts`):

```bash
npm run visual -- promote --from r30/base --reason "<the owner's words>" [--only card,thread] [--allow-unmerged]
```

- Refused without `--reason`, and the guard hook checks the words are the owner's, as for `accept`.
- Only what the round **accepted** moves: a picture whose commit in the round's `meta.json` was accepted after its
  baseline was cloned from main's (`branch.json`). Its other pictures are main's own as they were then, and never
  go back over main's newer ones. Each moved picture keeps its round commit in main's `meta.json`, and each run is
  a row of the accept log, `(promoted from r30/base)` after the reason.
- Every commit those pictures were taken at must be in main's history (`git merge-base --is-ancestor <c> main`):
  one that isn't — the round not merged yet, or merged as a squash or cherry-pick under other hashes — stops it,
  naming them, unless `--allow-unmerged` says the owner knows (said again as it goes).
- The round's own baseline stays as it is; removing a branch's baseline (`visual/baselines/<name>/`) is the
  owner's call, never a step of its own.

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

Two batches run at once (`VISUAL_AGY_PARALLEL`, default 2 — each `agy` holds about 1 GB; 1 runs them one after the other — a release's 116
changed captures took 12 batches in a row, 34 min, run 20261123-073642). A batch turned away for its rate or quota
(a 429, `RESOURCE_EXHAUSTED`, "rate limit", "quota") is tried once more and the rest go one at a time. In `capture
--review` the review doesn't wait for the run's end: as each phase ends, its platforms' changed and new captures
(and the film's stills, with the web) go to agy, judged while the next phases and the flows run; the end of the run
hands over whatever no phase did, and the verdict waits for every batch (`agyReviewer` in review.ts). A run that
ends early stops the calls still under way.

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

### The extended set (`--variants extended`)

The release set above is what every release run takes. The bugs that still reached the owner in rounds 17–24
sat in states it never has (the 2026-11-13 audit, §5): a large font or display size on Android, an iPad in
landscape or in a window, a tablet in the dark, the Android soft keyboard. `--variants extended` takes the
release set and those states on top, each aimed at the few screens where it bites (`variants.ts`):

| Device (folder) | On | Screens | Setting | For |
| --- | --- | --- | --- | --- |
| `android/phone-large` | the phone AVD | card, thread-reply, thread-attach, settings, write-draft, notifications, card-note-open | font 1.5, `wm density 504` (343 dp across) | #14 允許存取 gone at display size + font 1.5; #3 the writer's status line cut; the note's line grows, never clipped (round 26) |
| `android/phone-largest` | the phone AVD | the same seven | font 2.0 | #3 |
| `android/phone-landscape` | the phone AVD | card-note-open | `user_rotation 1` | the note field's two lines in a short window (round 26 SETTLED 9; the iPhone app stands upright only, and the web capturer has no device states) |
| `android/tablet-portrait` | the tablet AVD | home, messages, thread, thread-stickers, card, notifications | `user_rotation 1` | the tablet was landscape only |
| `ios/ipad-landscape` | `Visual iPad` | home, messages, thread, thread-stickers, thread-reply, card, notifications, write-draft | the simulator turned to landscape (Maestro's `setOrientation`) | #11 (the iPad was upright only) |
| `mac/mac-window` | the Mac app | home, messages, thread, thread-stickers, card | a 600 × 800 window | #11, #13: an iPad in a window, as near as the harness gets |
| `ios/ipad`, `android/tablet`, `web/tablet` | — | five each, and card-note-open | dark zh-TW | the tablets in the dark |
| `web/desktop`, `mac/mac` | — | card-note-open | dark zh-TW | the note in place in the dark wider than a phone (round 26 SETTLED 9) |
| `android/phone`, `android/tablet` | — | `thread-attach`, `thread-keyboard` (screens.ts `set: extended`) | `--es threadPanel attach` / `keyboard`; the soft keyboard shown beside the hardware one for that screen | #14; #9/#11 the keyboard against the composer |

`npm run visual -- plan` prints what each set takes: release 303 captures (291 compared + 12 film stills), about
25 min of captures; extended 353, 50 more, about 3 min more by the clock — the extra captures land mostly on
the tablets' and the Mac's lanes, which wait for the phones anyway (about 8 more minutes of device time).

A state is a device of its own: its captures live in its folder and have their own baseline, so a release
run never counts them missing, and `--device phone-large` takes one alone whatever the set. Each state is
worn before its screens and taken back after, to what the device had (`wearState` in `android.ts`); the take-back
waits three seconds and syncs, because Android writes a setting to disk a moment after the change and an AVD killed
before that boots next time still worn (2026-11-13: the phone left at font 2.0). The iPad
in landscape is the simulator itself turned: simctl can't rotate one, so `turn` (ios.ts) runs
`maestro/device/orientation.yaml` (Maestro's `setOrientation`, `LANDSCAPE_LEFT`; not a flow, outside `maestro/flows`)
before the state's screens and `PORTRAIT` after, in a `finally` so a capture that throws still leaves it upright,
and once more as the iPad's lane begins (a run cut off mid-state left it turned). Each turn is checked by the
screenshot's own shape and fails the run if it didn't take. `simctl io screenshot` then gives the turned screen
upright, 2360 × 1640, the status bar along the top and the app in its wide layout. (The first try,
`-visualOrientation` asking the app's scene to turn with `requestGeometryUpdate`, did nothing on the iPad
simulator: the app stayed upright and the pictures were the upright screen laid on its side. 2026-11-14.)

Left out, and why: **a windowed iPad itself** — neither simctl nor the app can put an iPad's scene in a
window, so `mac/mac-window` (the iPad's layouts at 77 %) stands in for its width, and a windowed iPad with a
hardware keyboard stays a check on the owner's device; **iOS's attach panel** — it is the system's photo
picker over the simulator's library, which the flows add pictures to (`maestro/flows/send-picture.yaml`), so
it would change from run to run; **motion** — still captured at rest; the flows assert what a jump would
break (`maestro/flows/composer-toggle.yaml`). The soft keyboard is Gboard's own drawing: an update of the
AVD's Gboard changes `thread-keyboard`, an accept with the reason "Gboard updated". Gboard is made the AVD's
keyboard before every variant (`keysOn` in `android.ts`): the flows type through Google's voice input, and an
AVD left with it showed its "Tap to speak" panel where the keys belong (run 20261118-235458).

When to run it: before a release (`capture --flows --review --variants extended`), and on a slice after a
change near one of those states (`capture android --device phone-large --only settings`).

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
  pinned (`SEED_NOW`, 2026-09-01 12:00 Taipei, in `stack.ts`), so every date on a screen is the same. The stack keeps
  the seed loaded (`seedServer.ts`, `stack.ts` `startSeeder`: the script's own `seedWorld`, asked again for each
  flow) and empties the database through the Firestore emulator's own endpoint (`wipeFirestore`): a reseed after a
  flow took 3.4 s and takes some 0.2 s, the world the same document for document (102 documents, 4 accounts, compared
  against the old way after a flow's writes). `VISUAL_SEED_RESIDENT=0` seeds in a process of its own as before; a
  seeder that stops or never answers is replaced by that way for the rest of the run.
- **Motion is never captured mid-way.** Web: `reducedMotion: 'reduce'`, CSS animations finished and
  the caret hidden by Playwright. iOS and Mac: the debug-only `-visualCapture YES` turns UIKit and
  SwiftUI animations off and hides scroll indicators (Mac also `-AppleShowScrollBars WhenScrolling`).
  Android: the three system animation scales at 0. Android's caret can't be hidden from outside the
  app (Compose blinks it every 500 ms whatever the scales): frames apart only by a caret-sized box inside a
  text field count as the same, and that box is written beside the capture for the comparison to skip
  (`steady` in `android.ts`).
- **First-times hints** (a hint shown for its first three displays, counted on the device and in the
  account's profile, on the one stack every platform shares): a screen naming them (`hints`; none does
  since card-note-open's privacy line went, 2026-11-19) starts every capture with them unspent (`hints.ts`).
- **No picks**: the stack seeds with `SEED_PICKS=none` (`noPicks.ts`), so home is the latest cards on every
  platform and run, never picks that one capture built and a later one found.
- **The apps say when a screen is drawn** (`ready.ts`): each launch carries a token of its own, and a debug build
  launched with one (`--es visualReadyToken` / `-visualReadyToken`) says it back once its screen is quiet — at
  least one request answered, none on its way, no skeleton block or picture placeholder on screen, for 0.8 s
  (`VisualReady`: Android in logcat, iOS and the Mac in the unified log, subsystem `com.resonance.visual`, read with `log stream` / `simctl spawn … log stream` — the Mac app's sandbox container is closed to every other process). The harness then goes
  on at once to a closer settle (frames 0.5 s apart; Android holds 1 s, not 3.5) instead of the fixed waits
  (Android's 4 s, 8 s on an account's first launch; iOS's and the Mac's 4 s). The sign-in launch iOS and the Mac make
  for each account isn't captured, it settles the account on the device: it carries a token too, and the app says
  `account <t>` once the account it was launched with is signed in and its profile read and kept (or signed out) —
  `SessionStore`, debug builds only — beside its `ready <t>`; with both said the harness holds 1 s more and goes on
  (`waitSignedIn`), with either missing it waits the full 10 s as before, and never longer.
  Everything that judges the frame stays as it was — the settle, Android's skeleton names, the second look. A
  launch that says nothing within `VISUAL_READY_TIMEOUT_S` (12) waits out the rest of the old fixed wait and goes
  on exactly as before; each capture's log line says which (`ready in 1.9 s`, `no ready signal`).
  `VISUAL_READY=0` turns it off. Release builds have none of it.
- **Waiting for the real page**: a capture is taken again and again until two in a row match
  (`settle` in `util.ts`). A page waiting for a compile or a read holds still too, so the web first
  waits for its requests to drain (bar the realtime channels), and Android checks a settled frame
  is still the same 3.5 s later after warming the API routes, with no skeleton left in its window
  (What fails a run, Android's skeletons). The web asks for every page once
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
- **The comparison** (`diff.ts`; two files with the very same bytes are the same page without it, and each result is kept with the stamps of what it was judged from, `_compare.json`, so `compare`, the verdict, a review and an accept judge only what changed under them; what is left is judged on worker threads, `VISUAL_COMPARE_WORKERS`, default the cores less two and at most 4, each PNG decoded by libvips — byte for byte pngjs's RGBA, checked on every capture of three real runs, with pngjs kept for a PNG carrying an ICC profile or more than 8 bits a channel, `judge.ts`; 185 web captures 31.8 s → 5.3 s): not a share of the page's pixels, which a window drawn a pixel
  lower fills with red edges while a heading moved across the page hardly registers. A pixel
  differs past pixelmatch's threshold (YIQ 0.1). The page is cut into 16 px cells; a cell with
  pixels apart is only *moved*, and forgiven, when one shift of at most 2 px lines the whole cell up
  with the other picture — one shift per cell, never per pixel, so a badge's "2" turned "3" (every
  stroke with ink beside it) still counts. The search runs on both pictures blurred 3 × 3, so a thin
  pen line moved by part of a pixel (the Mac app's 77 % scale after a one-pixel shift) lines up
  too, and so does text antialiased again at another fraction of a pixel (after a macOS update its
  edges still differ by up to ~70 grey levels blurred and lined up: the blurred pictures are compared
  at 0.2, with 4 pixels of slack a cell). What the blur would even out is held another way: a cell
  with more than 6 pixels apart on *flat paper* — nothing but one colour within 3 px, in either
  picture — is never forgiven, since antialiasing only lives on edges both pictures share. So a
  fill that changed colour, a hairline that came or went, an emoji drawn a duller red (the Mac's 🇹🇼
  in run 20261115-000009) still count. What it can't tell: text whose ink alone turned lighter or
  darker by less than ~70 levels reads as the same text antialiased again. A cell not forgiven with 6 pixels apart is changed; touching changed cells make an area, and
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
`./gradlew :app:assembleDebug`) — unless its inputs are as at the last build: the fingerprint of the
app's sources, the files it takes from the rest of the repository (fonts, strings, stickers, both
islands, native/), its build arguments and Xcode's version is kept beside the product, and a match
with the product untouched since reuses it (`buildStamp.ts`; about 0.3 s against 30–200 s of xcodegen
and xcodebuild). `--force-build` (or `VISUAL_FORCE_BUILD=1`) builds anyway; `VISUAL_SKIP_BUILD=1`
reuses the last build without looking. Every build is also kept in the machine's shared build cache by
that fingerprint (`~/Library/Caches/resonance-visual/builds`, `VISUAL_BUILD_CACHE=<folder>`, `0` turns it off;
the checkout's own path left out of it), so another worktree with the same app inputs — a web lane, a round's
base, a fresh worktree — takes the app from there instead of building its own (an entry is renamed into place once
whole, so a checkout finds a whole one or none; APFS clones, three per product). The builds run beside
the captures, never blocking them: the apps start building as the run starts, in the order their phases come
(`phases.ts`) — the Mac app first, as the Mac is captured in the first phase, then the simulator's, the two Xcode
builds taking turns as they share the project and Swift's package caches, and the APK beside them. The Xcode
builds write no index store (`XCODE_RUN_SETTINGS`: only Xcode's editor reads it). What the run starts leaves nothing resident behind it: the APK
builds with `--no-daemon` and the Kotlin compiler in that same process (`GRADLE_RUN_FLAGS`; a build used to leave a
4 GB Gradle daemon and a Kotlin daemon up for three idle hours, through the Android phase), and the stack's Firestore
emulator runs in a heap of 1 GB with the serial collector (`VISUAL_FIRESTORE_HEAP`; firebase-tools gives it no
limit). The web's own captures run in several browser contexts at once (`VISUAL_WEB_PARALLEL`, default 4; 1 takes
them one by one as before), with the writes its pages make to the shared stack — a read counted once per reader,
card and day, the bell's panel marking its notifications read, a screen's hints unspent — kept in their old order:
each screen's first visit by an account runs one at a time in the old order, and only the later visits (the dark
and English phone, the tablet, the desktop), which write nothing new, run side by side (`webSchedule.ts`). A
context that fails is tried once more in a fresh one; failing twice, its captures are said and fail the run as
unsettled, and the others go on. Phases (`PHASES` in `phases.ts`): web + Mac, then
Android's phone and tablet together, then the iPhone and iPad together — in one run whatever slices the
platforms take: `--<platform>-only a,b` and `--<platform>-device x,y` give a platform its own screens and
devices (`--only` / `--device` are the others'), so a slice of four platforms starts one stack, builds the
apps beside the first phase and leaves no gap between platforms (round-verify takes its slices this way) (`VISUAL_PARALLEL=0` runs a
platform's devices one at a time, for a machine short of memory); an AVD or simulator this run
booted is shut down when its screens are done (`VISUAL_KEEP_DEVICES=1` keeps the simulators up), and
nothing else ever is (One run at a time, and the owner's devices).
**A second phone** (`lanes.ts`): a phone takes three variants and a tablet one, so the tablet's lane used to stand
idle for most of the phase (run 20261123-073642: the Android tablet 14 min, the iPad 9). Now the phone's work is cut
by variant; the first phone takes from the front (light zh-TW first, so the first visits keep their old order) and,
once the tablet is done, shut down and seen gone, a second phone takes from the back — Android `visual-phone` again,
read-only, as `emulator-5604` (its writes thrown away when it stops); iOS `Visual iPhone 2`, a `simctl clone` of
`Visual iPhone` made before the iPhone boots (none when it already runs) and deleted when the run is done. Never more
than two devices at once; `VISUAL_SECOND_PHONE=0` (or `VISUAL_PARALLEL=0`) keeps to one phone.
The flows still run one platform at a time after the captures: each reseeds (and so empties) the
stack's database, which would pull the data from under the other platform's flow. The stack's `next dev` builds into `.next-visual/<port>` with its own
tsconfig, so it never meets another dev server's `.next` and never rewrites `tsconfig.json`, and keeps
every page it compiled for the whole run (`VISUAL_KEEP_PAGES` → next.config's `onDemandEntries`): by
default it drops a page left unasked for a while, and a full web run compiled `/[locale]/home` ten times.

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
