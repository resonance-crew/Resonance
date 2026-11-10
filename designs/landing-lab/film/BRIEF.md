# The landing film — brief (round 2 of the landing redesign, 2026-11-09)

## What the owner asked (verbatim, dictated Chinese)

After seeing the three prototypes (A 換你說, B 對頁, C 一天的戲 — `designs/landing-lab/prototypes/`), the owner wrote:

> 我想我明白現在自己喜歡的提案是怎麼樣子的。我想我們這一個故事的平台，因為我們已經有小紙團的這些 IP 們，然後它的敘事性、故事性都很強。如果不想要流於庸俗的話，我們可能就不能使用這種傳統的介紹方式。我想到應該是一個有點像是動畫的方式，互動式的動畫。它有一個場景，當然這個場景我現在的想像還是有限的，但我首先就是想到這個。Alto Adventure 這一款遊戲，它的這一種場景的設計，我覺得好像這一種感覺吧，它用很多層，然後這個特別適合作為我們這個故事的背景嗎？當然，它的這個風格跟我們可能有一點點不一樣，所以這個要看我們素材在生成的時候要怎麼樣子來些微的做調整。然後我們可能也不完全是在戶外，或者是這一種場景，但是呢，感覺就是這種多層的，然後可以用這個顏色做出遠近，然後讓我們的小紙團在前景可以比較明顯的這一種感覺，我覺得還不錯。
>
> 所以互動式的動畫可能是，就是有一個小紙團，他在寫卡片，然後他寫好之後呢，這個卡片會拋出來讓大家看到。那他這卡片樣式就會是我們的這個平台的這個卡片的樣式，會跳出來這樣子。然後另外一個小紙團就開始跟他互動啊，等等的，然後後面的場景會變化。我覺得可以考慮要不要讓他們會說話。我覺得用那種文字泡泡雲說話的話，好像又會顯得我們這個沒辦法讓使用者直接透過動畫就了解到我們這個平台要做什麼。我覺得他寫完的卡片可以浮出來讓大家看。那如果使用者點擊，或許就可以直接跳到那張卡片。那他寫的卡片呢，就是從我們平台現在現有的文章裡面去挑出來。可能這個，譬如說有共振的文章啊，譬如說他的體悟的指數很高的文章啊之類的。
>
> 那我覺得要設計一個故事，做成這種非常精美的動畫，然後非常沉浸式，非常有這一種我覺得可以有這種奇幻色彩在裡面，因為每一個人都是自己故事裡面的主角嘛，也就象徵著來到我們平台的這些使用者，他都能夠在這裡清楚自己的定位，展開他自己的冒險，就像這個 Alto Adventure 這種奇幻傳奇的感覺。所以我希望這個畫面、美術風格、顏色的這一種設計，也可以傳達出這個感覺。那使用者一看就知道，他甚至不用閱讀文字。那我們可能也要加一些非常簡單的、簡潔的這種按鈕嘛，讓它可以快進或者是回退那個動畫的進度嘛。這部分想請你幫忙思考設計一下，就是譬如說這個動畫播完之後，我們要顯示什麼？可能是全部的文章嗎？或者是什麼東西？或者是像是原本的 footer 的這樣子的設計嗎？或者是怎麼來做呢？就變成這個網頁，它可能不是透過這種垂直滾動的設計了。當然要使用 GSAP 把使用者的滾動加入到這個進度的控制，我想也可以考慮來做看看，或者是直接使用這個按鈕呢？

Then, a minute later:

> 我想要補充場景在轉換的時候，我在想可以做一個動畫，或許可以用這個視差滾動嘛，讓這些東西這樣子滾上去，然後換到下一個場景之類的。

And then:

> 然後這個場景也是有，譬如說黃昏啊，然後藍天的時候啊，然後這個傍晚的時候、晚間各種的時間的場景可以來做變化，會更有感覺。

So the scenes change through the times of day — dawn, blue-sky day, golden late afternoon, dusk, evening, night —
each its own palette and light; the passing of the day is part of the story's feeling.

The reference picture (a still from the game *Alto's Odyssey*, the owner's screenshot) is at
`/private/tmp/claude-501/-Users-ncchen--claude-spares-spare-pZgTcm/84b65950-01bf-4833-b134-c3a6994644eb/scratchpad/reference-layers.png`
— look at it. Many flat silhouette layers; each farther layer closer to the sky's colour (atmospheric perspective);
a gradient sky with a big low sun disc; stars, birds, balloons as small particles; the foreground darkest.

**Take the technique, never the look.** We are not recreating that game (no snowboarding, llamas, its desert city, its
domes, its silhouettes, its logo, its music). We take: layered depth by colour, a big simple sky, a time-of-day cycle,
small drifting particles, the protagonist small but legible in a vast world. Our idiom is the 小紙團's own: torn and
cut paper with its fibre rim, mottle and grain, pencil and crayon, the brand's OKLCH palette — a world made of paper.

## What this round must answer

1. **The story**: a short script (scenes, beats, roughly how long each plays) that a visitor understands *without
   reading*: a 小紙團 writes a card → the card comes out and floats up as a real platform card (tap → its card page)
   → another 小紙團 receives/reads it and answers with a card of its own (that is what 共振 / "answering stories with
   stories" means) → the two connect → the world changes around them. Fantasy and adventure: each visitor is the
   protagonist of their own story. No speech bubbles: the cards are the words.
2. **The art**: the layered world in paper — the scenes (indoors and outdoors are both allowed), palettes per scene and
   time of day (OKLCH), how depth is made by colour, how the 小紙團 stand out in the foreground, the particles, light.
   Light and dark colour schemes.
3. **Scene changes**: the owner's ask — layered parallax: the current scene's layers slide upward at different
   speeds and the next scene's layers rise from below (or a variation that keeps that idea).
4. **Control**: scroll-driven (GSAP ScrollTrigger: the scroll is the film's progress) and/or buttons (play/pause,
   back, forward, skip). Decide and justify; both may coexist.
5. **The end**: what the visitor sees when the film is over — all the stories? a night sky of cards? the footer?
   replay? — and where the download badges and 寫下你的故事 live.
6. **The cards**: the selection rule from real data (see Facts) and what happens with today's thin data.
7. **Every device**: desktop, tablet (both orientations), phone portrait (the most common visitor), both locales
   (zh-TW, en), reduced motion, Save-Data, keyboard and screen readers, the first paint (LCP) and the size budget.

## Facts (checked 2026-11-09)

- **Production data**: 18 public, published cards. **Zero public, named resonance pairs** (every `resonanceCount` is 0).
  Every listed card has a cover (`media.url`, a WebP on img.resonance.channel). All are zh-TW originals (some have
  `translations`). Each indexed card has `signature.insightScore` (0–1) — the owner's 「體悟的指數」: 15 cards score
  0.84–0.96 (top: 〈湖中央，我看見了知行合一〉 0.96, 〈換我坐副駕駛〉 0.95, 〈重新理解一句話〉 0.92,
  〈Let's Enjoy Me Time! 🌿〉 0.92, 〈錢是什麼？〉 0.91…). The signature is server-only: it may decide what the page
  shows, but must never be serialized into the page's HTML (`latestForLanding` strips it — keep that rule).
  The recommender's vector store can find the nearest card to a card (`src/lib/recommend`; the card page's
  `related` list) — a real "this story answers that one" relation even without a resonance.
  The reader `.lab-tmp/pairs.ts` (untracked, read-only) shows how to query production from this worktree.
- **The puppets** (CLAUDE.md "Landing stage"; `designs/mascots`, `src/lib/mascots`): 摺摺 Tuck (dog-ear paper,
  `tuck`), 牽牽 Twine (a 「給：」 tag, `tag`), 聆聆 Nod (a card, the listener, `card`), 點點 Pip (a dot / notebook,
  `dot`), 悄悄 Hush (navy night paper, stars, a lantern, `night`). Form rules: no skin tones, necks, mammal ears;
  short arms are the owner's ask — never lengthen them.
- **The sticker kit** (`designs/stickers/kit`, README in `designs/stickers/README.md`) is a deterministic puppet
  theatre: a scene is a **pure function of time** — `frame(t, cast, props)` poses every puppet and places every prop.
  Same rig and DOM as the site's puppets. Moves: breathe, blink, lookAt, nod, bow, hop, wave, reachTo, moved, hold;
  props: heart, note, card (`lines`), scribble, wave (the brand's ≋), lantern, sun, star, sparkles, strokes, zz,
  panel, ground… 12 fps stop-motion (`snap`, `step`). A pure function of t means a scrubbed scroll, rewind and
  fast-forward all work for free. The engine (`src/lib/mascots`) has walks, climbs, pops, acts
  (read, write, wave, point, beckon, nap, twinkle…) and the `note` duet, but it is an ambient random director.
- **Brand rules** (CLAUDE.md "Design System", "Copy", "Phone, tablet and Mac"): tokens in `src/styles/tokens.css`
  and `src/lib/design/palette.ts`; hand-drawn pen lines at INK / INK_LIGHT / INK_STRONG; **no shadow on any UI** (the
  puppets' and props' paper may keep the glue shadow their art draws); the official store badges unmodified;
  copy without a full stop on one-sentence strings, subtitles and the footer. Hero line: 用故事回應故事 / "Answer
  stories with stories" (on local main, commit 37817f0a).
- **Libraries**: GSAP 3.15 (ScrollTrigger, Observer, MotionPath, DrawSVG — all free) and Motion 12 are installed in
  this worktree. Earlier prototypes: A used GSAP lazily (~40 KB gzip), C used CSS scroll-driven animations only.
- **Earlier prototypes' lessons** (`designs/landing-lab/prototypes/*/REVIEW.md`, `proposals/critique.md`):
  the first screen must say what this is on a phone too; a sticky scroll scene needs a pause and a printed fallback;
  stills in the server HTML, the live stage on idle; puppets stand on drawn floors, never on words.

## Where the work goes

The worktree `/Users/ncchen/Documents/Resonance-landing`, branch `landing-lab` (not main; nothing here ships).
A new lab route `/{locale}/lab/landing/film` beside the others (`src/components/lab/landing/`, `registry.ts`,
`labRoute.tsx`). Dev server: `npx next dev --port 3200` in the worktree. The lead's own proposal is `LEAD.md` here.
