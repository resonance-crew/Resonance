/**
 * Where things stand on the 1920 × 1080 stage, shared by scenes that hand a
 * piece over to the next (the card written in "write" is the card published
 * in "visibility"; the card resonated with in "resonate" is the one a note is
 * left on in "notes"). A piece at its spot at a scene's end and at the next
 * scene's start makes the cross-fade between them invisible.
 */

/** The narration column (narration.ts) and the stage area beside it for the demonstration. */
export const STAGE = {
  width: 1920,
  height: 1080,
  /** Below the header's wavy rule. */
  top: 96,
  demo: { left: 800, right: 1840, top: 110, bottom: 1040 },
} as const;

/**
 * The demonstration's vertical middle, the narration's own: every state the
 * demonstration holds stands centred on it, with at least 90 px of paper under it.
 */
export const DEMO_CY = 565;

/** The top on the stage of something `h` tall (stage px) centred on DEMO_CY. */
export const centredTop = (h: number) => Math.round(DEMO_CY - h / 2);

/** The card being written, then published: StoryCard 340 wide at zoom 1.45, its left on the stage (its top: centredTop of its height). */
export const MY_CARD = { x: 1100, width: 340, zoom: 1.45 } as const;

/**
 * Someone else's card on its page, with the card page's action bar under it
 * (共振 | 寄小紙條 | 收藏): StoryCard 340 wide at zoom 1.3, the bar centred
 * under the card, `barGap` (1×) below it; the two centred on DEMO_CY together.
 */
export const THEIR_CARD = { x: 1100, width: 340, zoom: 1.3, barGap: 26 } as const;
