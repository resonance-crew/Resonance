# Web flows

Journeys through the running web app in a real browser (Playwright's Chromium, the one the web captures use), against the visual harness's private stack (emulators + `next dev`), the world reseeded before every flow. Each flow runs at the captures' desktop (1440 × 900) and phone (390 × 844, touch) sizes, each in a fresh browser context. They are the web's twin of the apps' Maestro flows (`maestro/`).

```bash
npx tsx scripts/visual/webFlows.ts                         # every flow, desktop and phone
npx tsx scripts/visual/webFlows.ts --only live-message,bell --width phone
npx tsx scripts/visual/webFlows.ts --wait                  # queue behind another run on the same ports
npx tsx scripts/visual/webFlows.ts --headed                # watch it
npx tsx scripts/visual/webFlows.ts --no-stack              # on a stack already up (VISUAL_*_PORT), for drafting a flow
```

Use other ports than another session's stack: `VISUAL_AUTH_PORT`, `VISUAL_FIRESTORE_PORT`, `VISUAL_DEV_PORT` (the run holds the same port locks as a capture, `lock.ts`). Reports go to `visual/webflows/<run>/<flow>@<width>/` (git-ignored): `log.txt` (the steps, with timings), `net.json` (every `/api/v1` call with its body and answer, every Firestore request sorted into write / read / listen with what it named), and for a failure `failure.png` and `failure.json` (the error, the page's console errors and uncaught exceptions, the failed requests). The last line is `Web flows <run>: N passed · M failed`; the exit code is 1 on a failure.

## What every flow checks

Besides its own assertions, a flow fails on:

- **a Firestore write from the page** — what the web writes goes through `/api/v1` since the middleware decouple;
- **a Firestore listen on anything but the viewer's `signals/{uid}`** — the web's one listener (`client/signals.ts`);
- an `/api/v1` answer of **5xx**, and an **uncaught exception** in the page.

Reads still on Firestore by design (the editor reading its own card, the card box's own shelves) are recorded in `net.json`, not failed.

## The flows

| Flow | What it proves |
| --- | --- |
| `live-message` | alice sits on `/messages/bob`; bob sends from outside (`POST /api/v1/messages` with his token, as `maestro/flows/common/send-as.js`); his words appear in the open thread within 10 s with no reload, and a second one appears on the conversation list by itself; her own send is drawn at once (≤ 1.5 s), goes out as `POST /api/v1/messages`, and is there after a reload |
| `bell` | alice sits on the home feed; bob taps her card from outside (`PUT /api/v1/cards/letter/tap`); the header's 通知 badge goes up by one without a reload (`GET /me/bell` pulled on the signal) and the notifications page lists 「bob 與你的卡片共振了」 |
| `block-person` | 封鎖 from bob's profile menu (`PUT /me/blocks/bob`), the profile says 你已封鎖 bob; settings · 隱私與連結 · 管理封鎖名單 lists him (`GET /me/blocks`); 解除 (`DELETE /me/blocks/bob`) empties the list |
| `write-draft` | a new card: `POST /api/v1/cards`, then `PATCH …/draft` with a rising `rev`; a reload keeps the words; offline, more words and the bar says 未儲存; back online the outbox sends by itself, the bar says 已儲存 again, and a reload shows the later words; ✓ · 公開 · 發布 (`POST …/publish`) lands on the card's page |
| `edit-published` | 管理卡片 · 編輯 on a published card: the edit is saved by `PUT …/edits/current` (修改已暫存, never a PATCH of the card), kept across a reload, and ✓ · 儲存修改 (`POST …/edits/apply`) shows it on the card's page |
| `thought-map` | 加入卡片 puts a card on the map and a pointer drag moves it: `POST /me/thought-map/ops`, the drag's moves gathered into a batch or two, and after a reload the node is where it was left |
| `bookmark` | 收藏 on bob's card (`PUT /me/bookmarks/rain-walk`), the 收藏 shelf shows it (`GET /me/cards?tab=bookmarks`), 取消收藏 (`DELETE …`) empties the shelf again |

## Adding a flow

1. A file `scripts/visual/webflows/<name>.ts` exporting a `WebFlow` (`kit.ts`): `name` (the file's name), `proves` (one line), `account` (signed in before it starts) and `run(kit)`. Its top comment says what it proves and which requests prove the path.
2. Register it in `webflows/index.ts` (`webFlows.test.ts` fails on a file that isn't).
3. Assert what a person sees — zh-TW words, by role or label (`kit.page.getByRole(…)`, `expect` from `kit.ts`) — and the requests (`kit.waitForApi`, `kit.apiCalls`). Act as someone else from outside with `kit.asUser('bob')`. Wait on what the page shows with generous timeouts on a first look (`kit.slow`: `next dev` compiles a route on its first request), never a fixed sleep for the app to be ready.
4. A check whose failure shouldn't stop the journey (what comes after it is still worth checking) goes through `kit.soft(…)`: the flow still fails, at its end.
5. It runs at both widths. Where the layout differs (a phone's settings menu, a desktop's shelf tabs, the conversation list beside the thread), branch on `kit.phone` rather than skipping a width.
