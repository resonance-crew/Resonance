import { wobRect } from './wobRect';

/**
 * A story picture's wobbly outline, `w`×`h`, seeded per picture — the shape
 * the reader, the web writer (atoms/OrganicStoryImage) and the apps' editor
 * island clip a picture to, and the line a picked one is ringed along.
 * `bleed` is how far the photo is zoomed past each edge (px) so the
 * wobble's outward swings land on real pixels instead of clipping to nothing.
 */
export function storyPictureShape(w: number, h: number, seed: number): { clip: string; bleed: number } {
  const mag = Math.min(w, h) * 0.025;
  const cornerOffset = 6;
  const clip = wobRect(w, h, 12, seed, mag, {
    segmentsH: [3, 4],
    segmentsV: [2, 3],
    curve: 0.4,
    cornerJitter: 1.1,
    cornerOffset,
  });
  return { clip, bleed: Math.ceil(mag + cornerOffset + 4) };
}
