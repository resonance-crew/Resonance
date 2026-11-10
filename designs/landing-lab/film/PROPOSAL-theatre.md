No newer owner message reached me. This proposal follows the brief and the four research reports. I did not read LEAD.md, and I wrote or changed no files.

# 再說一個就好 · One More Story
*A paper theatre in six scene changes*

**The idea in one line:** one small paper stage plays a whole day. Its flats fly up into the loft and the next scene's flats rise through the stage floor. Meanwhile a story written at dawn crosses the world, is answered at dusk, brings its writer and its reader together in the evening, and becomes a star at night. Then the night asks the visitor for one more story.

## 1. The stage, and why it's a theatre

- **The owner's scene change is how a real theatre changes scenery.** Victorian stages flew their flats up into the *flies* on lines, and raised ground rows through slots in the stage floor (*cuts* and *sloats*). So the parallax isn't a web effect we picked; it's stage machinery. A pop-up book adds one thing: the nearest rows can stand up on a hinge as they arrive.
- **悄悄 comes from this theatre.** Its Paper Pals bio already says it is 「紙劇場的一角夜空」 (a corner of a paper theatre's night sky). The night backdrop has a corner missing, and the film ends by mending it.
- **No proscenium, drapes or valance.** Round 1's critique called that kitsch, and on a phone the pillars shrink to nothing. Here the theatre shows only in how things move:
  1. **The stage lip.** One dark strip along the bottom (the darkest layer, L ≤ 0.38) that never moves. It takes the colour of each hour and holds the controls. New flats rise from behind it, so the lip is the cut in the floor.
  2. **Fly lines.** Two graphite threads go up from each flat, visible only while it moves (opacity follows its speed).
  3. **The light.** The sun and moon are the theatre's lights, not flats. They follow one arc over the whole film and never fly.
  4. **The bows** at the end.
- **The art follows the art colleague's recipe:** seven paper layers, depth made by colour in OKLCH, the six palettes. The four pale puppets always stand in front of the near hill or the ground (≥ 3.9:1). 悄悄 appears where it carries its own light.

## 2. The script (~72 s of film; ~85 s with ▶)

| Act · hour | Film s | What happens | What the visitor sees · can tap |
|---|---|---|---|
| **I 寫 · Dawn** (before sunrise → sunrise) | 0–8. The overture (1–6) plays by itself once, at the top of the page. | 摺摺 sits at a small paper desk and writes in graphite on a slip of its own sage paper. It lifts its folded corner to check the lines hidden under it, then decides to share. It holds the slip up; the dawn wind (three cream ≋ ribbons) takes it. The slip **turns over in the air and lands face-up as real card A.** The sun clears the far range as the card rises: the first story brings the morning. 點點's eyes pop up over the hill and follow it. 摺摺 turns to the visitor and **waves**, as its bio says it waves first. | Someone writes, and a story appears. **Waits.** Tap card A. |
| *change 1* | 8–10.5 | Fly and rise (§3) | |
| **II 出發 · Blue-sky day** | 10.5–22 | Card A rides the wind over a **moving panorama**: gabled roofs, a clock tower, a little post office, a river of paper strips. Paper birds lift off each roof as it passes, an origami crane leading. 點點 hops from roof to roof after it ("is this my story?"), leaps from the last gable, misses, lands in a paper boat and floats on, arms up. | A story travels far. Tap card A, shown at travel size. |
| *change 2* | 22–24.5 | Panorama, then pop-up | |
| **III 收到 · Golden afternoon** | 24.5–33 | A lone tree on a headland by the sea, with 聆聆 leaning against it. Card A glides down; 聆聆 reaches up and catches it. It reads: eyes scanning, slow nods. Faint lines write themselves across its own index-card body (its bio: it writes on itself what it hears). Three small ≋ ripples rise from it: the logo's waves, meaning resonance. **Never a ♥**, which round 1 showed reads as a like button. | Someone far away reads it and is moved. **Waits.** Tap card A. |
| *change 3* | 33–35 | Only the back flies | |
| **IV 回應 · Dusk** | 35–45 | 聆聆 writes on a slip of its own lavender paper, lifts it, and the slip turns over: **real card B**, beside A. 牽牽 walks in unspooling its string, ties one end to B, walks over and ties the other end to A. The string draws as the **≋ between the two cards**. | A story answered by a story, and the two linked. **Waits.** Tap A or B. |
| *change 4* | 45–47.5 | The thread becomes the bridge | |
| **V 相遇 · Evening** | 47.5–58 | A bridge of three pale paper waves spans a valley over the lit town; the moon is low, fireflies are out. The linked pair of cards floats small above the bridge's top. 摺摺 stands at one end and looks up at B, the answer to its story, then lifts its folded corner all the way (trust). 聆聆 stands at the other end. They climb, meet at the top, wave and bow (the kit's duet). 悄悄, just awake, raises its lantern on a far roof: every window in town lights and sky lanterns rise. 點點's boat drifts under the bridge. | Two people meet through their stories, and the world lights up around them. **Waits.** |
| *change 5* | 58–60.5 | The lanterns lift the night | |
| **VI 滿天的故事 · Night** | 60.5–72 | The biggest sky of the film, with one corner missing: a 悄悄-shaped hole where the page's cream shows through. A and B rise and become two stars joined by 牽牽's line. 悄悄 pricks stars with its lantern, and each opens into a tiny card: tonight's real stories. 悄悄 floats up into the missing corner; the sky is whole and its eyes close. On the stage floor 點點 finds a blank card and starts to write. 牽牽 holds another blank card out **to the visitor**: the empty 「給：」 on its tag has found its person. 摺摺 and 聆聆 bow. | Many stories, and one still blank: yours. **The end waits here.** The blank card becomes the call to action (§8). |

## 3. The five scene changes

Every change is scrubbed by scroll and is a pure function of p (0–1). Scrolling back runs it exactly in reverse: the new flats sink back through the floor and the old ones come down from the loft.

1. **Dawn → day: fly and rise** (the owner's change, kept as is).
   - The dawn flats fly up on their lines, the nearest about 2× faster than the back flat.
   - The day flats rise from behind the lip: the back flat first, the nearest landing last with a 2 px paper settle.
   - The sky crossfades through a middle sky computed in OKLCH, so it never turns grey.
   - Card A **stays where it is on screen** while the world changes under it, like a match cut. 摺摺 and its desk ride up with their ground row, 摺摺 still waving at the card.
2. **Day → golden: panorama, then pop-up.**
   - The sideways panorama slows to a stop, then the day flies up.
   - The headland, the nearest row, arrives lying flat and stands up on its hinge as it lands (`rotateX` 75° → 0°, like a pop-up page opening).
   - Card A starts to glide down.
3. **Golden → dusk: only the back flies.**
   - The headland, the tree and 聆聆 stay. The far range and the sea fly up and the dusk ones rise behind them, while the sun keeps sinking.
   - Half a scene change reads as "time passes while it thinks".
4. **Dusk → evening: the thread becomes the bridge.**
   - The dusk flats fly up, and the wave bridge rises through the floor to meet the pen ≋ that joins the two cards. The ≋ melts into it.
   - The link between two stories becomes the road between two people. This is the film's key picture.
5. **Evening → night: the lanterns lift the night.**
   - The town's sky lanterns keep rising as the evening flies away, carrying the eye up.
   - The night brings in only a low ground row, leaving the biggest sky.
6. **The release.** After the curtain call, the whole stage, lip included, scrolls up as one piece, and the night continues into the page below.

## 4. Control: both. Scroll hauls the scenery; buttons give the paced film

- **Scroll is film time.** One timeline t is computed from the scroll position, and the kit's `frame(t)` poses everything. The page stays a page: the back button, trackpads and screen readers all work, and rewinding costs nothing. The stage is pinned with CSS `position: sticky`; the track is about 12–14 screen heights.
- **Scene changes (the flats) are scrubbed by the visitor's hand.** Following the fingers is the thrill of the parallax. A change never stops halfway: after 160 ms without scrolling it glides on to the end the visitor was heading for, or back if they moved less than 24 px.
- **Acts belong to the actors.**
  - They can be scrubbed like a flipbook.
  - If the visitor stops after moving forward, the act plays on at film speed to its next **wait** (a card on screen).
  - If they stop after moving back, it holds; the puppets keep breathing on wall-clock time.
  - There are five waits, so the film never runs past a card before it can be seen.
- **The programme strip** sits on the stage lip and appears after the overture:
  - ⏮ ▶/❚❚ ⏭
  - a pen-line progress bar with six marks, built as a slider (「第 3 幕，共 6 幕：收到」)
  - 略過, which jumps to the end
  - ▶ plays through, holding 2.5 s at each wait. Any wheel, touch or key from the visitor hands control back to them.
  - On a phone the strip is just ▶ · progress · 略過; one nudge moves one act.
- **Keyboard:** ← and → move between acts, K plays and pauses. Space and ↓ keep their normal meaning.
- **The page never scrolls by itself on load.** The overture plays in place. The URL hash follows the act (#dawn … #night) via `replaceState`.
- **Why not buttons only:** a page that ignores the wheel feels broken, and the stories and footer must stay reachable.
- **Why not scroll only:** a fling would blur the acting. The waits and ▶ give the paced version.

## 5. The first screen, before anything plays

The first frame is the blue hour just before dawn. The top of the sky is deep violet (L ≈ 0.45), so the h1 and subtitle are cream (≥ 4.5:1). Lower down, near the horizon, the sky is peach and pale, so the black store badges stand out. The server HTML is this frame: flat inline SVG, the puppet stills and real text. The LCP is the h1.

```
Phone 390×844                         Desktop 1440×900
┌──────────────────────────────┐      ≋ Resonance                              繁體中文  登入
│ ≋ Resonance        繁中  登入 │      用故事回應故事  (h1 ≈ 96)                 ◜ card A lands here ◝
│ 用故事                        │      讀到觸動你的故事，不必按讚——寫一張自己的卡片回應它
│ 回應故事        (h1 ≈ 56)     │      [App Store] [Google Play] [▦ QR on hover]
│ 讀到觸動你的故事，不必按讚——    │      ︵︵︵ far range ︵︵︵ ☀ under the ridge ︵︵︵︵︵︵︵︵
│ 寫一張自己的卡片回應它          │      ~~~~~~ sea ~~~~~~        ⌂⌂⌂⌂ town ⌂⌂
│ [App Store] [Google Play] y≈300│      悄悄 asleep (lantern)  ︵ hill ︵ (••)點點   摺摺 ✎ desk
│ ︵︵ far range ︵ ☀ ︵︵︵︵︵   │      ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ stage lip ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓
│ ~~ sea ~~   ⌂⌂⌂ town         │      ▶ 看小紙團演一遍                                 往下 ↓
│ (••)點點 peeks                │
│ ︵ hill ︵   摺摺 ✎ desk  y≈700│
│▓▓▓▓▓▓▓▓ stage lip ▓▓▓▓▓▓▓▓▓▓▓│
│ ▶ 看小紙團演一遍      往下 ↓  │
└──────────────────────────────┘
```

- **Phone:** after the overture, card A hovers as a chip (cover, title, pen name; about 280×96) over the sea, below the badges. It opens to its full card as the h1 flies up with the dawn sky in change 1.
- **Desktop:** card A lands at full compact size in the sky on the right.
- **Desktop only:** 悄悄 sleeps at stage left, its lantern dimming as the night ends. It stands against the pale sea, where its contrast holds.
- **Tablet:** landscape uses the desktop composition; portrait uses the phone's, with full-size cards.
- **On a return visit** (film already seen), the second action becomes 「直接看故事 ↓」.

## 6. The cards

- **Selection:** the data colleague's rule, which I agree with. In order: an owner pin; a real resonance; a *kin* pair (insight distance ≤ 0.40, situation distance ≤ 0.70, one card per author, rotating daily among the top 3 at Taipei midnight); otherwise one card alone.
  - Today: 〈Let's Enjoy Me Time! 🌿〉 (Winnie) → 〈不要只有在狀態好的時候才喜歡自己〉 (Starry).
  - The sky: the latest landing cards minus those two, at most 12, without stories.
  - Anonymous sky cards link by id with no slug.
  - `readCount` and the signature are never serialized.
- **How a card comes out of a puppet:**
  - It starts as a slip of its writer's own paper (sage for 摺摺, lavender for 聆聆) with the fibre rim, drawn at the card's exact proportions. It gets written on in graphite and lifted.
  - It then **turns over**: the back is the puppet's paper, the front is the real StoryCard (a real `<a>`, laid out at full size and only ever scaled down).
  - The moment it is edge-on hides the swap from drawing to DOM, and no crossfade is needed.
  - Sizes: a chip while it travels, the compact card while the film waits.
  - Focus or hover holds the film. A tap opens the card's page, and t is saved so the back button returns to the same moment.
- **Honesty (needs the owner's decision).** With a kin pair, the film shows 聆聆 "answering" with Starry's real card, which suggests Starry answered Winnie.
  - The theatre framing softens this: the puppets are actors performing real people's stories.
  - The pair's accessible name and narration say 「兩個彼此呼應的故事」 for a kin pair, and 「一個故事，和回應它的故事」 for a real resonance.
  - The stricter option: card B is 聆聆's own drawn card, and Starry's card joins the night sky instead.
- **No pair:** card B turns over blank and dashed, and the ≋ draws dashed to it. The answer is still to come, perhaps from the visitor.
- **/en:** the cards are shown unchanged with the right `lang`; the film itself is wordless.

## 7. The five 小紙團

| Puppet | Role | What it does |
|---|---|---|
| 摺摺 Tuck | The writer | Writes at dawn and waves first. Lifts its folded corner a little to share, and all the way at the meeting. |
| 聆聆 Nod | The reader who answers | Catches, reads, nods. The story writes itself on its body. It answers on its own lavender paper. |
| 牽牽 Twine | The thread | Ties the answer to the story (the ≋, which is `referenceCardId` made visible). Its string becomes the bridge and the line between the two stars. At the end it offers the blank card: 「給：」 *you*. |
| 點點 Pip | The visitor's stand-in | Chases the card through the day ("is this my story?"), misses, sails on. At night it starts writing its own: the rest of its story gets written, not found. |
| 悄悄 Hush | The night's keeper | Falls asleep at dawn, wakes at dusk, lights the town, then the stars, and returns to its corner of the theatre's sky. |

## 8. The end and the rest of the page

- **The final frame is the curtain call.** The blank card 牽牽 holds out opens into the call to action on the night stage: 「下一個故事，由你來寫」, [寫下你的故事], both store badges (QR code on hover desktops), and **再演一次 ↺**, which rewinds like a tape in at most 2 s and plays again.
- **The release:** the stage scrolls up as one piece. The night sky continues into **今晚的故事**:
  - A and B first, joined by the ≋;
  - then up to 12 stories hung like stars: four loose, staggered columns tilted ±1.5° on desktop, two staggered columns on a phone; real links with lazy-loaded covers;
  - then 瀏覽所有故事 →;
  - then the footer on the night ground, under a sky with 悄悄 asleep in its corner.
- **The site header** slides away during the film and returns when the visitor scrolls up, and in the end state.
- **Dark mode:** the film keeps its own hours. Dark mode only lowers the exposure slightly; the page after the film follows the site's tokens.

## 9. Reduced motion, Save-Data, no JS, accessibility

- **The picture book: the theatre's printed programme.** Six plates (the first frame plus the five waits), each a still of the stage with its real card(s) beside it and one sentence. Then the end section. It scrolls natively, with no parallax.
  - **Reduced motion:** the book is the default. 「播放動畫」 offers the film with crossfades instead of flying flats, no panorama, and no automatic settle glides.
  - **Save-Data, low memory, no JS, or a runtime that hasn't started within 8 s:** the book. Save-Data also offers 「播放動畫（約 1.5 MB）」.
  - The book's first plate is the film's first frame, so the switch happens below the fold.
- **Accessibility:**
  - The art is `aria-hidden`.
  - Each act has an h2 and one sentence, visually hidden during the film and visible in the book.
  - Off-stage cards are `inert`.
  - A live region announces scene changes only when ▶ or ⏭ caused them.
  - ❚❚ stops every automatic motion (WCAG 2.2.2).
  - 略過動畫 is first in the tab order.
- **Budget:** at most 150 KB of images on the first screen; the film about 0.9 MB on a phone (puppet parts at 1.0 px per unit, about 418 KB); scenes load one or two ahead.

## 10. What I'd fake in the prototype

- **One seeded place, recoloured** (the art mock's `palettes.html`):
  - dawn and the golden/dusk headland from it;
  - the day panorama from its town row, tiled;
  - the bridge as three flat paper strips;
  - night as the same place, with the hole as a mask;
  - flat fills, no finish plates, fly lines added last.
- **Puppets** through the kit over the existing parts:
  - walks as slides with the walk cycle (feet may slide);
  - catches at fixed marks;
  - writing as the scribble prop revealed with `clip-path`;
  - the pop-up hinge as `rotateX`;
  - 悄悄's float into the hole as a straight path.
- **Cards:** today's pair by hard-coded id through the existing landing read (real cards, no rule yet); the sky as the landing read minus the two, stripped.
- **Controls:** scroll, ▶, 略過, a progress bar you can't drag yet, ← and →.
- **Other simplifications:** the ≋ → bridge as a crossfade, star-cards as sprites.
- **Scope:** 390 and 1440 wide, zh-TW only.

## 11. For the owner

1. With a kin pair, may card B be shown as 聆聆's answer, or should it be 聆聆's own drawn card?
2. Should the fly lines show (the theatre giving itself away), or should the flats move with no lines?
3. Is the ending with 悄悄 returning to its missing corner of the sky worth its 3 seconds?