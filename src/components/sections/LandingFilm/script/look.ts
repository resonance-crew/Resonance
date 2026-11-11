/**
 * The film's far land, and the lab's way back to how it was.
 *
 * The owner (2026-11-10): the film read too much like Alto's Adventure — its faceted peaks, sky lanterns, lone tree
 * and tower, the dark blades in the corners — and should read as ours while keeping the feeling (layers, the times of
 * day, the calm). Of the two looks tried the owner chose the waves (2026-11-11: 「只要波浪」):
 *
 *  - `waves` (the film): the far land as four long waves (the mark's ≋) where the folded peaks stood, each with its
 *    faint drawn wave line, and none of the borrowed props — no lone tree, no lighthouse, no corner grass, no sky
 *    lanterns.
 *  - `peaks` (the lab's comparison): the film as rounds 1–5 left it, at `/lab/landing/film/peaks` on a development
 *    server only (no deployment serves it).
 *
 * The server draws the look's paper (script/world.ts, World.tsx) and marks the film root `data-look="peaks"` for the
 * old one (film.module.css shows its grass and lanterns then). The light is the same for both.
 */
export type Look = 'waves' | 'peaks';

export const LOOKS: readonly Look[] = ['waves', 'peaks'];
