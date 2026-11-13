# Store automation: the App Store Connect API key and the Google Play Developer API

An evaluation, not a change. Today both consoles are worked through the owner's Chrome
(store-console-notes.md): App Store Connect through its own web API (`iris`) from the logged-in
page, Play Console by scripting its pages. Two official APIs would take most of that out of the
browser. This page says which owner touchpoints each removes, what 念誠 would have to create,
the risks, and which gates stay with a person whatever the tooling.

Sources: Apple's [App Store Connect API help](https://developer.apple.com/help/app-store-connect/get-started/app-store-connect-api)
and [creating API keys](https://developer.apple.com/documentation/appstoreconnectapi/creating-api-keys-for-app-store-connect-api);
Google's [`edits.commit`](https://developers.google.com/android-publisher/api-ref/rest/v3/edits/commit)
and the Android Publisher v3 `edits` reference. What the APIs can do is from the docs; how
Resonance's account would behave with them has not been tried.

## Where the owner is needed today (store side)

| # | Touchpoint | Cause |
|---|---|---|
| T1 | Signing in to App Store Connect again in Chrome | the web session expires (2.5.0: logged out mid-release) |
| T2 | Dragging the AAB into Play, or the 8 MB parts trick | Chrome's file upload takes ≤ 10 MB; the AAB is ~22 MB |
| T3 | Picking the right connected browser | two Chromes connected (Windows and Mac) |
| T4 | The classifier refusing uploads, promotions and removals from review until the owner's words | scripting a console in the owner's browser looks (rightly) like acting as them |
| T5 | Agreements (Program License Agreement) | Apple: only the Account Holder |
| T6 | Declarations and attestations (photo permission, child safety, AI assets, production access) | Play: forms in the console only |
| T7 | The explicit yes before upload and submission | the deliberate gate |
| T8 | Reading the review result | it arrives by e-mail; nothing polls |

## App Store Connect API key

**What it is.** A private key (`.p8`, downloadable once) with a Key ID and an Issuer ID. A script
signs a short-lived JWT (ES256, at most 20 minutes) and calls `api.appstoreconnect.apple.com`.
Node's `crypto` signs ES256 without any new dependency. Xcode's own upload takes the same key:
`xcodebuild -exportArchive … -authenticationKeyPath <p8> -authenticationKeyID <id>
-authenticationKeyIssuerID <issuer>`.

**What it covers.** Everything the release does through `iris` today has a public endpoint:
app store versions (create, release type), localizations (what's new, promotional text),
attaching the build, review details and notes, screenshot sets and uploads (reserve → PUT →
commit with checksum), TestFlight build localizations, review submissions, and reading every
state (`appStoreState`: WAITING_FOR_REVIEW, IN_REVIEW, REJECTED, READY_FOR_SALE …).

**Removes:** T1 (no web session to expire), T3 and T4 for App Store work (no browser at all),
T8 (a read-only daily poll of the versions' states — `scripts/ops/daily-check.ts` has the slot,
`AscReviewSource`). It also replaces the undocumented `iris` calls and their CSRF headers, the
most fragile part of today's route.

**Does not remove:** T5 (agreements stay the Account Holder's in the browser), T7 (by design).
Answering a rejection in Resolution Center is not in the API.

**What 念誠 creates.** In App Store Connect → Users and Access → Integrations → App Store Connect
API: request access once, then a **team key** (Account Holder or Admin can make one). Two keys
are better than one:

- *read-only in practice* — the least role that can read app versions and their states (try
  **Developer**; not checked on this account) — for the daily check. API keys have no truly
  read-only role: "read-only" is the role's reach plus the script only making GETs;
- *release* — role **App Manager** (versions, metadata, builds, submissions; no finance, no
  certificates) — used only inside a release.

The `.p8` files go in the repo's git-ignored `keys/` beside the signing keys (where the owner
already keeps them), the Key IDs and the Issuer ID in `.env` (`ASC_KEY_ID`, `ASC_ISSUER_ID`,
`ASC_KEY_PATH`; `ASC_READ_KEY_*` for the read-only one). Never in a commit, a note or a log.

**Risks.**

- A team key reaches **every app of the account whatever its role**, and an App Manager key can
  submit, change prices and availability and remove an app from sale. A leaked release key is a
  hijacked listing until it is revoked. Mitigations: the read-only key for anything scheduled;
  the release key read only by the release script; revoke and re-make it if it ever lands in a
  transcript.
- An agent with a working key no longer meets the classifier's refusal (T4): the human gate must
  be in the script — it prints what it will submit and waits for a typed confirmation — not left
  to the browser's friction.
- The key never expires; nothing reminds anyone it exists. Put its creation date in
  store-console-notes.md (not the key).

## Google Play Developer API

**What it is.** A Google Cloud service account invited into Play Console (Users and permissions)
with permissions on the Resonance app only, its JSON key used to get an OAuth token for
`androidpublisher.googleapis.com`. A JWT (RS256) from Node's `crypto` gets the token; no SDK
needed. Changes go through an *edit*: `edits.insert` → `edits.bundles.upload` → `edits.tracks.update`
(release name, version codes, notes per language, status `draft` / `completed`, rollout) →
`edits.commit`. `edits.commit?changesNotSentForReview=true` stages the changes and leaves
sending them for review to a person in the console.

**Removes:** T2 entirely (the bundle upload is a resumable media upload of any size — no 10 MB
cap, no parts, no drag), T3 and T4 for Play work. Release notes in both languages, countries,
listing texts and screenshots are API calls too.

**Does not remove:** T6 — declarations (photo and video permissions, child safety, data safety,
AI-generated assets) and the production access application exist only in the console. Play's
review state is not exposed as such: the API tells a release's status on a track
(`draft`, `inProgress`, `completed`, `halted`), not "in review" or "rejected", so T8 stays the
e-mail on Android. T7 by design.

**What 念誠 creates.** A Google Cloud project (or the Firebase project's), a service account in
it, a JSON key; then in Play Console → Users and permissions, invite the service account's
address with **app-level** permissions on Resonance: *release to testing tracks* and, only if
wanted, *release to production* — not admin, not account-wide. Google says permissions can take
24–48 hours to apply. The JSON key goes in `keys/`, its path in `.env` (`PLAY_SERVICE_ACCOUNT_PATH`).

**Risks.** A key with production release permission can ship a build to everyone; with
managed publishing off, an approved review goes live by itself. Mitigations: grant testing tracks
only at first and keep production promotion a console click; always commit with
`changesNotSentForReview=true` so the send-for-review click stays the owner's; one key, app-level
only, rotated if exposed.

## What stays a human gate either way

- **Starting a release** (the `release` skill, disable-model-invocation).
- **The explicit yes before upload and before submission** — said for what is named
  (platform, version and build, track or review, release type). With an API the script must ask
  and wait; the console's friction is gone.
- **Sending Play changes for review** (keep `changesNotSentForReview=true`) and **promoting to
  production**.
- **Agreements, declarations, attestations, the production access form.** They are the account
  holder's statements, not data entry.
- **Answering App Review** (Resolution Center) and removing a version from review.
- **Store texts the owner wrote** (promotional text, what's new): the script sets what the owner
  approved, never drafts and submits them unseen.

## Suggested order, if 念誠 wants it

1. ASC read-only key → the daily check reports App Store review states (T8 on iOS/Mac). Lowest
   risk, no release change.
2. Play service account with testing-track permission → the AAB upload and the draft release by
   API (T2 gone), sent for review by the owner in the console.
3. ASC release key → versions, texts, screenshots and the review submission by API (T1, `iris`
   gone), the script's confirmation prompt as the gate.

Each is a separate decision; none is set up by this change.
