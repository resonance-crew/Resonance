# Lead proposal — 「一張卡片的旅程」 (A card's journey)

The lead's sketch, to be debated (critics: write your own first, then tear this apart).

## The idea in one line

A world made of paper, seen as layered cut-paper flats. A story is written at dawn, rides the wind across the world
(the wind is the logo's three waves ≋), is answered at dusk, and by night the sky is full of stories — and the last
blank card is yours.

## The script (≈ 70 s at play speed; six scenes)

0. **Dawn · the writing room** (first screen). A small attic room at dawn: desk and lamp in the foreground, the wall,
   a round window; through it the layered world outside, peach sky, sun just rising. 摺摺 sits at the desk writing
   (pencil, scribble lines growing on a card). The sky carries the title 用故事回應故事 like a picture book's title
   page; under it one quiet line and ▶ 看看小紙團的故事 (play) · scroll cue; the store badges small at the foot.
1. **The card is done.** 摺摺 lifts the card up; it leaves its mitten and grows toward us into the **real card**
   (DOM: cover, title, excerpt, pen name — the platform's StoryCard), floating over the room. Tap → its card page.
   摺摺 opens the window; the ≋ wind comes in and lifts the card out.
2. **The journey · morning → noon.** Transition: the room's layers slide up and away (desk fastest, wall, window
   frame), and we are outside, riding along with the card over the world: hills, a paper town with 點點 peeking from a
   rooftop, a river, fields; birds (paper chevrons), the ≋ trails. Parallax travel.
3. **Arrival · late afternoon.** The card comes down to a hill by the sea where 聆聆 (the listener) sits under a
   lone tree. 聆聆 catches it and reads — the real card floats beside it again, so we read what it reads — then the
   "moved" pose (eyes shut, blush, a warm heart glow).
4. **The answer · dusk.** 聆聆 takes a blank card and writes; its own card rises beside the first: **two real cards
   side by side, joined by the ≋** — the logo made literal; that is 共振. The answer rides the wind back.
5. **Meeting · dusk → night.** The ≋ become a bridge of waves over the valley; 摺摺 and 聆聆 walk out along it and
   meet in the middle; a note changes hands (the `note` duet: connection). Lanterns begin to rise from the town.
6. **Night · the sky of stories** (the end state, interactive). Night paper with pinprick stars (light through holes
   in the paper); 悄悄 lights its lantern; all five stand on the hill and wave. The sky holds the real stories as small
   floating cards/lanterns (tap to open; "看更多故事 →" to the feed). In the foreground a blank card glows:
   「下一個故事，由你來寫」 + 寫下你的故事 + the badges. 重看一次 (replay). Below it the footer as the night ground.

## Control

One timeline, t = scroll position (GSAP ScrollTrigger, the stage pinned full-viewport). Travel and transitions are
scrubbed by the scroll (the layers' parallax answers the finger). Each acting beat (writing, reading, answering) is
a **dwell**: scroll snaps to its start, and if the reader stops, the beat finishes itself by auto-scrolling through
it at film speed (so acts play in real time, and scroll and t never disagree). A small player at the bottom:
⏮ previous scene · ▶/❚❚ play (auto-scroll at film speed) · ⏭ next scene, a thin progress line with six ticks, and
「略過」 (skip to the end). Keys ← → space. Idle life (breathe, blink) runs in real time on top of t, so a resting
frame is never frozen.

## Data

Card 1 (written): the highest insightScore among public, named, listed cards with a cover, rotating daily among the
top few; owner pin overrides (a server-only config doc). Card 2 (answer): a real public, named resonance of card 1
when one exists; until then the card nearest to it in the vector store (same realization), never by the same
author if avoidable. Night sky: the newest listed public cards (named and anonymous as the landing feed shows them).

## Fallbacks

Reduced motion / Save-Data / no JS: a picture book — the six scenes as still frames (each at its key pose) stacked
vertically with the two real cards, the CTA, the badges. The server HTML is that picture book's first frame plus
all the DOM content (h1, cards, CTA, footer), so the first paint never waits on JS.
