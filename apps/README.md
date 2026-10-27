# Resonance native apps

The iOS (SwiftUI) and Android (Jetpack Compose) apps. They share the web's
backend (`/api/v1` plus Firebase) and take their design tokens, strings,
fonts and story editor from the web through generators, so the web stays the
single source. The migration plan and its milestones are in the
"共振原生遷移計畫" document; `native/` holds what the apps share with the web
(see its README).

```
apps/
  ios/                      SwiftUI app (XcodeGen: project.yml)
    Resonance/              app target: App, Session, Navigation, Features/*
    Packages/DesignSystem/  tokens, fonts + CSS line boxes, grain, organic components
    Packages/ResonanceKit/  generated /api/v1 client, auth middleware, localization,
                            StoryFormat (a story's Markdown → the reader's blocks)
  android/                  Compose app (Gradle)
    app/                    the app: session, navigation (Navigation 3), screens
    core/design/            tokens, fonts + CSS line boxes, grain, organic components, story reader
    core/kit/               generated /api/v1 client, localization, story format (JVM, unit-tested)
  shared/fonts/             subset fonts for both apps (committed)
native/geometry/            the hand-drawn geometry in Swift and Kotlin (used by the apps)
native/editor/              the story editor island both apps load in a WebView
native/fixtures/            golden files the web and both apps' tests read alike
```

## Both apps

- **The site**: release builds talk to `https://resonance.channel` (`AppConfig`); the API (`/api/v1`), the
  policy pages, shared card links and pushed paths all follow that origin. The host the site had before,
  `resonance-world.vercel.app`, still serves the same deployment, so builds already installed keep working
  and older links keep opening (see Story links). Android's App Links filter claims the pages the app
  routes on both hosts (`AppLinksTest`); the iOS app declares no associated domains yet, so a site link
  tapped elsewhere opens in Safari.
- **HTTP**: every request goes through one setup (Android `AppHttp.client`, iOS `AppHTTP`) — User-Agent
  `Resonance/<version> (<OS>; build <n>)`, 30 s read/request timeout (15 s connect on Android); the
  illustration stream keeps 150 s. Android API calls run through `blocking`, which cancels the OkHttp
  call when its coroutine is cancelled: a new direct OkHttp call uses `blocking` and `apiClient`. The
  server tells the store builds before letters (2.0.0, build ≤ 6 on iOS / ≤ 7 on Android) by that
  User-Agent (`src/lib/api/v1/clientBuild.ts`): keep its shape, and never number a 2.0.0 build that low
  again (another version may start its build numbers over).
- **Sign-out / account switch** stops the listeners, then terminates Firestore and clears its local data
  (through `FirebaseBootstrap.db` / `AppFirebase.db` — never keep `Firestore.firestore()` around) before the
  next account's listeners start, and clears delivered notifications, the badge, the push memo and the
  profile mark. Android backup / device transfer keeps only `settings.xml`.
- **Push**: the registration (with the device's IANA time zone) is sent again only when the uid, token,
  language, app version or time zone changes, or after 24 h, never twice at once. Notification permission is asked after the first note, message or
  published card (`PushCenter.reachedOut()`): before that nobody can reach the account — or when a
  Settings → Notifications switch is turned on while notifications can't show. The iOS
  installation id is tied to the phone (`identifierForVendor`), so a restored backup gets its own.
- **Live lists** use `LiveListeners`: a failed listener re-attaches on the next foreground or a retry
  button; only permission-denied / not-found means "gone". With nothing loaded yet, a screen shows a retry.
  They all ride Firestore's one watch stream. iOS's SDK restarts it on every return to the foreground;
  Android's only when the network already reads as usable as the activity starts, so a return that beats
  Android lifting the app's background block would wait out the SDK's retry backoff (up to 90 s: the
  thread, the Messages list, the badges and the bell all stale). Android therefore restarts Firestore's
  streams itself when the app is back after 20 s or more away (`ForegroundReconnect` →
  `AppFirebase.reconnect()`: disable + enable network — listeners resume from their tokens, unsent writes stay queued).
- **The writer** reports a change only when it wrote something (iOS `WriteLauncher.Change`, Android
  `Session.CardChange` / `takeWriterChange`), naming the card and the card it answers. A card page reads
  again only for a change that `concerns` it — its card, or a resonance to it; a change naming no card (a
  block) concerns every page. The thought map is kept by the session per account: a visit within 15
  minutes shows what it read at once, re-reading only the card the writer changed.
- **Story links** (`StoryLink`): relative links and links on the site's host — the origin's, or the one it
  had before (`StoryLink.formerHosts` / `FORMER_HOSTS`; the exact name only, never a look-alike) — open in
  the app, other http(s) links in the in-app browser, `mailto:` as written; any other scheme is plain text.
- **App Check** (watched, not enforced): iOS release builds attest with App Attest (the
  `appattest-environment` entitlement), Android release builds with Play Integrity (src/release);
  debug builds use the debug provider (src/debug on Android) — its token is in Xcode's console /
  Logcat, to register in the Firebase console — and emulator builds none. API calls carry the token
  at hand (`AppCheckHeader`, kept current from the SDK's token listener; Android adds it to
  `/api/` requests only, never the pictures') and never wait for one.
- **Unknown enum values** in an API answer read as the nearest known one (Android `enumUnknownDefaultCase`,
  iOS `OpenEnumsMiddleware`, whose table a test checks against every response enum in openapi.json).

## Generated from the web

```bash
npm run apps:generate   # tokens, string accessors, icons, openapi.json, editor island
```

| Output | From | Script |
| --- | --- | --- |
| `DesignSystem/.../Generated/Tokens.swift` | `src/styles/tokens.css` (with a story's type: `--story-*` → `Tokens.story*`, the numbers the readers take), the palette's colours, strokes | `scripts/native/tokens.ts` |
| `DesignSystem/.../Generated/PaletteTables.swift`, `Assets.xcassets` LaunchBackground / LaunchMark | `src/lib/design/palette.ts`: every colour of every theme in light and dark, the hue-made roles (`HUE_INKS`), the launch screen's paper and mark in both appearances | `scripts/native/palette-swift.ts` (run by `tokens.ts`) |
| `ResonanceKit/.../Localization/L10n.swift` | `src/messages/*.json` (bundled as-is, read at runtime) | `scripts/apps/l10n.ts` |
| `DesignSystem/.../Generated/Icons.swift` | the hand-drawn icons in `src/components/atoms/Icon` | `scripts/apps/icons.ts` |
| `Resonance/Resources/{en,zh-Hant}.lproj/InfoPlist.strings` | the purpose strings the system shows itself (`share.image.photoAccess` for the photo prompt); project.yml keeps the English one, checked against the catalog | `scripts/apps/l10n.ts` |
| the same three for Android (`core/design/.../generated/Tokens.kt`, `Icons.kt`, `core/kit/.../l10n/L10n.kt`) | as above | as above |
| the Swift API client (at build time) | `openapi/v1/openapi.json` | swift-openapi-generator |
| the Kotlin API client (at build time) | `openapi/v1/openapi.json` | openapi-generator (`jvm-okhttp4`) |
| `apps/shared/fonts/*.ttf` | Noto TC, Playfair, DM Sans, 陳宇落雁 | `scripts/native/subset-fonts.py` (rarely) |
| `DesignSystem/.../Resources/Flags/flag-*.png`, `core/design/.../drawable-nodpi/flag_*.png` | `public/flags/*.svg` (the art the web's SquareFlag crops) | `scripts/apps/flags.ts` (by hand when a flag is added; not in `apps:generate`, not checked by CI) |

Both apps also bundle the story editor island, `native/editor/dist/editor.html`
(the writing screen's story field), which sets a story with the web's own
`src/styles/story.css` under the web's tokens (`scripts/native/islandRoot.ts`).
For the two-step writer (writer.spec, the apps' phase 2) it also takes
`?layout=canvas` (no frame or padding of its own), `?locale=` (the type an
empty story starts in) and `setTitle` / `setScript` over the bridge, and posts
`script` (how the story is set, for the native title field) and `caret` (the
caret's line, to keep above a keyboard bar) — all additive: a host that passes
none of it gets the island as before (src/lib/markdown/editorIsland.test.ts).
It is built, not committed: run
`npm run native:editor` (or `apps:generate`) before the first app build. An
Android build without it installs and runs, but the writer's story field says
"Webpage not available", so the builds check: the iOS build and Android release
builds (APK, bundle, lint) stop with a message naming the command, and an
Android debug build prints a warning.

CI fails when the committed tokens, string accessors or icons are stale. The
apps draw only the web's icons (`OrganicIcon`); an icon the web lacks is added
to the web's registry first, so both stay one set.

## iOS

Needs Xcode 27 and XcodeGen.

```bash
cd apps/ios && xcodegen generate
xcodebuild -project Resonance.xcodeproj -scheme Resonance \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' -derivedDataPath build \
  -skipPackagePluginValidation -skipMacroValidation build
xcrun simctl install booted build/Build/Products/Debug-iphonesimulator/Resonance.app
xcrun simctl launch booted com.resonance.stories
```

Tests: `cd Packages/ResonanceKit && swift test` (API client, localization,
story format — on the Mac, in seconds) and `xcodebuild … test` (app).

Dark mode and themes: every `Tokens.<colour>` is dynamic — a UIColor provider
(`Palette` in DesignSystem `Color/Palette.swift`) that looks the token up for
the trait collection it is drawn in, its `userInterfaceStyle` and `AccentTrait`
(a `UITraitDefinition`, bridged to SwiftUI's `\.accent`); `Tokens.UI.<colour>`
is the same colour for UIKit. Settings → 外觀 (`AppearanceSettings`) keeps the
choice in UserDefaults (`appearance.scheme`: system | light | dark,
`appearance.accent`: terracotta | sage | lavender | yellow) and
`AppearanceStore` lays it on the window scene's trait overrides, so sheets,
alerts, the keyboard, the photo picker and the in-app browser follow, live,
with no screen rebuilt. A colour the palette has no token for is a `Palette.hue`
(a role of `HUE_INKS` at a hue the data carries), a `Palette.mix` of two tokens,
or `Palette.schemed(light:dark:)`; a colour that must not follow (a picture
that leaves the device, what stands on a photo) is `Palette.shared` or
`Tokens.photoInk` / `photoShade` / `viewerGround`. A CALayer's CGColor or a view drawn by hand takes its ink
again in `registerForTraitChanges`. `src/lib/design/colourLiterals.ios.test.ts`
fails on a colour literal outside its short list. The story editor island
wears `data-scheme` / `data-accent` from its web view's traits. Screen checks:
`-appearance.scheme dark -appearance.accent sage` (any launch), and
`-appearanceCycle <seconds>` steps through dark terracotta, dark sage, light
lavender and light terracotta on whatever screen is open (Debug).
Launch arguments for checking screens (Debug): `-route /card/<slug>` or
`-route /u/<handle>` opens that page; the seed has `rich-story`, a card with
every kind of content. `-writeTitle "…" -writeStory "…"` start a new card with
that text (the simulator can't type into the fields from outside), and
`-writeCover <url>` with that picture as its cover; `-threadDraft "…"` fills a
conversation's composer (`-route /messages/<handle>` opens one), `-threadReply YES`
answers their newest message (a reply riding, the keyboard up) and `-threadPicture <s>`
opens the newest picture and closes it that many seconds later (round 11 §1's check).
`-route /settings` (or `/settings/<section>`: profile, account, privacy, notifications,
language, appearance, terms, delete) opens Settings or one of its pages.
`-openWriter YES` opens the writer on a new card at launch and `-writeCard <id>`
on one of yours (a draft, a published card, one in the trash); `-writeStep publish`
then opens its second step, `-writeFocus YES` puts the caret in the story (the
keyboard and its format bar up), and `-writeAppend "…" -writeAppendAfter <s>`
types onto the story a while later (a save to watch, e.g. refused once the card
is moved to the trash elsewhere). `-writePaste "…"` (with `-writePasteHTML "…"`
beside it, as a rich-text source's clipboard holds HTML) pastes into the story
once it is up, through the page's own paste event — the island's paste rule
checked without the Mac's clipboard, which the simulator's follows.
`-cardBoxShelf <key>` opens the card box on that shelf (`trash` for the trash;
`private` and `draft` open 私人卡).
`-route /me/thought-map` opens the thought map (the seed gives alice one:
a region, three cards, a labelled arrow).
`-pushToken <any>` registers a stand-in push token under the signed-in
account (`devices/*` in the emulator), and `xcrun simctl push booted
com.resonance.stories <file.apns>` with top-level `route` and `notificationId`
keys checks where tapping a push leads.

`-feedPicksDelay <seconds>` holds back the recommended feed, to see late picks
go on top of the latest cards; `-feedPicks <id,id,…>` stands those cards in for
the picks (the emulator's recommender has none).

iPad: the app runs on iPhone (portrait only) and iPad (every orientation,
resizable windows, one scene). Every layout decision is made from the window's
width as `MainTabView` measures it (`WindowLayout` in the `window` environment
value, `LayoutClass` in DesignSystem `Components/Layout.swift`: compact < 600 ≤
medium < 900 ≤ expanded, the writer split from 1200) — never `UIScreen` or the
device. Medium and up: a full-width header with the four tabs centred in it
(`OrganicTopTabs`, the pen at its end) instead of the tab bar — a pushed page's bar keeps that
header's height, its row (←, title, actions) 6 under the row's middle (round 11 §6,
`HeaderChrome.backRowDrop`), and a title's two lines never grow it; expanded: the
bordered feed grid, two-pane Messages (`MessagesPanes`: the conversation at the
foot of the Messages stack is the detail pane), the card page's contents rail
(for a story with a table of contents only; the byline is under the title at every
width), and the card's share · ⋯ at the end of that byline instead of in the bar,
which keeps them on a compact window (`CardPageLayout.actionsInByline`) — until
the byline scrolls under the bar, which then takes them, as a phone's bar names
the author past the same point.
The simulator can't be turned or split from the command line:
`-debugWindow 1376x1032` (any `WxH`) lays the app out at that size, scaled into
the screen, for layout checks only (the safe areas stay the screen's).

The launch screen (`UILaunchScreen`: the paper and `LaunchMark`, which
`LaunchCover.swift` draws again and dissolves into the first screen) is a
picture the system takes once and keeps, and its renderer keeps the app's asset
catalog as it first read it. After changing either, reboot the simulator and
delete the app's `Library/SplashBoard` (`xcrun simctl get_app_container booted
com.resonance.stories data`) before judging it: until then the old picture
shows, even across reinstalls.

Reading: a card's page is one `GET /api/v1/cards/{key}?include=resonances,related,links,embeds`
(story embeds come from `embeds`, matched by slug or id with `CardKey.of(href:)`; an unmatched link
stays a plain link), a person's page one `GET /api/v1/users/{handle}?include=cards,links&limit=12`, and
a conversation's shared cards one `GET /api/v1/cards?keys=` (`CardSummaries`). A card's ⋯ visibility
change goes through `PATCH /api/v1/cards/{id}`; its 刪除 moves the card to the trash
(`POST …/trash`, `TrashDecision`: no question but the plain one for a public, named resonance whose
original is named), with the shell's 「已移到垃圾桶 · 復原」 toast in the card box and the trash banner
(`TrashedCardBanner`) on the card's own page, which stays. The card box's last shelf, 垃圾桶 (no line
under its cards, round 11 §7), restores (`…/restore`, its toast saying who reads the card now — `RestoredAs`,
from the answer's card: 已還原為私人卡 · 公開卡片 · 匿名公開卡片 · 僅連結的人看得到), deletes for good (`DELETE …?onlyIfTrashed=true`, asked in red) and empties
(`DELETE /me/trash`, paged by `WritingAPI.emptyTrash` through a 70 s client, `AppHTTP.slowSession`:
a page of deletes can outlast the app's 30 s; after a failure the dialog closes once the trash,
read again, is empty); a trashed card is left off the thought map
(its node stays stored), the trash shelf opens every card on its page (its trash banner; the server answers
its author for a trashed card never published too), and the writer opens one on a 還原並繼續寫 notice. A tapped push opens its thread by
`data.fromUserId`. The latest feed and a person's cards page by `nextPageToken` (`FeedPage.next`;
a page without one falls back to `nextCursor`). The card box asks for my own shelves (published,
private, drafts) in one `GET /api/v1/me/cardbox?shelves=`, the others' when shown; whichever answer
brings the published shelf is what's kept. The 私人卡 shelf (round 9 §1; the `draft` key) holds the cards
never published and the published cards kept private together, the latest changed first
(`CardBoxScreen.draftShelf`, by `editedAt`, else `publishedAt`); every card in the box opens its page, a
私人卡 too — whose meta line ends with 🔒 私人卡 and whose bar (a phone's; a tablet's byline) has a pen to the
writer where share would be (`CardScreen.isPrivateCard`) — and a card's ⋯ offers 轉為私人卡 only on a card
readers have (`CardActionsMenu.rows(readersSee:answering:editShown:)`). On a 私人卡's own page, where that pen
is 編輯, the ⋯ leads with 公開發表 instead (round 12 §3, `editShown`): `WriteLauncher.publishPublicly` opens
the writer at its publish step (`Request.publishPublicly` → `WriteModel.openPublishing`) with 公開 chosen —
匿名公開 for a card already marked anonymous — as if picked there (it autosaves; a published 私人卡's choice
waits in its pending edit); the card box's ⋯, with no pen beside it, keeps 編輯. The thought map reads its cards under the rules
— the newest 40 published, and the 40 never-published 私人卡 most recently edited in a query of their own
(`ThoughtMapService.newestDrafts`), wears the lock on every 私人卡's node and tray row, and opens every card of
mine in the writer, a 私人卡 as a shared one (round 10 §1; below the split the writer — iOS
`ThoughtMapScreen.opensWriter` —, at it the pane), someone else's on its page — and asks
`GET /api/v1/cards?keys=` for the ones they refuse (someone else's anonymous original, without its
author). Reports go through the server (`POST /api/v1/reports`, `…/cards/{key}/report`). A scheduled
deletion comes with the account (`Me.deletion`, the kept one on a cold start): no separate request,
and a cancel clears it from the kept account too. The home feed asks for the latest and the recommended cards together.
Picks that arrive within `FeedModel.defaultPatience` (800 ms) lead the feed;
later ones go on top of the latest cards at once (`FeedModel.picksOnTop`), leaving out
those the latest cards already show: the cards are the scroll's targets (CardColumns `ids`),
so a reader further down keeps the card they are reading where it is, and one at the top
(TabScreen's `head`) sees the first pick there; a grid keeps them in rows of their
own above, the latest cards keeping their columns, colours and shapes
(`CardPalette.palettes(_:over:)`). The reader further down hears of them from the
shell's toast, 今天的推薦來了 · 往上看 (`FeedModel.picksLanded`, `PicksNotice`): the
pill takes the feed to its top (TabScreen's `toTopRequests`), reaching the top by hand
takes it down, and picks that land while the feed is out of sight are told of once it is
back. `-feedPicksDelay 15 -feedPicks …` and a scroll down shows it. Cards seen in lists stay in
`SessionStore.cardPreviews` (memory only, per account, emptied on sign-out
and on any block change) as the card page's placeholder — the page always
refetches. `Route.thread(handle:uid:note:)` takes the uid whenever the caller
knows it; threads listen by pair id, and PERMISSION_DENIED means "no
conversation yet".

The story reader sets a card's title and story in the reading design's type, by
the story's script (`CardModel.storyType`, ScriptRule) and the window: every
number comes from DesignSystem's `StoryTypography` (the generated
`Tokens.story*`) — `StoryTitle` (balanced, a CJK title's clauses kept whole),
`ProseStyle` (each block's face, size, tracking, alignment, colour), its
`rhythm()` for `ProseMetrics`' collapsing margins, and `CardPageLayout` (the
680 column; on an expanded window a story with a table of contents has its rail
`Tokens.storyRailGap` past it, one without is centred). A GFM table is
`StoryBlock.table` (head, rows, column alignments), drawn by `StoryTableView`:
rules rather than boxes — calm pen lines (`StoryTable.rulePoints`: the header's ±1.0 a little past both
ends, the rows' ±0.7 a little short), seeded by the table and the row —, every cell at its start edge
whatever the alignments say (round 9 §6), the body's face at 0.94 em on 1.6 lines, each column
4–18 em, wider than the column it scrolls sideways under a fading edge; its
words count toward the excerpt and read time (`StoryProse`). Justified Chinese is spread by
`StoryJustification` (between characters, as a browser does — TextKit's own
`.justified` widens only spaces); TextKit keeps a Chinese word whole where a
browser breaks between any two characters, so a line can end a character
earlier than the web's. A story's words grow with the system's text size up
to 2× (`TextScale.readingFactor`); the byline and the rest stay under 1.25×.

The card page's head is measured from the bar's pen line (round 9 §2, `StoryTypography.headGap`,
`PenLineGap`): the title's box 48 / 64 under it, a cover's top 56 / 72; a person's page and Me put the
avatar 40 / 56 under it (`peopleHeadGap()`). The story's end row is the response bar alone (none on the
author's own card), spread across a phone; its segments give way in steps (`SegmentSpec.collapsesAt`: the
bookmark, then the note) and the row never runs wider than offered. 與此文共振 draws full story cards, three
and then 查看全部.

Share: a card's bar on a phone (its byline on a tablet) shows the share glyph only for a published, public card not in the trash
(`CardShareGate`); the glyph draws
its own loader while the picture is made. It opens the system sheet with the link
(`LinkSource`, with its `LPLinkMetadata`) and the 1080 × 1920 picture drawn
on the phone (`CardImageSource`; DesignSystem's `ShareCardView` /
`ShareCardRenderer`, pure SwiftUI through `ImageRenderer`): Save Image takes the
picture, everyone else the link — Instagram's share extension too, whose own
choice (story, post, message) is never told to the app, and a message must carry
the link. With `AppConfig.metaAppID` and an Instagram that opens
`instagram-stories://`, the sheet adds Instagram 限時動態
(`InstagramStoriesActivity`: sticker and backdrop on the pasteboard for five
minutes, the link copied beside them with the toast
`share.image.storiesLinkCopied`, Instagram opened 1.2 s later so the toast is
read). Its glyph is the asset `InstagramGlyph`, native/brand/instagram.svg as it
is (a template image, vector kept; `CardShareTests` pins the bytes). The owner of
an anonymous card confirms first. A profile
shares its link through `ShareLink`. `-debugShare YES` opens a card's share
at launch, to check the sheet on screen.

Caches: `APICache` (ResonanceKit, Caches/APICache/<sha256(uid)>) keeps the
account's latest feed page, today's picks (UTC day only), Me, the published
shelf and the block list for an instant cold start — filtered by the block list,
removed on sign-out, account switch or scheduled deletion. v1 GETs go through
`APIHTTPCache` (a URLCache and URLSession per account; never `URLSession.shared`
for v1 — build clients with `ResonanceClient.make(_:cache:)`), which honours the
server's `private` + ETag, opts in with `X-Resonance-Cache: 1`, and sends
`no-cache` after the viewer's writes (`SessionStore.noteOwnWrite()` for writes
that go straight to Firestore). Back in the foreground after 15 minutes or on a
new UTC day, `SessionStore.awayRefreshes` refreshes saved screens. The editor
island is served from `resonance-editor://editor/editor.html` by
`EditorPageHandler` with a hash-based CSP: if `scripts/native/build-editor.mjs`
starts loading anything new, update `EditorPage`. A note typed and not sent
(`NoteDrafts`, Application Support/NoteDrafts/<sha256(uid)>.json, out of backups)
is kept per card as it is typed and however the composer closes, and the composer
opens from it again; it goes once the note is sent (201) or handed to a resonance,
when emptied, and on sign-out, account switch or scheduled deletion — at most 50,
none older than 30 days.

Writing (writer.spec, `WriteScreen`): two steps on one page. Writing is the bare
title (the story's title type, by the script the island posts) over the island in
its canvas layout (`?layout=canvas&locale=`: an empty story in the interface
language's type), whose formatting is `StoryFormatBar`, docked on the keyboard
while the story has the focus; the page keeps the island's caret line (`caret`)
above it (`CaretFollow`), and the island's own scroll view is pinned at its top
(WebKit would otherwise slide the story out of its frame to show the caret).
The bar is back · a short title (編輯私人卡 for a 私人卡) with the save state as
its second line (round 11 §5, `BarTitles` through `OrganicInlineBar.subtitle`: 儲存中⋯
once a write has gone 400 ms unanswered, 已儲存, 修改已暫存 for a live card's revision,
未儲存 in the error ink, at 12; its line kept while empty, the title alone on the
row's line meanwhile, gliding up as it fills; a pointer reads the last write's time) … ✓
(`write.finish`, a ghost icon; at the split it floats at the pane's top end with
the state beside it). The title's line box stands the reading head under the bar's
pen line, as a card page's title does, and 32 over the story (round 11 §4); the
publish step's sections are `--publish-section-gap` apart. ✓ asks for a title, waits a moment for a new draft's first
save, and opens `PublishStep` in place: the mirror (asked once per title and
story, never for a revision), the card as a list shows it — its cover changed on
the picture itself, one 更換封面 chip whose menu offers another, a drawn one or
none (`PublishStep.coverItems`); a picture that failed says so inside it —, tags,
卡片類型 as one choice of 公開 · 匿名公開 · 私人卡 (`WriteModel.Audience`: both fields
in one change; 私人卡 keeps a live card's byline), the resonance line, then one
button (`WriteModel.verbTitle` / `submit()`): 發布 · 匿名發布 for a draft shared or
a published 私人卡 made public (the latter through edits/apply), 儲存 for a 私人卡
(written, never published), 儲存修改 for a live card, 轉為私人卡 for a live card made
one — 捨棄修改 beside it only for a live card with a revision — and then the card's page
in the writer's place (round 9 §1: a 私人卡's too; one kept only on the device, offline,
leaves as before). A card begun and emptied again is deleted as the writer leaves
(`WriteModel.dropIfEmpty`). The cover's controls wear the preview's family — a card's
cover hue's, else its id's (`CardPalette.family(id:)`) — and a menu is presented with the
trigger's frame read at the tap (`MenuAnchor`, `MenuPresentation`), never from `.zero`. Its choices are the draft's own values and autosave; back from it is
back to writing (the bar's back, the edge swipe), the map's Leave at the split
leaves from either step. A save the rules refuse, or a publish answered 409, is
read again: a card moved to the trash meanwhile says so where the save line was,
with 還原, keeping what is typed. A story picture that failed is the shell's toast
(`write.editor.imageUploadError`, `imageUnsupported`); back from the photo
picker the story has its caret, selection, keyboard and format bar again
(`StoryEditorBridge.refocus()`).

The composer floats over the thread (round 9 §4, round 10 §3; `ComposerCapsule`, `ComposerRow`,
`ComposerBacking` in DesignSystem): one capsule — ＋, the text, Send as its end segment, tonal at rest and
solid with something to send — 48 for a line at any text size (`ComposerText`: the padding from the line it
draws), growing to five lines, its pen the field's border, darker (`Tokens.fieldBorderHover`) while it is
written in, never a halo. What rides along is a row each in the reply's style, no frame — the reply (its
wavy rule), the note answered or the card (a glyph on a tonal tile, a card's cover when it has one), the
picture (its 40 × 40) — label · detail · ✕ at the end (`ComposerRide` orders them); the letter's line is
the thread's last item, a notice in the composer's place a framed slip. Behind it all the foot's paper
runs the pane's whole width down to the screen's foot (through the home indicator, under the keyboard),
its top 12 a fade (round 11 §3): over the capsule's top 12, or from 6 above the topmost riding row. It is the
thread's `.safeAreaInset(edge: .bottom)`; the list runs under it to the screen's foot and, drawn upside
down, takes all it covers (the fade too) as its top margin (`ThreadFoot.room`, + 12), which the pill and
已複製 keep too. A tap on the thread or on the foot's solid paper puts the keyboard away (`KeyboardTapAway`:
a UIKit tap on the list that waits for a message's own hold and taps), a drag down takes it with the
finger; the list is held at its own edge in UIKit (`SidewaysLock`) — setting its `ScrollPosition` for
that froze the app after a picture was sent (round 10 §5). Opening a picture puts the keyboard away under
it (UIKit gives the field back on the way out): the thread keeps its foot meanwhile (`KeyboardHold`), and
the viewer keeps the status bar (hidden, it moved an iPad's page by 24), so closing it leaves the thread
exactly where it was (round 11 §1).

Pictures in chat: the composer's ＋ opens 圖片 · 卡片 (`AttachMenuOverlay`, the
screen's own layer, so the keyboard stays up). 圖片 is the system's `PhotosPicker`
(one picture, `.current` encoding; no library access is asked for), readied off
the main thread by `ChatPictures.prepare` — a JPEG at most 2048 px on its longest
side, upright; a GIF up to 4 MB goes as it is — and held above the field
(`ThreadModel.pendingPicture`: picking a card drops it, and the other way round), in a row over the composer.
Sending draws it at once from the device (`ChatImageStore.keep`, under the
message's client id) while `ChatOutboxes` uploads it (`POST /api/v1/chat-images`
with that client id, once per message, however often it is retried) and then
sends the message naming it. Pictures are read only through
`MessagingAPI.chatImage`, the account's HTTP stack with its token — never a
plain image loader: the thread's size for a bubble (`MessagePictureSize`: as
wide as the bubble, at most 320 tall, its shape held between 1:2 and 2:1) and
the full one in `ChatPictureViewer` (pinch or double-tap to zoom; a pull down or
its ✕ closes it — a cream glyph on an always-shown wobbly disc of the viewer's ink,
`Tokens.viewerGround` at 50 %, 72 % pressed, 40 in its 44 tap area 16 inside the safe
area: round 12 §1–2's `ViewerClose`, so it reads on a light picture that fills the screen). `FreshnessMiddleware` never asks for one again (its bytes
never change); `ChatImageStore` keeps them decoded, per account. One that
couldn't be read keeps its fill with the picture glyph, and a tap asks again.
A reply to a picture quotes 一張圖片 (`ReplyQuote.summary`), and the Messages
list says 傳送了一張圖片 for one sent without words.

Round 17 (2026-10-27), iOS: every menu is one sheet (`OrganicMenuPanel`, DesignSystem `OrganicMenu.swift`) — the ⋯
dropped from its trigger (no scrim), the composer's ＋ and a held message's actions alike: borderless paper
(`MenuColors.paper`, raised at night) under the grain laid past the wobble (`MenuSheetMetrics.grainOverflow`), no pen and
no rules, a shadow that follows the wobble (`SheetShadow`), rows 44 with the glyph 17 and the words 12 apart and 20 in
from either side, 168 to 300 wide (a held message's list 216 to 280; `MenuSheetMetrics`), the ink spreading from the finger inside its row's band, and a
held message's time at the trailing end right under its rows. Holding a message dims and softens the thread's body alone
(the scrim is the thread's, under its header and short of the rule beside the list; `PressPlacement` keeps the
reactions and the list 12 inside it), and the five stickers float on it with no paper. A chosen tag is the 「AI 建議」
segment's face (`TagField.pillFill` / `pillInk`), and Return in the tag field is a line break taken out at once
(`TagInput.returned`), so the field keeps the keyboard and nothing moves. 連結 is the format bar's last tool, after its
own rule, and opens `StoryLinkModal` in the app's modal. The phone's tab bar stands 18 into the home indicator's room
(`OrganicTabBar.lowered(bottomInset:)`: the row's middle 42 over the screen's foot) with its outline glyphs at INK_STRONG;
the writer's bar grows round its title and save line at a large text size (`BarTitles.scaledSubtitleLine`); and at the
split the map's Leave is the workspace's one back — from the publish step back to writing, named 繼續寫 (`WritePane.publishing`).

The app hosts its unit tests; run them with `xcodebuild test … -destination
'id=<udid>'`. Under XCTest the app points at a local stack that isn't there
(no backend, not even a simulator's saved account on production) unless the
simulator's defaults say `emulator` (with `emulatorAuthPort`/…), e.g.
`xcrun simctl spawn <udid> defaults write com.resonance.stories emulator -bool YES`.

Push: the server pushes every bell row through FCM (`src/lib/push`); the app
registers its token with `PUT /api/v1/me/devices/{installationId}` after
sign-in (see "Both apps" for when) and unregisters on sign-out. Real delivery needs the Apple team: an
APNs auth key uploaded to Firebase (Project settings → Cloud Messaging), and
`aps-environment` switched to `production` for release builds. The registration
also names the phone's time zone (`TimeZone.current.identifier`; `PushAPI`
sends none rather than one over the contract's 64 characters, as Android does),
and a new one sends it again (`PushRegistration`).

Settings → 通知 holds the two opt-in pushes ("a card for tonight" and new
cards from connections; `GET/PATCH /api/v1/me/notifications` through
`NotificationSettingsAPI`, both off until turned on). `NotificationSettingsModel`
flips a switch at once and puts it back with `saveError` when the PATCH fails.
Turning one on asks the system first (`PushCenter.askIfUndetermined`, the same
question `reachedOut()` asks): never asked, the system's question; a no, or
notifications already off in Settings, leaves the switch off and shows
`permissionDenied` with a button to `UIApplication.openNotificationSettingsURLString`
(the simulator opens Settings at its root; the app's page is under App →
Resonance → 通知). Back in the foreground the section looks again. Both pushes
are plain notifications (`threadId: picks`) whose `route` is the card's page, so
a tap opens the card like any other push; `xcrun simctl push booted
com.resonance.stories <file.apns>` with `type: pick`, `cardId` and `route:
/card/<slug>` at the top level checks it. `simctl privacy` has no notifications
service: reinstalling the app makes the permission undetermined again.

### Against the local backend

Debug builds talk to production (`https://resonance.channel`) unless launched
with `-emulator YES`, which points Firebase at the emulators (project
`demo-resonance`) and the API at `http://127.0.0.1:3100`:

```bash
npm run emulators                       # Auth + Firestore emulators
npx tsx scripts/seed-emulator.ts        # seeded accounts
npx tsx scripts/seed-store-demo.ts      # the store screenshot world (sign in as demo@resonance.test, same password); seed-emulator.ts restores the test world
npx tsx scripts/seed-store-demo.ts --lang=en   # the same world in English (Mia, thread /messages/June; default is zh-TW)
npm run dev:emulator -- --port 3100     # the web + API on the emulators
xcrun simctl launch booted com.resonance.stories -emulator YES \
  -email alice@resonance.test -password <SEED_PASSWORD from scripts/seed-emulator.ts>
```

`-email`/`-password` sign that seeded account in on launch (emulator builds
only); the sign-in screen also shows an email form in emulator builds.

## Android

Needs JDK 21 and the Android SDK (compileSdk 37); the Gradle wrapper fetches
the rest.

```bash
cd apps/android
./gradlew :app:assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
./gradlew :core:kit:test        # API clients, localization, story format, cover hue
./gradlew :app:testDebugUnitTest  # the app's JVM tests: the origin, routes, App Links, pen names, settings sections, push routing
./gradlew :core:design:testDebugUnitTest  # the design language: geometry against the web's fixtures, and components composed under Robolectric (switch rows, dialogs)
```

Debug launch extras mirror iOS's arguments: `--ez emulator true` points
Firebase at the emulators (`10.0.2.2`) and the API at `http://10.0.2.2:3100`,
`--es email … --es password …` signs a seeded account in,
`--es route /card/<slug>` (or `/u/<handle>`) opens that page,
`--es writeTitle … --es writeStory …` start a new card with that text, and
`--es threadDraft …` fills a conversation's composer (`--es route /messages/<handle>` opens one),
`--es pushTitle … --es pushBody … --es pushRoute /card/<slug> --es pushType pick` (or `new_card` with
`--es pushCardId …`) posts the notification such a push shows while the app is open,
`--es route /me/thought-map` opens the thought map (the seed gives alice one: a region, three cards, a
labelled arrow; `npx tsx scripts/seed-thought-map-bench.ts` swaps in a 100-card one, `seed-emulator.ts` puts hers back),
`--ez firestoreLog true` turns on Firestore's own debug log (Logcat tag `Firestore`: its streams, the
foreground hook, retries), and `--es pushToken <any>` registers a stand-in push token under the signed-in account
(`devices/*` in the emulator; it lasts until the process ends, and emulator builds never touch FCM):

```bash
adb shell am start -n com.resonance.stories/com.resonance.app.MainActivity \
  --ez emulator true --es email alice@resonance.test \
  --es password <SEED_PASSWORD from scripts/seed-emulator.ts> --es route /card/rich-story
```

A cover or story picture stored against the emulators is served by the dev server at
`http://localhost:<dev port>/api/emulator-storage/…` — on the device, the device itself. Reverse that port once
per boot (`adb -s <serial> reverse tcp:3100 tcp:3100`, or the port the dev server runs on) and debug builds reach
it: their network security config (`app/src/debug/res/xml/network_security_config.xml`, in place of main's) lets
plain HTTP go to `localhost` and `127.0.0.1` as well as `10.0.2.2`. Chat pictures need nothing: they go through the API.

A tapped push starts the app with its data as extras, so `--es route` with `--es notificationId` fakes a
tap (`--es route "''"` for a push with no page of its own: the notifications tab); `--es pushTitle …`
posts the notification a push that arrives while the app is open shows:

```bash
adb shell am start -n com.resonance.stories/com.resonance.app.MainActivity \
  --es route /messages/alice --es notificationId x
```

Reading (tests in `:core:kit`: FeedLoader, CardPageLoader, CardCache): the feed shows the latest cards
first; picks that answer later go on top of them at once (`FeedLoader.State.picksAbove`), less any the
latest already show — the latest keep their places, rows and colours (`storyCards`' `leading` run), a
reader at the very top sees the first pick and one scrolled into the feed stays put, told by the shell's
toast 今天的推薦來了 · 往上看 (`FeedHead`; a tap goes to the top, reaching it by hand takes it down).
`--ei feedPicksDelay <s>` holds the picks back and `--es feedPicks <id,…>` stands those cards in for
them (the emulator's recommender has none), as iOS's `-feedPicksDelay` / `-feedPicks`. A card page is one
`GET /api/v1/cards/{key}?include=resonances,related,links,embeds` (story embeds from `embeds`, matched
by slug or id; an unmatched link stays plain), a person's page one `GET /users/{handle}?include=cards,links&limit=12`,
and a thread's shared cards one `GET /cards?keys=` per batch of new ids. Lists pass their FeedCard as
`Route.Card(key, preview)` and remember it in `Session.cardCache` (per account; cleared on sign-in/out,
your own card changes and block changes) so the card page draws at once. The card ⋯ (visibility,
delete) goes through `PATCH`/`DELETE /api/v1/cards/{id}`. The feed and a person's cards page by
`nextPageToken` (`NextPage`; the millisecond `nextCursor` only from a server without the token). The card
box reads my own shelves (published, private, drafts) together, one `GET /me/cardbox?shelves=`, and the
other shelves one at a time, when shown. The thought map reads its cards under the rules and asks `GET /cards?keys=` for those
the rules refuse (someone else's anonymous card I resonated with, which comes without its author). Reports
— cards, people, conversations — go through the API (`SafetyApi`), which keeps the evidence. The scheduled
deletion comes with `/me` (`Me.deletion`, kept on disk with the profile): no second request at start.
`--es fromUserId <uid>` (and `--es pushFromUserId`
for the notification posted while the app is open) fake a push carrying its sender's uid; the thread
then opens by uid. `--es route /messages/<handle>` for the thread already on top leaves it
in place.

Navigation and caches: routes are @Serializable NavKeys and each tab's NavBackStack is saved
(rotation, restored processes); pages keep their saved state and their own ViewModels
(lifecycle-viewmodel-navigation3) while on their stack, re-reading only after a card or block change or
after 15 minutes. cacheDir/api is `ApiCache` (per account; cleared on sign-out, deletion or account switch;
the feed filtered by the block list); cacheDir/http is the OkHttp cache via `HttpCaching` (private
max-age/ETag honoured, opted in with `X-Resonance-Cache: 1`; no-cache after the viewer's writes or a block
change; evicted on sign-out). Coil shares the app's OkHttpClient and keeps only pictures on disk (`PicturesOnly`, as the
chat pictures do: a cover that answered an error once is asked for again); below Android 12 AVIF goes through the
app's libavif decoder (`--ez avifDecoder true` forces it on any version). The editor WebView loads only
the bundled island; external links open in the in-app browser.

Push: the server pushes every bell row through FCM (`src/lib/push`, on the "activity" channel); the app
asks for the notification permission after the first note, message or publish (API 33+), registers its
token with `PUT /api/v1/me/devices/{installationId}` (see "Both apps" for when) and unregisters on sign-out.
Settings → Notifications holds the two pushes a person turns on (both off until then; `GET/PATCH
/api/v1/me/notifications` through `NotificationSwitches`: a flip shows at once, is sent one at a time and
undone with `saveError` when it fails). Turning one on while notifications can't show asks for the
permission first (API 33+) and saves once it is given; refused — or with only the "picks" channel turned off
(`PushCenter.picksBlock`) — the switch stays off and `permissionDenied` offers the app's notification settings
(that channel's page, when only it is off). Those pushes — tonight's card (`type: pick`) and a connection's new
card (`type: new_card`) — come on the "picks" channel (`native.channelNewCards`), and a card route opens the
card; one that arrives while the app is open is drawn in the same channel and tag (`PushPlacement`). Real delivery needs a build against production (not `--ez emulator true`)
on a device with Google Play services.

Chat: a thread keeps the newest 50 messages live and pages older ones in (`MessageHistory`, `ThreadModel.loadOlder()`;
a search reads the whole conversation with `loadAll()`). Sending never holds the composer: `ThreadModel.send()` queues
the message in the conversation's `Outbox` (kept by the session in `ChatOutboxes`, so a send outlives the screen), which
sends in order, one at a time, each under its own client id (`POST /messages` with `clientId`, which the server makes the
document's id — a retry after a lost answer finds the message instead of writing a second) and `replyTo`. A failure that
will pass (offline, 5xx) stops the line; `retry(key)` sends the failed message after the ones before it. Links in a message
are found by `Linkify` (the server's `firstLink` rules, `src/lib/links/url.ts`) and opened only through `LinkOpener`: a
number instead of a name, a punycode host, a port or userinfo asks first, anything but http(s) opens nothing, and the page
is a Custom Tab. The build registers the `chat-push` capability, so the server sends chat messages as data-only pushes and
`PushCenter.showChatMessage` draws the conversation's notification itself (one `MessagingStyle` per pair id on the
"messages" channel, silent while that thread is resumed). Debug builds fake one:
`--es pushChatBody "…" --es pushChatConversation alice_bob --es pushChatId m1 --es pushFromUserId bob --es pushRoute /messages/bob`.

Pictures in chat (round 7): the composer's 「＋」 opens 圖片 (the system's photo picker) · 卡片; a picture is made ready
on the device (`ChatPictures.prepare`: upright, ≤ 2048, JPEG 0.85 or WebP with transparency, under 4 MB; a GIF that
fits as it is) and goes into the outbox with its message, drawn from the device under the message's client id —
the id the server keeps it by: `ChatOutboxes.deliver` sends it up (`ChatPicturesApi.upload`, POST /api/v1/chat-images)
before the message names it. They are read only with the account's token, through `ChatPicturesApi.client` and their
own Coil loader and folder (`cacheDir/chat-pictures`, emptied with the account; `PicturesOnly` keeps pictures and
never an error answer, which Coil's own strategy would serve for good). A picture heads its bubble edge to edge in
the place `PictureBox` gives it before it loads; a tap opens `PictureViewer` (pinch, double tap, swipe down).

A note (小紙條, `NoteComposer`) keeps its unsent words on the device per account and card (`NoteDrafts` in `:core:kit`,
`note-drafts.xml` via `NoteDraftPrefs`, outside the backup): written a moment after typing stops, as the app leaves the screen
and as the composer closes (a tap beside it, back, 取消), and opened on again for that card; cleared once the server answers
201, when the text is emptied, and with the account's other local data on sign-out. At most 50 are kept, none past 30 days.

The thread screen (`ThreadScreen`, `ThreadList`, `ThreadActions`, `ThreadSearch`, `ThreadComposer`) draws that model.
The bar is an `OrganicInlineBar` over the list (cream stops on the pen line, content scrolls up under it; half ink
until messages are under it). `ThreadRows` lays the messages out in runs — same sender, under 3 minutes apart, same
day, no label between — and `MessageBubbleShape` tucks the corners that face a neighbour (`CornerRadii`, an Android-only
option of `wobRect`); a day label leads a day, a time label a message 15 minutes after the one before it. A reply shows
its quote as a ghost bubble under a caption and opens a run; tapping the quote reads older pages until the original is
held (`ThreadModel.ensureLoaded`) and brings it to the middle with a pulse. A long-press lifts the message out of the
dimmed thread with an `OrganicMenuPanel` under it (Reply, Copy, the link under the finger, Retry/Delete for a failed
one, and the full time); a drag toward the middle replies. Search lists the matches over the thread
(`SearchResults`, the snippet cut by `SearchSnippet`); choosing one takes the thread to that message with the words
marked, and the bar steps through the matches. Words are drawn by `ChatText` (CSS line boxes with spans: links,
highlights), so a bubble keeps the web's metrics.

Toasts, story type and text size (the 2026-10-20 redesign's foundation): the shell has one toast
(`Toasts` in `core/design`, drawn once by `ToastHost` in `MainTabs` over every page and bar, under dialogs);
a page shows one with `LocalToasts.current.show(message, announce, action)` — 4 s, 8 s with an action, longer
when the accessibility timeout asks for it, held under a finger, a mouse or a keyboard's focus — and TalkBack
hears each through one polite live region. Its face is `OrganicPill` (`PillSize.Toast`; the thread's pill is
`PillSize.Small`). A story is set by its script (`StoryScripts` in `core/kit`, the twin of
`src/lib/text/script.ts`, pinned by `native/fixtures/story-script.json`) through `StoryType`, which reads the
generated `Tokens.Story*` in one place: a CJK story in `AppFonts.Family.HeadingCJK` / `BodyCJK` (Noto TC first,
then the Latin face per glyph), a Latin one in Playfair over DM Sans. A story's title and words sit inside
`ReadingTextScale` (the system's text size up to 2×); everything else stays under `CappedTextScale`'s 1.25.
The share image's numbers are `ShareCardRecipe` (`native/fixtures/share-card.json`), its words
`SharePassages.opening` (`share-passages.json`), and the trash's calls `WritingApi.trashCard` / `restoreCard` /
`deleteCard(onlyIfTrashed)` / `emptyTrash`, with `Trash`'s clock over `FeedCard.trashedAt` / `purgeAt`.

The card page reads in the story's type (reading-type §5–§8): `StoryMarkdown(blocks, type, lang, …)` and
`StoryTitle` take `StoryType.of(script, class)` and the story's language, set every block from the generated
`Tokens.Story*` (no prose number is written in Kotlin: `ProseMetrics` in `core/kit` collapses story.css's margins
from the `ProseSpacing` the type resolves), and sit inside `ReadingTextScale` — the cards a story embeds go back
under `CappedTextScale`. The head is cover → title → byline (avatar and pen name over 「6 分鐘 · 日期」, at every
width); share and the ⋯ end that byline under a tablet's header (`cardActionsSlot`) — the bar taking them while the
byline is scrolled under it — and sit in a phone's bar; the story's end is the response bar alone (round 9 §3).
`WindowLayout.cardPage(rail)` is §4's formula (the 680 measure, centred; on an expanded window with contents their
rail `Tokens.StoryRailGap` — 80 — past it; without, the column centred).
Sharing a card (share.spec, Owner revision; `ui/share`) is one glyph, shown only for a published, public card out
of the trash (`ShareLinks.canShare`), straight to the system sheet: `ShareIntents.cardChooser` carries the link
(an anonymous card's by its id) for every app, Instagram's targets too, and the app's own Instagram 限時動態
and 儲存圖片 actions — the only ways the picture leaves the app (ChooserActions on 34+, LabeledIntents on 29–33,
both reaching the unexported `ShareActionActivity`, both wearing the app's own drawables). The picture is drawn on the device — `ShareCardCanvas` / `ShareCardSticker` /
`ShareCardBackdrop` in `core/design`, recorded off screen by `ShareCardRenderer` into GraphicsLayers at
Density(3, fontScale 1) — and written to `cacheDir/share` (the `{applicationId}.share` FileProvider; emptied
before each share and on sign-out). Stories needs `AppConfig.metaAppId` and Instagram installed; the owner of an
anonymous card is asked first (`share.anonymousTitle`). A person's page shares its plain link.

The writer (writer.spec, Android): `WriteScreen` is two steps over one `WriteModel`. Writing is the bare title
(`StoryType`'s title style, by the script the island reports) and the island as the bare page (`StoryCanvas`:
`?layout=canvas&locale=`, its editable root's min-height set by the host so a tap under the words lands in the
story), with `StoryFormatBar` docked on the keyboard while the story has the focus and the page kept above it from
the island's `caret` message (`caretScroll`); ✓ sits in the bar (floating at the pane's top end at the split).
The publish step (`PublishStep` in WriteScreen.kt) is composed the first time it opens and stays, the writing step
kept composed — and drawn without a standing graphics layer, which would freeze the WebView's size — under it; its
choices are the draft's values (`setAudience` coerces an anonymous card for connections to public in one change):
卡片類型 is one choice of three (`WriteModel.choose`: 公開 · 匿名公開 · 草稿, which keeps a live card's anonymity),
and the one button and the step's title follow it and the card (`WriteModel.stepVerb`, `stepTitle`, `finish`). While its verb works the step only
holds its touches (`Modifier.holdWhile`) — no alpha layer, which is cut at its box and clipped the card's pen line.
`WriteModel` takes `DraftStore` (DraftService), `WriterCalls` (`WritingApi.writerCalls()`) and `StoryEditor` (the
bridge), so `WriterStepsTest` drives the steps with stand-ins; a write the rules refuse or a 409 'This card is in the
trash.' is read again (`DraftStore.isTrashed`) and turns into the trashed line with 還原. The trash's moves go
through `TrashCenter` (`LocalTrash`, one per account in `MainTabs` beside the toasts, with `RestoredAloneNotice`), so
a toast's 復原 outlives the card's ⋯; `CardActionsMenu`'s 刪除 trashes (asking only per `trashAsk`),
`TrashActionsMenu` restores or deletes for good, the card box's last shelf is 垃圾桶, `TrashedCardBanner` heads the
owner's trashed card page, and the thought map parks a trashed card's node (`ThoughtMapStore.parkNodes`) so a
restore puts it back in place.

Round 8 (2026-10-24): the writer's bar says ← · its short title (新卡片 · 編輯草稿 · 編輯卡片) · how the writing is
kept (`WriteModel.saveState`: 儲存中⋯ only for a write past 400 ms, 已儲存, 修改已暫存, 未儲存; `SaveStateText`, a polite
live region that gives way first) and ends on ✓ (`OrganicIconButton` with `enabled`/`busy`); at the split the state
stands before the floating ✓, and at the end of the step's heading. The step's 卡片類型 is 公開 · 匿名公開 · 草稿 with no
line under it and one button by `stepVerb` (a kept 草稿 is written, never published; a published private card made public goes
through its edit). The card box's 草稿 shelf is the private and draft shelves merged by `editedAt` (`draftShelf`, at
most 40), and the ⋯'s only visibility row is 轉為草稿 on a card readers have (`seenByReaders`) — both renamed 私人卡 in
round 9, below. An emptying that failed reads the
trash again (`TrashCalls.trashLeft`): empty is done; DELETE /me/trash waits 70 s (`WritingApi.EMPTY_TRASH_TIMEOUT_SECONDS`). The story's WebView reports its
caret's line as its focused area (`StoryWebView.getFocusedRect`), so Compose's keep-the-focused-thing-in-view as the
keyboard rises keeps the line being typed above the format bar, not the story's top; the caret follow looks again
once the page or the bar has settled; the canvas' least height follows the page, not the keyboard; the photo and
card pickers hand the caret, keyboard and bar back (`refocusWhenBack`); the format bar's paper runs under the
navigation bar. A story picture that fails is the shell's toast, a cover's failure is said on the picture. A GFM
table is `StoryBlock.Table` (head, rows, alignments) drawn by `StoryTable` (rules not boxes, 4–18 em columns,
sideways scroll with a fading edge, 表格 to TalkBack); excerpts read it as its cells' words. Instagram 限時動態 wears
`ic_share_instagram` (native/brand/instagram.svg, pinned by ShareIntentsTest) and says what the copied link is for in
a system toast.

Round 9 (2026-10-24): a card only its author sees is a 私人卡 (never published, or published and private; the data
unchanged). Every card in the card box opens its page (`managedTap`), the trash's too, never published included
(`trashTap`: the server shows a card in the trash to its author by id, banner first); the owner's 私人卡 page ends
its meta line with the lock and 私人卡 (`StoryMetaLine`) and has a 編輯 pen where share would be (a phone's bar, a
tablet's byline); every step verb lands on the card's page (`WriteModel.finish`), and a card begun in a writer and
emptied again is deleted on the way out (`dropIfEmpty`). The map locks every 私人卡 (`mapNodeIcon`, its tray too) and
opens one below the split on its page. The card page's head is measured from the bar's pen line (`storyHeadGap`:
48/64 to the title, 56/72 to a cover; title → byline 20/24, byline → story 40/48, the meta 14 wider), the profile's
and My Card Box's from it to the avatar (`peopleHeadGap`: 40/56, avatar → name 16), skeletons alike. The response
bar gives up its words in two steps (`SegmentedLayout.steps`: the bookmark, then the note) and never runs past its
room. The chat composer floats over the thread (`ComposerCapsule` in `core/design`: ＋, the field and Send's segment
in one field shape, 48 tall for one line at any text size up to the 1.25 cap; what rides with the message on a slip
over it, `floatingSlip`; both drawn in a `floatingGroup` whose paper halos go under each other's pen lines), the
thread running under it with its foot following it and the keyboard (`ComposerRoom`), a letter's line as the
thread's last item. 與此文共振 lists full cards, three then 查看全部; the card picker shows four skeleton rows and says
when its read failed; tables set every cell at its start under hand-drawn rules (`tableRule`); the trash's head is one
row (the hint, 🗑 清空); the writer's cover controls wear the card's family (`CoverFaces`; a coverless card's from its
id, `CardPalette.ofId`), 更換封面 with its menu in the same hue. Bare icon buttons draw at INK at rest.

Round 10 (2026-10-25): below the split the thought map opens every card of mine in the writer, a 私人卡 as a shared
one (`mapOpening`; someone else's on its page; the card box and the trash still open a 私人卡's page). The composer
lost its paper halo (and `floatingGroup`): behind the thread's foot lies `ComposerBacking`, the cream across the pane
down to the screen's edge (through the navigation bar, to the keyboard's top), its top 24 (`ComposerFade`) a fade
that lets taps through to the thread while the solid paper takes them. With nothing riding the fade covers the
capsule's top half; what rides with the message — the reply, the note answered, the card (its cover as a 40 thumbnail,
`Attachment.cover`), the picture — are frameless rows in the reply's style (`ComposerRow`: lead · 12/600 label over a
12.5 line · a 44 ✕ over Send, 52 at least, touching), 24 more over them for the fade, so the paper is solid behind
every row; why the last one didn't go is a terracotta line under them. That 24 is part of the measured foot
(`ComposerRoom.foot`), so the newest message, the pill and the list's end room keep 12 over the fade. The capsule's
pen is `FieldBorder`, `FieldBorderHover` while written in (`composerPen`) — darker, never terracotta. A notice in the
composer's place keeps its framed slip, the paper behind it alike.

Round 11 (2026-10-25): a tap on the thread's blank — one no message took: between bubbles, beside them, above the
first — puts the keyboard away (`onThreadBlankTap`, the final pass), and so does a tap on the foot's solid paper
(`ComposerBacking`'s `onTap`); the capsule and the riding rows keep their own touches. The foot's fade is 12
(`ComposerFade`), starting on the capsule's top edge, or 6 over the topmost riding row (`ComposerRowsLead`), where
the row's ink starts. The writer's head is the card page's (`writerHead`: the bar's pen line → the title's line box
48 / 64, a tablet's publish card 72), the title → the story 32 (`writerTitleGap`), the title's count or error in
that gap; the publish step's sections are one `publishSectionGap` apart (40 / 48), a label 12 over its control,
the rule over the button in the middle of one gap, a phone's mirror line keeping two lines of room while asked. The
save state is the bar title's second line (`TitleWithStatus`: 12, start-aligned on a phone, centred on a tablet,
its line kept while empty and the title alone standing on the row's line until it comes). A tablet's back bar sets
its row `TabletBarRowDrop` (6) under its middle. The trash shelf's cards say nothing under them; its 還原 says who
reads the card now (`restoredToast`, from the restore's answer: the web's `restoredAs`).

Round 12 (2026-10-26): the picture viewer's ✕ is `OnDarkIconButton` — the cream glyph (20, INK) on a wobbly disc
of the viewer's own dark (`OnDarkDisc`: `oklch(12% 0.01 60)` at 50 %, 72 % pressed; the web bare button's wash,
seed 5, 40 across in a 48 target), its centre 16 + 22 in from the top and end inside the system bars and a cutout
(`ViewerCloseCentre`): it reads on a light picture that fills the screen and fades into the dark around one. While open, the viewer's own
window makes the status bar's glyphs light (`LightStatusGlyphs`); the paper's dark ones are back as it closes. On a
私人卡's own page — the 編輯 pen already beside the ⋯ — the ⋯ leads with 公開發表 (globe) instead of 編輯
(`menuRows(penBeside)`), which opens the writer on the card at its publish step (`publishRoute`:
`Route.Write.publishing`, carried by the workspace's pane) with the card offered to readers — 公開, or 匿名公開 for a
card already anonymous (`publishingAudience`), a choice like any in the step (autosaved, still changeable); the offer
is made once, so a restored writer keeps what it was left with. Back from that step is writing, as always. The card
box's ⋯ keeps 編輯.

Round 13 (2026-10-26), Android: the thought map — its own screen and the writer's map at the split — opens doing what
👁 顯示全部 does, every card and region framed in what it shows (`ThoughtMapStore.framing`, the web's `followFitRef`):
each visit (the session's store no longer opens where the last visit left the camera), a board read that lands after
the map has its size (`place`), and, until the reader pans, pinches or zooms (`takeCamera`), every change of its size —
the pane easing open, the divider let go, a turn — and each settling beside the pane (`settledBesidePane`), a card
opened from the map included. Once the reader has moved it a settling glides the pane's card to the middle as before;
顯示全部 hands the camera back to the rule.

Round 13 (2026-10-26, iOS): a thought map opens as its 👁 顯示全部 leaves it — every card and region framed in the
map's visible area — on the map page and beside the writer at the split alike (`ThoughtMapStore.beginVisit`, once per
`ThoughtMapScreen` shown, whatever the camera was on the session's last visit), and while `framing` frames it again
as the board's read lands (`show`), as its visible size changes (the pane easing open or hidden, a divider
let go, the iPad turned or its window resized, the map back from under a page pushed over it — only the screen on
show reports its size) and when a card opens in the pane (`settle`). A pan past the 4px rule, a pinch or the zoom
buttons take the camera (`takeCamera`): from then on the pane's card glides to the centre as before; 👁 hands it back.
The web's rule (50d7cf4a, `followFitRef`).

Round 16 (2026-10-27), Android: the publish step's tags are the label on its own line, the chosen tags wrapping under it
(`TagPillRow`: lg outlined quiet pills — half the accent's light wash, the soft pen at INK_LIGHT, words at 500, a muted ✕
named for its tag, `write.tagsRemoveLabel`, in a 44 hit box; no room at all with no tags) over the composer's capsule (`CapsuleField`, which
`ComposerCapsule` now wraps): its end segment is ✦ AI 建議 with nothing committed — an IME's composing range
(`TextFieldValue.composition`) counts as nothing — and ＋ 新增 once a word is, as wide as its wider face; only a
hardware keyboard's first Backspace takes a tag back (`TagEntry`), and while the field is in use any change of height
above it (the row wrapping, the preview's row of tags) scrolls the step by as much in the same layout pass
(`TagFieldAnchor`). The phone's tab bar is glyphs alone (52 tall, 26 glyphs, the chosen tab its solid twin, the badge
on a paper ring); the home feed slides it away while read down (`TabBarAutoHide` / `TabBarHideRule`, never under
TalkBack or Switch Access, a fade with animations off). A held message lifts with the five reactions right above it
(`ReactionTray`, `ReactionGlyph` from generated/Reactions.kt) and its actions right under it (`MessageActionSheet`:
回覆 · 複製 · the link's · 收回 · 檢舉這則訊息 · 重試 / 刪除), gliding the least that fits (`placeHeldMessage`);
reactions are chips in the gutter (`ReactionChips`), drawn at once and put back on a refusal (`ThreadModel.react`),
and also the bubble's custom accessibility actions; an unsent message is a dashed ghost (`UnsentBubble`), its quotes
訊息已收回, the list its ghost's words; a chat push `type: 'unsend'` redraws the conversation's notification without
that line (`PushCenter.removeChatLine`; debug: `--es pushChatUnsend <id> --es pushChatConversation <pair>`). The
writer's format bar has 連結 after 斜體, opening `StoryLinkSheet` (卡片 | 文字 where the island's `canCard` says, the
address checked by `StoryLinks.linkTarget`; `--es linkDraft …` fills its field in debug builds), and a tapped link
card opens it with 卡片 chosen (the island's `linkTap`). A lone link is a card only when its words are its address
(`StoryLinks.wordsAreTheAddress`).

Round 16 review (2026-10-27), Android: a held message's list leads with the link's rows when the press was on one
(開啟連結 `arrow-right` · 複製連結 `link`, `messageActionKinds`), its glyphs in the accent at 17; the chosen reaction's disc
at night is the accent at 30 % over the tray (`PaletteMixes.reactionChosen`); a chip is tapped in 44 × 44
(`ReactionChips` `onTap`); a gliding message of theirs carries their face; what lies under the press layer or any
`OrganicModal` is softened 2 dp on Android 12 and later (`softenedUnder`, `ModalBackdrop` at the root); one time of day
across the chat (`chatTimePattern`: 下午3:04 / 3:04 PM, the list, the thread and the menu's foot); 檢舉這則訊息 is titled
for that message (`ReportDialog` `customTitle`); a Chinese placeholder stands upright (`AppFonts.obliqueUnlessCjk`); the
link sheet opens with its field focused, 完成 waiting for an address, 顯示為 inline before its choice; a format tool that
turns on out of sight scrolls into the row; and the reader draws a standalone link with no stored preview as the
writer's quiet card — its host over its address — wherever the server would fetch it (`StoryLinks.unfurlable`: not the
site's hosts, not an IP address).

Round 17 (2026-10-27), Android: every menu is the press menu's sheet (`PaperMenuSheet` / `MenuSheet` in `core/design`:
OrganicMenu, OrganicMenuFrom, OrganicMenuPanel and `MessageActionSheet` alike) — the menus' paper raised at night and the
sheet grain over the whole wobble, no pen line, no rules between rows, a blurred shadow following the wobble
(`SheetShadow`: by day 0 8 24 and 0 1 3, at night 0 10 28), rows 44 with the glyph 17, 12 to the words and 20 in from
either side, the sheet as wide as its longest row (280 at most); a row's ink spreads from the finger inside its own
wavy band (`rowRegion`), the warning row keeps its wash; a popup keeps `SheetShadow.Room` (40) round its sheet so
neither is cut by its window, a tap there closing it. A held message: the tray floats over the scrim with no paper, the
chosen disc popping in with its sticker; the list's time at the end of a 24 line right under the last row; the scrim
and the softening cover the thread's body only — drawn under the thread's bar, which stays sharp, as do the
conversations and the rule beside a tablet's pane — and the glide keeps 12 under that bar (`regionTop`). The chosen
tags are rimless pills in the AI 建議 segment's colours (`TagPill` `ink`). The format bar ends ┆ 連結, and the link
editor is the app's modal (`StoryLinkDialog`: 插入連結 / 編輯連結, the address focused and selected, 顯示為 over 卡片 |
文字 where a card can stand, 移除連結 · 完成; no sheet at the foot). The phone bar grows to hold a title and its save
state at the 1.25 text cap (`OrganicInlineBar` with `hasStatus`). The tab bar's one pen is `TabGlyphPen` (INK_STRONG). At
the writer's split the publish step has no back of its own: the map's Leave is step-aware (`WriterHandle.inPublishStep`
/ `stepBack`), back to writing and named 繼續寫 from the step.
