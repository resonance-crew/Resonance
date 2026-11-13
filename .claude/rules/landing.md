---
paths:
  - "src/components/sections/LandingFilm/**"
  - "src/components/sections/LandingStage/**"
  - "src/components/sections/ReadingStage/**"
  - "src/components/sections/PaperPalsPage/**"
  - "src/components/molecules/PaperPalStill/**"
  - "src/lib/mascots/**"
  - "native/mascots/**"
  - "designs/landing-lab/**"
  - "designs/mascots/**"
  - "src/components/lab/**"
  - "src/app/**/lab/**"
  - "src/app/**/paper-pals/**"
  - "src/app/*/page.tsx"
  - "scripts/mascots/**"
  - "public/mascots/**"
---

# The landing film, the stages, Paper Pals

## Landing film

The landing page is a short film of paper, 一張卡片，一整天 (`src/components/sections/LandingFilm`, designed in `designs/landing-lab/film/` — SPEC, and the rounds in its history): 摺摺 writes a card at the blue hour, the wind carries it, 聆聆 reads it and answers with a card, the two meet on a bridge at dusk, and by night the next story is the visitor's — the platform's real cards (data.ts: public, published; an anonymous one linked by its id, never its author), the scenery layered flats coloured by depth and hour (script/palette.ts), changing scene by parallax (script/changes/flats.ts).
The far land is long waves, the mark's ≋, and the paper carries a fine sand (script/look.ts, script/sand.ts; the owner moved it away from Alto's Adventure's look, 2026-11-11 — no faceted peaks, lone tree, lighthouse, corner grass or sky lanterns).
It starts by itself on a fresh visit (not under reduced motion), the scroll drives the scenery and ▶/❚❚ and the line drive the acting; after it the page is the site's own: tonight's stories, the closing band (`#download`) and the footer.
The same component runs the lab's `/lab/landing/film` (its `?rest=1`, `?sand=0|2`, `?b=` comparisons) and, on a development server only, `/lab/landing/film/peaks` (the look before the waves).
Its colours are its own light, listed in `colourLiterals.web.test.ts`.
The release screenshots take its first frame and its end as screens (`landing`, `landing-stories`, `landing-footer`) and one still of each scene held at its moment (`?rest=1&t=`, `film-*`) only to look at and check, never compared (scripts/visual/README.md, The landing film).

## Landing stage

(The old landing page's; the landing page is now the film — see Landing film.
The engine below still runs the reading stage and the Paper Pals page.) The landing page's paper puppets — the 小紙團 (Paper Pals, the series' name wherever it is named: 外觀's switch, its hint): 摺摺 Tuck, 牽牽 Twine, 聆聆 Nod, 點點 Pip, 悄悄 Hush (slugs `tuck tag card dot night`) — come one or two at a time to its words, cards and buttons.
`sections/LandingStage` is client-only and none of it is in the server's HTML: `next/dynamic` without SSR, rendered once the page has loaded and the browser is idle, never under Save-Data, inside a boundary that renders nothing if its chunk fails to load or the stage fails to start (a deploy while the page is open must never turn the landing page into the error page); it puts a layer on `<body>` (page px, `aria-hidden`, z 50 under the header's 100, clipped at the page's sides, no pointer but each torso's invisible shape) and runs the engine (`src/lib/mascots`, `createStage`; engine.ts says how it behaves — it sleeps on one timer while nobody is on stage, brings a character only once its parts are loaded and decoded, sends off one the view's top leaves mostly hidden (under the fixed header), and stops for good, said once, when its frame keeps failing) over the DOM env in `lib/mascots/landing`: `measure.ts` finds every place through `data-mascot` / `data-mascot-zone` marks on the sections, GetTheApp, StorytellerProof and StoryCard (`LANDING_MARKS`; the waves from the SectionEdge's own path, words by their glyphs' ink, cards by their drawn outline — paths read from their `d` by `svgPath.ts`, never walked with getPointAtLength, which took a quarter of a second per measure) — again on a new width, once fonts still loading are in and when the body's size changes, never per frame; `stage.ts` gives the engine the view below the fixed header (`HEADER_CLEAR` more) and the scheme and reduced motion live, a new width a new stage, and ends the stage quietly if a later measure fails.
A mark renamed or removed takes its place away (`landing/marks.test.tsx` renders the real sections and checks each one).
The store badges' spots keep them out of an arm's reach (`reach`), so a pointing mitten stops short of their clear space; a seat under words (`clear`) is climbed to already sitting.
`/mascots/*` is served `immutable` (next.config.ts: every URL carries its `?v=`).
Three presets by the card grid's breakpoints (`presets.ts`): phone < 640 (摺摺 80 px; beside the badge, over the avatars, over the write button's end), tablet 640–1023 (100; the badge's two sides to walk up to, both avatar places, the outer cards' sides), desktop ≥ 1024 (120; the QR code's three places when a mouse shows it).
The cast: `npm run mascots:cast` builds `designs/mascots/cast/<slug>/parts` into `public/mascots/<slug>/*.webp` and `src/lib/mascots/cast.generated.ts` (its test fails while stale).
Development builds expose the stage as `window.__landingStage` (and its latest events, `__landingStageEvents`).

**Reading stage** (round 19): the same puppets now and then on the home feed and a card's page, only when Settings → 外觀 → 小紙團 is on (`TweakState.mascots`, this browser's, off by default).
`sections/ReadingStage` (mounted by both pages, always in the tree — `off` for a card in the trash or held), its layer at z 30 (under every menu, toast and dialog); `mountPageStage` (landing/stage.ts) over `lib/mascots/reading`: `measure.ts` reads the marks (`data-mascot-zone="home" | "card"`, `feed-foot`, `story-title`, `story`, `respond`, and the cards' own) into a `ReadingScene`, and `scene.ts` — plain geometry, no DOM — gives the places (round 20, so visits differ: a card's top sat on, stood on (pointing at its title) or peeked over, an outer card's side, a phone band's top rule walked along — where two meet —, each card's places one at a time (`group`) and named by its id (`SceneCard.key`, so a lazy list's churn leaves its visitor be); a cover, a title's end, the margins beside paragraphs where they are wide enough (greeting across), over/beside the response bar, by 顯示更多, napping by the feed's end); `presets.ts` the smaller sizes and the pacing (`READING_PACE`).
Whoever is behind a card stays under its whole pen line (`Cover.pen`: the clip runs along the drawn outline's outer edge — the owner, round 20: the card's border in front of the puppet), and a peeker over a card's top stays under the card above it too; a sitter or stander is in front of the cards, as on the landing page.
A click or tap: a hop, then something its place allows, a hop, and the fourth sends it off shy (`Puppet.poke`).
Settings → 外觀 has a strip under the switch (`MascotsStrip`, `reading/settingsStage.ts`): off, one puppet naps on its floor; on, they come and go, wake where the napper lay, point at the switch.
The apps run it in the **mascot island** (`native/mascots`, `npm run native:mascots` → `native/mascots/dist/mascots.html`, every picture inlined, git-ignored like the editor's): a transparent WebView over their feed and card page that takes no touch, handed a `ReadingScene` in its own points and the scroll offset (`window.mascots.scene / scroll / tap / inset / theme / reducedMotion / pause / resume / stop`), answering `hits` (where a tap reaches a puppet: the app keeps that tap from the card under it and calls `tap`) and `scrolled` (a scroll drawn: an app that shifted the overlay natively during the scroll puts it back); settings' strip is a scene with `settings`.
Development builds expose `window.__readingStage` and `window.__settingsStage`.

**The Paper Pals page** (`/paper-pals`, `sections/PaperPalsPage`, linked from the footer and in the sitemap): the five introduced as characters, in few words — the owner's ask: no captions, kickers, numbers or labelled lists, the puppets show the rest.
The opening is the page's title on a story card with the five busy round it (`PalsTitleScene` over `lib/mascots/pals/titleScene.ts`: 摺摺 reading on the card's top, 悄悄 dozing at its other end, 點點 peeking past its side — over its top when narrow —, 聆聆 and 牽牽 meeting on the floor beside it — under it when narrow); the engine keeps two to a stage, so each is a stage of its own (the meeting one stage for both, `VisitRequest.meet` having the other walk up), all over one scene — their layers take no pointer, only the characters do — their places read from where the server drew the stills (`[data-still]`), so the CSS is the one layout, and 點點 cut along the card's drawn line (its outline read as a `Cover`, the sitters seated on its drawn top); a tap has one say its `line` where it covers no one (`placeSaid`).
Then each one on a band of its own paper, its blobs placed differently per band and clipped to that paper between its own wave and the next band's (`BandDrift`, reading the waves from `lib/design/sectionEdge` — the one geometry `SectionEdge` draws too, whose turns and swell follow the width: fewer and lower below 1024) (悄悄's band the page's one night in either scheme, `data-night`: its puppets wear the dark theme there), two meeting on a strip whose ends fade out, and the five back with a sixth on blank paper (`BlankPal`: the family's brads, mittens and pencil face, nothing else, drawn inline — not in the cast, so no stage brings it anywhere) over the vision, then the CTA band.
Every puppet is in the server's HTML standing still — `molecules/PaperPalStill` lays the stage's own part images at rest from `lib/mascots/pals/still.ts` — and comes alive once the page is idle (strips once mostly in view: `mountPalStrip` in `lib/mascots/pals/stage.ts`), never under reduced motion or Save-Data — and where a stage is coming (a script runs, motion is welcome) the opening's and the strips' stills wait unseen until each one comes on with its own entrance (`data-staged`; `data-stills` shows them when no stage is coming, and CSS shows them anyway if none has started 12 s in); `--unit` (摺摺's height) is the CSS's, resolved by measuring (`unitOf`: a custom property reads back as written, a `clamp()` too).
Development builds expose the opening as `window.__palsTitle`.
