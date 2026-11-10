No newer owner message reached me, so this covers only the brief and the materials listed in the task. I wrote my own proposal before reading LEAD.md. The theatre and vertical proposals came in my task text, so I had already seen them. I checked the art mocks myself and drew three key frames in headless Chrome, all in the scratchpad: `/private/tmp/claude-501/-Users-ncchen--claude-spares-spare-pZgTcm/84b65950-01bf-4833-b134-c3a6994644eb/scratchpad/critic/phoneB.png` (an outdoor dawn first screen at 390×844), `/private/tmp/claude-501/-Users-ncchen--claude-spares-spare-pZgTcm/84b65950-01bf-4833-b134-c3a6994644eb/scratchpad/critic/phoneA.png` (the lead's attic on a phone) and `/private/tmp/claude-501/-Users-ncchen--claude-spares-spare-pZgTcm/84b65950-01bf-4833-b134-c3a6994644eb/scratchpad/critic/deskB.png` (the outdoor dawn at 1440×900). The source is `/private/tmp/claude-501/-Users-ncchen--claude-spares-spare-pZgTcm/84b65950-01bf-4833-b134-c3a6994644eb/scratchpad/critic/mock.html` plus `shoot.mjs`, a patched copy of the art mock. I changed nothing in the worktree.

## 1. My own proposal: 「一張卡片，一整天」 (One card, one day)

**Four scenes, about 45 s at film speed, six hours of light.** Three rules:
- **The meaning lands by the second scroll:** a story is written, it becomes a card, and someone reads it and answers.
- **The hours pass inside the scenes.** The sun's arc follows the scroll across the whole film. All six palettes play, but there are only three scene changes.
- **The page never moves by itself** unless the visitor presses ▶, ⏭ or 略過.

**The script**

| Scene · hours | Film s | Beats |
|---|---|---|
| **1 寫 Write** · blue hour → sunrise | 0–8 | 摺摺 sits at a small paper desk on the near hill and writes. Graphite lines grow on a slip of its own sage paper. It lifts the slip, the slip turns over edge-on, and it is the **real card** (a chip with cover, title and pen name). This plays once on load. 點點 peeks over the hill. The sun clears the range. Scrolling lets the dawn wind ≋ take the card. |
| *Change 1* | | The owner's change: the dawn flats fly up and the day flats rise. The card holds its place on screen. |
| **2 讀與回 Read and answer** · morning → golden | 8–26 | **A short journey (about 6 s):** the card flutters over the paper town, and 點點 leaps on and rides it. That is the adventure and the comedy. **The catch:** the card drops to a headland, where 聆聆 catches it and reads. It nods, the lines it hears appear on its own body, and three ≋ ripples rise. **Never a heart:** the subtitle says 不必按讚. **The answer:** 聆聆 writes, its own slip turns over, and the answer stands beside card A, joined by a pen-drawn ≋. |
| *Change 2* | | Only the back flats fly (golden → dusk). The pair stays. |
| **3 相遇 Meet** · dusk → evening | 26–38 | The ≋ rises into a bridge of three paper waves. 摺摺 and 聆聆 cross from either end, meet at the top and bow. 牽牽 ties the two cards together. 悄悄 wakes, and the town's windows light. |
| *Change 3* | | The town's lanterns rise and carry the night in. |
| **4 換你 Your turn** · night | 38–45, then rests | The lanterns become today's real stories (at most 12, each tappable). All five stand on the hill. 牽牽 holds a blank card out to the visitor, which opens into 寫下你的故事, the badges and 重看一次. The stage then releases into the stories list, the call to action again, and the footer. |

**Control: two clocks.**
- **The scenery** (flats, sky, sun, scene changes, the card while it travels) is scrubbed by the scroll on a CSS-sticky stage. No GSAP pin.
- **The acting is triggered, not scrubbed.**
  - Entering a beat's window plays it at film speed on its own clock (the kit's pure f(t)).
  - If the visitor scrolls through faster than it plays, it fast-forwards to match.
  - Scrolling back above the beat rewinds it at 3×.
  - There is no auto-scroll and no settle glide.
- **The player** sits on a dark stage lip at the foot: ▶/❚❚, ⏮ ⏭, a four-tick progress line, 略過.
  - ▶ is the only thing that scrolls the page, at film speed. Any input from the visitor hands control back.
  - Keys: ← → and K. Space keeps its normal meaning.
- **Track length:** 4 × 100 svh + 3 × 80 svh, about 6.5 screens.

**The first screen** (my mock: `phoneB.png`).
- **Contrast:**
  - The top of the sky must be L ≤ 0.45 for cream text.
  - The mock's dawn top, at L 0.60, fails AA for the subtitle with either colour: dark ink 4.1:1, cream 3.7:1 (both computed).
  - At L 0.45, cream is 7.1:1.
- **Phone layout:**
  - The h1 on two lines, the subtitle and both badges at 40 px all fit above y ≈ 300.
  - The card chip floats over the sea.
  - 摺摺 and 點點 stand on the near hill.
  - The lip holds ▶ and 「直接看故事 ↓」.
- **Desktop** (`deskB.png`): text on the left over the sky, the card on the right, the world full-bleed.

**Art.** Use the art researcher's depth formula and palettes, but let the paper itself do what Alto's silhouettes do: brads at the flats' hinges, fly lines while they move, paper cranes instead of V-birds. At thumbnail size the mock's dawn and golden frames read as Alto with grain (lone tree, low-poly peaks, low sun, V-birds). Two more notes:
- **Phone composition:** a phone needs its own horizontal composition, not just vertical offsets. The mock puts the puppets at x 380–610 and the sun at x 1020 of 1600. A phone's centre crop (about 600 of 1600) keeps one or the other.
- **The wind:** the ≋ wind ribbons read as streamers in a still, so they must visibly stream.

**Cards.**
- **The pair:** when a real resonance pair exists, use it. Until then, card A is real (the data rule) and 聆聆's answer is its own drawn card. The "kin" card hangs beside A in the night sky, joined by a faint ≋. No real person is ever shown answering someone they didn't answer.
- **Sky cards:** anonymous ones link by id with no slug, and no sky card carries `readCount` or its story.

**Fallback.** The picture book: four plates plus the pair, and its first plate is frame 0.

## 2. Critique

### LEAD: 「一張卡片的旅程」
1. **Understood without reading?** The arc is right. But there are six scenes, and the answer only arrives about 35–45 s in.
   - The reading beat's "warm heart glow" contradicts the hero subtitle 不必按讚. Round 1 already showed a ♥ reads as a like button.
2. **Feeling.** The journey, the wave bridge and the lanterns are strong. Opening in the attic is cosy, not vast.
3. **Brand.** It fits. The lone tree and birds lean toward Alto.
4. **First screen: the weakest of the three on a phone.** My `phoneA.png` puts the attic at 390×844:
   - The layered world, which is the whole point of the Alto reference, shrinks to a porthole of about 260 px, framed by wall and desk.
   - "The sky carries the title" can't happen inside a room.
   - "Store badges small at the foot" puts the conversion at the bottom and undersized.
   - The attic only works on desktop.
5. **Control: the most intrusive option.** "Scroll snaps to its start" plus "auto-scrolling through it at film speed" means the page moves under the visitor for up to about 10 s per act.
   - On iOS, a programmatic scroll during momentum stops with a jolt.
   - `html { scroll-behavior: smooth }` turns per-frame scroll writes into smooth scrolls (the tech research's finding).
   - The tappable card is visible exactly while the page is auto-scrolling.
   - Space as play breaks keyboard paging.
   - A GSAP pin costs 45 KB and jitters on iOS where `sticky` doesn't.
6. **End state.** Good: the night sky, the five waving, the blank card, the call to action, replay, the footer as ground. It still needs the story list after it.
7. **Feasibility.** The attic is extra art no other scene reuses. About 70 s of choreography with five puppets won't fit in a day.
   - **Data:** the "kin" card is presented as an answer, which isn't true.
   - **Sky:** "named and anonymous as the landing feed shows them" inherits the feed's slug links for anonymous cards and its serialized `readCount` (the data research's privacy flags).

### Theatre: 「再說一個就好」
1. **Understood without reading?** The clearest acts, and the best tricks:
   - the edge-on turn-over that hides the swap from drawing to DOM card;
   - ≋ ripples instead of ♥;
   - a no-pair fallback with a dashed blank answer.
   But the panorama, roof-hopping and paper boat (about 11 s) delay the meaning, and the answer only appears at film second 35–45.
   - **Honesty only for screen readers:** the kin pair's honest name reaches screen readers alone. A sighted visitor still sees 聆聆 "answer" with Starry's card.
2. **Feeling.** Rich and fantastical; the adventure is moderate.
3. **Brand: the best grounded.** The theatre machinery motivates the owner's change, and 悄悄's bio is a paper theatre's night sky.
   - The fly lines are lovely but may read as wires.
   - Cut the hole-mending ending. Prototype C's hole read as "a blank tombstone", and here it costs 3 s plus a concept that needs explaining.
4. **First screen.** It passes: the blue hour with cream text is 7:1 by my numbers, the badges sit at about y 300, and the card is a chip.
   - The stage lip costs a permanent dark band of about 64 px on a phone, but it earns it by holding the controls.
5. **Control.** Changes settle by gliding the page, and acts drive the page to the next wait. That is the lead's problem, only softer.
   - The track is **12–14 screens**, about 85 s with ▶, with five waits that are each a chance to leave. Too long.
   - Space stays native: good.
6. **End state.** Good: the curtain call, the call to action, replay, the release into the sky list and the footer.
7. **Feasibility: the most moving parts.**
   - The parts: the panorama, a `rotateX` pop-up hinge on full-width flats (costly on phones), the bridge, the lanterns, a masked hole, star cards and a curtain call.
   - None of that fits in a day, and production means six scenes of art.

### Vertical: 「雲海與天燈」
1. **Understood without reading?** The fall reads well. Reading and answering come at about 33 s, out of 9 scenes. The climb back up adds plot that isn't needed.
   - **Direction:** "stories fall" works against the owner's 「浮出來讓大家看」 (the card floats up for all to see).
   - **Hearts:** a paper heart swells, twice.
2. **Feeling: the most adventure and the most original geometry.** The insight is real: the owner's change is exactly what a descending camera sees. The sled ride, the catch above the water, the sea of clouds and the sky lanterns are strong, and lanterns suit a Taiwanese audience.
3. **Brand.** Good, apart from the hearts.
4. **First screen.** It passes: ink on the pale band is ≥ 6.9:1. But the phone h1 at 36 px on one line is weak for a hero.
5. **Control.**
   - **The reversal:** on the way up, scrolling down moves the camera up. The visitor's mental model flips, and the author admits it needs real fingers to judge.
   - **The climb plays itself,** which is auto-scroll again.
6. **End state.** Original and good: the pair hanging on 牽牽's string, the blank card as the button, a sea of clouds of real stories.
7. **Feasibility: the highest art cost.**
   - **A new world:** five strata composed wide plus an attic, a world five screens tall. The palette mock's horizontal compositions don't transfer.
   - **Width:** landscape screens see the least of a vertical world.
   - **Length:** about 75 s, with a 25 s middle the author already flags.

## 3. Recommendation

**Spine.** The lead and the theatre share one arc: write, card pops, journey, catch and read, answer, the ≋ becomes a bridge, meeting, a night of stories. Build that arc with the theatre's stage mechanics, trimmed to my four scenes: about 45 s at film speed, at most 7 phone screens, the meaning by about 16 s.
- **Open outdoors** at the blue hour: the theatre's first screen, the sky top at L ≤ 0.45, cream text, the badges at 40 px above the fold.
- **Control:** the two clocks.
  - **By default the page moves only for ▶, ⏭ and 略過.**
  - If the owner wants settling, allow short glides at scene changes only, never acts driving the page.

**Grafts:**
- From the theatre: the edge-on turn-over, ≋ ripples instead of ♥, the stage lip as the phone player's home, one wait per scene.
- From the vertical: 點點 riding the card as the journey's adventure; possibly the sea of clouds as the journey's band.
- From the lead: the wave-bridge meeting and the night stage as the call to action.
- From the research: the data rule (with anonymous cards by id, no `readCount`, no stories in the sky), the sticky stage with our own clock and no GSAP, frame 0 equal to the book's first plate, mounting only the current shot, and baked props.

**Cut:**
- the attic as the first screen (desktop at most)
- every heart
- the panorama, roof-hopping and boat
- the `rotateX` pop-up hinge
- the hole-mending
- the 牽牽 snag
- the V reversal
- auto-scroll through acts
- Space as play
- the GSAP pin
- slug links for anonymous sky cards

**A day's prototype:**
- scenes 1 and 2 fully built, scenes 3 and 4 rough;
- three acting puppets (摺摺, 聆聆, 點點), with 悄悄 mostly still at night;
- today's real card through the turn-over;
- the player and the picture book;
- phone and desktop layouts.

**Five decisions only the owner can make:**
1. **The kin pair.** Show Starry's real card as 聆聆's answer, which tells visitors Starry answered Winnie? Or use a drawn answer until a real resonance exists? A third way is to write one real resonance yourself, so the film is real from day one.
2. **Length.** Four scenes in about 45 s (my recommendation), or six acts in 70–85 s?
3. **Control feel.** May the page ever move by itself, to settle a scene change or finish an act? Try both on your phone.
4. **The opening.** Outdoors at the blue hour, where the vast layered world is the point, or the attic writing room?
5. **The theatre machinery.** Visible brads and fly lines on the flats (unmistakably ours, never Alto's), or a seamless world?

One smaller question: should /en visitors see the zh-TW cards unchanged inside an otherwise wordless film? I recommend yes, with the right `lang`.