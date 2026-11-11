# Landing page redesign — shared brief (read all of it)

## The owner's words (2026-11-09, dictated, verbatim — this is the task)

> 重構首頁介面在思考啊，现在的首页啊、呃，看起来会让人有一种非常普通的感觉。我们的 UI design 很特别，但是我们的首页的排版啊，就是很普通的这一种，SaaS 服务，甚至是那种啊、呃，就是最基本的那种版面。不知道为什么，我在想，请你帮忙重构这个首页的这种排版。和设计是不是有一些办法？或许不单纯是排版而已，想请你提出几个方案。来看一下，怎么样子？来重新设计，并且因为现在画面上有一些小纸团啊，我们的这个品牌的吉祥物，会出现在页面上，但他们是后来加入的，他们是为了适应原本的界面。而不是这个界面就是为他们设计的，所以现在看起来会感觉也不是那么合适，可能也是这个原因。
> …我在想你可以想几个设计，然后我们来看怎么样的版面配置，怎么样的设计会比较好。当然，你也可以使用像是，GSAP 或是什么 Motion (https://motion.dev/) 来制作出这个比较有特色的我们的官网 (https://gsap.com/)。…当然我们的首页还是要走我们这个风格，可是在于互动设计排版上，或许我们可以参考这些。
> 我想你也不要被我们现在官网的这个排版和给限制住了，还有现在这个设计，哦，我们的也一样可以保留这样设计的风格和元素，但是对整个版面和操作的行为来做新的发想，我想这是可以的。

Reference galleries the owner pasted (optional to browse; JS-heavy sites may not fetch): scrolltide.co (scroll-driven templates), styles.refero.design, supahero.io (heroes), navbar.gallery, cta.gallery, footer.design, land-book.com, godly.website, landdding.com, recent.design, 60fps.design, motionsites.ai.

Already done (do not redo): the hero line is now **用故事回應故事** (回應 is the accent word with the pen-wave underline; en "Answer stories with stories", "Answer" accented — the App Store slides already use exactly this). Subtitles and the footer carry **no full stop** at all (zh no 「。」, en no "."), however many thoughts — join with a comma, dash or semicolon.

## What the page is for

Resonance（共振）: people write real-life "story cards"; when a story moves you, you do NOT like it — you answer it by writing a card of your own that *resonates* with it (the two cards are linked; if yours is public and named, the author is notified and you two are connected and can message). Notes (小紙條) can be left for an author. Native apps on iOS, Android and Mac; the website is also a full reader/writer. The landing page (`src/app/[locale]/page.tsx`, signed-out visitors, zh-TW and en) must, within ~5 seconds, make a visitor feel "this is not another social platform", and then lead to: **get the app** (official App Store / Google Play badges; a QR code to /download for hover+mouse devices only), **read stories** (/home is public), **write** (/write; asks sign-in first).

Today's page (see the screenshots) is: centred hero (pill tag, big headline, subtitle, badges+QR, 4 team-initial avatars 「成為一群最早說故事的人」, two drifting blobs) → wavy edge → "值得閱讀的故事" 3×2 grid of the 6 latest real public cards + "瀏覽所有故事" → wavy edge → terracotta CTA band (寫下你的故事 / 先讀讀大家的故事) → dark footer (tagline, badges, trademark line, links, ©). The paper puppets were added later and visit "ledges" measured from that layout (sitting on the headline, peeking over cards, standing by the badges).

## Screenshots (Read these PNGs)

- Current landing, desktop full page: /private/tmp/claude-501/-Users-ncchen--claude-spares-spare-pZgTcm/84b65950-01bf-4833-b134-c3a6994644eb/scratchpad/shots/current-desktop-full.png (1440 wide) and fold: /private/tmp/claude-501/-Users-ncchen--claude-spares-spare-pZgTcm/84b65950-01bf-4833-b134-c3a6994644eb/scratchpad/shots/current-desktop-fold.png
- Current landing, phone: /private/tmp/claude-501/-Users-ncchen--claude-spares-spare-pZgTcm/84b65950-01bf-4833-b134-c3a6994644eb/scratchpad/shots/current-phone-fold.png, /private/tmp/claude-501/-Users-ncchen--claude-spares-spare-pZgTcm/84b65950-01bf-4833-b134-c3a6994644eb/scratchpad/shots/current-phone-full.png (390 wide @2x)
- The Paper Pals page (/paper-pals, built later *around* the puppets — bands per character, stills in the HTML, a title scene with all five busy round a story card): /private/tmp/claude-501/-Users-ncchen--claude-spares-spare-pZgTcm/84b65950-01bf-4833-b134-c3a6994644eb/scratchpad/shots/pals-desktop-full.png
A dev server runs at http://localhost:3000 (/zh-TW, /en, /zh-TW/paper-pals, /zh-TW/home, /zh-TW/about). Do not start or stop servers.

## The brand's visual language (keep it; reinvent layout and interaction)

Read designs/DESIGN.md §1–5 skim, src/styles/tokens.css skim. Key facts:
- 70% functional / 30% organic. Warm OKLCH pastels: cream paper `--color-cream`, `--color-cream-dark`, terracotta accent, lavender, sage, yellow, sky; near-black warm ink. Full dark mode through palette tokens (every colour is a token).
- Hand-drawn everything: wobbly rounded rects (`wobRect`, `HandDrawnBorder`), wavy section edges (`SectionEdge`), wavy pen underlines, blobs (`OrganiBlob`, and `DriftingBlobs` — live metaball blobs that drift and come to rest, at most one or two per section), sand grain (`ShapeGrain`). Stroke widths only from the "one pen" tokens INK / INK_LIGHT / INK_STRONG.
- **No shadows, ever** (owner's rule): nothing floats by a shadow; what floats is told by its pen line.
- Buttons are fills (solid / tonal), never outlines; an outline marks a container, a floating surface or an input.
- Type: Playfair Display + DM Sans (Latin), Noto Serif TC (Ming) + Noto Sans TC (Hei). Stories set CJK as Ming titles over Hei body.
- Store badges are Apple's/Google's official files, unmodified, at one visible height.
- Existing pieces to reuse: OrganicButton, TagPill, StoryCard / CardLinkGrid (real cards), PaperSheet, SectionEdge, OrganiBlob, DriftingBlobs, GetTheApp (badges + QR), StorytellerProof, PaperPalStill (a puppet standing still, drawn from its real part images, server-rendered), the reading-design story type.

## The paper puppets — 小紙團 / Paper Pals (the brand mascots)

Five cut-paper puppets with brads at the joints, short mitten arms (never lengthen), pencil faces; no skin tones, no necks, no mammal ears. Each has a personality (src/messages/zh-TW.json `pals.*`):
- 摺摺 Tuck — torn sage-green sheet, corner folded over a few hidden lines; shy, earnest, waves first. 「一起看嗎？」
- 牽牽 Twine — mist-blue gift tag, "To:" still blank, looking for that someone; gentle, polite. 「這個……可以給你嗎？」
- 聆聆 Nod — lavender index card, nods and writes down what it hears; warm, a good listener. 「嗯，我在聽」
- 點點 Pip — yellow hole-punch dot, only "ry" of "story" left, hops about looking for the rest; bouncy, curious. 「這是我的故事嗎？」
- 悄悄 Hush — a corner of a paper theatre's night sky, pinprick stars, a moon it cut itself; quiet by day, awake at night. 「晚安……再說一個就好」

The engine (src/lib/mascots, CLAUDE.md "Landing stage" and "The Paper Pals page") already does: entrances walk / pop / climb / rise / slide; acts read, swing, look, wave, stretch, hop, deco, reveal (Tuck lifts its corner), twinkle (Hush), point, beckon, lean, write (pencil), nap, duck; duets greet, **resonate**, **note** (one hands a folded note to the other: drawn to the chest, eyes shut, blush, a bow, carried off), five (high-five), shy (after 4 pokes); places ("ledges") are lines to walk along, edges to rise from behind, spots to stand/sit, peeks over/past a cover (clipped along a drawn outline); a stage can be told `visit({ledge, slug, acts, meet})` so a scene can be directed; puppets are tappable; stop-motion at 12 fps; stills in the server HTML that come alive when idle (`PaperPalStill`, `mountPalStrip`); reduced motion → stills only; Save-Data → none. Sizes: unit 120 px desktop / 100 tablet / 80 phone (Tuck's height). New *acts* can be added but each costs real work; new *characters or redraws* are out of scope.

## Hard constraints for any direction

- Server HTML is the finished page (SSR/ISR, `revalidate = 3600`); motion is enhancement. Every word, card, badge readable with JS off, with reduced motion, and under Save-Data.
- Phone (≥ 320), tablet, desktop (≥ 1024) and wide (1440+) are all first-class; a phone is probably the most common visitor (people arrive from the apps' share links and store pages). Touch has no hover.
- zh-TW and en (CJK line breaking; en words are longer). Dark mode.
- Performance: the headline is the LCP; no heavy JS before first paint; animation libraries load after paint / on idle. GSAP is now 100% free including every plugin (ScrollTrigger, SplitText, DrawSVG, MorphSVG, Flip, Draggable, Inertia, ScrollSmoother). Motion (motion.dev, v12: `motion/react`, `animate`, `scroll`, `inView`, layout animations) is also available. Native CSS scroll-driven animations (animation-timeline: view()/scroll()) are fine as enhancement. Scroll-jacking that fights the browser (wheel hijack, forced smooth scroll) is a red flag on phones; pinned scenes are fine if short and skippable.
- Accessibility: one h1; real text, not text in images; keyboard reachable; no motion that is required to understand the page; WCAG 2.2.2 (a pause control if something moves > 5 s and is not essential).
- Privacy: only what the latest-cards read already exposes (no author for anonymous cards).
- The landing reads the 6 latest public cards on the server; a direction may show fewer, feature one, or quote excerpts.

SCRATCH = /private/tmp/claude-501/-Users-ncchen--claude-spares-spare-pZgTcm/84b65950-01bf-4833-b134-c3a6994644eb/scratchpad
