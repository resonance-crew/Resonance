/**
 * The five reactions a message can be answered with (round 16 §4): small
 * hand-drawn stickers, one source for the web (atoms/ReactionGlyph) and both
 * apps (scripts/apps/reactions.ts → Generated/Reactions.swift, generated/
 * Reactions.kt). Pure data: no DOM.
 *
 * Each glyph is drawn in a 24 box as layers, bottom to top. A layer is a path
 * (absolute M/L/C/Z only, as the icons) filled and/or stroked in one of the
 * sticker colours. Fills of the big shapes sit a little off their line
 * (`offset`), as crayon on a drawing does. Stickers keep their colours in
 * both schemes, as emoji do — the features' ink a deep brown in both — all
 * but the outer rim (`outline`), which is the palette's `reaction-outline`:
 * that brown on paper, chalk at night, as a die-cut sticker's edge.
 */

export const REACTION_IDS = ['heart', 'moved', 'laugh', 'hug', 'thumbs'] as const;
export type ReactionId = (typeof REACTION_IDS)[number];

export function isReactionId(value: unknown): value is ReactionId {
  return typeof value === 'string' && (REACTION_IDS as readonly string[]).includes(value);
}

/** The sticker colours — the same in light and dark, but `outline` (the palette's `reaction-outline`; its light value here). */
export const REACTION_COLOURS = {
  outline: 'oklch(30% 0.035 45)',
  ink: 'oklch(30% 0.035 45)',
  face: 'oklch(88% 0.13 88)',
  heart: 'oklch(64% 0.19 22)',
  tear: 'oklch(78% 0.09 235)',
  blush: 'oklch(80% 0.09 20)',
  cream: 'oklch(98% 0.01 80)',
  sleeve: 'oklch(80% 0.07 235)',
} as const;
export type ReactionColour = keyof typeof REACTION_COLOURS;

export interface ReactionLayer {
  d: string;
  fill?: ReactionColour;
  stroke?: ReactionColour;
  /** The pen, in the 24 box. */
  width?: number;
  /** 0–1. */
  opacity?: number;
  /** The fill shifted off its line, in the 24 box. */
  offset?: readonly [number, number];
}

const FACE_FILL: ReactionLayer = {
  d: 'M12.0,3.9 C16.6,3.6 20.0,7.2 20.2,12.0 C20.4,16.6 16.6,20.4 11.8,20.3 C7.3,20.4 3.6,16.7 3.8,12.3 C3.6,7.6 7.4,4.0 12.0,3.9 Z',
  fill: 'face',
  offset: [-0.5, 0.4],
};
const FACE_LINE: ReactionLayer = {
  d: 'M12.2,3.4 C16.9,3.3 20.6,7.0 20.6,11.9 C20.7,16.8 16.9,20.6 12.0,20.6 C7.2,20.7 3.4,16.9 3.4,12.1 C3.3,7.3 7.4,3.5 12.2,3.4 Z',
  stroke: 'outline',
  width: 1.4,
};
const line = (d: string, width = 1.3, stroke: ReactionColour = 'ink'): ReactionLayer => ({ d, stroke, width });
const fill = (d: string, colour: ReactionColour, opacity?: number): ReactionLayer => ({ d, fill: colour, ...(opacity != null && { opacity }) });

export const REACTION_GLYPHS: Record<ReactionId, readonly ReactionLayer[]> = {
  heart: [
    {
      d: 'M12.0,19.1 C9.3,17.2 6.0,14.7 5.0,11.8 C4.1,9.4 5.1,6.8 7.5,6.2 C9.5,5.8 11.0,7.0 11.9,8.7 C13.0,6.9 14.7,5.7 16.9,6.1 C19.2,6.7 20.0,9.3 19.1,11.6 C18.0,14.5 14.8,17.0 12.0,19.1 Z',
      fill: 'heart',
      offset: [-0.5, 0.35],
    },
    line('M12.1,19.6 C9.2,17.6 5.6,14.9 4.5,11.9 C3.5,9.2 4.6,6.3 7.3,5.6 C9.4,5.1 11.0,6.4 12.0,8.1 C13.1,6.2 14.9,5.0 17.1,5.5 C19.7,6.1 20.6,9.0 19.6,11.6 C18.4,14.7 15.0,17.4 12.1,19.6 Z', 1.4, 'outline'),
    line('M6.9,9.0 C7.1,8.1 7.7,7.5 8.6,7.3', 1.3, 'cream'),
  ],
  // 🥹 — soft brows high in the middle, big eyes brimming (a pool of tears lit along its rim, one big glint),
  // a blush under them, a small quivering mouth. Drawn to read at 18.
  moved: [
    FACE_FILL,
    FACE_LINE,
    fill('M5.2,15.0 C5.5,14.3 6.9,14.2 7.4,14.8 C7.6,15.4 6.5,15.9 5.8,15.7 C5.4,15.6 5.1,15.4 5.2,15.0 Z', 'blush', 0.85),
    fill('M16.6,14.8 C17.1,14.2 18.5,14.3 18.8,15.0 C18.9,15.4 18.6,15.6 18.2,15.7 C17.5,15.9 16.4,15.4 16.6,14.8 Z', 'blush', 0.85),
    line('M6.6,8.0 C7.6,7.6 8.7,7.2 9.8,6.9', 1.25),
    line('M14.2,6.9 C15.3,7.2 16.4,7.6 17.4,8.0', 1.25),
    fill('M8.9,8.5 C10.4,8.5 11.4,9.7 11.4,11.2 C11.4,12.8 10.4,13.9 8.9,13.9 C7.4,13.9 6.4,12.7 6.4,11.2 C6.4,9.7 7.4,8.5 8.9,8.5 Z', 'ink'),
    fill('M15.1,8.5 C16.6,8.5 17.6,9.7 17.6,11.2 C17.6,12.7 16.6,13.9 15.1,13.9 C13.6,13.9 12.6,12.8 12.6,11.2 C12.6,9.7 13.6,8.5 15.1,8.5 Z', 'ink'),
    fill('M6.5,11.4 C7.7,12.2 10.1,12.2 11.3,11.4 C11.2,12.9 10.2,13.9 8.9,13.9 C7.6,13.9 6.6,12.9 6.5,11.4 Z', 'tear'),
    fill('M12.7,11.4 C13.9,12.2 16.3,12.2 17.5,11.4 C17.4,12.9 16.4,13.9 15.1,13.9 C13.8,13.9 12.8,12.9 12.7,11.4 Z', 'tear'),
    { d: 'M7.0,12.0 C8.2,12.6 9.6,12.6 10.8,12.0', stroke: 'cream', width: 0.6, opacity: 0.9 },
    { d: 'M13.2,12.0 C14.4,12.6 15.8,12.6 17.0,12.0', stroke: 'cream', width: 0.6, opacity: 0.9 },
    fill('M9.9,9.0 C10.5,9.0 10.9,9.4 10.9,10.0 C10.9,10.6 10.5,11.0 9.9,11.0 C9.3,11.0 8.9,10.6 8.9,10.0 C8.9,9.4 9.3,9.0 9.9,9.0 Z', 'cream'),
    fill('M16.1,9.0 C16.7,9.0 17.1,9.4 17.1,10.0 C17.1,10.6 16.7,11.0 16.1,11.0 C15.5,11.0 15.1,10.6 15.1,10.0 C15.1,9.4 15.5,9.0 16.1,9.0 Z', 'cream'),
    line('M10.1,16.8 C10.7,17.3 11.4,17.0 12.0,16.6 C12.6,17.0 13.3,17.3 13.9,16.8', 1.25),
  ],
  // 😂 — squeezed eyes, an open grin, two tears flying.
  laugh: [
    FACE_FILL,
    FACE_LINE,
    line('M6.9,10.9 C7.5,9.6 9.3,9.3 10.3,10.5', 1.4),
    line('M13.7,10.5 C14.7,9.3 16.5,9.6 17.1,10.9', 1.4),
    { d: 'M7.4,13.2 C10.4,13.9 13.6,13.9 16.6,13.2 C16.3,16.4 14.4,18.3 12.0,18.3 C9.6,18.3 7.8,16.5 7.4,13.2 Z', fill: 'ink', stroke: 'ink', width: 1.2 },
    line('M8.3,14.3 C10.8,14.8 13.2,14.8 15.7,14.3', 1.0, 'cream'),
    line('M10.0,17.2 C11.2,16.4 12.8,16.4 14.0,17.2', 1.1, 'heart'),
    { d: 'M4.4,10.0 C3.5,11.5 2.6,12.7 3.1,13.7 C3.5,14.5 4.9,14.5 5.3,13.6 C5.6,12.6 5.0,11.4 4.4,10.0 Z', fill: 'tear', stroke: 'outline', width: 0.9 },
    { d: 'M19.6,10.0 C19.0,11.4 18.4,12.6 18.7,13.6 C19.1,14.5 20.5,14.5 20.9,13.7 C21.4,12.7 20.5,11.5 19.6,10.0 Z', fill: 'tear', stroke: 'outline', width: 0.9 },
  ],
  // 🤗 抱抱 — closed happy eyes, a small open smile, two mittens opening out at the chin (the comfort word
  // Taiwanese chat already uses; round 16 §4).
  hug: [
    FACE_FILL,
    FACE_LINE,
    line('M6.9,10.0 C7.6,8.8 9.3,8.7 10.1,9.8', 1.35),
    line('M13.9,9.8 C14.7,8.7 16.4,8.8 17.1,10.0', 1.35),
    { d: 'M9.3,11.8 C10.9,12.4 13.1,12.4 14.7,11.8 C14.4,13.8 13.3,14.7 12.0,14.7 C10.7,14.7 9.6,13.8 9.3,11.8 Z', fill: 'ink', stroke: 'ink', width: 0.9 },
    line('M10.6,13.9 C11.4,13.5 12.6,13.5 13.4,13.9', 1.0, 'heart'),
    {
      d: 'M2.1,17.1 C1.9,15.4 3.0,14.0 4.5,13.8 C5.6,13.6 6.6,14.2 7.1,15.2 C7.8,14.6 8.9,14.8 9.2,15.7 C9.5,16.7 8.8,18.0 7.8,18.9 C6.5,20.2 4.6,20.8 3.3,20.1 C2.5,19.6 2.2,18.3 2.1,17.1 Z',
      fill: 'face',
      stroke: 'outline',
      width: 1.3,
    },
    {
      d: 'M21.9,17.1 C22.1,15.4 21.0,14.0 19.5,13.8 C18.4,13.6 17.4,14.2 16.9,15.2 C16.2,14.6 15.1,14.8 14.8,15.7 C14.5,16.7 15.2,18.0 16.2,18.9 C17.5,20.2 19.4,20.8 20.7,20.1 C21.5,19.6 21.8,18.3 21.9,17.1 Z',
      fill: 'face',
      stroke: 'outline',
      width: 1.3,
    },
    line('M4.4,15.5 C5.1,16.0 5.6,16.8 5.7,17.6', 0.9),
    line('M19.6,15.5 C18.9,16.0 18.4,16.8 18.3,17.6', 0.9),
  ],
  // 👍 — a sleeve, a fist, the thumb up.
  thumbs: [
    { d: 'M4.6,10.9 C6.0,10.8 7.4,10.8 8.8,10.9 C8.9,13.7 8.9,16.5 8.8,19.3 C7.4,19.4 6.0,19.4 4.6,19.3 C4.5,16.5 4.5,13.7 4.6,10.9 Z', fill: 'sleeve', stroke: 'outline', width: 1.4 },
    {
      d: 'M8.9,11.3 C10.3,9.7 11.1,7.6 11.3,5.4 C11.4,4.2 12.9,4.0 13.6,4.9 C14.5,6.1 14.2,8.4 13.5,10.2 C15.0,10.2 16.5,10.2 17.9,10.3 C19.4,10.3 20.0,11.7 19.3,12.6 C20.0,13.2 19.9,14.4 19.0,14.8 C19.6,15.5 19.3,16.7 18.4,17.0 C18.8,17.9 18.2,18.9 17.1,19.0 C14.4,19.3 11.6,19.2 8.9,18.9 Z',
      fill: 'face',
      stroke: 'outline',
      width: 1.4,
    },
    line('M15.3,12.6 C16.6,12.5 17.9,12.5 19.2,12.6', 1.1),
    line('M15.2,14.8 C16.4,14.7 17.6,14.7 18.9,14.8', 1.1),
    line('M15.1,17.0 C16.1,16.9 17.2,16.9 18.3,17.0', 1.1),
  ],
};

/** A layer's path with its offset applied — the form the apps draw (no transforms there). */
export function placedPath(layer: ReactionLayer): string {
  const [dx, dy] = layer.offset ?? [0, 0];
  if (!dx && !dy) return layer.d;
  let i = 0;
  return layer.d.replace(/-?\d*\.?\d+/g, (n) => {
    const v = Number(n) + (i++ % 2 === 0 ? dx : dy);
    return String(Math.round(v * 100) / 100);
  });
}
