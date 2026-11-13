---
paths:
  - "src/app/**/write/**"
  - "src/app/**/thought-map/**"
  - "src/components/sections/WriteWorkspace/**"
  - "src/components/molecules/CardEditor/**"
  - "src/components/molecules/PublishStep/**"
  - "src/components/molecules/ThoughtMap/**"
  - "src/components/sections/AppHeader/HeaderBar.tsx"
  - "src/components/sections/AppHeader/HeaderBar.module.css"
  - "apps/ios/Resonance/Features/Write/**"
  - "apps/ios/Resonance/Features/ThoughtMap/**"
  - "apps/android/**/Write*.kt"
  - "apps/android/**/Workspace.kt"
---

# The writer and the workspace (from the design system)

A page's own back + title bar is `HeaderBar` (the app header's `HeaderChrome`): a phone's settings detail, and the writer below 1200, whose back asks before leaving written work (`CardEditor`'s ref: `hasWork`, `saveNow` — the apps' rule).
The writer is two steps in one `CardEditor`: the bare writing page (title + canvas story, no frames — the named exception to the outline rule), then `PublishStep` in the same place (✓ → 發布這張卡片 / 儲存私人卡 / 更新這張卡片: mirror, the card's preview with its cover, tags, 卡片類型 — 公開 · 匿名公開 · 私人卡, no line under it —, one button whose verb follows the card and the choice: `stepTitleKey` / `stepVerb`; 私人卡 + 儲存 never publishes a never-published card, and every verb of the step lands on the card's page (replacing the writer in history); 捨棄修改 only for a live card's revision); the bar reads ← short title … ✓, the save state the title's second line (`HeaderBar` `status`, 12 muted, its line kept while empty and the title alone standing on the arrow's line meanwhile; `SaveState`: 儲存中⋯ past 400 ms · 已儲存 · 修改已暫存 · 未儲存, the time its tooltip; titles by `editTitleKey`) — below the split the writer's title stands `--story-head-gap` under the bar's pen line, as a card page's does, `--writer-title-gap` over the story, and the publish step's sections `--publish-section-gap` apart, ✓ 完成 being the host's to draw (`onPrimaryActionChange` → `WorkspaceShell paneAction`, a `BareIconButton`: the bar's end below 1200, floating at the split with the state before it), every choice in the step autosaves with the draft, the writer's page puts the step in its address (`?step=publish`, so the browser's back returns to writing), and a note grown into a resonance hands its words over in sessionStorage (`lib/data/writeSeed`), never the address.

## The workspace (≥ 1200)

At ≥ 1200 the writer and the thought-map page are one workspace (`WorkspaceShell`): the map beside the editor pane, no bar and no pane header, the Leave floating over the map their way back (the writer's asks as its bar's back does); one of the viewer's cards opens in the pane in place, someone else's on its card page; the divider (`role="separator"`: arrows resize 32–50 %, Enter/Space and Escape fold, Home / End the whole width / folded) is the only way to hide the pane — dragged past 18 % it hides on release, kept mounted and saved at once, its grip docked at the edge to show it again; the writer's pane dragged past 1:1 follows the pointer and, released past 3/4, takes the whole width as on the tablets (round 16 — no bar comes in: the ✓ stays where it floated and the Leave, where it floated, turns to its glyph alone — its words fading, its paper narrowing to a disc with its own wobble (never a clip) as the ← grows to the ✓'s size and ink, then the bare ← in its place in one frame and the paper fading: one arrow throughout, centred on the ✓'s line; its grip docks at the leading edge to give the map back at 1:1); a throw (≥ 0.5 px/ms over the last 80 ms of the pointer's moves — the release counted only where it moved, and a release more than 50 ms after the last move a stop: `releaseSpeed` — after ≥ 24 px) goes on to the next stop its way (the whole width, or folded); dragged past 1:1 the map's tools fade before the Leave can meet them (`data-beyond` → `--map-tools-away`); the grip is one wavy pen mark in every state; beside the map the Leave is the map's own way out (離開, from the publish step too) and the publish step has a back of its own before its name (繼續寫, its row on the Leave's and the ✓'s line), and only at the whole width is the Leave the page's one back, step-aware (in the publish step 繼續寫, back to writing; the step then draws none) — the thought-map page's pane alike, which takes the whole width too while it holds one of the viewer's cards (`WorkspaceShell` `fillable`, `onFullChange` → `inlineStepBack`); a pointer's release settles in 180 ms without a spring, and the map re-centres the pane's card only when it is out of sight.
A drag ends on lostpointercapture, window blur, or a mouse move with no button held, so a hover never moves it.
