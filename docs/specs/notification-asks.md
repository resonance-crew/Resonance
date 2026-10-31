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

Card: paper sheet in the card style (tokens; pen line; no shadow), title `notifyAsk.picksTitle`,
line `notifyAsk.picksBody`, actions at its end `notifyAsk.no` (tonal) · `notifyAsk.yes` (solid).

- 好，通知我 → the system question if never asked; on yes (or already allowed) PATCH `picks: true`,
  the card goes, toast `notifyAsk.turnedOn`. On a system no: the card goes, nothing saved, toast
  `notifyAsk.systemOff` with action `notifyAsk.openSettings` (the system settings page).
- 不用了 → the card goes for good (this account, this install).
- A failed PATCH: the card stays, the shell's toast says `settings.notifications.saveError`.

## 4. Connection-cards invite: on the messages list

Same card, at the top of the conversations list (Messages tab), when the account has at least one
connection (a conversation that isn't a letter waiting), `connectionCards` is off, the system
question isn't `denied`, and it hasn't been answered on this install for this account. Copy
`notifyAsk.connectionCardsTitle` / `connectionCardsBody`, actions as §3, PATCH
`connectionCards: true`.

## Shared rules

- One card component for §3 and §4, one dialog for §2; tokens, OrganicButton, no shadows, copy only
  from `notifyAsk.*` (one-sentence strings carry no full stop).
- Remembered answers live in the account's local preferences (cleared at sign-out with the rest).
- Twins: iOS and Android behave and look the same (placement, order, spacing, labels).
- Unit tests for the decisions (when the ask shows, the 3 days / 3 times rule, when each invite
  shows, what a tap writes).
