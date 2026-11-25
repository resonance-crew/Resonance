# Store consoles: what is fragile

The release skill (`.claude/skills/release/SKILL.md`) says what happens in which order; this page
keeps what the consoles do that nobody would guess, learnt one release at a time (2.0.0 → 2.5.0,
2026-09-30 → 11-10). It is carried over from the release agent's working memory without its
account details: no e-mail address, account or app id, key, password or certificate is written
here, and none should be. Listing texts and the declarations' answers are in
[docs/store/google-play.md](../store/google-play.md) and [docs/store/app-store.md](../store/app-store.md).

Today both consoles are worked in the owner's Chrome (Claude in Chrome). The API route that would
replace most of this is weighed in [automation-options.md](automation-options.md).

## Before any store work

- **Two browsers may be connected** (the Windows one and the Mac one). List them and select the
  macOS one before touching a console; on 2026-11-09 only one was connected, on 10-31 two.
- **Chrome's file upload takes at most 10 MB.** The AAB is about 22 MB and the store graphics are
  under that.
- **The auto-mode classifier refuses uploads and attestations** until the owner has said yes in
  so many words ("Yes, upload all three"). That is the human gate working, not a bug: ask, with
  what goes where, and wait.

## Google Play Console

**Uploading the AAB.** The owner dragging it in always works. Without that: `split -b 8000000`
the AAB, give each part to an injected `<input type=file>`, join them in the page
(`new File(parts, name)`), put the file on Play's `input[accept=".aab"]` through a `DataTransfer`
and fire `change`. If the owner already put that version code in the bundle library, the release
takes it from 從檔案庫新增 (uploading again says 版本代碼已使用); remove the old one from the release
with the row's ⋯ → 移除.

**Release notes** stick only through the textarea's native value setter followed by an `input`
event; typing into it from script is lost on save.

**Promoting** (內部測試 → 升級版本 → 封閉測試 → the Alpha track): the submenu opens on click, not
hover. Promoting and sending for review were refused by the classifier without the owner's word.

**Sending for review** happens in 發布總覽, which gathers every saved change (listing, policy,
releases); a new change can restart a review already in flight. Managed publishing is off, so an
approved release goes live by itself.

**Production** needs production access, granted after a closed test (12 testers opted in for 14
days, for an account made after November 2023). The application form has no draft; its last
button (套用) submits. Play gives no reason for a refusal. First production release is a full
rollout with no staged option; countries: select all in the track's 國家/地區 → 編輯國家/地區 → 儲存.

**Declarations that appear late:**

- **Photo and video permissions** (the gallery's `READ_MEDIA_IMAGES`) shows only as an error on a
  closed or production track's review page, never on internal testing and never in App content
  before that: 前往聲明表單 → app-content/photos-and-videos, one field of 250 characters. The owner
  fills it. Keep it on file before any release whose build reads the gallery.
- **Child safety standards** (a social app): an attestation form the classifier won't fill; the
  owner does.
- **AI-generated assets**: the classifier refuses this declaration's choice even with the owner's word
  to fill the forms (2.6.0) — the owner does that dialog. A listing save asks whether screenshots carry AI-made pictures. The
  label is the review step's 「為 AI 生成的素材加上標籤」 dialog, not 管理標記. The owner chose to
  label the screenshots with demo illustrations, not the icon or feature graphics.

**Listing screenshot slots.** Uploading one file at a time from the slot's 新增資產 panel (its hidden
`input[type=file]`), waiting for each to land, adds them in order (2.6.0: 36 shots, zh/en × phone, 7", 10").
Uploading several at once adds them in the order they finish, which is wrong. Clear the slot, upload to the panel, remove what it auto-added, then click each library
row's 「選取」 in 01 → 06 order about a second apart and press 新增. The library list is
virtualised: scroll its container to find a row.

**Only warning on every bundle so far:** native debug symbols not uploaded — harmless until crash
reporting exists ([../ops/crash-reporting-proposal.md](../ops/crash-reporting-proposal.md)).

**Signing.** Play App Signing rotated the key once: register every signer's SHA-1 in Firebase,
the original's too, or Google sign-in fails with Credential Manager error 28444 on Play installs.
Check a signer with `apksigner verify --print-certs -v` on the installed base.apk (keytool's
zh-TW output crashes: `JAVA_TOOL_OPTIONS=-Duser.language=en`).

## App Store Connect

**The session expires.** When the console has logged out, the owner signs in again in Chrome;
nothing else can.

**Agreements.** A new Program License Agreement on developer.apple.com blocks creating the Mac
Catalyst profile, archiving and uploading until the owner accepts it (2026-10-29).

**Builds.** iOS and the Mac are one target with one build number. Archive with
`-destination 'generic/platform=iOS'` and `'generic/platform=macOS,variant=Mac Catalyst'`,
upload with `xcodebuild -exportArchive` and destination upload (method app-store-connect). dSYM
warnings for frameworks are harmless.

**Versions are made through the console's own API from the logged-in page** (`iris`): create the
app store version with its build relationship, one per platform (IOS, MAC_OS); release type
AFTER_APPROVAL lately (the owner's choice per release; it was MANUAL at first). Writes need the
headers the console itself sends (`X-Requested-With`, `X-CSRF-ITC`). Review notes are copied from
the last version; append a "New in x.y.z" paragraph. **Review notes cap at 4000 characters and the
Mac's are close** — trim old "New in" paragraphs first.

**What's new and the promotional text** are set per version and language (zh-Hant, en-US); the
promotional text is not copied over. The owner's promotional text is one sentence only (no
iPad/Mac sentence). TestFlight's build localizations are PATCHed (`whatsNew`); a new build copies
the previous build's, so a POST answers 409.

**Screenshots.** Sets are copied from the previous version: clear before adding (10 at most).
Upload through the API: POST the screenshot (with the file's MD5, computed in the page or passed
in), PUT the upload operations, PATCH it uploaded with the checksum. **Submitting answers 409
while any screenshot is still UPLOAD_COMPLETE** — wait for COMPLETE. Header and search assets
(iOS 27's 「標題和搜尋結果」) take PNG only.

**Languages.** Add a language in App 資訊 first (its name), then on the version page; click menu
items by script, since coordinate clicks hit the wrong language. The en-US name is
"Resonance: Story Cards" (plain "Resonance" is taken by another developer there).

**While a version waits for review** its screenshots are locked; removing it from review
(「將此版本從審查中移除」) was refused by the classifier — the owner clicks it.

**Submitting** is a review submission per platform (2.6.0, from the page: POST `reviewSubmissions`
{platform}, POST `reviewSubmissionItems` with the appStoreVersion, PATCH `submitted: true`); the state to read back is
`WAITING_FOR_REVIEW`. The result arrives by e-mail to the account holder; nothing polls it yet
([../ops/daily-check.md](../ops/daily-check.md)).

## Web and Universal Links

- A push to `main` is a production deploy. Watch it with the CLI, which prints its table on
  **stderr**: take the newest row's URL from `vercel ls resonance --prod 2>&1 | head` (or
  `--format json`), then `vercel inspect <url> --wait --timeout 10m 2>&1 | grep -i status`.
  Polling stdout for "Ready" never ends.
- Apple's CDN refreshes `apple-app-site-association` within a day and can't be flushed: the web
  goes first (preflight's `web` check). Check: `curl -s https://app-site-association.cdn-apple.com/a/v1/resonance.channel`.
