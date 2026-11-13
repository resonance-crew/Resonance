# Crash reporting: a Crashlytics proposal

A proposal, not a change: no SDK is added by it. Today no build of the web, iOS, the Mac app or
Android reports a crash. The one crash investigated so far came from the owner's own Mac
(`~/Library/Logs/DiagnosticReports/Resonance-*.ips`, unsymbolicated), and every Play upload has
warned "native debug symbols not uploaded". Testers' crashes reach no one unless they say so.

**Why Crashlytics:** the apps already run on Firebase (Auth, Firestore, Messaging, App Check, the
same project and `GoogleService-Info.plist` / `google-services.json`), so it adds one product, no
new vendor and no new account. Firebase ships an MCP server that reads Crashlytics issues, which
is what lets the daily check (daily-check.md) include crashes without a person opening a console.
Sentry would be the alternative (one tool for web and apps), at the price of a new processor in
the privacy policy and an account to keep.

## What changes, by platform

### iOS and Mac Catalyst (`apps/ios`, one target)

1. `apps/ios/project.yml`, the `Firebase` package's products for the `Resonance` target: add
   `FirebaseCrashlytics`. **Not** `FirebaseAnalytics`: Crashlytics runs without it; Analytics
   would add breadcrumbs and an analytics SDK the privacy policy says we don't use.
2. `DEBUG_INFORMATION_FORMAT: dwarf-with-dsym` for Release (check it is set for both
   destinations), and a `postBuildScripts` entry running Crashlytics' `run` script
   (`${BUILD_DIR%/Build/*}/SourcePackages/checkouts/firebase-ios-sdk/Crashlytics/run`) with the
   dSYM and Info.plist as input files, Release only — this uploads dSYMs at archive time.
   Belt and braces: after `xcodebuild archive`, `upload-symbols -gsp GoogleService-Info.plist -p ios
   <archive>/dSYMs` (and `-p mac` for the Catalyst archive) from the release skill's step 8.
3. `App/FirebaseBootstrap.swift`: nothing for the emulator branch; in the production branch
   collection is on by default — set `Crashlytics.crashlytics().setCrashlyticsCollectionEnabled(false)`
   in DEBUG so simulator and Xcode runs don't fill the dashboard.
4. Never call `setUserID` or `setCustomValue` with a uid, pen name or anything written: crashes stay
   unlinked to an account (see the labels below). Custom keys allowed: app version, screen name,
   whether the emulator is used.
5. `PrivacyInfo.xcprivacy`: add `NSPrivacyCollectedDataTypeCrashData` (not linked, no tracking,
   purpose App Functionality); the Firebase SDK's own privacy manifest covers its required-reason
   APIs.
6. Mac Catalyst: Crashlytics supports it; the dSYM upload needs the Catalyst archive's dSYMs
   (`-p mac`). Confirm the first Mac crash arrives symbolicated before relying on it.

### Android (`apps/android`)

1. `apps/android/build.gradle.kts`: the plugin `com.google.firebase.crashlytics` (`apply false`),
   next to `com.google.gms.google-services`.
2. `apps/android/app/build.gradle.kts`: apply the plugin; add
   `implementation("com.google.firebase:firebase-crashlytics")` under the existing BoM (no
   `firebase-analytics`). Release is minified (`isMinifyEnabled = true`): the plugin uploads the
   R8 mapping file on `bundleRelease` by itself (`mappingFileUploadEnabled` is on by default for
   minified builds). Native symbols: the app has no NDK code of its own; the Play warning concerns
   libraries' `.so` files — `firebase.crashlytics.nativeSymbolUploadEnabled = true` with
   `firebase-crashlytics-ndk` only if native crashes are worth it (start without).
3. `ResonanceApp.kt`: `FirebaseCrashlytics.getInstance().isCrashlyticsCollectionEnabled = !BuildConfig.DEBUG`.
4. Same rule as iOS: no user id, no pen name, no content in custom keys or logs.
5. The Play upload's "debug symbols" warning: upload `native-debug-symbols.zip` with the AAB if
   the NDK route is taken; otherwise it stays a harmless warning.

### Web

Out of scope here. The server's errors are in Vercel's logs (the daily check reads them); a
browser-side error reporter would be a separate decision and a new processor.

## Files touched (when done)

| File | Change |
|---|---|
| `apps/ios/project.yml` | `FirebaseCrashlytics` product; Release dSYM setting; post-build upload script |
| `apps/ios/Resonance/App/FirebaseBootstrap.swift` | collection off in DEBUG |
| `apps/ios/Resonance/PrivacyInfo.xcprivacy` | Crash Data, not linked |
| `apps/android/build.gradle.kts`, `apps/android/app/build.gradle.kts` | Crashlytics plugin and library |
| `apps/android/app/src/main/kotlin/com/resonance/app/ResonanceApp.kt` | collection off in debug |
| `docs/legal/privacy.{en,zh-TW}.md` | the paragraphs below |
| `docs/store/app-store.md` §3, `docs/store/google-play.md` §6 | the labels below |
| `.claude/skills/release/SKILL.md`, `docs/release/store-console-notes.md` | `upload-symbols` after the archives; the labels change in the consoles |
| `scripts/ops/daily-check.ts` | a crash section (below) |

## Store labels and the privacy policy

**App Store privacy (App Privacy in App Store Connect, and `PrivacyInfo.xcprivacy`):** add
*Diagnostics → Crash Data* — collected, **not linked** to the user's identity (no user id is set),
not used for tracking, purpose *App Functionality*. If any custom key ever carries an account id,
it becomes linked: don't.

**Google Play Data safety (`docs/store/google-play.md` §6):** add *App info and performance →
Crash logs* (and *Diagnostics*, which Crashlytics' device and OS data falls under) — collected,
not shared (Firebase is a service provider), not processed ephemerally, required (collection can't
be turned off by the user in the app), purpose *App functionality* / *Analytics* as Play defines
crash diagnosis — and remove 「當機紀錄、診斷資料」 from the "不收集" line.

**Privacy policy (`docs/legal/privacy.en.md` / `privacy.zh-TW.md`):**

- *What we collect* — a new bullet: **Crash reports (apps only)**: when the app crashes, a report
  of what the app was doing (the code's stack, the app and system version, device model, free
  memory and disk, orientation) and an ID for this installation, so we can fix it. It doesn't
  include what you wrote or who you are.
- *Who processes it for us* — Google Firebase's list gains **Crashlytics**.
- *Keeping and deleting data* — crash reports are kept by Firebase for 90 days.
- *What we don't do* — "We don't use third-party analytics or tracking tools" stays true; add
  "Crash reports are used only to fix the apps" so nobody reads Crashlytics as analytics.

Both languages change together, and the store labels change in the same release as the first
build carrying the SDK (Apple and Google compare them at review).

## Feeding the daily check through the Firebase MCP

- Set up once, by 念誠: `claude mcp add firebase npx -- -y firebase-tools@latest mcp` (project
  scope, in the main checkout; it uses the firebase CLI's existing login).
- The scheduled task's prompt (daily-check.md) gains a step: through the Firebase MCP's
  Crashlytics tools, list the top issues of the last 24 hours for the iOS and Android apps (by
  users affected), and the issues that are new or regressed since the last report; write them
  into the report's "Crashes" section as `<issue id> · <platform> <version> · <users>/<events> ·
  <exception> at <top frame>` — no device or user data.
- Same one-issue rule: crash lines join the "To look at" list of the single `daily-check` issue
  (no per-crash issues), and only the counts and the top frame go into the public repo's issue;
  stack traces stay in the local report.
- A script-only fallback (no MCP) is not available without new credentials: Crashlytics has no
  public REST API for issues; its BigQuery export would need a GCP billing project. The MCP is the
  cheap route.

## What 念誠 decides

1. Whether to add Crashlytics at all (a new data type in both stores' labels and the policy).
2. NDK symbols on Android: now or later.
3. Whether the daily task reads crashes through the Firebase MCP (an MCP server added to the
   project's config).

Size once decided: one round's lane for both apps (SDK, symbols, policy, labels), verified by a
forced test crash on a Release build of each (iOS device, Mac, Android emulator) appearing
symbolicated in the console, then the forcing code removed.
