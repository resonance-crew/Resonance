# Release checklist

For a store release (iOS, Mac, Android) and for a push that ships the web. Go down the list in order;
each step names the check that proves it is done, and a step that fails stops the release there.
A push to `main` **is** a production deploy (Vercel's Git integration), so nothing here is pushed,
uploaded or submitted without the owner's word for that step.

A store release is started by the owner with the `release` skill (`.claude/skills/release/SKILL.md`,
`/release`, which only a person can start): it walks this list with the scripts below. Steps 1, 2
and 3 are checked together by `npm run release:preflight` (`scripts/release/preflight.ts`: one
PASS/FAIL line per check, a `Preflight PASS|FAIL` summary line, exit code 1 on a FAIL). What the
consoles do that nobody would guess is in [release/store-console-notes.md](release/store-console-notes.md).

## 1. CI is green on the commit you release

Nothing ships from a commit whose CI is red, still running or missing.

```bash
gh run list --commit "$(git rev-parse HEAD)" --workflow CI --json status,conclusion,url
```

Green is one run with `"status":"completed","conclusion":"success"`. An empty list means CI has
not run on that commit yet: it is not green.

- CI runs on a push to `main` (and on a pull request) — after Vercel has started deploying the same
  commit. So after a push, wait for the run (`gh run watch <id> --exit-status`) and report its
  result with the push; when it is red, say so and fix it before anything else ships.
- Store builds come from a commit whose run is already green: push, wait for green, then build.
- The local suite (`npm run lint && npm run typecheck && npm test`) runs on the Node in `.nvmrc`, the
  one CI and Vercel use (`src/lib/nodeVersion.test.ts` fails on any other).

Why: the 2.5.0 release commit `0cffdc6c` passed the local suite and failed `npm test` on CI (Node 22
there, 24 locally); nobody read CI until the next day (`6534ba4c`).

## 2. What has to be live before what

| First | Then | Why, and the check |
|---|---|---|
| Firestore rules and indexes (`cd firebase && firebase deploy --only firestore:rules,firestore:indexes`) | the web that needs them (the push) | the client's writes are refused, or left unguarded, until the rules are there; on 2026-10-20 a push put the web live before its rules. Check: the deploy's output names the released ruleset |
| The web, deployed and Ready | an iOS / Mac build whose associated domains claim a path the live site's `apple-app-site-association` doesn't yet | Apple's CDN refreshes it within a day and can't be flushed (round 23). Check: `vercel inspect <deployment url> --wait --timeout 10m 2>&1 \| grep -i status` is Ready, and `curl -s https://app-site-association.cdn-apple.com/a/v1/resonance.channel` lists the paths |
| Rules first, then the backfills a release relies on (`npx tsx scripts/backfill.ts <name>` dry run, then `--apply` on the owner's go) | the builds that read the data that way | anything left owed from an earlier round (rules, a backfill) is done or named to the owner first — written as an open item in [release/owed.md](release/owed.md), which preflight fails on |
| Play's Photo and video permissions declaration | an Android release that reads the gallery (`READ_MEDIA_IMAGES`) | it only shows as an error on a closed or production track's review page; the owner fills it |

## 3. The release run

`npm run visual -- capture --flows --review` (screens, Maestro flows, review): its last line is
`Visual PASS …` or `Visual FAIL …` and its exit code says the same — a FAIL stops the release until
it is fixed and the run passes (`scripts/visual/README.md`, What fails a run). The owner looks at what
it flagged and at the changes waiting for their OK. It closes the simulators and emulators it uses, so only one runs at a time and never while
the owner is using one. A new picture becomes the baseline only on the owner's word
(`npm run visual -- accept --run <id> --only … --reason "<their words>"`), never unasked; each accept
is a row of [visual-accept-log.md](visual-accept-log.md), committed with it.

## 4. Builds

- One commit bumps the versions (`npm run release:bump -- <x.y.z|patch|minor>`, a dry run until
  `--write`): `apps/ios/project.yml` (`MARKETING_VERSION`, and `CURRENT_PROJECT_VERSION`
  — one build number for iOS and the Mac) and `apps/android/app/build.gradle.kts` (`versionName`,
  `versionCode`). It goes through step 1 like any other.
- Build from a clean export of that commit, never from a checkout other sessions use
  (`npm run release:export -- --dest <dir>`, `--dry-run` for the plan): `git archive`,
  `node_modules` and `keys/` linked, `apps/android/local.properties` and `native/fonts` copied,
  `npm run native:editor` and `npm run native:mascots` (both git-ignored outputs), then `xcodegen`.

## 5. Upload and submit

Only after the owner's explicit yes at that moment — a store submission can't be taken back. Say what
goes where (platform, version and build, track or review) before asking.

## 6. After

The submission's result still comes by e-mail. A daily report — CI on `main`, the production
deployment and its error logs, the stores' review states, the moderation queue and the integrity
check — is prepared but not switched on: [ops/daily-check.md](ops/daily-check.md).
