# UI review — calibration examples

Real cases from rounds 16–24 and the 2.5.0 release run, each with the verdict that turned out right and why. The
`ui-reviewer` agent reads this before it looks at anything; a person tuning a review prompt should too. Half of them
**looked wrong and were fine** — the failure an uncalibrated reviewer has is not missing bugs, it is flagging these
and sending a fix round after them.

Paths: `$NOTES` = `/Users/ncchen/Documents/Resonance-notes`. Verdicts are the `ui-reviewer`'s: `ok`, `intended`,
`broken` (app or capture), `off-spec`, `nit`.

| # | Case | Looked like | Right verdict |
|---|---|---|---|
| 1 | Writer at full width: 離開 wraps to 離／開 | broken | **broken (app)** |
| 2 | Android menu's warning row: opaque band, darker than the sheet at night | a style choice | **off-spec** |
| 3 | Menu rows: 22 leading vs 29 trailing room | off-spec | **ok** (a nit at most) |
| 4 | The phone's ☰ is still an outlined Modal with a scrim | off-spec (every menu is a sheet) | **ok** |
| 5 | The reader's link card centred, reading as an indent | off-spec | **ok** — pre-existing, not this round |
| 6 | Conversations captures changed by an invite row | a regression | **ok** — explained by an earlier change |
| 7 | Web phone notifications: a page now, not a dialog | broken (the dialog is gone) | **intended** |
| 8 | Sticker cells are stills in the captures | broken (no animation) | **ok** |
| 9 | Notification rows show no separator at rest | broken (rows run together) | **ok** at rest; the press needs code |
| 10 | Android status bar has a Wi‑Fi icon the baseline lacks | changed | **ok** — the harness's |
| 11 | Three Android card captures with empty covers | broken (app) | **broken (capture)** |
| 12 | Mac attach popover with a pen line over the photo picker | ok (pixels right) | **broken (app)**, found in code |

---

## 1. Writer at full width: 離開 wraps to 離／開 — broken (app)

Round 16, web, desktop 1280, dragging the writer's pane to full width. The Leave button squeezed to 71 × 59 and its
label wrapped onto two lines; the map's toolbar slid under it.

- **Verdict:** `broken`, layer `app`. A button label on two lines is never a design choice here; since `cf938fae` a
  wrapped label also fails the web pass outright.
- **Cause it had:** `.back` absolutely positioned in a pane that collapses to 0; the toolbar chose short labels by
  viewport width, not its own (`useIsMobile(640)`).
- **Source:** `$NOTES/2026-10-27-round16/review-web.md` (M1); `review-decisions.md` (M1).

## 2. Android menu's warning row: opaque band, darker than the sheet at night — off-spec

Round 17. On every menu with a warning or delete row (封鎖, 刪除), Android drew that row on a flat band with no grain;
at night it was darker than the sheet, so the sheet looked like paper on a separate strip. iOS and the web drew the
same wash see-through.

- **Verdict:** `off-spec`: the twins disagree, and the "two layers" look was what the owner had just complained about.
  A twin that differs is a finding even when each platform alone looks deliberate; check dark mode, where it showed.
- **What followed:** decision D1 — destructive rows carry no resting wash at all (since round 18 the danger row
  rests on its red wash; read the current CLAUDE.md, not the old decision).
- **Source:** `$NOTES/2026-10-27-round17/review-apps.md` (§1); `review-decisions.md` (D1).

## 3. Menu rows: 22 leading vs 29 trailing room — ok (a nit at most)

Round 17, both apps. Measured from the sheet's visible edge: about 22 to the glyph, about 29 after the longest label.

- **Verdict:** `ok`. The difference is inside the hand-drawn wobble and the 20 + wobble padding rule; the reviewer
  wrote "Fine as is" and the lead kept it as an optional tidy-up. Measuring is right; flagging a few px of asymmetry
  in an organic outline is not.
- **Source:** `$NOTES/2026-10-27-round17/review-apps.md` (§11, "Fine as is").

## 4. The phone's ☰ is still an outlined Modal with a scrim — ok

Round 17, web 375. After "every menu is one sheet" (no outline, no scrim), the phone's ☰ still opened an outlined
dialog over a blurred scrim, its rows without glyphs.

- **Verdict:** `ok`. It is a navigation **dialog**, not a menu a button drops; the sheet rule doesn't cover it. The
  reviewer raised it as a nit for the owner, and the decision was "stays as it is". Know what kind of surface a thing
  is before applying a rule to it.
- **Source:** `$NOTES/2026-10-27-round17/review-web.md` (§14); `review-decisions.md` (W14).

## 5. The reader's link card centred, reading as an indent — ok (pre-existing)

Round 16. The quiet link card sat centred at 520 in a 680 column while the prose starts at the column edge.

- **Verdict:** `ok` for this round. It was a pre-existing reader choice, not something the round changed; it went to
  "Not now (tell the owner)". A review covers what the round changed; an older choice goes in open items at most.
- **Source:** `$NOTES/2026-10-27-round16/review-web.md` (N4); `review-decisions.md` ("Not now").

## 6. Conversations captures changed by an invite row — ok

Round 23's screenshot review. The messages and two-pane thread captures showed a new row atop the list:
「有連結的人公開發表新卡片時通知你？」.

- **Verdict:** `ok`. The connection-cards invite came from an earlier change after the baseline was taken
  (baseline 2026-10-31); it was not this round's. A change is a regression only if no commit since the baseline
  explains it — read the `Visual:` lines and `git log` since the baseline before calling it one.
- **Source:** the round-23 visual review's brief (`r23-visual-review` workflow, item (a) of "known and fine"),
  `$NOTES/2026-11-09-round23/notes.md`.

## 7. Web phone notifications: a page now, not a dialog — intended

Round 23. The web phone `notifications` capture no longer showed the bell's dialog over the feed; it showed a whole
page with the header's brand slot naming it.

- **Verdict:** `intended`. The owner said 「好」 to the bell becoming a full page like the apps' (spec §4), and the
  commit's `Visual:` line names the screen. A screen that looks completely different can be exactly right.
- **Source:** `$NOTES/2026-11-09-round23/notes.md` (擁有者的決定 1); `spec.md` SETTLED §4.

## 8. Sticker cells are stills in the captures — ok

Round 23. The sticker picker's "breathing" cells showed only their still thumbnails in every capture.

- **Verdict:** `ok`. The harness captures with reduced motion on, where stills are the specified behaviour. Motion is
  checked by hand or in Maestro, never from a still. Don't flag "the animation doesn't run" from a screenshot.
- **Source:** `$NOTES/2026-11-09-round23/critique.md` ("captured still"); CLAUDE.md "Stickers and the composer".

## 9. Notification rows show no separator at rest — ok at rest

Round 23. The bell's rows and the phone's conversation list ran together with no line between rows.

- **Verdict:** `ok` for the capture: the bands are invisible at rest by design (the curves show only on hover 6 % and
  press 12 %). What *was* broken — iOS bands never showed a press state (`.tracking`) — no screenshot could see; the
  post-merge code review found it. When a spec'd state can't be in a capture, say "not verifiable from captures",
  don't pass or fail it.
- **Source:** `$NOTES/2026-11-09-round23/notes.md` (色帶列表; 合併後審查).

## 10. Android status bar has a Wi‑Fi icon the baseline lacks — ok (the harness's)

The 2.5.0 release run `20261110-112400`. Web and Mac unchanged; Android's only difference was one more Wi‑Fi icon in
the demo-mode status bar.

- **Verdict:** `ok`. Environment, not app: the status bar belongs to the emulator. Say so in one line so the owner
  can accept it with the rest.
- **Source:** `$NOTES/2026-11-10-releases/notes.md` (截圖 run 20261110-112400).

## 11. Three Android card captures with empty covers — broken (capture)

Same run. Three Android card captures were taken before the card had loaded.

- **Verdict:** `broken`, layer `capture`: retake, don't fix the app. They were recaptured (`20261110-122019`); the
  harness's settle check had reported nothing unsettled, which became step 1's work. Telling the two layers apart
  sends the fix to the right place.
- **Source:** `$NOTES/2026-11-10-releases/notes.md`; `$NOTES/2026-11-13-loop/audit.md` §5 (#16).

## 12. Mac attach popover with a pen line over the photo picker — broken (app), found in code

Round 24, part 4. The Mac's attach popover looked right in every picture, and no photo in it could be clicked: the
pen line drawn over the out-of-process `PhotosPicker` (and a `.offset` / `.scaleEffect` on its sheet) took every
click.

- **Verdict in code mode:** `broken` for any view drawn over `PhotosPicker` or any transform on it, whatever the
  screenshot shows — the rule is in CLAUDE.md's composer paragraph now. **In screenshots mode:** `ok` is all a
  picture can say; note "interaction not verifiable". Pixels prove layout, never that a tap lands.
- **Source:** `$NOTES/2026-11-09-round24/notes.md` (第四部分 1); `$NOTES/2026-11-13-loop/audit.md` §5 (#12).

---

## What the cases add up to

- A change is judged against the spec, the `Visual:` lines and `git log` since the baseline — not against the
  baseline alone (6, 7).
- What the harness does (reduced motion, demo status bar, early captures) is the harness's (8, 10, 11).
- A surface's kind decides which rule applies (4); a round's review covers that round (5).
- Twins and dark mode are where off-spec hides (2).
- Some states can't be seen in a still — the press, a click, motion: say "not verifiable", and leave them to code
  review or a flow (9, 12).
- Measure before you flag, and keep small organic asymmetries out of the list (3).
