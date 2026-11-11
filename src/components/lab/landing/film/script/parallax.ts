/**
 * The scene change (SPEC §4, the tech research's math): as p runs 0 → 1 across a change, the old scene's flats lift
 * off upward — the nearest first and fastest — while the new scene's rise from below, the farthest first, the nearest
 * landing last; the backdrop (depth < 0.35: the far range, the peaks, the sea) barely moves and crossfades. Offsets are
 * in stage heights (positive is down). Both ends start and stop at zero velocity, so a scrub feels like paper with
 * some weight. Pure, no DOM.
 */
import { clamp01, easeIn, easeOut, smooth } from './timeline';

export const S_CUT = 0.35;
/** Room for the torn edges: a flat travels a little more than the stage's height. */
export const M = 0.06;

/** How much of p a flat of depth d takes to leave (or arrive): the near flat 0.35, the back flat 0.70. */
export const win = (d: number) => 0.35 + (0.35 * (1 - d)) / (1 - S_CUT);
/**
 * The old flat's lift-off (up, negative), near flats first and fastest. `reach` is how far it goes (stage heights):
 * at least 1 + M, and past its own foot, so it has left the stage by the end of its window.
 */
export const outFlat = (d: number, p: number, reach = 1 + M) => -reach * easeIn(clamp01(p / win(d)));
/** The new flat's rise from below: the back flat leads, the near one lands last. */
export const inFlat = (d: number, p: number) => (1 + M) * (1 - easeOut(clamp01((p - 1 + win(d)) / win(d))));

export const isBackdrop = (d: number) => d < S_CUT;
export const backdropOut = (d: number, p: number) => -0.5 * d * smooth(p);
export const backdropIn = (d: number, p: number) => 0.5 * d * (1 - smooth(p));
/**
 * The backdrop never shows two places at once: the old one fades out early (p 0.1–0.35), before the new one fades in
 * (from 0.35) — one set of landmarks at a time, the sky alone between them.
 */
export const backdropOutAlpha = (p: number) => 1 - smooth(clamp01((p - 0.1) / 0.25));
export const backdropInAlpha = (p: number) => smooth(clamp01((p - 0.35) / 0.3));

/**
 * The seam lock: the new back flat never shows sky under the old ground — its top rises at least as fast as the old
 * ground's foot climbs (never above its own rest place), so the two read as one hanging scroll being rolled up.
 */
export function inBack(p: number, dBack: number, dGroundOld: number, oldGroundBottom: number, newBackTop: number, reach = 1 + M): number {
  return Math.min(inFlat(dBack, p), Math.max(0, oldGroundBottom + outFlat(dGroundOld, p, reach) - newBackTop));
}

/** What one plane does in a change: its offset (stage heights) and its opacity. */
export interface Move {
  y: number;
  alpha: number;
}

export interface PlaneSpec {
  depth: number;
  /** Its drawn top and its paper's foot at rest, in stage heights from the stage's top. */
  top: number;
  bottom: number;
}

/** How far a flat must fly to leave the stage: past its foot, never less than 1 + M. */
export const reachOf = (pl: PlaneSpec) => Math.max(1 + M, pl.bottom + 0.04);

/** Every plane's move at p: the old set leaving, the new set arriving (the seam lock on the new back flat). */
export function changeMoves(p: number, olds: PlaneSpec[], news: PlaneSpec[]): { old: Move[]; new: Move[] } {
  const old = olds.map((pl) => (isBackdrop(pl.depth) ? { y: backdropOut(pl.depth, p), alpha: backdropOutAlpha(p) } : { y: outFlat(pl.depth, p, reachOf(pl)), alpha: 1 }));
  const oldFlats = olds.filter((pl) => !isBackdrop(pl.depth));
  const newFlats = news.filter((pl) => !isBackdrop(pl.depth));
  const oldGround = oldFlats.length ? oldFlats.reduce((a, b) => (b.depth > a.depth ? b : a)) : null;
  const newBack = newFlats.length ? newFlats.reduce((a, b) => (b.depth < a.depth ? b : a)) : null;
  const nw = news.map((pl) => {
    if (isBackdrop(pl.depth)) return { y: backdropIn(pl.depth, p), alpha: backdropInAlpha(p) };
    if (pl === newBack && oldGround) return { y: inBack(p, pl.depth, oldGround.depth, oldGround.bottom, pl.top, reachOf(oldGround)), alpha: 1 };
    return { y: inFlat(pl.depth, p), alpha: 1 };
  });
  return { old, new: nw };
}

/** What a held element (the card on the wind, the pair, the lanterns) does in a change: it keeps its place, lifting a little mid-way. */
export const heldLift = (p: number) => 0.06 * Math.sin(Math.PI * clamp01(p));

/** The hero block leaves with the first change, as a flat of depth 0.6. */
export const HERO_DEPTH = 0.6;
