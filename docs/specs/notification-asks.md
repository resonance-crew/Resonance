# Asking for notifications in context (2026-11-01)

The owner's call (after a signup notifications step was built and reviewed): no step at signup —
a new account doesn't yet know what the switches mean, and signup already asks a lot. Ask at the
moment the reason is plain, explain first, then put the system's question.

Already shipped with this change and staying: the `messages` switch (messages and notes, on until
turned off) on the server, the web and both apps' Settings → 通知 (first row).

## 1. Remove the signup step

iOS `NotificationStepScreen` / `NotificationStepModel`, `Landing.notifications`,
`adopt(welcoming:)`, `finishNotificationStep`, `-notifyStep`; Android `NotificationStepScreen.kt`,
`Entry.Notifications`, `--ez notifyStep`, and their tests. Onboarding's Finish goes straight to the
tabs as before. Keep the shared Settings row pieces (iOS `NotificationSwitchRow` +
`NotificationsDeniedNotice`, Android `PushSwitchList`) and whatever the kit gained (`Messages`
switch, Android's multi-switch PATCH).

## 2. The reply ask: after reaching someone

Today `PushCenter.reachedOut()` (first note, first message, a card published) puts the bare system
question. Instead, while the system was **never asked** (`undetermined`) and the person hasn't
recently said 先不要, show our own ask first:

- A small organic dialog (the app's modal: iOS `organicModal`, Android its organic dialog), centred
  on tablets, no ✕ needed beyond the house rule:
  - title (heading) + one muted line:
    - after a note or a message: `notifyAsk.replyTitle` / `replyBody`
    - after publishing a card: `notifyAsk.publishTitle` / `publishBody`
  - a quiet hint line `notifyAsk.changeLater`
  - actions at the end: `notifyAsk.later` (tonal) · `notifyAsk.turnOn` (solid); stack, primary
    first, when they don't fit.
- 開啟通知 → the system's question (`askIfUndetermined`); a yes registers as today.
- 先不要 (or closing the dialog) → nothing asked. Remember it per install: the ask comes back at the
  next reaching-out moment only after **3 days**, and never after **3** 先不要s.
- `denied` or `allowed` already → nothing shown (Settings → 通知 says where to turn them on).
- Shown over the tabs by the shell, once whatever triggered it has closed (the note composer, the
  writer's publish landing on the card page): never stacked on another modal, never twice at once.
  If a modal is up, wait for it to close.
- Debug flows: `-askForNotifications NO` (iOS) / Android's equivalent keeps the ask from showing,
  as it keeps the system question today.

## 3. Picks invite: on the home feed, for readers

For someone who reads and never writes, the evening card is the one push worth offering. An
invite card **above the feed's cards** (where the refresh note sits), shown when all hold:

- the account has opened **5 or more card pages** on this install (count locally, any card),
- the `picks` switch is off (read `GET /me/notifications` once, when the count first allows it; cache
  the answer for the session),
- the system question isn't `denied`,
- not answered on this install for this account.

Look (round 24, the owner's 2026-11-09 calls: 「做成像是首頁這邊手機上文章會變成使用水平分割線分割的區段…裡面有填色…
深色一點的灰，這樣就不會…顯得又多一張卡片的感覺」, and for tablets 「應該要做這種沒有 border 的卡片…因為它這時候左邊右邊的
padding 已經變多了」): never a sheet in a pen line; always the thread's grey (`bubble-theirs`), its line in the deeper
muted ink that clears 4.5:1 there (`link-card-muted`); the form follows the kind of device (CLAUDE.md, "Phone, tablet
and Mac"):

- **Phone**: a band of the feed, edge to edge, under the story bands' grain. Its top is the bar's pen line (its paper
  running up under the bar's wave, as the first card's does) and its foot the first card's own top wave; a pull opens a
  gap of the same grey. Under the refresh note it draws its own top rule (7 turns, amp 1.4, INK_LIGHT, in
  `field-border-hover`; seeds 84 top, 108 foot) and the gap is the page's. Its words where a card's are (38 in).
- **Tablet, banded feed** (an iPad or Android tablet in portrait): a borderless card — the grey, the card grain, the
  card's outline, no pen line — its edges on the cards' content edges (where the covers' edges are), 24 under the bar
  and 24 above the first card's top rule, 26 over its title, 22 on its other sides.
- **Tablet or Mac, grid feed**: the wide card spanning every column, in the grid's outline and inset, borderless grey.

Inside: title `notifyAsk.picksTitle` (heading 18) → 8 → line `notifyAsk.picksBody` → 14 → `notifyAsk.no` (tonal) ·
`notifyAsk.yes` (solid) at the row's end (beside the words on a wide card). iOS `AsideBand` / `PicksInvite`, Android
`Modifier.filledBand` / `NotifyInviteSheet`.

- 好，通知我 → the system question if never asked; on yes (or already allowed) PATCH `picks: true`,
  the card goes, toast `notifyAsk.turnedOn`. On a system no: the card goes, nothing saved, toast
  `notifyAsk.systemOff` with action `notifyAsk.openSettings` (the system settings page).
- 不用了 → the card goes for good (this account, this install).
- A failed PATCH: the card stays, the shell's toast says `settings.notifications.saveError`.

## 4. Connection-cards invite: on the messages list

At the top of the conversations list (Messages tab), in the same grey, by device:

- **Phone**: a band edge to edge, its top the bar's pen line (paper up under the bar's wave, the pull gap grey), its own
  rule along its foot, its words where the rows' content is (20 in, 20 under the bar's foot), the first row 4 under it.
- **Mac** (the list pane beside the thread): a band filling the pane — from the window's edge to the panes' wavy rule,
  its top the header's pen line (no rule of its own), its foot rule running on to the panes' rule (iOS
  `MessagesTwoPane`'s `PaneBand`: the strip under the header and the gutter carried by the two-pane view).
- **Tablet** (iPad, Android tablet; one pane or two): a borderless card in the rows' column, 16 under the bar, 22 / 22 /
  20 inside, the first row 12 under it.

Shown when the account has at least one
connection (a conversation that isn't a letter waiting), `connectionCards` is off, the system
question isn't `denied`, and it hasn't been answered on this install for this account. Copy
`notifyAsk.connectionCardsTitle` / `connectionCardsBody`, actions as §3, PATCH
`connectionCards: true`.

## Shared rules

- One invite view for §3 and §4 (its form by device), one dialog for §2; tokens, OrganicButton, no shadows, copy only
  from `notifyAsk.*` (one-sentence strings carry no full stop).
- Remembered answers live in the account's local preferences (cleared at sign-out with the rest).
- Twins: iOS and Android behave and look the same (placement, order, spacing, labels).
- Unit tests for the decisions (when the ask shows, the 3 days / 3 times rule, when each invite
  shows, what a tap writes).
