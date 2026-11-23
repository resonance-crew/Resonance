---
name: instagram
description: Make and post Resonance's Instagram content for @resonance.channel — vertical reels (scripts/reels), the weekly 那句留下來的話 carousel, local music / voice / sounds that may be used commercially, and posting through Claude in Chrome in the owner's own signed-in browser (never a third-party posting service). Use when the owner asks for a reel, a carousel, a caption, a post, or to change how the videos look.
argument-hint: "[reel <likes|kept|write|new idea> | carousel <passage.json> | post <folder> | update]"
---

# Instagram for 共振

The owner (念誠) wants posts that feel made by a person: calm, paper, warm, never glossy.
They don't want any service that holds the account's password: everything here runs on
this Mac, and posting happens in their own Chrome through Claude in Chrome.

When the owner asks to change how the videos look or how posting works, change the code
(scripts/reels) and then this file in the same commit, so the next run follows the new way.

The code lives here (public repository). The posts themselves — captions, passage.json files, plans,
consent notes, the rendered videos, covers and music — live in the **private** repository
`resonance-crew/Resonance-marketing`, cloned next to this checkout as `../Resonance-marketing`
(`gh repo clone resonance-crew/Resonance-marketing ../Resonance-marketing`). Never commit them
here: this repository is public, and those notes name team members and what they agreed to.
Commit and push the marketing repo after each round of posts.

## 1. Before an idea: look at references (every new series)

Search with the current month and year in the query (e.g. "Instagram Reels app promo
trends November 2026"): older articles describe formats that no longer work. Then *watch*
a few in Chrome, not only read about them:

- Meta Ad Library (facebook.com/ads/library): search an advertiser by name, country TW,
  media type video. Free, no login.
- New Engen's weekly Instagram trend page (newengen.com/insights/instagram-trends): each
  trend with its length and which audio a business account may use.
- Accounts with our temperament: @slowlyapp (pen pals; hands holding the phone, small serif
  captions), @mymind (very large serif words, lots of air), @letterboxd (the app's own card
  floating over the picture), @dayoneapp, @finchcare (a soft character), @moleskine (paper
  up close).

What held in 2026-11 (scripts/reels/page/lib.ts says how the code does it): a hook in the
first second (no fade from blank), one idea per beat in very large type, a cut every
1.5–3 s, 15–20 s in all, the app at a phone's own proportions with a camera that zooms in
on what's tapped, the 小紙團 reacting, text on screen for people watching without sound.
Sends per reach matter most for reaching new people: give them a reason to forward it.

## 2. Make a reel

```bash
cd <the checkout with scripts/reels>   # the ig-reels branch until it is merged
npx tsx scripts/reels/make.ts likes --score          # or kept, write; --music <file> for another bed
```

- It renders the page (scripts/reels/page, a pure function of time, through
  scripts/promo/render.ts), lays the reel's sound cues and the music under it, brings it to
  -14 LUFS / -1.5 dBTP, and writes `../Resonance-marketing/instagram/2026-11-launch/reel-<id>.mp4` and
  `reel-<id>-cover.jpg` (MP4s and JPEGs stay out of git; the code makes them again).
- A new reel is a new entry in `REELS` (page/reels.ts) built from page/lib.ts (words,
  tornSheet, phone, sticker, endCard) and page/cardpage.ts (the card page and its dialogs,
  their words read from src/messages so the video says what the app says). A new sticker
  joins page/stickers.ts (assets.ts splits it into frames).
- **Check stills before the full render**, all beats on one sheet:
  `npx tsx scripts/promo/render.ts --page scripts/reels/page --size 1080x1920 --query reel=<id> --name <id> --locale zh-TW --stills 0.1,2,4,... --stills-dir <scratch>`
  and look for: everything that must be read between y 250 and 1460 (Instagram covers the
  rest), nothing crowding the top — a headline has air under it and the content sits in the
  middle of that band —, no word cut at an edge, dialogs in the visible part of the phone.
  The owner reads balance closely; fix it before they see it.
- Say only what the app does today (the branch being shipped included): 共振 is a tap and
  then the passage that moved you (2–3 whole sentences), never "a card answering a card";
  publish has four audiences 公開 / 連結的人 / 匿名公開 / 私人卡. No public counts are
  promised. Never show or hint who wrote an anonymous card.

### 小紙團劇場 (theater-1/2/3)

The paper-puppet episodes (../Resonance-marketing/instagram/plans.md, C) drive the landing page's own
puppet engine (src/lib/mascots) frame by frame: page/theater.ts builds its Stage with an
injected clock and a seeded random and steps it to each frame's t (same t, same picture,
in any order); page/theater-reels.ts writes each episode's choreography on the engine's
Puppet, props and the write act's grip. assets.ts exports the rigs' parts at 1.6 px a unit
into scripts/reels/.assets/mascots. A new episode is a new `episode({...})` there: one line
of words, the held face, the sign-off. `npx tsx scripts/reels/make.ts theater-<n> --out
../Resonance-marketing/instagram/theater`.

## 3. Sound

Only sound we may use commercially:

- `scripts/promo/score.m4a` (`--score`): ElevenLabs Music made under the owner's paid plan,
  licensed for Resonance's own promotion (THIRD_PARTY_NOTICES). make.ts lays its opening
  under the reel and cross-fades into its close for the end card.
- Local tools in `../Resonance-media-tools` (its README has the commands and licences):
  `bin/music "<prompt>" <seconds> <out.wav>` (ACE-Step 1.5, MIT), `bin/tts "<text>" <out.wav>`
  (BreezyVoice, Apache-2.0, Taiwan Mandarin; for real use a prompt voice the owner has the
  rights to), `bin/sfx` (the synthesised tap / paper / page / chime / pencil / whoosh kit,
  ours). Pass music with `--music <wav>`, a voice-over with `--voice <wav> --voice-at <s>`.
- The 2026-11 beds (`../Resonance-marketing/instagram/music/*.wav`, kept in the marketing repository): each
  `bin/music "<caption>" <reel length + 1 s> <out.wav> --bpm N --seed N`, ~4 min a piece (the
  model loads every call — run a batch in the background). Captions that worked: "gentle felt piano
  with soft plucked acoustic guitar, warm, hopeful, intimate, light and airy, storybook,
  instrumental, no drums" (likes, 80 bpm); "tender music box over warm felt piano and a soft string
  pad…" (kept, 72); "soft fingerpicked acoustic guitar with light felt piano, cozy morning…"
  (write, 88); for the theater "quiet late night, solo felt piano…", "music box with light
  pizzicato strings…", "celesta and soft piano, two gentle melodies meeting…". Always end with
  "instrumental, no drums". Listen before posting: the model may slip a vocal-like sound in.
- Never: the ElevenLabs account's current output (its free plan is non-commercial), macOS
  `say` voices, F5-TTS, Fish Speech, MusicGen / AudioGen weights (non-commercial), YouTube
  Audio Library, Pixabay tracks with the shield icon (Content ID claims).

## 4. The weekly carousel 那句留下來的話

Only a public, named card, and only after its author said yes in writing (the owner asks
them). Write `../Resonance-marketing/instagram/<week>/passage.json` like `SAMPLE` in
page/carousel.ts (passage, title, author, context, pickers, family, week), then
`npx tsx scripts/reels/carousel.ts ../Resonance-marketing/instagram/<week>/passage.json` → four
1080 × 1350 JPEGs. Look at all four before posting.

## 5. Captions

Traditional Chinese as people in Taiwan write it (load the zh-tw-writing skill; run its
zh_lint.py on the file). The first line stands alone; one call to action per post (a
question to answer, or "send this to…"); at most 5 hashtags (Instagram's limit since
2025-12), `#共振` first. Keep each post's caption in the post's folder (captions.md).

## 6. Post through Claude in Chrome

The owner's Chrome is signed in to @resonance.channel. Load the Chrome tools in one
ToolSearch (tabs_context_mcp, tabs_create_mcp, navigate, computer, find, read_page,
file_upload, javascript_tool, tabs_close_mcp), open a new tab, and:

1. instagram.com → the sidebar's 建立 (find "新貼文 建立") → the dialog 建立新貼文.
2. Upload with `file_upload` on the dialog's hidden file input — the one inside `[role=dialog]`
   whose accept list has `video/mp4` (find "file input inside the create post dialog that accepts
   video"; check with javascript_tool if unsure). Never click 從電腦選擇 (a native picker the tools
   can't see). Under 10 MB per call: our reels are 3–5 MB. A video becomes a Reel.
3. The first time a notice says 影片貼文現在會以 Reel 形式分享 (information, not terms): 確定.
4. 裁切: the crop opens cropped; the round button at the preview's bottom-left opens the ratios —
   choose 原始 (the whole 9:16). 下一步.
5. 編輯: 封面相片 → 從電腦選擇 has its own hidden input in the dialog (accept image/jpeg,image/png):
   `file_upload` `reel-<id>-cover.jpg` there. Look at the preview — a cover must not catch a tap
   ring or a half-drawn moment (`coverAt` in reels.ts; 2026-11: likes 2.9, kept 1.9, write 6.3).
   Leave 開啟音效 on. 下一步.
6. Caption: click the 新增說明文字 box, type the text from captions.md (`\n` gives line breaks).
   Typing a hashtag opens a suggestion list: close it by clicking the post's header (not Escape,
   which can close the whole dialog). Read the box back with javascript_tool
   (`[role=dialog] [contenteditable=true]` innerText) and compare with captions.md character by
   character. Leave 新增 AI 標籤 off: it is for realistic AI photos and video, not our drawn reels.
7. **Stop before 分享** and show the owner what will go out (file, cover, caption) — unless
   their message for this post already said to publish it ("開始發" did, 2026-11-23). Publishing
   is public and can't be taken back cleanly.
8. 分享 takes about 30 s (分享中…, then 我們已分享你的 Reel。 → 完成). Post a series oldest
   first: the grid shows the newest leftmost.
   **Scheduling** (the owner's way for a series: one post every two days, 20:00 Taiwan time,
   carousels and the theater alternating): on the caption step turn on 排定發佈內容; the date is
   a button that opens a calendar (`Next month` for the next month, then the day — the calendar
   moves between openings, so click from a fresh screenshot, and read the date button back: a
   click one column off picked 12/2 instead of 12/3 once);
   the time is three spinbuttons — click Hours and type `08`, then click Minutes and type `00`
   (focus doesn't move on by itself), AM PM stays PM. Read all three back
   (`[role=spinbutton]` aria-valuenow / aria-valuetext) and the date button's text, then 貼文排程
   (it replaces 分享). instagram.com/scheduled_content/ shows the calendar of what's queued.
   On the caption step also check the switches (`[role=dialog] [role=switch]` checked):
   新增 AI 標籤 off, 分享到 Facebook (念誠's own account) off unless the owner asks.
   A carousel: upload the four JPEGs in one `file_upload`, choose 4:5 in the ratio menu, skip
   the filters (原始).
9. Open the profile, read the new `/reel/` links (javascript_tool over `a[href*="/reel/"]`),
   check the grid's order, and write each URL into the post's captions.md.

Account changes (bio, pinning, archiving) only on the owner's yes in this conversation. The
bio can be edited on the web (instagram.com/accounts/edit, the 個人簡介 box, then 提交). **Pinning
and archiving are in the phone app only**: the web's ⋯ menu on a post has 刪除, 編輯, 從個人檔案網格
移除, 對其他人隱藏按讚數, 關閉留言功能… but no 釘選 or 封存 — ask the owner to do those in the
app (⋯ → 釘選到個人檔案 / 封存). Don't use 從個人檔案網格移除 or 刪除 in their place. Close the tabs
you opened.

## 7. When the owner wants it different

Change the code, re-render stills, show them the sheet, then the video. Record what they
said and what changed at the end of this file (newest first), so the reasons stay.

## Changes

- 2026-11-23, later: on the owner's word, Winnie's carousel (12/3) and theater 3 (12/5) scheduled too — six posts queued, one every other evening to 12/5. Theater 3's caption names only what is live now (tap 共振, pick the passage), not readers seeing each other's picks.

- 2026-11-23: scheduled the next four (carousel 臣服練習 11/25, theater 1 11/27, carousel 活成一道光 11/29, theater 2 12/1, 20:00 each) with Instagram's own scheduling; Winnie's carousel waits for her yes; theater 3 waits for Wave 2. Carousels lost their week numbers (posting order isn't fixed).

- 2026-11-23: first real posts (write, kept, likes) through Claude in Chrome; the steps above are the ones that worked, and pin/archive turned out to be app-only.

- 2026-11-23, the owner's second look: the passage dialog follows the app as it is now (wide paper, no row
  blocks; the pick marked like the card page marks a passage — a soft wash under its words and a check),
  the card page's bar runs the column's width (kit `segmentedBar` `pad` / `width`), the header rule is grey,
  tags end in the bookmark. Big quotes lose their full stops (the copy rule), on reels and carousels.
  寫一張故事卡's audiences became four roomy rows (icon, name, what it means) instead of the publish step's
  bar + line + card + button crowded together — imitating the app's screen is not the point when it crowds
  the frame. Theater 1: the ball stays in the mitten through the wind-up, leaves just past the top of the
  swing on a real parabola (`arc` at an even pace), and the miss flies the way the arm threw it.

- 2026-11-23: local ACE-Step beds for the three reels and the theater (make.ts `--music`), the 小紙團劇場 series merged from ig-theater.

- 2026-11-23: 小紙團劇場, three episodes (theater-1 寫不出來的晚上，也算數, theater-2
  有人讀到你了, theater-3 原來你也被這段話留住) on the real puppet engine, stepped by the
  reel's time; sound cues only until ACE-Step's weights finish downloading.

- 2026-11-23: first version. Reels rebuilt from the owner's "too rough" on the first try:
  references watched (Slowly, mymind, Letterboxd), big words, torn-paper cuts, a bigger
  phone, puppets; then evened out on the owner's note that the top must not be crowded.
