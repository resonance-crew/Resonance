# Critique of the five landing directions

Written after critic-own.md, which reached the same core diagnosis independently: the page has the SaaS
*grammar* under a special *surface*, it never shows the one verb that makes Resonance different, it tells no
story, and the puppets borrow ledges from a layout that gave them no ground and no job.

**The first thing to say:** all five proposals, and my own, landed on the same picture: **two cards joined by the
brand's three pen-waves**, with puppets performing the link (read → write → resonate / hand over a note). That
convergence is the real finding of this round. The idea is settled. What the five differ on is *how the visitor
meets it*: told to them as a scroll story (Picturebook, Theatre), handed to them as an object (Desk), set for
them as reading (Editorial), or done by them (Answer). The three prototypes should split along those lines, and
should not be five variations of "hero + two linked cards".

Scores are 1–10 on: **Complaint** (answers "not plain / not SaaS") · **Puppets** (built for them) · **Brand** ·
**5 s** (clarity in five seconds) · **Phone** · **Feasible**.

---

## 1. 在書縫相遇 Picturebook

**Strong**
- It has the clearest single device of the five. The gutter is the distance between two strangers: a thread
  crosses it on page 4 and the two meet *on* it on page 5. The puppets are the reason the layout has a fold.
- **The heart that unfolds into a card** is the best "no likes, answer instead" image any of the proposals has. It
  says the whole positioning without a word. Every direction should take it.
- Sticky sheets that slide over each other are pure CSS, need no JS and don't hijack scroll. "Scroll turns the
  page; the puppets keep their own time" and "every page ends on its printed picture" are the right rules.
- The blank last page with `BlankPal` as the visitor, and the night back cover that gives the dark footer a
  reason, are both good.
- The cut order is honest and the engine additions are listed.

**Weak or risky**
- **Phones.** A 390 screen split into two 195 px half-pages, each holding an 80 px puppet beside a ~150 px card,
  is cramped. Each sheet is `100svh`, so en text at about 1.4× and a 320 px phone can overflow a sheet that cannot
  grow. iOS toolbar resizing and `svh` inside stacked sticky sheets need device testing. The book adds about six
  screens before the first real story, on the device most visitors use.
- **Tone.** A fiction about puppets, framed as a picture book, pushes the brand toward children's content. The
  real cards on the site are about stoicism, stuttering, Wittgenstein and FOMO. Real stories wait until after five
  spreads of make-believe.
- The vertical h1 duplicates Editorial's bet and slows the 5-second read on the cover. The cover plate (two
  fictional cards and a thread) is good; the vertical title is not needed here.
- **Cost.** A directed-scene API, a hold mode, settle-to-still, new still poses, five plates and GSAP with
  MorphSVG. That is 15–18 days, and I would expect more.

**Scores:** Complaint 9 · Puppets 9 · Brand 6 · 5 s 7 · Phone 5 · Feasible 5

## 2. 書桌 Desk

**Strong**
- It has the best founding rationale of the five. Cut-out animation is shot top-down on an evenly lit table:
  that explains the *no-shadow rule*, the *12 fps*, and why gravity is "down the screen". The rule "what your hand
  moves is smooth; what moves on its own moves in stop-motion" belongs in whichever direction wins.
- The hero shows a **real** resonance pair (B answered A) with the annotation 「這張卡片，回應了那個故事」. That is
  the product, shown with real content, inside the first screen on desktop.
- **Pulling the two stories apart and feeling the waves stretch** is the most GSAP-site moment in the set, and it
  is the one the owner's references point at.
- 牽牽 bringing a note addressed 「給：第一次來的你」 is a lovely piece of casting: the tag's blank 「給：」 finally
  gets a name, and the name is the visitor's.

**Weak or risky**
- **Its best interactions are for a mouse; the most common visitor has a thumb.** On a phone the pair is stacked
  diagonally, the drag is x-only, and the scatter becomes a strip. The signature mostly isn't there.
- **It is the most expensive by far: about 21 days.** It needs per-object stages whose layer sits inside a
  transformed card (the inverse-transform viewport), plus new `ride`, `offer` and resonate-at-a-distance
  behaviour. On top of that come Draggable, Inertia, Flip and DrawSVG, three fold layouts for the note, and the
  dog-ear 3D flip. Most of that cost buys desktop delight.
- **Data and privacy.** It reads beyond the six cards (the original of the newest resonance) without flagging
  that as the owner's call, as Editorial does. The card back's 「這個故事收到 {n} 個共振」 needs `resonanceCount`,
  which `LANDING_CARD_FIELDS` does not read. A public count is a like-proxy, against the brand's own stance, and
  「還沒有人回應它」 on the landing page is a sad signal.
- **LCP.** Two real cards with covers in the desktop fold are likely to take LCP from the h1 (a remote R2 image
  larger than the text block). The hero cards need small covers, or no cover.
- **Content risk.** The pair is whatever the newest resonance is. The owner pin helps, but the default could
  be weak.

**Scores:** Complaint 9 · Puppets 8 · Brand 8 · 5 s 8 (desktop) / 6 (phone) · Phone 5 · Feasible 4

## 3. 對頁 Editorial (Facing Pages)

**Strong**
- **「第四個字」, the fourth character.** The column 用故事 is one cell short of 回應故事, and a puppet stands in the
  empty cell as the missing character. It is the single best "designed for the puppets" idea in the round,
  because the room for the puppet is *drawn into the type*. When the puppet hops, the headline **ripples** in
  ink weight. That is resonance happening to the brand's own words, and it is cheap and true to the name. Noto Serif
  TC is variable in `fonts.ts`, so animating its weight fetches nothing new.
- It shows stories as **words, not widgets**. Titles in Ming, a first-sentence pull quote, rows ruled by hand.
  It reads the most like a reading product, and the phone loses about 2,000 px of near-identical cards.
- Fixed geometry (cells, gutters, rules) replaces measuring glyph ink. That makes it the easiest of the five to
  test and to maintain.
- **The most feasible.** It is mostly CSS scroll-driven animations, one ~4 KB Motion call, and no new acts. Its
  degradation story is the cleanest of the five.
- 「本期編輯部」 (each puppet credited with a job) explains the cast after the fact, and links to /paper-pals.

**Weak or risky**
- **It risks austerity.** No colour bands, one blob, ink on cream. Restraint is good, but the brand is 70/30, and
  this is closer to 90/10. A literary-magazine page is also a known genre on godly and land-book. It is not SaaS,
  but it is not unique to us either. The warmth has to come from the puppets and a little colour.
- **On phones the puppets shrink to marginalia.** The margin track is 0 there, so outside the cover cell they
  live only in dinkus rows. That is quieter than the brief wants.
- **The running head's date** (「本期 11 月 9 日」 from the newest card) shows staleness on a slow week
  (「本期 10 月 2 日」). Drop the date.
- **Privacy bug.** 「…和一位不署名的作者」 counts *authors*. The landing read blanks `authorId` on anonymous cards,
  so it can't know whether two anonymous cards share an author. If it ever could, "one" versus "two" would tell
  readers that two anonymous cards are by the same person. Count cards, or don't count at all
  (「…和不署名的作者」).
- The vertical h1 is the boldest bet. It splits zh and en into two compositions, and its en parity (Tuck in a
  one-cell indent) is weaker than the zh. Test it at 320 px and at 200 % zoom.
- Animating `font-weight` re-lays out text on every frame (it is not compositor-only). That is fine for seven
  glyphs, but say so.

**Scores:** Complaint 8 · Puppets 7 · Brand 8 · 5 s 7 · Phone 8 · Feasible 8

## 4. 紙劇場 Theatre

**Strong**
- **The one rule is right: content, then a puppet lane, then a floor; puppets stand on floors and set pieces,
  never on words.** It answers "bolted on" directly and could be lifted into any direction.
- **Day → night across the page** gives the existing cream → terracotta → near-black ramp a meaning. 悄悄's night
  band with a Hush-shaped hole in the sky is a lovely detail.
- **The answer scene.** A sticky stage with three beats scrolling past it, cues and never scrubs, and a three-panel
  comic as the JS-off / reduced-motion / short-screen fallback. It is the most robust telling of the mechanic
  of the five, and it is what I proposed myself.
- **The kamishibai.** One real story at stage size, with the rest as a fanned stack. It is a good answer for
  phones (native scroll-snap, nothing auto-advances).
- **"Scroll is the stage manager: it calls cues, never scrubs a puppet."** Correct.
- GSAP is held as an escape hatch, not the default.

**Weak or risky**
- **Kitsch.** A proscenium, drapes, a valance, a sun, far and near hills: the set takes over. The page becomes an
  illustration with UI inside it, the 70/30 flips, and on a phone the "pillars" are the 16 px gutters (so in
  effect nothing). The proposal names the theme-park risk but keeps every set piece. Cut most of the set and keep
  the floors.
- **The hero shows no story.** The 5-second read rests on the h1 and a stage set.
- The answer scene is about 210 svh on a phone. It is native scroll, but long.
- The kamishibai hides five of the six stories (mitigated, but real).
- The illustrative cards in the answer scene are honest, but they lose Desk's and Editorial's "this really
  happened here".
- **Cost:** about 20 days, mostly set art (the proscenium kit, layered flats, sun, moon, stars, the hole).

**Scores:** Complaint 8 · Puppets 9 · Brand 6 · 5 s 6 · Phone 6 · Feasible 5

## 5. 換你說 Answer (Your Turn)

**Strong**
- **It is the only proposal where the visitor *does* the verb.** Doing it once may explain Resonance faster than
  any picture. Typing a line and tapping 回應 makes your line flip into a card, a thread draw, 聆聆 fold it and
  牽牽 carry it. It needs no account and nothing is stored.
- **Its conversion path is real, not a demo.** 寫完這張卡 opens the writer *as a resonance to that very card*, with
  the line seeded through `writeSeed` (sessionStorage, never the URL). The JS-off form opens the story's real page.
  This is the only direction whose interaction pays off as an actual card being written.
- **The thread.** The pen wave under 回應 runs on into the thread that spans the page. It is cheap, it means
  something, and every direction should take it.
- **The casting is the most careful of the five.** 聆聆 nods while you type, 牽牽 carries the note. It is gentle by
  design, with no hops on a desk where the story may be about grief. 摺摺's `reveal` happens at the moment the CTA
  band's corner lifts.
- The honesty line (「只是試試看，不會發布、也不會送出」) sits *before* the button.

**Weak or risky**
- **The answer card risks reading as a comment box, which is the very thing Resonance is not.** A one-line field
  in the chat composer's capsule, under someone's story, is what a comment section looks like. The product's point
  is "a *card* of your own". The answer page has to look like the start of a card (a blank card with a title-size
  Ming line and paper), not like the chat composer.
- **No badges in the phone hero.** It relies on the Smart App Banner, which is iOS Safari only. Android, and the
  in-app browsers of LINE, IG and Threads where share links open, get nothing. "Get the app" is the brief's first
  path. Keep the badges in the phone hero.
- **LCP.** The featured story card with "cover preferred" sits in the fold, and its cover image can take LCP from
  the h1. The hero story should go without a cover, or with a small one.
- **Most phone visitors won't type.** The chips are what make it two taps (chip, then 回應); the design should lead
  with that and not with the keyboard. The keyboard and `visualViewport` handling on iOS is real work, and the
  field must be 16 px or larger, or iOS zooms on focus.
- **The ethics of the featured story.** A stranger's real story gets a pretend answer. That is fine with the
  honesty line, but the selection rules (listed, length at least 120, an owner pin) are needed from day one, not
  later.
- **The CTA band stays terracotta with two buttons.** The fold corner and Tuck save it, but it is the most
  template-like of the five closings.
- **The desktop clothesline** is a horizontal scroller with drag-to-scroll, which hides cards on the device that
  has room to show them.

**Scores:** Complaint 9 · Puppets 8 · Brand 7 · 5 s 8 · Phone 7 (with the fixes) · Feasible 6

### Summary table

| | Complaint | Puppets | Brand | 5 s | Phone | Feasible |
|---|---|---|---|---|---|---|
| Picturebook | 9 | 9 | 6 | 7 | 5 | 5 |
| Desk | 9 | 8 | 8 | 8 / 6 | 5 | 4 |
| Editorial | 8 | 7 | 8 | 7 | 8 | 8 |
| Theatre | 8 | 9 | 6 | 6 | 6 | 5 |
| Answer | 9 | 8 | 7 | 8 | 7 | 6 |

---

## 6. The three to prototype now: told, read, done

These three differ **in kind**, not in degree. In the first the page tells you the story, in the second it sets
real stories for you to read, and in the third you do the thing yourself. Each makes the same core idea (two
cards linked by the waves) land in a different way, so the owner sees a real spread of options.

### A. 換你說 "Do it" — Answer, with Desk's tactility at the edges

*Why:* it is the most direct expression of 用故事回應故事, its payoff is a real card being started, and it works on
a phone.

Changes before building:
1. **The answer page is a card, not the chat capsule.** Draw a blank card (`HandDrawnDashedBorder`) with one
   title-size Ming line, 「這個故事讓你想起什麼？」, and a solid 回應 fill below it. Keep the chips; they become
   the main path on a phone (tap a chip, then 回應).
2. **Keep the badges in the phone hero**, in a row under the subtitle. The desk starts after them, and the story
   card's top sits at the fold with the two puppets on the answer card just under it.
3. **The hero story is shown without its cover** (title and passage in the reading type), so the h1 stays the LCP.
   Selection rules and an owner pin (`config/landing.featuredCardId`) are in from the start.
4. Graft from Desk: the **stop-motion rule** for everything the page animates on its own, and B's
   **"placed on the desk" settle-in**. Use **Picturebook's ♥ → card** as the idle hint over the empty answer card
   (a heart that refuses to be a heart), so a visitor who never types still gets the point.
5. **Cut:** the 「回應這個 ↑」 swap, the thread's sag, and the clothesline on desktop (use a two-row bottom-aligned
   shelf there, as in Picturebook; keep the swipe row on phones).
6. **Replace the terracotta CTA band** with the night ending (§8): 摺摺's corner-lift can happen on the night
   band's wave instead.

### B. 對頁 "Read it" — Editorial, warmed up

*Why:* it is the calm, typographic, real-content option, the most feasible, and the best on a phone for reading.
「第四個字」 plus the ripple is a signature nobody else has. It is the safe-but-distinct option the owner should see
next to the bolder two.

Changes before building:
1. **Keep the vertical h1, the fourth-cell puppet and the ripple.** That is the bet. Prototype en at the same
   time, so its parity is judged and not deferred.
2. **Drop the date** from the running head (stale weeks), and on phones drop the running head entirely. **Fix the
   author-count wording** (§3).
3. **Put warmth back.** Add tiny cover thumbnails in the contents rows where a card has a cover (no
   placeholders), one `DriftingBlob` per section where there is room, and the **night footer band with 悄悄**
   instead of the stock dark one.
4. **Graft Desk's pull on the spread, desktop only.** Page B can be dragged a little away from page A, the gutter
   waves stretch, and it hops back in stop-motion. That gives the calm direction one tactile moment on mouse
   devices, at roughly 1.5 days of cost and nothing on phones.
5. **Phones need more puppet presence.** Let Pip sit on the top of the contents rule rows, and keep the meet strip
   under the stacked spread at full width (unit 80).
6. **Cut:** the reading strip and the handwritten face (use Ming light in pencil grey).
7. **Keep:** the blank ruled last page with 聆聆, and the colophon.
8. **The pair read needs the owner's OK.** Prototype it with two of the six faked as a pair, and keep the
   "section omitted if no pair" rule.

### C. 一天的戲 "Told" — Theatre's floors and day → night, with Picturebook's beats; no proscenium

*Why:* it is the scroll-story option. The page is directed for the puppets from top to bottom, which answers
"they were added later" most completely. It is the most "motion site" of the three.

Changes before building:
1. **Cut the set:** no proscenium, drapes, valance, sun or hills. **Keep:** the lane-and-floor rule (every
   section ends on a drawn pen floor, and puppets stand only there or on set pieces), and the
   **day → night paper ramp** across the sections.
2. **The hero** is Picturebook's cover plate on a floor: the h1 horizontal (not vertical; that is B's bet), the
   subtitle stating the mechanic, the badges, and beside or under them two small *fictional* cards with the thread
   and waves, 摺摺 and 點點 standing on the floor. The puppets are stills in the HTML that come alive on idle.
3. **The answer scene** is Theatre's single sticky stage with three beats, not Picturebook's five full-screen
   sheets with folds (which don't work on a phone):
   ① 讀一個故事 (聆聆 reads)
   ② 不按讚，寫一張回應 (**♥ unfolds into card B**: a crossfade first, MorphSVG only if the crossfade disappoints)
   ③ 兩張卡片，從此相連 (the waves draw; **the two meet at the gutter between the cards** and hand over the note,
   which is Picturebook's finale as the last beat)
   Cap each beat at about 60 svh on phones, and keep the comic fallback.
4. **Real stories:** the kamishibai on phones (a snap row with the stack's edges showing), and Picturebook's
   bottom-aligned shelf on desktop. Real stories come right after the hero, *before* the answer scene, so real
   content is in the first two screens.
5. **Ending:** the night band with the Hush-shaped hole, `BlankPal` under a blank card (「最後一頁，留給你」 →
   寫下你的故事), 「晚安……再說一個就好 →」 /home, and the footer merged into the same night.
6. **Engine:** `mountScene` with section ledges, plus `cue()`. The wing entrance is optional (a side walk-in
   clipped at the section edge is fine). Hold settle-to-still back unless the hand-off visibly jumps.

**Not picked: Desk.** Its ideas are the best-argued in the round, but it costs the most, its signature needs a
mouse, and its real-pair hero overlaps B's spread. Its best parts go into A and B (the stop-motion rule, the
stretch-pull, the settle-in) and into the cross-cutting list (Twine's note 「給：第一次來的你」).

---

## 7. Cross-cutting: belongs in whichever direction wins

- **Two cards joined by the three waves is the picture of the product.** The logo is the link, so use it as the
  link everywhere the mechanic is shown.
- **The ♥ that becomes a card.** This is the positioning in one gesture.
- **Puppets get ground, never words.** Floors, lanes, cells and card tops are drawn into the layout. Nobody stands
  on the h1 (the LCP) or on any line of text. Each section is cast by meaning, with one home per character:
  摺摺 reads or shares, 聆聆 listens and writes, 牽牽 carries the note, 點點 looks among the stories, 悄悄 is the
  night and the "one more". The random ledge picker and glyph-ink measuring retire from the landing; each section
  gets its own stage (the `mountPalStrip` / `titleScene` pattern), with at most one or two live sections at a time.
- **Stills in the server HTML** (`PaperPalStill`) so the puppets are there in the first second, come alive on
  idle, and settle back.
- **Motion rules:** scroll scrubs paper (lines, threads, waves), never puppets. What the hand moves is smooth;
  what moves on its own is stop-motion at 12 fps. Puppet scenes are cued and play in their own time.
- **The pen wave under 回應 continues into the thread** that links the cards.
- **A night ending.** 悄悄's band takes in the CTA and the footer, with 「晚安……再說一個就好 →」 linking to /home.
  The dark footer gets a reason, and the terracotta two-button band retires (keep terracotta for the solid write
  button).
- **A blank card or blank page with `BlankPal` as the write CTA:** "the last page is yours".
- **Copy:** the subtitle says the mechanic in plain words (「不必按讚，寫一張自己的卡片回應它」-style). The hero's
  ✦ pill eyebrow goes. The four-initials proof row goes, or moves to the end beside the write CTA. No full stops.
- **Stories:** no grey placeholder covers (a card without a cover is type only), quotes in the reading design's
  type via `storyType`, and on phones a native scroll-snap row instead of six stacked cards (about 4,000–6,000 px
  saved).
- **Featured-card rules,** if any card is featured: listed, not thin, a minimum excerpt length, cover optional,
  and an owner pin in server-only config.
- **Pause control in the brand's voice:** 「讓小紙團休息 / 叫醒小紙團」 (`aria-pressed`, try/catch storage).
- **Tech:** CSS scroll-driven animations first (`@supports`, motion-safe), with a static final state as the
  fallback. One animation library at most: GSAP core with DrawSVG, and Flip where a DOM move is needed. Load it on
  idle or on intent, never before paint. Motion only if nothing needs GSAP. No ScrollSmoother, no snap-jacking,
  no pin longer than one short sticky stage.
- **Tests:** per-section mark/ledge tests (as `marks.test.tsx`), new `npm run visual` screen ids for the
  landing's states, and a check at 320 px in en.

## 8. Contradictions with the brief's hard constraints

1. **LCP (Desk, Answer):** real covers in the fold can take LCP from the h1. The hero cards must go coverless or
   be capped small.
2. **"Get the app" path (Answer):** dropping the badges from the phone hero leaves Android and in-app browsers with
   no way to the app in the first screen.
3. **Privacy:**
   - **Editorial** counts anonymous *authors* in a sentence. It can't know that count, and if it could, it would
     link anonymous cards to each other.
   - **Desk and Editorial** read the original of a resonance beyond "the 6 latest cards". That is public on the
     card pages, but it is outside the brief's stated scope, so it is the owner's call. Editorial says so; Desk
     doesn't.
   - **Desk's** resonance count is not in `LANDING_CARD_FIELDS`.
4. **Phone ≥ 320 first-class (Picturebook):** `100svh` sheets with fixed text areas and half-width spreads will
   overflow or crush at 320, and in en.
5. **"Motion is enhancement":** all five respect it on paper, with stills and final states in the HTML.
   Picturebook and Theatre must make sure the reduced-motion "printed book" and comic fallbacks are the same
   content, not a lesser one. Both say so.
6. **No shadows:** none of the five breaks the rule. Theatre's "spotlight" and Desk's "lamp" must stay flat fills,
   and Desk's 3D flip and Answer's flips must not pick up a `box-shadow` or `filter: drop-shadow` for depth.
7. **WCAG 2.2.2:** every direction proposes a pause control. Picturebook ties its pause to each page, which is fine.
   Editorial's ripple is short and doesn't need one, but its live puppets do (it has one).
8. **No new characters or redraws:** `BlankPal` already exists (/paper-pals). Theatre's Hush-shaped hole reuses
   the torso image as a mask. Picturebook's "new still poses" (mirrored, holding the note, blushing) are poses,
   not redraws. That is acceptable, but it is engine and still work to count.
