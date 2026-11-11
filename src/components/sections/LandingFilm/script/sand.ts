/**
 * The paper's sand (the owner 2026-11-11: 「背景是不是可以加入這種沙沙的感覺」, at the lightest strength tried —
 * film.module.css; the lab's `?sand=0` shows the film without, `?sand=2` plain to see): a fine grit on the
 * scenery's paper and the sky — dark specks that show on a light paper, pale ones that show on a dark one — as two
 * small seamless tiles (sand-dark.png, sand-light.png: designs/landing-lab/film/tools/sand.mjs) in one pattern
 * (`film-sand`), which each paper of the world is filled with a second time (World.tsx PlaneGroup). The grit is part of
 * each paper, in world units: it lies on it once, cut to its edge, and travels with its hill through a pan and a scene
 * change — never a film of dust over the lens — and the puppets and the cards carry none of it. No filter anywhere.
 */

/**
 * The tile's side in world units (its bitmaps are 256 px, a speck two of them): 72 — finer than the first 120 (the
 * owner, 2026-11-12: 「顆粒弄小一點」), as many specks again on the same paper, each a little over half as wide.
 */
export const SAND_TILE = 72;

/** A bundler's picture import: Next gives its data, Vite (the tests) its address. */
export const pictureSrc = (m: string | { src: string }): string => (typeof m === 'string' ? m : m.src);
