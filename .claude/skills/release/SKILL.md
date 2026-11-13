---
name: release
description: Release Resonance to the stores (iOS, Mac, Android) and, with it, the web — preflight, version bump, clean export, release run, builds, then upload and submit only on the owner's explicit yes. Started by a person only.
disable-model-invocation: true
argument-hint: "[x.y.z | patch | minor] [ios] [mac] [android]"
---

# Release

念誠 started this by saying release (`/release $ARGUMENTS`). Nothing else starts it: not a
green CI, not "the code looks ready". Each step names its check; a step that fails stops the
release there, and what failed is said to 念誠 before anything else is tried. The why of each
rule is in [docs/release-checklist.md](../../../docs/release-checklist.md); what the consoles do
that nobody would guess is in [docs/release/store-console-notes.md](../../../docs/release/store-console-notes.md)
— read it before step 9.

## Human gates (never passed on 念誠's behalf)

| Gate | What 念誠 does | What you do before it |
|---|---|---|
| G1 Start | says release, and which platforms | nothing |
| G2 Push | says push (a push to `main` is a production deploy) | say what the push ships and that it deploys |
| G3 Production writes | says go for a rules deploy or a backfill `--apply` | show the dry run / the rules diff |
| G4 Baseline | says which changed screens are right; `accept` runs with `--reason "<their words>"` | show the report's changed captures; never accept unasked |
| G5 Upload and submit | an explicit yes at that moment, for what is named | say platform, version (build), track or review, release type |
| G6 Logins, agreements, declarations | signs in (App Store Connect), accepts agreements, fills attestation and permission forms | say which form, and what it asks |

A yes covers what was named, once. A later step needs its own.

## Order that matters

1. **Firestore rules (and indexes) before the web that needs them.** The client's writes are
   refused — or left unguarded — until the rules are live (2026-10-20: a push put the web live
   before its rules).
2. **The web, deployed and Ready, before an iOS / Mac build with associated domains.** Apple's
   CDN refreshes `apple-app-site-association` within a day and can't be flushed. Preflight's
   `web` check.
3. **Rules, then the backfills a release relies on, then the builds** that read data that way.
4. **Play's photo and video permission declaration before an Android release that reads the
   gallery.** It surfaces only on a closed or production track's review page.
5. **CI green on the exact commit before any build.** Push, wait for green, then build.

## Procedure

1. **Confirm the scope.** Platforms (iOS, Mac, Android; the web ships with the push), and the
   version: `patch` / `minor` / an explicit one from `$ARGUMENTS`, else ask. Read
   [docs/release/owed.md](../../../docs/release/owed.md) and name every open item to 念誠.

2. **Commit what is meant to ship** — and only that: the release is a commit, never a working
   tree. Other sessions' files stay out.

3. **Bump the versions** in one commit of its own:
   ```bash
   npm run release:bump -- <version>          # dry run: prints the diff and the subject
   npm run release:bump -- <version> --write
   git commit -m "<the printed subject>" -- apps/ios/project.yml apps/android/app/build.gradle.kts
   ```

4. **Production prerequisites (G3).** If firebase/firestore.rules or the indexes changed, or
   owed.md says so: show the change, and on 念誠's go
   `cd firebase && firebase deploy --only firestore:rules,firestore:indexes`. Backfills: dry run
   `npx tsx scripts/backfill.ts <name>`, then `--apply` on the go. Tick each in owed.md.

5. **Push (G2)**, rebased onto `origin/main`. Then wait for both:
   ```bash
   gh run watch <run id> --exit-status                                  # CI on that commit
   vercel ls resonance --prod --format json                             # the new deployment's url
   vercel inspect <url> --wait --timeout 10m 2>&1 | grep -i status      # ● Ready
   ```
   Red CI: say so, fix, push the fix, and start this step again.

6. **Preflight.**
   ```bash
   npm run release:preflight
   ```
   Every line is PASS or FAIL; the last line is `Preflight PASS|FAIL: …` and the exit code
   agrees. Before the release run, only `visual` may still fail; after step 7, everything
   must pass. A WARN is read out to 念誠 (e.g. rules that couldn't be read: check them in the
   console).

7. **The release run** — the full suites and the screens:
   ```bash
   npm run release:export -- --no-keys --dest <scratchpad>/rel-<version>-test
   # in that export: npm run lint && npm run typecheck && npm test && npm run test:emulator
   #   (private emulator ports: EMULATOR_AUTH_PORT=… EMULATOR_FIRESTORE_PORT=… npm run emulators:at)
   #   Android unit tests, iOS app + kit tests (two "< 2 s" kit tests fail only under CPU load)
   npm run visual -- capture --flows --review    # 36–50 min; never while 念誠 uses a simulator
   ```
   The run's last line is `Visual PASS|FAIL <id>`. FAIL stops the release. Changes waiting for
   念誠 are shown to them (G4); accepted ones are committed with their accept-log row. Run
   preflight again: it must say PASS.

8. **Builds**, from a clean export of the preflighted commit:
   ```bash
   npm run release:export -- --dest <scratchpad>/rel-<version>
   ```
   Then the archive (iOS, Mac Catalyst) and `./gradlew bundleRelease` it prints. Building is
   not uploading: nothing leaves the Mac in this step.

9. **Upload and submit (G5, G6).** Ask once per batch, naming each item:
   "iOS + Mac x.y.z (b) → App Store review, AFTER_APPROVAL; Android x.y.z (vc) → production,
   full rollout — upload and submit?" Wait for the yes. Then follow store-console-notes.md:
   App Store Connect (sign-in, versions, texts, build, screenshots, review submission per
   platform → `WAITING_FOR_REVIEW`); Play (AAB, release notes zh-TW / en-US, countries,
   declarations, 發布總覽 → send for review). Anything the classifier refuses goes to 念誠 as
   it is — never routed around.

10. **Record it** (below), and tell 念誠 in one message what went where, its state, and what is
    still owed.

## What to record afterwards

Append to the round's notes (`Resonance-notes/<date>-releases/notes.md`), in this shape — no
e-mail addresses, keys or account ids:

```markdown
## x.y.z（YYYY-MM-DD，<platforms>）
- 念誠：「<the words that started it>」
- Commits: <ship commit(s)>, bump <sha>: iOS + Mac x.y.z (<build>), Android x.y.z (vc<code>)
- Web: <deployment url> Ready at <sha>; rules/backfills: <what, or none>
- Preflight: <the summary line>
- Release run: web <n> + emulator <n>, Android <n>, iOS app <n> + kit <n>; visual <run id> <PASS line>
- Baseline: <accepted run/screens with the reason, or "not accepted">
- App Store: iOS <state>, Mac <state> (release type); Play: <track> <state>
- Declarations / forms 念誠 filled: <list, or none>
- Classifier refusals and what 念誠 did: <list, or none>
- Owed after this release: <items, also written into docs/release/owed.md>
- Next build numbers: iOS / Mac <b+1>, Android vc<code+1>
```

If a console did something new, add it to docs/release/store-console-notes.md in the same
commit as the notes' summary, not to a memory file.
