# Critic — my own view (written before reading the five proposals)

## Diagnosis: why it reads as a plain SaaS page

1. **The skeleton is the 2019 template, block for block.** Centred hero (pill tag → H1 → subtitle → CTAs →
   "join the early ones" avatar row) → section header (pill → H2 → subtitle) → 3×2 grid → "browse all" button →
   coloured CTA band with two buttons → dark footer. Every block is centred, symmetric, one column wide, the same
   rhythm. The hand-drawn *surface* is special; the *grammar* underneath is generic, so the eye reads the grammar.
2. **The product's one idea is never shown.** The hero now says 用故事回應故事, but nothing on the page answers
   anything. Cards sit in a grid as isolated items (blog posts / products). The thing that makes Resonance not
   "another social platform" — a story answered by another story, the two linked, the people meeting — has no
   picture anywhere. The brand mark itself (three waves = two things vibrating together) isn't used as an idea.
3. **No narrative, for a storytelling product.** The page is a list of sections, not a story with a beginning,
   a turn and an end. Nothing changes as you scroll.
4. **Content density is wrong in both directions.** Desktop fold: one small centred column, ~60 % empty paper,
   two blobs filling the void. Feed: six cards in UI chrome (tags, avatars, read-time, arrows), half with grey
   empty cover boxes that read as loading skeletons. Story *words* — the best asset — are 13 px grey excerpts.
5. **SaaS tropes:** the pill eyebrow over every heading; the initials-avatar social proof (4 team initials is
   weaker than none); "瀏覽所有故事" pill under a grid; two-button CTA band.

## Why the puppets look bolted on

- **They borrow ledges; they were never given ground.** The layout has no floors, no gutters, no stage — so they
  perch on the H1 (competing with the LCP and crowding the words), stand in the badges' margins, peek over cards
  whose tops weren't meant as seats. On a phone they flank the headline in a 390 px column and press on it.
- **They have no role.** They wander in at random (ambient engine pacing), do a gesture, leave. Nothing on the page
  needs them; nothing they do says what Resonance is. Compare /paper-pals: each has a band, a floor line, a
  still in the HTML, a reason to be there — and it works.
- **They arrive late and from nowhere.** Client-only, after idle; the first 5 s (the brief's window) are mostly
  without them, then something pops in beside text. Stills in the HTML (as /paper-pals does) fix this.
- **Scale mismatch:** 120 px figures in a 1440 page of empty paper look like stickers, not inhabitants.

## My direction: "Answer" — the page shows one resonance happening, the puppets perform it

**Structure (one story in four beats, day → night):**
1. **Hero, asymmetric.** Headline 用故事回應故事 big at the start (left on desktop), subtitle, badges/QR under it.
   On the other side, a *stage*: one real latest story card on a drawn floor line, and a second, blank card
   leaning toward it — the answer not yet written — with the brand's three pen-waves between them. 摺摺 reads
   the first card (read), 聆聆 sits by the blank one with its pencil. Stills in SSR (PaperPalStill), alive on idle.
   Phone: headline + badges first (LCP untouched), the stage directly under, its floor at the fold's foot.
2. **The turn — "how it works" without a 3-icon row.** Three short scenes on one continuous floor line,
   scroll-revealed, each an act the engine already has: 讀一張故事 (read) → 寫一張回應 (write; the blank card
   fills with a real excerpt line by line) → 兩張卡連起來，你們相遇 (the waves draw between the two cards;
   牽牽 hands 摺摺 a folded note — the existing `note` duet). Captions are one line each.
3. **Stories, as words not widgets.** Not a 3×2 grid: one featured story set in the reading design's type
   (Ming title, a real opening passage at reading size), and the other five as a loose, slightly rotated
   scatter / shelf of smaller cards with drawn tops — explicitly designed as seats for 點點, who hops among them
   ("這是我的故事嗎？") — which is the read-stories CTA. No placeholder covers: a card without a cover is type-only.
4. **Night ending.** The page darkens into 悄悄's night band (the /paper-pals `data-night` band): 「晚安……再說
   一個就好」 → 寫下你的故事 (the write CTA) and the badges again; the footer continues the night, no separate
   dark slab. The day→night arc is the page's signature scroll feeling, and it costs one colour band.

**Puppets' role:** a cast with parts, not visitors. Each has a home on the page tied to an action:
摺摺 = reading (hero), 聆聆 = writing (the turn), 牽牽 = connecting (the note), 點點 = browsing (stories),
悄悄 = the invitation to write tonight (end). The layout reserves their ground: every section has a drawn floor
line and a gutter they stand in, never on the H1. Directed scenes via `visit({ledge, slug, acts, meet})`
started per section on view (as `mountPalStrip`), with stills in the HTML so they are there in the first second.
Tap = the existing poke. One or two alive at a time per section; nothing alive off-screen.

**Signature moment:** the pen-wave drawing itself between two real cards as you scroll, and the note changing
hands. It *is* the product's verb, drawn in the brand's own mark.

**Tech:** CSS scroll-driven animations (`animation-timeline: view()`) for the waves' stroke-dashoffset, card
slide-ins and the day→night tint — compositor-only, no JS, static final state where unsupported or under reduced
motion. The existing engine for the puppets (no new characters; maybe one new act at most). GSAP not needed;
if a scrubbed sequence must be exact across browsers, GSAP ScrollTrigger loaded on idle, desktop only, no pinning
longer than one viewport, none on phones. Motion (motion.dev) adds little over CSS here — skip it.

**Risks I'd watch:** the "turn" must read with JS off (three static frames with captions); the featured card
is chosen from the 6 latest public cards, so its words are unvetted — pick by length/cover rules and show only
the stored excerpt; en words are longer (captions must wrap gracefully); the night band must stay distinct in
dark mode (it does on /paper-pals). Engineering: new sections + new stage specs; engine mostly reused.
